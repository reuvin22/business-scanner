import { CameraView, type BarcodeType } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import CameraGate from '@/components/CameraGate'
import { ApiError, disconnect as endConnection, getSession, isDisconnected, sendScan } from '@/lib/api'
import { useAppSession } from '@/lib/session'
import { base, useColors } from '@/lib/theme'

// Product barcodes (not QR codes: those pair the phone with a till)
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar']
// The camera reports a barcode many times a second while it is in view, loses it for a moment while it refocuses,
// and sometimes sees two barcodes at once. So a barcode counts ONCE while it stays around: it counts again only
// after it has been out of view this long. (To add the same product again quickly, use "+1" in the list.)
const SAME_CODE_PAUSE_MS = 3000
// After any scan counts, nothing else counts for this long (one product at a time)
const AFTER_SCAN_PAUSE_MS = 800
const RECENT_LIMIT = 30

type Recent = { id: string; barcode: string; status: 'sending' | 'added' | 'error'; text: string; at: number }

/**
 * Scan barcodes: each product goes straight into the paired till's cart. Nothing is sold here: the cashier
 * charges on the till.
 */
export default function ScanScreen() {
  const colors = useColors()
  const { pairing, setPairing } = useAppSession()
  const [recent, setRecent] = useState<Recent[]>([])
  const [paused, setPaused] = useState(false)
  const [torch, setTorch] = useState(false)
  const [typed, setTyped] = useState('')
  const [ended, setEnded] = useState('')
  const lastSeen = useRef(new Map<string, number>()) // every barcode the camera saw lately -> when it last saw it
  const lastCounted = useRef(0)

  const disconnected = useCallback(
    async (message: string) => {
      setEnded(message)
      setPaused(true)
    },
    [],
  )

  // When the app comes back to the screen, check the session is still open (the till may have ended it)
  useEffect(() => {
    if (!pairing) return
    const check = () =>
      getSession(pairing).then(
        // What the phone may do can change (e.g. the person at the till got the products permission)
        ({ actions }) => (actions.join() !== (pairing.actions ?? []).join() ? setPairing({ ...pairing, actions }) : undefined),
        (err) => (isDisconnected(err) ? disconnected((err as Error).message) : undefined), // offline: try again later
      )
    check()
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check())
    return () => subscription.remove()
  }, [pairing, disconnected, setPairing])

  if (!pairing) return <Redirect href="/pair" />
  if (!pairing.session.approved) return <Redirect href="/waiting" />
  if (pairing.session.mode === 'admin') return <Redirect href="/register" />
  const current = pairing

  function update(id: string, change: Partial<Recent>) {
    setRecent((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }

  /** A barcode from the camera: counts only when it is new (see SAME_CODE_PAUSE_MS). */
  function fromCamera(barcode: string) {
    const code = barcode.trim()
    if (!code || paused) return
    const now = Date.now()
    const seenAt = lastSeen.current.get(code)
    lastSeen.current.set(code, now) // still in view: the pause starts over
    if (seenAt !== undefined && now - seenAt < SAME_CODE_PAUSE_MS) return
    if (now - lastCounted.current < AFTER_SCAN_PAUSE_MS) return
    for (const [seen, at] of lastSeen.current) if (now - at > SAME_CODE_PAUSE_MS) lastSeen.current.delete(seen)
    lastCounted.current = now
    send(code)
  }

  /** Sends one product to the till (from the camera, typed, or "+1"). */
  async function send(barcode: string) {
    const code = barcode.trim()
    if (!code || paused) return
    const now = Date.now()

    const id = `${now}-${code}`
    setRecent((list) => [{ id, barcode: code, status: 'sending' as const, text: 'Sending…', at: now }, ...list].slice(0, RECENT_LIMIT))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      const result = await sendScan(current, code)
      update(id, { status: 'added', text: result.productName })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      const error = err as ApiError
      update(id, { status: 'error', text: error.message })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (isDisconnected(error)) disconnected(error.message)
    }
  }

  async function disconnect() {
    await endConnection(current).catch(() => undefined) // ends it on the till too; fine if it already ended
    await setPairing(null)
    router.replace('/pair')
  }

  const added = recent.filter((item) => item.status === 'added').length

  return (
    <SafeAreaView style={[base.screen, { backgroundColor: colors.side }]} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }} numberOfLines={1}>
            {current.businessName}
          </Text>
          <Text style={{ color: '#c9c9c3', fontSize: 13 }} numberOfLines={1}>
            {current.session.locationName} · till of {current.session.tillName || 'the cashier'}
          </Text>
        </View>
        {(current.actions ?? []).includes('register_product') && !ended && (
          <Pressable onPress={() => router.replace('/register')} hitSlop={10} style={[styles.chip, { backgroundColor: colors.lime }]}>
            <Text style={{ color: colors.ink, fontWeight: '800' }}>Options</Text>
          </Pressable>
        )}
        <Pressable onPress={disconnect} hitSlop={10}>
          <Text style={{ color: colors.lime, fontWeight: '700' }}>Disconnect</Text>
        </Pressable>
      </View>

      <View style={{ height: 300, marginHorizontal: 12, borderRadius: 18, overflow: 'hidden' }}>
        <CameraGate>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={paused ? undefined : ({ data }) => fromCamera(data)}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{ width: '82%', height: 120, borderWidth: 3, borderColor: paused ? '#888' : colors.lime, borderRadius: 14 }} />
          </View>
          {paused && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000a' }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{ended ? 'Disconnected' : 'Paused'}</Text>
            </View>
          )}
          <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setTorch((on) => !on)} style={[styles.chip, { backgroundColor: torch ? colors.lime : '#000a' }]}>
              <Text style={{ color: torch ? colors.ink : '#fff', fontWeight: '700' }}>Light</Text>
            </Pressable>
            {!ended && (
              <Pressable onPress={() => setPaused((on) => !on)} style={[styles.chip, { backgroundColor: '#000a' }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{paused ? 'Resume' : 'Pause'}</Text>
              </Pressable>
            )}
          </View>
        </CameraGate>
      </View>

      <View style={{ flex: 1, marginTop: 12, backgroundColor: colors.page, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        {ended ? (
          <View style={[base.padded]}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>{ended}</Text>
            <Pressable style={[base.button, { backgroundColor: colors.accent }]} onPress={disconnect}>
              <Text style={[base.buttonText, { color: '#fff' }]}>Connect to a till again</Text>
            </Pressable>
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
              <TextInput
                style={[base.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.line, color: colors.heading }]}
                placeholder="Type a barcode if it won't scan"
                placeholderTextColor={colors.muted}
                keyboardType="default"
                autoCorrect={false}
                value={typed}
                onChangeText={setTyped}
                onSubmitEditing={() => {
                  send(typed) // typed: always counts
                  setTyped('')
                }}
                returnKeyType="send"
              />
            </View>
          </KeyboardAvoidingView>
        )}
        <Text style={{ paddingHorizontal: 16, color: colors.muted, fontSize: 13, marginBottom: 6 }}>
          {recent.length ? `${added} sent to the till · they are sold when the cashier taps Charge` : 'Point the camera at a barcode.'}
        </Text>
        <FlatList
          data={recent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16, gap: 8 }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: item.status === 'error' ? colors.dangerSoft : item.status === 'added' ? colors.upSoft : colors.surface,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text style={{ fontSize: 18, width: 24, textAlign: 'center', color: item.status === 'error' ? colors.danger : colors.up }}>
                {item.status === 'error' ? '✕' : item.status === 'added' ? '✓' : '…'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.heading, fontWeight: '700' }} numberOfLines={2}>
                  {item.text}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {item.barcode} · {new Date(item.at).toLocaleTimeString()}
                </Text>
              </View>
              {item.status === 'added' && !ended && (
                <Pressable onPress={() => send(item.barcode)} hitSlop={8} style={[styles.chip, { backgroundColor: colors.accent }]}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>+1</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
})
