import { Ionicons } from '@expo/vector-icons'
import {
  AudioQuality,
  IOSOutputFormat,
  RecordingOptions,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import * as DocumentPicker from 'expo-document-picker'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { PickedAudio } from '../lib/api'
import { localStamp } from '../lib/dates'
import { Marker, newMarker } from '../lib/markers'
import {
  addRecording,
  deleteRecording,
  latestDraft,
  markRecordingEnded,
  markRecordingStarted,
  mimeTypeFor,
  recoverInterrupted,
  removeFile,
  saveInProgressMarkers,
} from '../lib/recordings'
import { useTheme } from '../lib/theme'
import { AudioPreview } from './AudioPreview'
import { Waveform } from './Waveform'
import { Button, Card, ErrorText, Muted } from './ui'

// Speech only: mono is all the server needs, so recording at a low rate halves the upload.
// The containers are chosen to survive a crash: CAF (iOS) and ADTS (Android) can be read
// even when the app dies mid-recording, unlike .m4a whose index is written at the very end.
// AVAudioRecorder rejects bit rates that don't suit the sample rate, so settings are tried
// from the leanest down to Expo's own preset, which every device accepts.
type Directory = 'cache' | 'document'

const speech = (directory: Directory, sampleRate: number, bitRate: number): RecordingOptions => ({
  ...RecordingPresets.HIGH_QUALITY,
  directory,
  isMeteringEnabled: true,
  sampleRate,
  numberOfChannels: 1,
  bitRate,
  ...(Platform.OS === 'ios'
    ? { extension: '.caf', ios: { ...RecordingPresets.HIGH_QUALITY.ios, outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH } }
    : { extension: '.aac', android: { outputFormat: 'aac_adts' as const, audioEncoder: 'aac' as const } }),
})

const fallback = (directory: Directory): RecordingOptions => ({ ...RecordingPresets.HIGH_QUALITY, directory, isMeteringEnabled: true })

const candidates = (directory: Directory): RecordingOptions[] => [
  speech(directory, 16000, 32000),
  speech(directory, 22050, 48000),
  speech(directory, 44100, 64000),
  fallback(directory),
]
const KEPT = candidates('document') // survives OS cache cleaning
const TEMPORARY = candidates('cache')

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

type Session = 'idle' | 'recording' | 'paused'

// Crash recovery runs once per app launch, not on every remount.
let recovered = false

interface Props {
  /** Runs the upload; progress is reported 0-100. Throws on failure. */
  onSubmit: (audio: PickedAudio, onProgress: (p: number) => void) => Promise<void>
  /**
   * Keep recordings on the device until they are sent (and survive app restarts).
   * Off for guests: nothing is stored.
   */
  persist?: boolean
}

export function UploadPanel({ onSubmit, persist = false }: Props) {
  const t = useTheme()
  const options = persist ? KEPT : TEMPORARY
  const recorder = useAudioRecorder(options[options.length - 1])
  const state = useAudioRecorderState(recorder, 100)
  const [session, setSession] = useState<Session>('idle')
  const [audio, setAudio] = useState<PickedAudio | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [takes, setTakes] = useState(0) // bumped per recording so the audiogram starts empty
  const [markers, setMarkers] = useState<Marker[]>([])

  const busy = progress !== null
  const active = session !== 'idle'

  // Bring back an unsent recording (and any that a crash cut short) when the screen shows.
  useFocusEffect(
    useCallback(() => {
      if (!persist || session !== 'idle') return
      if (!recovered) {
        recovered = true
        const saved = recoverInterrupted()
        if (saved) setNote('Un enregistrement interrompu a été récupéré.')
      }
      const draft = latestDraft()
      setAudio((current) => current ?? (draft ? { uri: draft.uri, name: draft.name, mimeType: mimeTypeFor(draft.uri), recordingId: draft.id } : null))
    }, [persist, session])
  )

  // A phone call, a disconnected headset… stop the recorder without our involvement.
  useEffect(() => {
    if (session !== 'recording' || state.isRecording) return
    const timer = setTimeout(() => {
      setSession('paused')
      setNote('Enregistrement interrompu (appel, casque débranché…). Reprenez ou terminez.')
    }, 1500)
    return () => clearTimeout(timer)
  }, [session, state.isRecording])

  const pickFile = async () => {
    setError(null)
    const res = await DocumentPicker.getDocumentAsync({
      type: ['audio/*', 'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'],
      copyToCacheDirectory: true,
    })
    if (res.canceled) return
    const f = res.assets[0]
    setAudio({ uri: f.uri, name: f.name, mimeType: f.mimeType ?? 'application/octet-stream' })
  }

  const startRecording = async () => {
    setError(null)
    setNote(null)
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Micro refusé', "Autorisez l'accès au micro dans les réglages pour enregistrer.")
      return
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true, interruptionMode: 'doNotMix' })
      let prepared = false
      let failure: unknown
      for (const candidate of options) {
        try {
          await recorder.prepareToRecordAsync(candidate)
          prepared = true
          break
        } catch (e) {
          failure = e
        }
      }
      if (!prepared) throw failure
      recorder.record()
      setSession('recording')
      setTakes((n) => n + 1)
      setMarkers([])
      setAudio(null)
      if (persist && recorder.uri) markRecordingStarted(recorder.uri, `enregistrement-${localStamp()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de démarrer l'enregistrement")
    }
  }

  const togglePause = () => {
    if (session === 'recording') {
      recorder.pause()
      setSession('paused')
    } else {
      setNote(null)
      recorder.record()
      setSession('recording')
    }
  }

  const addMarker = () => {
    const marker = newMarker(state.durationMillis, markers.length)
    const next = [...markers, marker]
    setMarkers(next)
    saveInProgressMarkers(next)
  }

  const stopRecording = async () => {
    const durationMs = state.durationMillis
    const uri = recorder.uri
    await recorder.stop()
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false })
    setSession('idle')
    setNote(null)
    if (!uri) return
    const name = `enregistrement-${localStamp()}`
    if (persist) {
      const entry = addRecording({ name, uri, durationMs, markers })
      markRecordingEnded()
      setAudio({ uri, name, mimeType: mimeTypeFor(uri), recordingId: entry.id })
    } else {
      setAudio({ uri, name: `${name}${uri.slice(uri.lastIndexOf('.'))}`, mimeType: mimeTypeFor(uri) })
    }
  }

  const cancelRecording = () =>
    Alert.alert("Annuler l'enregistrement ?", 'Ce qui a été enregistré sera supprimé.', [
      { text: 'Continuer', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const uri = recorder.uri
          await recorder.stop().catch(() => {})
          await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false })
          if (uri) removeFile(uri)
          if (persist) markRecordingEnded()
          setMarkers([])
          setSession('idle')
          setNote(null)
        },
      },
    ])

  const discardAudio = () =>
    Alert.alert("Supprimer l'enregistrement ?", persist ? "Le fichier sera effacé de l'appareil." : undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          if (audio?.recordingId) deleteRecording(audio.recordingId)
          setAudio(null)
          setError(null)
        },
      },
    ])

  const submit = async () => {
    if (!audio) return
    setError(null)
    setProgress(0)
    try {
      await onSubmit(audio, setProgress)
      setAudio(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Échec de la transcription')
    } finally {
      setProgress(null)
    }
  }

  // dB (about -50 silence … 0 loud) to 0..1; the exponent makes quiet speech visible
  const level = state.metering === undefined ? 0 : Math.pow(Math.max(0, Math.min(1, (state.metering + 50) / 50)), 1.6)
  const recording = session === 'recording'

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? "Terminer l'enregistrement" : "Démarrer l'enregistrement"}
          onPress={active ? stopRecording : startRecording}
          disabled={busy}
          style={[
            styles.recBtn,
            { backgroundColor: active ? t.danger : t.primary, shadowColor: active ? t.danger : t.primary, opacity: busy ? 0.4 : 1 },
          ]}
        >
          <Ionicons name={active ? 'stop' : 'mic'} size={active ? 64 : 84} color="#fff" />
        </Pressable>
        <Text style={{ color: t.text, fontSize: 40, fontWeight: '300', fontVariant: ['tabular-nums'] }}>{active ? fmt(state.durationMillis) : '00:00'}</Text>

        {active ? (
          <>
            <Waveform level={level} active={recording} resetKey={takes} />
            <Muted>{recording ? "Enregistrement en cours… vous pouvez quitter l'app" : 'En pause'}</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 4 }}>
              {persist && (
                <Pressable accessibilityRole="button" accessibilityLabel="Poser un repère" onPress={addMarker} style={[styles.pill, { borderColor: t.primary, backgroundColor: t.primarySoft }]}>
                  <Ionicons name="flag" size={18} color={t.primary} />
                  <Text style={{ color: t.primary, fontWeight: '600' }}>Repère</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={togglePause} style={[styles.pill, { borderColor: t.border, backgroundColor: t.card }]}>
                <Ionicons name={recording ? 'pause' : 'play'} size={18} color={t.primary} />
                <Text style={{ color: t.text, fontWeight: '600' }}>{recording ? 'Pause' : 'Reprendre'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={cancelRecording} style={[styles.pill, { borderColor: t.border, backgroundColor: t.card }]}>
                <Ionicons name="trash-outline" size={18} color={t.danger} />
                <Text style={{ color: t.danger, fontWeight: '600' }}>Annuler</Text>
              </Pressable>
            </View>
            {markers.length > 0 && (
              <Muted>
                {markers.length} repère{markers.length > 1 ? 's' : ''} · dernier à {fmt(markers[markers.length - 1].atMs)}
              </Muted>
            )}
          </>
        ) : (
          <>
            <Muted>Touchez pour enregistrer un mémo vocal</Muted>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Importer un fichier audio ou vidéo"
              onPress={pickFile}
              disabled={busy}
              style={({ pressed }) => [styles.pill, { marginTop: 8, borderColor: t.border, backgroundColor: t.card, opacity: busy ? 0.4 : pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={t.primary} />
              <Text style={{ color: t.text, fontWeight: '600' }}>Importer un audio / une vidéo</Text>
            </Pressable>
          </>
        )}
      </View>

      {note && <Muted style={{ textAlign: 'center' }}>{note}</Muted>}

      {audio && !active && (
        <Card>
          <AudioPreview key={audio.uri} uri={audio.uri} name={audio.name} />
          <Muted style={{ marginTop: 10 }}>
            {persist ? 'Enregistré sur votre appareil. Le réseau ne sert qu’à transcrire.' : 'Écoutez avant de transcrire.'}
          </Muted>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>

      {busy ? (
        <Card>
          <Muted style={{ marginBottom: 8 }}>
            {persist
              ? progress >= 100
                ? 'Lancement de la transcription…'
                : `Envoi… ${progress}%`
              : `${progress < 25 ? 'Envoi…' : 'Transcription en cours (cela peut prendre quelques minutes)…'} ${progress}%`}
          </Muted>
          <View style={[styles.track, { backgroundColor: t.border }]}>
            <View style={[styles.bar, { backgroundColor: t.primary, width: `${progress}%` }]} />
          </View>
        </Card>
      ) : (
        audio &&
        !active && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Supprimer" variant="secondary" onPress={discardAudio} style={{ flex: 1 }} />
            <Button title="Transcrire" onPress={submit} style={{ flex: 2 }} />
          </View>
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  recBtn: {
    width: 176,
    height: 176,
    borderRadius: 88,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
})
