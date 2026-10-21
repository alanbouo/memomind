import { useEffect, useRef, useState } from 'react'
import { Image, Text, View } from 'react-native'
import { SocialButtons } from '../../components/SocialButtons'
import { Button, ErrorText, Field, Muted, Screen } from '../../components/ui'
import { errorMessage, requestEmailCode } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'

const RESEND_SECONDS = 60

export default function Login() {
  const t = useTheme()
  const { signInWithCode, enterGuest, guestResult } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const submitting = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendCode = async () => {
    const address = email.trim().toLowerCase()
    if (!address) return setError('Renseignez votre adresse e-mail')
    setError(null)
    setLoading(true)
    try {
      await requestEmailCode(address)
      setSentTo(address)
      setCode('')
      setCooldown(RESEND_SECONDS)
    } catch (e) {
      setError(errorMessage(e, "Impossible d'envoyer le code"))
    } finally {
      setLoading(false)
    }
  }

  const verify = async (value: string) => {
    if (!sentTo || submitting.current) return
    submitting.current = true
    setError(null)
    setLoading(true)
    try {
      await signInWithCode(sentTo, value)
    } catch (e) {
      setError(errorMessage(e, 'Code invalide ou expiré'))
      setCode('')
      setLoading(false)
    } finally {
      submitting.current = false
    }
  }

  const onCodeChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) verify(digits)
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', paddingTop: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Image source={require('../../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 18 }} />
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '800', marginTop: 12 }}>MemoMind</Text>
          <Muted>Transcrivez vos mémos vocaux</Muted>
        </View>

        {guestResult && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.primarySoft, marginBottom: 20 }}>
            <Text style={{ color: t.text }}>Votre transcription sera enregistrée dans votre compte dès que vous serez connecté.</Text>
          </View>
        )}

        {sentTo ? (
          <>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Saisissez votre code</Text>
            <Muted style={{ marginBottom: 16 }}>Nous l&apos;avons envoyé à {sentTo}. Il est valable 10 minutes.</Muted>
            <Field
              label="Code à 6 chiffres"
              value={code}
              onChangeText={onCodeChange}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              style={{ fontSize: 28, letterSpacing: 10, textAlign: 'center' }}
            />
            <ErrorText>{error}</ErrorText>
            <Button title="Valider" onPress={() => verify(code)} loading={loading} disabled={code.length !== 6} />
            <Button
              variant="ghost"
              title={cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
              onPress={sendCode}
              disabled={cooldown > 0 || loading}
              style={{ marginTop: 8 }}
            />
            <Button
              variant="ghost"
              title="Changer d'adresse e-mail"
              onPress={() => {
                setSentTo(null)
                setError(null)
              }}
            />
          </>
        ) : (
          <>
            <SocialButtons />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              onSubmitEditing={sendCode}
            />
            <ErrorText>{error}</ErrorText>
            <Button title="Recevoir un code par e-mail" onPress={sendCode} loading={loading} />
            <Muted style={{ textAlign: 'center', marginTop: 12 }}>Pas de mot de passe : un code à 6 chiffres suffit. Le compte est créé à la première connexion.</Muted>
            <Button variant="secondary" title="Continuer sans compte" onPress={enterGuest} style={{ marginTop: 20 }} />
          </>
        )}
      </View>
    </Screen>
  )
}
