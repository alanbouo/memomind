import { useEffect, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { Button, Card, ErrorText, Field, Heading, Muted, Screen } from '../../components/ui'
import { changePassword, deleteAccount, errorMessage, getCurrentUser, getSettings, Quality, updateSettings } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'

const QUALITIES: Quality[] = ['low', 'medium', 'high']
const QUALITY_LABEL: Record<Quality, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute' }

export default function Settings() {
  const t = useTheme()
  const { signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [quality, setQuality] = useState<Quality>('medium')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  useEffect(() => {
    getCurrentUser().then((u) => setEmail(u.email)).catch(() => {})
    getSettings().then((s) => setQuality(s.default_quality)).catch(() => {})
  }, [])

  const pickQuality = async (q: Quality) => {
    const previous = quality
    setQuality(q)
    try {
      await updateSettings({ default_quality: q })
    } catch (e) {
      setQuality(previous)
      Alert.alert('Erreur', errorMessage(e))
    }
  }

  const submitPassword = async () => {
    setPwMsg(null)
    if (next.length < 6) return setPwMsg({ ok: false, text: 'Au moins 6 caractères' })
    setPwLoading(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setPwMsg({ ok: true, text: 'Mot de passe modifié' })
    } catch (e) {
      setPwMsg({ ok: false, text: errorMessage(e) })
    } finally {
      setPwLoading(false)
    }
  }

  const confirmDelete = () =>
    Alert.alert('Supprimer le compte ?', 'Votre compte et toutes vos transcriptions seront définitivement supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount()
            await signOut()
          } catch (e) {
            Alert.alert('Erreur', errorMessage(e))
          }
        },
      },
    ])

  return (
    <Screen>
      <Heading>Compte</Heading>
      <Muted style={{ marginBottom: 20 }}>{email || '…'}</Muted>

      <Card style={{ marginBottom: 20 }}>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 10 }}>Qualité par défaut</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {QUALITIES.map((q) => (
            <Button key={q} title={QUALITY_LABEL[q]} variant={quality === q ? 'primary' : 'secondary'} onPress={() => pickQuality(q)} style={{ flex: 1 }} />
          ))}
        </View>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 10 }}>Changer le mot de passe</Text>
        <Field label="Mot de passe actuel" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="Nouveau mot de passe" value={next} onChangeText={setNext} secureTextEntry />
        {pwMsg && (pwMsg.ok ? <Text style={{ color: t.success, marginBottom: 12 }}>{pwMsg.text}</Text> : <ErrorText>{pwMsg.text}</ErrorText>)}
        <Button title="Mettre à jour" variant="secondary" onPress={submitPassword} loading={pwLoading} disabled={!current || !next} />
      </Card>

      <Button title="Se déconnecter" variant="secondary" onPress={signOut} />
      <Button title="Supprimer mon compte" variant="danger" onPress={confirmDelete} style={{ marginTop: 12 }} />
    </Screen>
  )
}
