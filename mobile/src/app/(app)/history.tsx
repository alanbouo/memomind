import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { TagChip } from '../../components/Tags'
import { Button, Card, ErrorText, Muted } from '../../components/ui'
import { deleteTranscripts, errorMessage, getUtterances, listTranscripts, TranscriptSummary, updateTranscript } from '../../lib/api'
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
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const selecting = selected.size > 0

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
  // Every tag in use, most used first, for the filter row.
  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of items ?? []) for (const tag of i.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag)
  }, [items])
  // A tag that vanished (last transcript untagged or deleted) must not keep filtering.
  const activeTag = tagFilter && allTags.includes(tagFilter) ? tagFilter : null
  const filtered = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          (!activeTag || (i.tags ?? []).includes(activeTag)) &&
          (!q || `${i.filename} ${i.content} ${(i.tags ?? []).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [items, q, activeTag]
  )

  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const deleteSelected = () =>
    Alert.alert(`Supprimer ${selected.size} transcription${selected.size > 1 ? 's' : ''} ?`, 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTranscripts([...selected])
            setSelected(new Set())
            await load()
          } catch (e) {
            Alert.alert('Erreur', errorMessage(e))
          }
        },
      },
    ])

  // Pin the selection, or unpin it when everything selected is already pinned.
  const pinSelected = async () => {
    const chosen = (items ?? []).filter((i) => selected.has(i.id))
    const pin = !chosen.every((i) => i.pinned)
    try {
      await Promise.all(chosen.map((i) => updateTranscript(i.id, { pinned: pin })))
      setSelected(new Set())
      await load()
    } catch (e) {
      Alert.alert('Erreur', errorMessage(e))
    }
  }

  if (!items && !error) return <ActivityIndicator style={{ flex: 1 }} color={t.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, paddingBottom: 0, gap: 10 }}>
        {selecting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>
              {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
            </Text>
            <Button title="Épingler" variant="secondary" onPress={pinSelected} style={{ minHeight: 40, paddingHorizontal: 12 }} />
            <Button title="Supprimer" variant="danger" onPress={deleteSelected} style={{ minHeight: 40, paddingHorizontal: 12 }} />
            <Button title="Annuler" variant="ghost" onPress={() => setSelected(new Set())} style={{ minHeight: 40, paddingHorizontal: 8 }} />
          </View>
        ) : (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher dans les transcriptions…"
            placeholderTextColor={t.muted}
            clearButtonMode="while-editing"
            style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, color: t.text, paddingHorizontal: 14, fontSize: 16 }}
          />
        )}
        {allTags.length > 0 && !selecting && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TagChip tag="tous" active={!activeTag} onPress={() => setTagFilter(null)} />
            {allTags.map((tag) => (
              <TagChip key={tag} tag={tag} active={activeTag === tag} onPress={() => setTagFilter(activeTag === tag ? null : tag)} />
            ))}
          </ScrollView>
        )}
        {offline && <Muted>Hors ligne : dernière version enregistrée</Muted>}
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
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>{q || activeTag ? 'Aucun résultat.' : 'Aucune transcription pour le moment.'}</Muted>}
        extraData={selected}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => (selecting ? toggleSelected(item.id) : router.push({ pathname: '/transcript/[id]', params: { id: String(item.id) } }))}
            onLongPress={() => toggleSelected(item.id)}
          >
            <Card style={selected.has(item.id) ? { borderColor: t.primary, borderWidth: 2 } : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {selecting && <Ionicons name={selected.has(item.id) ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected.has(item.id) ? t.primary : t.muted} />}
                {item.pinned && <Ionicons name="pin" size={14} color={t.primary} />}
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {item.filename}
                </Text>
              </View>
              {(item.tags ?? []).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {item.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                </View>
              )}
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
