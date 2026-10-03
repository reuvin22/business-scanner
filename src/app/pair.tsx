import { CameraView } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import CameraGate from '@/components/CameraGate'
import { isTillQr, pairWithTill } from '@/lib/api'
import { useAppSession } from '@/lib/session'
import { base, useColors } from '@/lib/theme'

/**
 * Connect this phone to ONE till: scan the QR code the till shows (selling app → Phone scanner), or type its code.
 * No sign-in: each till makes its own one-time code, so the phone can only ever reach the till that showed it.
 */
export default function Pair() {
  const colors = useColors()
  const { setPairing, phoneName, setPhoneName } = useAppSession()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const working = useRef(false) // the camera reports the same QR code many times a second

  async function pair(text: string) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      const pairing = await pairWithTill(text, phoneName.trim())
      await setPairing(pairing)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace(pairing.session.mode === 'admin' ? '/register' : '/scan')
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError((err as Error).message)
      // Let a code be tried again after a moment (e.g. after fixing the connection)
      setTimeout(() => (working.current = false), 1500)
    } finally {
      setBusy(false)
    }
  }

  function onQr(data: string) {
    if (isTillQr(data)) pair(data)
    else if (!working.current) setError('That QR code is not from a SIRIS till.')
  }

  const lightInput = [base.input, { backgroundColor: '#ffffff', borderColor: '#ffffff', color: colors.ink }]

  return (
    <SafeAreaView style={[base.screen, { backgroundColor: colors.side }]} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 4 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Connect to a till</Text>
        <Text style={[base.hint, { color: '#c9c9c3' }]}>
          On the till, open the selling app and tap “Phone scanner”. Point this phone at the QR code it shows. No sign-in needed.
        </Text>
      </View>

      <View style={{ flex: 1, marginHorizontal: 16, borderRadius: 18, overflow: 'hidden' }}>
        <CameraGate>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => onQr(data)}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{ width: 220, height: 220, borderWidth: 3, borderColor: colors.lime, borderRadius: 20 }} />
          </View>
          {busy && (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0008' }]}>
              <ActivityIndicator color={colors.lime} size="large" />
              <Text style={{ color: '#fff', marginTop: 10, fontWeight: '600' }}>Connecting…</Text>
            </View>
          )}
        </CameraGate>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: 16, gap: 10 }}>
          {!!error && (
            <Text style={{ color: '#fff', backgroundColor: colors.danger, padding: 10, borderRadius: 10, overflow: 'hidden' }}>{error}</Text>
          )}
          <TextInput
            style={lightInput}
            placeholder="This phone's name (optional), e.g. Ana's phone"
            placeholderTextColor="#8a8a84"
            maxLength={40}
            value={phoneName}
            onChangeText={setPhoneName}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[lightInput, { flex: 1, letterSpacing: 2 }]}
              placeholder="Or type the till's code"
              placeholderTextColor="#8a8a84"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => code.trim() && pair(code)}
            />
            <Pressable
              style={[base.button, { backgroundColor: colors.lime, paddingHorizontal: 20, opacity: code.trim() && !busy ? 1 : 0.6 }]}
              disabled={!code.trim() || busy}
              onPress={() => pair(code)}
            >
              <Text style={[base.buttonText, { color: colors.ink }]}>Connect</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
