import { Link } from 'expo-router'
import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { SocialButtons } from '../../components/SocialButtons'
import { Button, ErrorText, Field, Muted, Screen } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'

export default function Login() {
  const t = useTheme()
  const { signIn, signUp, enterGuest } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError(null)
    if (!email.trim() || !password) return setError('Renseignez votre email et mot de passe')
    if (mode === 'signup') {
      if (password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères')
      if (password !== confirm) return setError('Les mots de passe ne correspondent pas')
    }
    setLoading(true)
    try {
      await (mode === 'signup' ? signUp : signIn)(email.trim(), password)
    } catch (e) {
      setError(errorMessage(e, mode === 'signup' ? 'Inscription impossible' : 'Connexion impossible'))
      setLoading(false)
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', paddingTop: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Image source={require('../../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 18 }} />
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '800', marginTop: 12 }}>MemoMind</Text>
          <Muted>Transcrivez vos mémos vocaux</Muted>
        </View>

        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} />
        {mode === 'signup' && <Field label="Confirmer le mot de passe" value={confirm} onChangeText={setConfirm} secureTextEntry />}

        <ErrorText>{error}</ErrorText>
        <Button title={mode === 'signup' ? 'Créer mon compte' : 'Se connecter'} onPress={submit} loading={loading} />

        <SocialButtons />

        {mode === 'login' && (
          <Link href="/forgot-password" style={{ color: t.primary, textAlign: 'center', marginTop: 16 }}>
            Mot de passe oublié ?
          </Link>
        )}

        <Button
          variant="ghost"
          title={mode === 'login' ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
          onPress={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
          }}
          style={{ marginTop: 8 }}
        />
        <Button variant="secondary" title="Continuer sans compte" onPress={enterGuest} style={{ marginTop: 8 }} />
      </View>
    </Screen>
  )
}
