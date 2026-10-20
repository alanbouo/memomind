import { Stack, router, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, Share, Text, View } from 'react-native'
import { ChatPanel } from '../../components/ChatPanel'
import { PromptModal } from '../../components/PromptModal'
import { UtteranceList } from '../../components/UtteranceList'
import { ErrorText } from '../../components/ui'
import {
  clearChatHistory,
  deleteTranscript,
  errorMessage,
  getChatHistory,
  getSettings,
  getTranscriptText,
  getUtterances,
  listTranscripts,
  renameTranscript,
  sendChatMessage,
  updateSpeakerMapping,
  Utterance,
} from '../../lib/api'
import { useTheme } from '../../lib/theme'

const autoPrompt = () => getSettings().then((s) => s.default_user_prompt?.trim() || null)

export default function TranscriptScreen() {
  const t = useTheme()
  const { id: rawId } = useLocalSearchParams<{ id: string }>()
  const id = Number(rawId)
  const [tab, setTab] = useState<'text' | 'chat'>('text')
  const [filename, setFilename] = useState('Transcription')
  const [utterances, setUtterances] = useState<Utterance[] | null>(null)
  const [timestamps, setTimestamps] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renameFile, setRenameFile] = useState(false)
  const [speaker, setSpeaker] = useState<Utterance | null>(null)

  const loadUtterances = useCallback(async () => {
    try {
      setUtterances((await getUtterances(id)).utterances)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [id])

  useEffect(() => {
    let alive = true
    getUtterances(id)
      .then((r) => alive && setUtterances(r.utterances))
      .catch((e) => alive && setError(errorMessage(e)))
    listTranscripts()
      .then((l) => alive && setFilename(l.find((x) => x.id === id)?.filename ?? 'Transcription'))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  const withText = async (fn: (text: string) => Promise<unknown> | unknown) => {
    try {
      await fn(await getTranscriptText(id, timestamps))
    } catch (e) {
      Alert.alert('Erreur', errorMessage(e))
    }
  }

  const confirmDelete = () =>
    Alert.alert('Supprimer la transcription ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => deleteTranscript(id).then(() => router.back()).catch((e) => Alert.alert('Erreur', errorMessage(e))),
      },
    ])

  const menu = () => {
    const actions: [string, () => void][] = [
      [timestamps ? 'Masquer les horodatages' : 'Afficher les horodatages', () => setTimestamps((v) => !v)],
      ['Partager le texte', () => withText((text) => Share.share({ message: text, title: filename }))],
      ['Copier le texte', () => withText((text) => Clipboard.setStringAsync(text))],
      ['Renommer', () => setRenameFile(true)],
      ['Supprimer', confirmDelete],
    ]
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a[0]), 'Annuler'], cancelButtonIndex: actions.length, destructiveButtonIndex: actions.length - 1 },
        (i) => actions[i]?.[1]()
      )
    } else {
      Alert.alert(filename, undefined, [...actions.map(([text, onPress]) => ({ text, onPress })).slice(0, 3), { text: 'Plus…', onPress: () => Alert.alert(filename, undefined, [...actions.slice(3).map(([text, onPress]) => ({ text, onPress })), { text: 'Annuler', style: 'cancel' as const }]) }])
    }
  }

  const loadHistory = useCallback(() => getChatHistory(id), [id])

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: filename,
          headerRight: () => (
            <Pressable onPress={menu} hitSlop={12} accessibilityLabel="Options">
              <Text style={{ color: t.primary, fontSize: 22, fontWeight: '700' }}>⋯</Text>
            </Pressable>
          ),
        }}
      />
      <View style={{ flexDirection: 'row', margin: 16, marginBottom: 0, borderRadius: 12, backgroundColor: t.border, padding: 3 }}>
        {(['text', 'chat'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: tab === k ? t.card : 'transparent' }}>
            <Text style={{ color: tab === k ? t.text : t.muted, fontWeight: '600' }}>{k === 'text' ? 'Transcription' : 'Chat IA'}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'text' ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : utterances ? (
          <UtteranceList utterances={utterances} showTimestamps={timestamps} onSpeakerPress={setSpeaker} />
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} />
        )
      ) : (
        <ChatPanel
          loadHistory={loadHistory}
          autoPrompt={autoPrompt}
          send={async (m) => (await sendChatMessage(id, m)).content}
          onClear={async () => {
            await clearChatHistory(id)
          }}
        />
      )}

      <PromptModal
        visible={renameFile}
        title="Renommer la transcription"
        initialValue={filename}
        onCancel={() => setRenameFile(false)}
        onSubmit={async (v) => {
          setRenameFile(false)
          try {
            await renameTranscript(id, v)
            setFilename(v)
          } catch (e) {
            Alert.alert('Erreur', errorMessage(e))
          }
        }}
      />
      <PromptModal
        visible={!!speaker}
        title={`Renommer « ${speaker?.speaker_name ?? ''} »`}
        initialValue={speaker?.speaker_name ?? ''}
        onCancel={() => setSpeaker(null)}
        onSubmit={async (v) => {
          const target = speaker
          setSpeaker(null)
          if (!target) return
          try {
            await updateSpeakerMapping(id, target.speaker, v)
            await loadUtterances()
          } catch (e) {
            Alert.alert('Erreur', errorMessage(e))
          }
        }}
      />
    </View>
  )
}
