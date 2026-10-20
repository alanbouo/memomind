import { Ionicons } from '@expo/vector-icons'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import * as DocumentPicker from 'expo-document-picker'
import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { PickedAudio } from '../lib/api'
import { localStamp } from '../lib/dates'
import { useTheme } from '../lib/theme'
import { AudioPreview } from './AudioPreview'
import { Button, Card, ErrorText, Muted } from './ui'

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  /** Runs the upload; progress is reported 0-100. Throws on failure. */
  onSubmit: (audio: PickedAudio, onProgress: (p: number) => void) => Promise<void>
}

export function UploadPanel({ onSubmit }: Props) {
  const t = useTheme()
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const state = useAudioRecorderState(recorder, 250)
  const [audio, setAudio] = useState<PickedAudio | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const busy = progress !== null
  const recording = state.isRecording

  // Elapsed time while transcribing: proof of life even when the percentage crawls.
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [busy])

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
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Micro refusé', "Autorisez l'accès au micro dans les réglages pour enregistrer.")
      return
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
    setAudio(null)
  }

  const stopRecording = async () => {
    await recorder.stop()
    await setAudioModeAsync({ allowsRecording: false })
    if (recorder.uri) {
      setAudio({ uri: recorder.uri, name: `enregistrement-${localStamp()}.m4a`, mimeType: 'audio/mp4' })
    }
  }

  const submit = async () => {
    if (!audio) return
    setError(null)
    setElapsed(0)
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

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
          onPress={recording ? stopRecording : startRecording}
          disabled={busy}
          style={[
            styles.recBtn,
            { backgroundColor: recording ? t.danger : t.primary, shadowColor: recording ? t.danger : t.primary, opacity: busy ? 0.4 : 1 },
          ]}
        >
          <Ionicons name={recording ? 'stop' : 'mic'} size={recording ? 64 : 84} color="#fff" />
        </Pressable>
        <Text style={{ color: t.text, fontSize: 40, fontWeight: '300', fontVariant: ['tabular-nums'] }}>
          {recording ? fmt(state.durationMillis) : '00:00'}
        </Text>
        <Muted>{recording ? 'Enregistrement en cours… touchez pour arrêter' : 'Touchez pour enregistrer un mémo vocal'}</Muted>

        {!recording && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Importer un fichier audio ou vidéo"
            onPress={pickFile}
            disabled={busy}
            style={({ pressed }) => [styles.uploadBtn, { borderColor: t.border, backgroundColor: t.card, opacity: busy ? 0.4 : pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={t.primary} />
            <Text style={{ color: t.text, fontWeight: '600' }}>Importer un audio / une vidéo</Text>
          </Pressable>
        )}
      </View>

      {audio && !recording && (
        <Card>
          <AudioPreview key={audio.uri} uri={audio.uri} name={audio.name} />
          <Muted style={{ marginTop: 10 }}>Écoutez avant de transcrire, ou réenregistrez.</Muted>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>

      {busy ? (
        <Card>
          <Muted style={{ marginBottom: 8 }}>
            {progress < 25 ? 'Envoi…' : 'Transcription en cours (cela peut prendre quelques minutes)…'} {progress}% · {fmt(elapsed * 1000)}
          </Muted>
          <View style={[styles.track, { backgroundColor: t.border }]}>
            <View style={[styles.bar, { backgroundColor: t.primary, width: `${progress}%` }]} />
          </View>
        </Card>
      ) : (
        audio && !recording && <Button title="Transcrire" onPress={submit} />
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
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, marginTop: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
})
