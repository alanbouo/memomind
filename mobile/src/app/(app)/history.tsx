import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { Card, ErrorText, Muted } from '../../components/ui'
import { errorMessage, getUtterances, listTranscripts, TranscriptSummary } from '../../lib/api'
import { cached, readCached } from '../../lib/cache'
import { onTranscriptionsCompleted } from '../../lib/recordings'
import { formatDateTime } from '../../lib/dates'
import { useTheme } from '../../lib/theme'

// Keep the newest transcripts readable offline: fetch the ones not stored yet.
const prefetch = async (ids: number[]) => {
  for (const id of ids.slice(0, 20)) {
    if (readCached(`utterances-${id}`) !== null) continue
    try {
      await cached(`utterances-${id}`, () => getUtterances(id))
    } catch {
      return // offline or failing: try again on the next refresh
    }
  }
}

const excerpt = (content: string, q: string) => {
  const i = content.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return null
  const start = Math.max(0, i - 40)
  return (start > 0 ? '…' : '') + content.slice(start, i + q.length + 80).replace(/\s+/g, ' ') + '…'
}

export default function History() {
  const t = useTheme()
  const [items, setItems] = useState<TranscriptSummary[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [offline, setOffline] = useState(false)
  const processing = useRef(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const { data, stale } = await cached('list', listTranscripts)
      setItems(data)
      setOffline(stale)
      processing.current = data.some((i) => i.status === 'processing')
      // Recordings whose transcript is ready can go, if the user chose not to keep them.
      if (!stale) {
        const ready = data.filter((i) => i.status === 'completed').map((i) => i.id)
        onTranscriptionsCompleted(ready)
        prefetch(ready)
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  // Refresh on focus, and keep refreshing while something is being transcribed.
  useFocusEffect(
    useCallback(() => {
      load()
      const timer = setInterval(() => processing.current && load(), 6000)
      return () => clearInterval(timer)
    }, [load])
  )

  const q = query.trim()
  const filtered = useMemo(
    () => (items ?? []).filter((i) => !q || `${i.filename} ${i.content}`.toLowerCase().includes(q.toLowerCase())),
    [items, q]
  )

  if (!items && !error) return <ActivityIndicator style={{ flex: 1 }} color={t.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher dans les transcriptions…"
          placeholderTextColor={t.muted}
          clearButtonMode="while-editing"
          style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, color: t.text, paddingHorizontal: 14, fontSize: 16 }}
        />
        {offline && <Muted style={{ marginTop: 8 }}>Hors ligne : dernière version enregistrée</Muted>}
        <ErrorText>{error}</ErrorText>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true)
          await load()
          setRefreshing(false)
        }}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>{q ? 'Aucun résultat.' : 'Aucune transcription pour le moment.'}</Muted>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/transcript/[id]', params: { id: String(item.id) } })}>
            <Card>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                {item.filename}
              </Text>
              <Muted style={{ marginTop: 2 }}>
                {formatDateTime(item.created_at)} · {item.word_count} mots
                {item.speakers.length ? ` · ${item.speakers.join(', ')}` : ''}
              </Muted>
              {item.status === 'processing' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <ActivityIndicator size="small" color={t.primary} />
                  <Muted>Transcription en cours…</Muted>
                </View>
              ) : item.status === 'failed' ? (
                <Text style={{ color: t.danger, marginTop: 8 }} numberOfLines={2}>
                  Échec : {item.error ?? 'la transcription a échoué'}
                </Text>
              ) : (
                <Text style={{ color: t.text, marginTop: 8, lineHeight: 20 }} numberOfLines={3}>
                  {(q && excerpt(item.content, q)) || item.preview}
                </Text>
              )}
            </Card>
          </Pressable>
        )}
      />
    </View>
  )
}
