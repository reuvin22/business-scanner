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
  return <Redirect href={pairing ? '/scan' : '/pair'} />
}
