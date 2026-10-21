import * as Notifications from 'expo-notifications'
import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AiConsentProvider } from '../components/AiConsent'
import { AuthProvider, useAuth } from '../lib/auth'
import { syncNotifications } from '../lib/notifications'
import { useTheme } from '../lib/theme'

function RootNavigator() {
  const { status } = useAuth()
  const t = useTheme()
  const lastResponse = Notifications.useLastNotificationResponse()

  useEffect(() => {
    if (status === 'signedIn') syncNotifications().catch(() => {})
  }, [status])

  // Tapping "transcription terminée" opens that transcript.
  useEffect(() => {
    const id = lastResponse?.notification.request.content.data?.transcriptId
    if (status === 'signedIn' && typeof id === 'number') router.push(`/transcript/${id}`)
  }, [lastResponse, status])

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="transcript/[id]" options={{ title: 'Transcription' }} />
        <Stack.Screen name="recordings" options={{ title: 'Enregistrements locaux' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'guest'}>
        <Stack.Screen name="guest" options={{ title: 'Mode invité' }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AiConsentProvider>
          <RootNavigator />
        </AiConsentProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
