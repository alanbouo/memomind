import { Stack, router, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, Share, Text, TextInput, View } from 'react-native'
import { CONSENT_DECLINED, useAiConsent } from '../../components/AiConsent'
import { PlayerControls } from '../../components/AudioPreview'
import { ChatPanel } from '../../components/ChatPanel'
import { TagEditor } from '../../components/Tags'
import { PromptModal } from '../../components/PromptModal'
import { UtteranceList } from '../../components/UtteranceList'
import { Button, Card, ErrorText, Muted } from '../../components/ui'
import {
  clearChatHistory,
  deleteTranscript,
  errorMessage,
  getChatHistory,
  getSettings,
  getTranscriptStatus,
  getTranscriptText,
  getUtterances,
  renameTranscript,
  updateTranscript,
  sendChatMessage,
  updateSpeakerMapping,
  TranscriptStatus,
  TranscriptSummary,
  Utterance,
} from '../../lib/api'
import { cached, readCached } from '../../lib/cache'
import { findByTranscript, onTranscriptionsCompleted, releaseRecording } from '../../lib/recordings'
import { findRanges } from '../../lib/search'
import { useTheme } from '../../lib/theme'

export default function TranscriptScreen() {
  const t = useTheme()
  const { ensure } = useAiConsent()
  const { id: rawId } = useLocalSearchParams<{ id: string }>()
  const id = Number(rawId)
  const [tab, setTab] = useState<'text' | 'chat'>('text')
  const [filename, setFilename] = useState('Transcription')
  const [utterances, setUtterances] = useState<Utterance[] | null>(null)
  const [timestamps, setTimestamps] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renameFile, setRenameFile] = useState(false)
  const [speaker, setSpeaker] = useState<Utterance | null>(null)

  const [status, setStatus] = useState<TranscriptStatus | null>(null)
  const [offline, setOffline] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [pinned, setPinned] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  // The audio, when this device still has the recording: listen, and tap a passage to play it.
  const [recUri, setRecUri] = useState<string | null>(null)
  const player = useAudioPlayer(recUri ? { uri: recUri } : null)
  const playerStatus = useAudioPlayerStatus(player)

  // Search in the transcript
  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)
  const [jump, setJump] = useState<{ index: number; n: number } | null>(null)
  const matches = useMemo(
    () => (utterances && query.trim() ? utterances.flatMap((u, i) => (findRanges(u.text, query).length > 0 ? [i] : [])) : []),
    [utterances, query]
  )

  const goToMatch = (pos: number, list: number[]) => {
    if (list.length === 0) return
    const wrapped = (pos + list.length) % list.length
    setMatchPos(wrapped)
    setJump((j) => ({ index: list[wrapped], n: (j?.n ?? 0) + 1 }))
  }

  const onQueryChange = (value: string) => {
    setQuery(value)
    const next = utterances && value.trim() ? utterances.flatMap((u, i) => (findRanges(u.text, value).length > 0 ? [i] : [])) : []
    setMatchPos(0)
    if (next.length > 0) setJump((j) => ({ index: next[0], n: (j?.n ?? 0) + 1 }))
  }

  const playFrom = async (u: Utterance) => {
    if (!recUri || u.start === undefined) return
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    await player.seekTo(u.start / 1000)
    player.play()
  }

  // The utterance under the playhead (last one that started), while there is audio to follow.
  const activeIndex = useMemo(() => {
    if (!recUri || !utterances) return undefined
    const ms = playerStatus.currentTime * 1000
    if (!playerStatus.playing && ms < 1) return undefined
    let found = -1
    utterances.forEach((u, i) => {
      if (u.start !== undefined && u.start <= ms) found = i
    })
    return found >= 0 ? found : undefined
  }, [recUri, utterances, playerStatus.currentTime, playerStatus.playing])

  const loadUtterances = useCallback(async () => {
    try {
      const { data, stale } = await cached(`utterances-${id}`, () => getUtterances(id))
      setUtterances(data.utterances)
      setOffline(stale)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [id])

  // Follow the transcription until it is done; the entry can be renamed meanwhile.
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const s = await getTranscriptStatus(id)
        if (!alive) return
        setStatus(s)
        setTags(s.tags ?? []) // an API without tags yet omits the field
        setPinned(Boolean(s.pinned))
        setRecUri(findByTranscript(id)?.uri ?? null)
        setFilename(s.filename)
        setOffline(false)
        if (s.status === 'processing') timer = setTimeout(tick, 4000)
        else if (s.status === 'completed') {
          onTranscriptionsCompleted([id])
          loadUtterances()
        }
      } catch {
        if (!alive) return
        // No network: show the last copy of this transcript if there is one.
        setRecUri(findByTranscript(id)?.uri ?? null)
        setFilename(readCached<TranscriptSummary[]>('list')?.find((x) => x.id === id)?.filename ?? 'Transcription')
        await loadUtterances()
        if (alive) timer = setTimeout(tick, 10000)
      }
    }
    tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [id, loadUtterances])

  // Re-render every few seconds while waiting, for the elapsed time.
  useEffect(() => {
    if (status?.status !== 'processing') return
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [status?.status])

  const retry = async () => {
    // Free the recording (it becomes a draft again) and drop the failed entry.
    await deleteTranscript(id).catch(() => {})
    releaseRecording(id)
    router.replace('/')
  }

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
      [pinned ? 'Désépingler' : 'Épingler en haut', togglePin],
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

  const togglePin = async () => {
    try {
      await updateTranscript(id, { pinned: !pinned })
      setPinned(!pinned)
    } catch (e) {
      Alert.alert('Erreur', errorMessage(e))
    }
  }

  // The saved default prompt runs by itself on a new chat, so it needs the consent first.
  const autoPrompt = useCallback(async () => ((await ensure()) ? ((await getSettings()).default_user_prompt?.trim() || null) : null), [ensure])

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

      {offline && <Muted style={{ textAlign: 'center', marginTop: 8 }}>Hors ligne : dernière version enregistrée</Muted>}

      {status?.tags !== undefined && (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <TagEditor transcriptId={id} tags={tags} onChange={setTags} />
        </View>
      )}

      {status?.status === 'processing' ? (
        <View style={{ padding: 16 }}>
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={t.primary} />
            <Text style={{ color: t.text, fontWeight: '700' }}>Transcription en cours…</Text>
            <Muted style={{ textAlign: 'center' }}>
              {Math.max(1, Math.round((now - startedAt) / 60000))} min · Vous pouvez renommer cette entrée ou quitter l&apos;écran : elle apparaîtra dans l&apos;historique.
            </Muted>
          </Card>
        </View>
      ) : status?.status === 'failed' ? (
        <View style={{ padding: 16, gap: 12 }}>
          <ErrorText>{status.error ?? 'La transcription a échoué.'}</ErrorText>
          {findByTranscript(id) ? (
            <Button title="Réessayer avec l'enregistrement" onPress={retry} />
          ) : (
            <Muted>Aucun enregistrement local pour relancer cette transcription.</Muted>
          )}
        </View>
      ) : tab === 'text' ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : utterances ? (
          <View style={{ flex: 1 }}>
            {recUri && (
              <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                <Card style={{ padding: 12 }}>
                  <PlayerControls player={player} status={playerStatus} />
                </Card>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12 }}>
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                placeholder="Rechercher dans la transcription…"
                placeholderTextColor={t.muted}
                clearButtonMode="while-editing"
                returnKeyType="search"
                onSubmitEditing={() => goToMatch(matchPos + 1, matches)}
                style={{ flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, color: t.text, paddingHorizontal: 14, fontSize: 15 }}
              />
              {query.trim() !== '' && (
                <>
                  <Muted style={{ minWidth: 44, textAlign: 'center' }}>{matches.length === 0 ? '0' : `${matchPos + 1}/${matches.length}`}</Muted>
                  <Pressable accessibilityLabel="Résultat précédent" hitSlop={8} onPress={() => goToMatch(matchPos - 1, matches)} disabled={matches.length === 0}>
                    <Ionicons name="chevron-up" size={24} color={matches.length ? t.primary : t.muted} />
                  </Pressable>
                  <Pressable accessibilityLabel="Résultat suivant" hitSlop={8} onPress={() => goToMatch(matchPos + 1, matches)} disabled={matches.length === 0}>
                    <Ionicons name="chevron-down" size={24} color={matches.length ? t.primary : t.muted} />
                  </Pressable>
                </>
              )}
            </View>
            <UtteranceList
              utterances={utterances}
              showTimestamps={timestamps}
              onSpeakerPress={setSpeaker}
              onUtterancePress={recUri ? playFrom : undefined}
              activeIndex={activeIndex}
              query={query}
              focus={jump}
              follow={playerStatus.playing && !query.trim() ? activeIndex : undefined}
            />
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} />
        )
      ) : (
        <ChatPanel
          loadHistory={loadHistory}
          autoPrompt={autoPrompt}
          send={async (m) => {
            if (!(await ensure())) throw new Error(CONSENT_DECLINED)
            return (await sendChatMessage(id, m)).content
          }}
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
