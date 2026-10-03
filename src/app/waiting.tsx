import { Redirect, router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { disconnect, getSession, isDisconnected } from '@/lib/api'
import { useAppSession } from '@/lib/session'
import { base, useColors } from '@/lib/theme'

const CHECK_EVERY_MS = 2000

/**
 * After scanning the till's QR code, the phone waits until someone at the till (or the web app) taps Allow.
 * A QR code photographed by someone else is useless: nothing works until the cashier allows that phone.
 */
export default function Waiting() {
  const colors = useColors()
  const { pairing, setPairing } = useAppSession()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pairing || pairing.session.approved) return
    let stopped = false
    const check = async () => {
      try {
        const { session, actions } = await getSession(pairing)
        if (stopped) return
        setError('')
        if (session.approved) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          await setPairing({ ...pairing, session, actions })
        }
      } catch (err) {
        if (stopped) return
        if (isDisconnected(err)) {
          await setPairing(null) // refused, or it took too long
          router.replace('/pair')
        } else setError((err as Error).message) // offline: keep trying
      }
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [pairing, setPairing])

  if (!pairing) return <Redirect href="/pair" />
  if (pairing.session.approved) return <Redirect href={pairing.session.mode === 'admin' ? '/register' : '/scan'} />

  async function cancel() {
    if (pairing) await disconnect(pairing).catch(() => undefined)
    await setPairing(null)
    router.replace('/pair')
  }

  return (
    <SafeAreaView style={[base.screen, { backgroundColor: colors.side, justifyContent: 'center' }]}>
      <View style={[base.padded, { alignItems: 'center' }]}>
        <ActivityIndicator color={colors.lime} size="large" />
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Waiting for approval</Text>
        <Text style={[base.hint, { color: '#c9c9c3', textAlign: 'center' }]}>
          On the {pairing.session.mode === 'admin' ? 'web app' : 'till'}, tap “Allow” for “{pairing.session.scannerName}”. This keeps
          strangers who photograph the QR code out.
        </Text>
        <Text style={{ color: '#c9c9c3', textAlign: 'center' }}>
          {pairing.businessName} · {pairing.session.locationName}
        </Text>
        {!!error && <Text style={{ color: colors.lime }}>{error}</Text>}
        <Pressable onPress={cancel} style={[base.button, { paddingHorizontal: 24, borderWidth: 1, borderColor: '#c9c9c3' }]}>
          <Text style={[base.buttonText, { color: '#fff' }]}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
