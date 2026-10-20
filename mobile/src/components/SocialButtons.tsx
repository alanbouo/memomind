import * as AppleAuthentication from 'expo-apple-authentication'
import { useEffect, useState } from 'react'
import { Image, Pressable, Text, useColorScheme, View } from 'react-native'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { appleAvailable, googleConfigured, SignInCancelled, SocialProvider } from '../lib/social'
import { useTheme } from '../lib/theme'
import { ErrorText, Muted } from './ui'

/** "Continue with Apple / Google" buttons; renders nothing when no provider is usable. */
export function SocialButtons() {
  const t = useTheme()
  const dark = useColorScheme() === 'dark'
  const { signInWithProvider } = useAuth()
  const [apple, setApple] = useState(false)
  const [busy, setBusy] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    appleAvailable().then(setApple).catch(() => setApple(false))
  }, [])

  if (!apple && !googleConfigured) return null

  const run = async (provider: SocialProvider) => {
    setError(null)
    setBusy(provider)
    try {
      await signInWithProvider(provider)
    } catch (e) {
      if (!(e instanceof SignInCancelled)) setError(errorMessage(e, 'Connexion impossible'))
      setBusy(null)
    }
  }

  return (
    <View style={{ marginTop: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
        <Muted>ou</Muted>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      </View>
      <ErrorText>{error}</ErrorText>
      {apple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={12}
          style={{ height: 48, opacity: busy ? 0.5 : 1 }}
          onPress={() => !busy && run('apple')}
        />
      )}
      {googleConfigured && (
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => run('google')}
          style={({ pressed }) => ({
            minHeight: 48,
            marginTop: apple ? 10 : 0,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.card,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: busy ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Image source={require('../../assets/google-logo.png')} style={{ width: 20, height: 20 }} />
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Continuer avec Google</Text>
        </Pressable>
      )}
    </View>
  )
}
