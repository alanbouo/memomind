import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { Card, ErrorText, Muted } from '../../components/ui'
import { errorMessage, listTranscripts, TranscriptSummary } from '../../lib/api'
import { formatDateTime } from '../../lib/dates'
import { useTheme } from '../../lib/theme'

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

  const load = useCallback(async () => {
    try {
      setError(null)
      setItems(await listTranscripts())
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
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
              <Text style={{ color: t.text, marginTop: 8, lineHeight: 20 }} numberOfLines={3}>
                {(q && excerpt(item.content, q)) || item.preview}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </View>
  )
}
