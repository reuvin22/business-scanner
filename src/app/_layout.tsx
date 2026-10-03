import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider } from '@/lib/session'
import { useColors } from '@/lib/theme'

export default function RootLayout() {
  const colors = useColors()
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page }, animation: 'fade' }} />
      </SessionProvider>
    </SafeAreaProvider>
  )
}
