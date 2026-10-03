import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAppSession } from '@/lib/session'
import { base, useColors } from '@/lib/theme'

/** Sends you where you belong: connect to a till (scan its QR code), or scan products. */
export default function Start() {
  const { pairing } = useAppSession()
  const colors = useColors()

  if (pairing === undefined) {
    return (
      <View style={[base.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }
  if (!pairing) return <Redirect href="/pair" />
  // Connected from the web app: only registering products (there is no till cart to scan into)
  return <Redirect href={pairing.session.mode === 'admin' ? '/register' : '/scan'} />
}
