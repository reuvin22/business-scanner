import { CameraView, type BarcodeType } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { Redirect, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import CameraGate from '@/components/CameraGate'
import ProductFormPhone from '@/components/ProductFormPhone'
import { disconnect, getSession, isDisconnected, lookupBarcode, WEB_URL, webAddProductUrl } from '@/lib/api'
import { useAppSession } from '@/lib/session'
import { base, useColors } from '@/lib/theme'

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar']

type Step = 'scan' | 'choose' | 'form' | 'done'

/**
 * Options → Register product: scan the new product's barcode, then finish here on the phone (name, price, stock)
 * or on the web app (it opens "Add product" with the barcode filled in). Only offered when the person signed in
 * on the till may manage products (e.g. the owner or an admin).
 */
export default function RegisterProduct() {
  const colors = useColors()
  const { pairing, setPairing } = useAppSession()
  const [step, setStep] = useState<Step>('scan')
  const [barcode, setBarcode] = useState('')
  const [typed, setTyped] = useState('')
  const [taken, setTaken] = useState('') // the product that already has this barcode
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const reading = useRef(false) // the camera reports a barcode many times a second: read it once
  const admin = pairing?.session.mode === 'admin'

  // Still connected, and still allowed? (Checked when the screen opens and when the app comes back.)
  useEffect(() => {
    if (!pairing) return
    const check = () =>
      getSession(pairing).then(
        ({ actions }) => (actions.join() !== (pairing.actions ?? []).join() ? setPairing({ ...pairing, actions }) : undefined),
        (err) => (isDisconnected(err) ? setPairing(null) : undefined),
      )
    check()
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check())
    return () => subscription.remove()
  }, [pairing, setPairing])

  if (!pairing) return <Redirect href="/pair" />
  if (!pairing.session.approved) return <Redirect href="/waiting" />
  if (!(pairing.actions ?? []).includes('register_product')) return <Redirect href={admin ? '/pair' : '/scan'} />
  const current = pairing

  async function check(code: string) {
    const value = code.trim()
    if (!value || reading.current) return
    reading.current = true
    setBusy(true)
    setError('')
    setTaken('')
    try {
      const found = await lookupBarcode(current, value)
      setBarcode(value)
      if (found.productName) {
        setTaken(found.productName)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setStep('choose')
      }
    } catch (err) {
      setError((err as Error).message)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setBusy(false)
      setTimeout(() => (reading.current = false), 1200)
    }
  }

  function restart() {
    setStep('scan')
    setBarcode('')
    setTyped('')
    setTaken('')
    setError('')
    setSaved('')
  }

  /** Connected from the web app: ending it means pairing again later. */
  async function leave() {
    await disconnect(current).catch(() => undefined)
    await setPairing(null)
    router.replace('/pair')
  }

  async function openWeb() {
    if (!WEB_URL) {
      setError('The web app address is not set in this app (EXPO_PUBLIC_WEB_URL). Finish on this phone instead.')
      return
    }
    await Linking.openURL(webAddProductUrl(current, barcode))
  }

  const input = [base.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.heading }]
  const primary = [base.button, { backgroundColor: colors.accent }]
  const secondary = [base.button, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }]

  return (
    <SafeAreaView style={[base.screen, { backgroundColor: colors.side }]} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Register product</Text>
          <Text style={{ color: '#c9c9c3', fontSize: 13 }} numberOfLines={1}>
            {current.businessName}
          </Text>
        </View>
        {admin ? (
          <Pressable onPress={leave} hitSlop={10}>
            <Text style={{ color: colors.lime, fontWeight: '700' }}>Disconnect</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.replace('/scan')} hitSlop={10}>
            <Text style={{ color: colors.lime, fontWeight: '700' }}>Back to scanning</Text>
          </Pressable>
        )}
      </View>

      {step === 'scan' && (
        <View style={{ height: 280, marginHorizontal: 12, borderRadius: 18, overflow: 'hidden' }}>
          <CameraGate>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={busy || taken ? undefined : ({ data }) => check(data)}
            />
            {busy && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#0008',
                }}
              >
                <ActivityIndicator color={colors.lime} size="large" />
              </View>
            )}
          </CameraGate>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1, marginTop: 12, backgroundColor: colors.page, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
          contentContainerStyle={base.padded}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text>}

          {step === 'scan' && (
            <>
              <Text style={[base.hint, { color: colors.text }]}>Scan the new product’s barcode, or type it.</Text>
              {!!taken && (
                <View style={{ backgroundColor: colors.dangerSoft, padding: 12, borderRadius: 12, gap: 8 }}>
                  <Text style={{ color: colors.heading, fontWeight: '700' }}>
                    {barcode} is already registered: {taken}
                  </Text>
                  <Pressable style={secondary} onPress={restart}>
                    <Text style={[base.buttonText, { color: colors.heading }]}>Scan another</Text>
                  </Pressable>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[input, { flex: 1 }]}
                  placeholder="Barcode"
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                  value={typed}
                  onChangeText={setTyped}
                  onSubmitEditing={() => check(typed)}
                />
                <Pressable style={[primary, { paddingHorizontal: 18 }]} disabled={!typed.trim() || busy} onPress={() => check(typed)}>
                  <Text style={[base.buttonText, { color: '#fff' }]}>Next</Text>
                </Pressable>
              </View>
            </>
          )}

          {step === 'choose' && (
            <>
              <Text style={{ color: colors.muted }}>Barcode</Text>
              <Text style={{ color: colors.heading, fontSize: 22, fontWeight: '800', letterSpacing: 1 }}>{barcode}</Text>
              <Text style={[base.hint, { color: colors.text }]}>Where do you want to finish registering it?</Text>
              <Pressable style={primary} onPress={() => setStep('form')}>
                <Text style={[base.buttonText, { color: '#fff' }]}>On this phone</Text>
              </Pressable>
              <Text style={[base.hint, { color: colors.muted, marginTop: -6 }]}>
                The same details as the web app: prices, variants, photos, and more.
              </Text>
              <Pressable style={secondary} onPress={openWeb}>
                <Text style={[base.buttonText, { color: colors.heading }]}>On the web app</Text>
              </Pressable>
              <Text style={[base.hint, { color: colors.muted, marginTop: -6 }]}>
                Opens SIRIS in the browser (sign in if asked): Products → Add product opens with this barcode filled in. For photos,
                variants, and every detail.
              </Text>
              <Pressable onPress={restart}>
                <Text style={[base.link, { color: colors.accent, textAlign: 'center' }]}>Scan a different barcode</Text>
              </Pressable>
            </>
          )}

          {step === 'form' && (
            <ProductFormPhone
              pairing={current}
              barcode={barcode}
              onSaved={(name) => {
                setSaved(name)
                setStep('done')
              }}
              onBack={() => setStep('choose')}
            />
          )}

          {step === 'done' && (
            <>
              <View style={{ backgroundColor: colors.upSoft, padding: 14, borderRadius: 12, gap: 4 }}>
                <Text style={{ color: colors.heading, fontSize: 18, fontWeight: '800' }}>✓ {saved} is registered</Text>
                <Text style={{ color: colors.text }}>It can be scanned and sold at the till right away.</Text>
              </View>
              <Pressable style={primary} onPress={restart}>
                <Text style={[base.buttonText, { color: '#fff' }]}>Register another</Text>
              </Pressable>
              {!admin && (
                <Pressable style={secondary} onPress={() => router.replace('/scan')}>
                  <Text style={[base.buttonText, { color: colors.heading }]}>Back to scanning</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
