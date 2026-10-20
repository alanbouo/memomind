import { Stack } from 'expo-router'
import { useTheme } from '../../lib/theme'

export default function AuthLayout() {
  const t = useTheme()
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
  )
}
