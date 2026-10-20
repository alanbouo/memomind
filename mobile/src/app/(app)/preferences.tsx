import * as Sharing from 'expo-sharing'
import { useCallback, useEffect, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { Alert, Pressable, Switch, Text, View } from 'react-native'
import { Button, Card, ErrorText, Field, Heading, Muted, Screen } from '../../components/ui'
import {
  deleteAccount,
  downloadAccountExport,
  errorMessage,
  getCurrentUser,
  getSettings,
  updateSettings,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { getLocalPrefs, listRecordings, setKeepRecordings, totalSize } from '../../lib/recordings'
import { useTheme } from '../../lib/theme'

// Empty code = let AssemblyAI detect the language.
const LANGUAGES = [
  { code: '', label: 'Détection auto' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'nl', label: 'Néerlandais' },
  { code: 'ja', label: 'Japonais' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ko', label: 'Coréen' },
  { code: 'ar', label: 'Arabe' },
  { code: 'ru', label: 'Russe' },
]

function SectionTitle({ children }: { children: string }) {
  const t = useTheme()
  return <Text style={{ color: t.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 8 }}>{children}</Text>
}

export default function Preferences() {
  const t = useTheme()
  const { signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [userPrompt, setUserPrompt] = useState('')
  const [promptsSaved, setPromptsSaved] = useState(true)
  const [promptsMsg, setPromptsMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [keep, setKeep] = useState(() => getLocalPrefs().keepRecordings)
  const [local, setLocal] = useState({ count: 0, bytes: 0 })

  useFocusEffect(
    useCallback(() => {
      setLocal({ count: listRecordings().length, bytes: totalSize() })
    }, [])
  )

  useEffect(() => {
    getCurrentUser().then((u) => setEmail(u.email)).catch(() => {})
    getSettings()
      .then((s) => {
        setLanguage(s.default_language ?? '')
        setSystemPrompt(s.system_prompt_template ?? '')
        setUserPrompt(s.default_user_prompt ?? '')
      })
      .catch(() => {})
  }, [])

  const pickLanguage = async (code: string) => {
    const previous = language
    setLanguage(code)
    try {
      await updateSettings({ default_language: code })
    } catch (e) {
      setLanguage(previous)
      Alert.alert('Erreur', errorMessage(e))
    }
  }

  const savePrompts = async () => {
    setPromptsMsg(null)
    try {
      await updateSettings({ system_prompt_template: systemPrompt.trim(), default_user_prompt: userPrompt.trim() })
      setPromptsSaved(true)
      setPromptsMsg({ ok: true, text: 'Enregistré' })
    } catch (e) {
      setPromptsMsg({ ok: false, text: errorMessage(e) })
    }
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const uri = await downloadAccountExport()
      await Sharing.shareAsync(uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: 'Exporter mes données' })
    } catch (e) {
      Alert.alert('Erreur', errorMessage(e, e instanceof Error ? e.message : "L'export a échoué"))
    } finally {
      setExporting(false)
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

  const inputBox = { minHeight: 110, textAlignVertical: 'top' as const, paddingTop: 12 }

  return (
    <Screen>
      <SectionTitle>Transcription</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Langue préférée</Text>
        <Muted style={{ marginBottom: 12 }}>Forcez une langue, ou laissez MemoMind la détecter.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map((l) => {
            const on = language === l.code
            return (
              <Pressable
                key={l.code}
                onPress={() => pickLanguage(l.code)}
                style={{ paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderRadius: 19, borderWidth: 1.5, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.card }}
              >
                <Text style={{ color: on ? t.primary : t.text, fontWeight: '600' }}>{l.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      <SectionTitle>Enregistrements</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Garder mes enregistrements</Text>
            <Muted>
              {keep
                ? "L'audio reste sur cet appareil après la transcription. Il n'est jamais synchronisé."
                : "L'audio est supprimé de cet appareil une fois la transcription terminée."}
            </Muted>
          </View>
          <Switch
            value={keep}
            onValueChange={(v) => {
              setKeep(v)
              setKeepRecordings(v)
            }}
            trackColor={{ true: t.primary }}
          />
        </View>
        <Button
          title={`Enregistrements locaux (${local.count} · ${(local.bytes / 1e6).toFixed(1)} Mo)`}
          variant="secondary"
          onPress={() => router.push('/recordings')}
          style={{ marginTop: 14 }}
        />
      </Card>

      <SectionTitle>Prompts</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        <Field
          label="Prompt système"
          value={systemPrompt}
          onChangeText={(v) => {
            setSystemPrompt(v)
            setPromptsSaved(false)
          }}
          multiline
          placeholder="Vous êtes un assistant… Utilisez {transcript} pour insérer la transcription."
          style={inputBox}
        />
        <Field
          label="Prompt lancé automatiquement"
          value={userPrompt}
          onChangeText={(v) => {
            setUserPrompt(v)
            setPromptsSaved(false)
          }}
          multiline
          placeholder="Ex. Résume cette transcription en 5 points."
          style={inputBox}
        />
        <Muted style={{ marginBottom: 12 }}>Le prompt automatique est envoyé dès que vous ouvrez le chat d&apos;une nouvelle transcription.</Muted>
        {promptsMsg && (promptsMsg.ok ? <Text style={{ color: t.success, marginBottom: 12 }}>{promptsMsg.text}</Text> : <ErrorText>{promptsMsg.text}</ErrorText>)}
        <Button title="Enregistrer les prompts" variant="secondary" onPress={savePrompts} disabled={promptsSaved} />
      </Card>

      <SectionTitle>Compte</SectionTitle>
      <Heading>{email || '…'}</Heading>
      <Button title="Exporter mes données" variant="secondary" onPress={exportData} loading={exporting} style={{ marginTop: 8 }} />
      <Button title="Se déconnecter" variant="secondary" onPress={signOut} style={{ marginTop: 12 }} />
      <Button title="Supprimer mon compte" variant="danger" onPress={confirmDelete} style={{ marginTop: 12 }} />
    </Screen>
  )
}
