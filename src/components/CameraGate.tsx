import { useCameraPermissions } from 'expo-camera'
import type { ReactNode } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import { base, useColors } from '@/lib/theme'

/** Shows `children` (a camera) once the phone allows the camera; otherwise asks for it. */
export default function CameraGate({ children }: { children: ReactNode }) {
  const colors = useColors()
  const [permission, requestPermission] = useCameraPermissions()

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    )
  }
  if (permission.granted) return <>{children}</>

  return (
    <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.side }, base.padded]}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>The camera is needed to scan</Text>
      <Text style={[base.hint, { color: '#c9c9c3', textAlign: 'center' }]}>
        SIRIS Scanner only uses it to read barcodes and the till’s QR code. Nothing is recorded.
      </Text>
      <Pressable
        style={[base.button, { backgroundColor: colors.lime, paddingHorizontal: 24 }]}
        onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
      >
        <Text style={[base.buttonText, { color: colors.ink }]}>{permission.canAskAgain ? 'Allow the camera' : 'Open settings'}</Text>
      </Pressable>
    </View>
  )
}
