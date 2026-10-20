import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, FlatList, Pressable, Text, View } from 'react-native'
import { AudioPreview } from '../components/AudioPreview'
import { Button, Card, Muted } from '../components/ui'
import { formatDateTime } from '../lib/dates'
import { deleteRecording, fileSize, listRecordings, Recording, releaseRecording } from '../lib/recordings'
import { useTheme } from '../lib/theme'

const fmtDuration = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Recordings stored on this device only: listen, send again, delete. */
export default function Recordings() {
  const t = useTheme()
  const [items, setItems] = useState<Recording[]>([])
  const [open, setOpen] = useState<string | null>(null)

  const refresh = useCallback(() => setItems(listRecordings()), [])
  useFocusEffect(refresh)

  const confirmDelete = (r: Recording) =>
    Alert.alert('Supprimer cet enregistrement ?', "Le fichier sera effacé de l'appareil. La transcription n'est pas touchée.", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          deleteRecording(r.id)
          refresh()
        },
      },
    ])

  const sendAgain = (r: Recording) => {
    // Back to a draft on the Transcribe screen.
    if (r.transcriptId !== undefined) releaseRecording(r.transcriptId)
    router.dismissTo('/')
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      style={{ backgroundColor: t.bg }}
      ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>Aucun enregistrement sur cet appareil.</Muted>}
      renderItem={({ item }) => (
        <Card>
          <Pressable onPress={() => setOpen(open === item.id ? null : item.id)}>
            <Text style={{ color: t.text, fontWeight: '700' }} numberOfLines={1}>
              {item.name}
            </Text>
            <Muted style={{ marginTop: 2 }}>
              {formatDateTime(item.createdAt)}
              {item.durationMs > 0 ? ` · ${fmtDuration(item.durationMs)}` : ''} · {(fileSize(item.uri) / 1e6).toFixed(1)} Mo ·{' '}
              {item.transcriptId !== undefined ? 'transcrit' : 'non envoyé'}
            </Muted>
          </Pressable>
          {open === item.id && (
            <View style={{ marginTop: 12, gap: 12 }}>
              <AudioPreview key={item.uri} uri={item.uri} name={item.name} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Supprimer" variant="secondary" onPress={() => confirmDelete(item)} style={{ flex: 1 }} />
                <Button title={item.transcriptId !== undefined ? 'Retranscrire' : 'Transcrire'} onPress={() => sendAgain(item)} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </Card>
      )}
    />
  )
}
