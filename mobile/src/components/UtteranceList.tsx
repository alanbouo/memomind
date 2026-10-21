import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useRef } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { Utterance } from '../lib/api'
import { Marker } from '../lib/markers'
import { findRanges } from '../lib/search'
import { useTheme } from '../lib/theme'
import { Muted } from './ui'

const PALETTE = ['#0284c7', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0d9488']

interface Props {
  utterances: Utterance[]
  showTimestamps: boolean
  /** Tap on a speaker name (used to rename). */
  onSpeakerPress?: (u: Utterance) => void
  /** Tap on a passage: plays the audio from there when it is available on the device. */
  onUtterancePress?: (u: Utterance) => void
  /** Utterance being played, highlighted. */
  activeIndex?: number
  /** Search term: matches are highlighted. */
  query?: string
  /** Scroll to this utterance whenever `n` changes. */
  focus?: { index: number; n: number } | null
  /** Keep this utterance in view (the one being played). */
  follow?: number
  /** Markers dropped while recording, shown where they fall in the conversation. */
  markers?: Marker[]
  onMarkerPress?: (m: Marker) => void
  onMarkerRename?: (m: Marker) => void
}

const isNamed = (u: Utterance) => Boolean(u.speaker_name) && u.speaker_name !== u.speaker

function MarkerRow({ marker, onPress, onRename }: { marker: Marker; onPress?: (m: Marker) => void; onRename?: (m: Marker) => void }) {
  const t = useTheme()
  const s = Math.floor(marker.atMs / 1000)
  const time = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.primary, opacity: 0.35 }} />
      <Pressable disabled={!onPress} onPress={() => onPress?.(marker)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, backgroundColor: t.primarySoft }}>
        <Ionicons name="flag" size={13} color={t.primary} />
        <Text style={{ color: t.primary, fontWeight: '600', fontSize: 13 }}>{marker.label}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>{time}</Text>
      </Pressable>
      {onRename && (
        <Pressable onPress={() => onRename(marker)} hitSlop={10} accessibilityLabel="Renommer le repère">
          <Ionicons name="pencil" size={14} color={t.muted} />
        </Pressable>
      )}
      <View style={{ flex: 1, height: 1, backgroundColor: t.primary, opacity: 0.35 }} />
    </View>
  )
}

function Highlighted({ text, query, color, mark }: { text: string; query?: string; color: string; mark: string }) {
  const ranges = query ? findRanges(text, query) : []
  if (ranges.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let at = 0
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a))
    parts.push(
      <Text key={i} style={{ backgroundColor: mark, color }}>
        {text.slice(a, b)}
      </Text>
    )
    at = b
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

export function UtteranceList({ utterances, showTimestamps, onSpeakerPress, onUtterancePress, activeIndex, query, focus, follow, markers, onMarkerPress, onMarkerRename }: Props) {
  const t = useTheme()
  const list = useRef<FlatList<Utterance>>(null)
  const colors = new Map<string, string>()
  utterances.forEach((u) => {
    if (!colors.has(u.speaker)) colors.set(u.speaker, PALETTE[colors.size % PALETTE.length])
  })

  // Each marker goes just before the passage it falls in or precedes; the rest close the list.
  const { before, after, speakers } = useMemo(() => {
    const before = new Map<number, Marker[]>()
    const after: Marker[] = []
    for (const m of [...(markers ?? [])].sort((a, b) => a.atMs - b.atMs)) {
      const i = utterances.findIndex((u) => (u.end ?? u.start ?? -1) > m.atMs)
      if (i < 0) after.push(m)
      else before.set(i, [...(before.get(i) ?? []), m])
    }
    const speakers = new Map<string, Utterance>()
    utterances.forEach((u) => {
      const known = speakers.get(u.speaker)
      if (!known || (isNamed(u) && !isNamed(known))) speakers.set(u.speaker, u)
    })
    return { before, after, speakers }
  }, [markers, utterances])
  const unnamed = [...speakers.values()].some((u) => !isNamed(u))

  useEffect(() => {
    if (focus) list.current?.scrollToIndex({ index: focus.index, animated: true, viewPosition: 0.3 })
  }, [focus])

  useEffect(() => {
    if (follow !== undefined) list.current?.scrollToIndex({ index: follow, animated: true, viewPosition: 0.3 })
  }, [follow])

  return (
    <FlatList
      ref={list}
      data={utterances}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ padding: 16, gap: 6 }}
      extraData={`${activeIndex}|${query}|${markers?.map((m) => m.label).join()}`}
      // Rows have no fixed height: when a jump lands on an unmeasured row, retry once it exists.
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
        setTimeout(() => list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }), 120)
      }}
      ListEmptyComponent={<Muted style={{ textAlign: 'center' }}>Aucun contenu.</Muted>}
      ListHeaderComponent={
        onSpeakerPress && speakers.size > 0 ? (
          <View style={{ marginBottom: 10 }}>
            <Muted style={{ marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Interlocuteurs</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[...speakers.values()].map((u) => (
                <Pressable
                  key={u.speaker}
                  onPress={() => onSpeakerPress(u)}
                  accessibilityLabel={`Renommer ${u.speaker_name ?? u.speaker}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.get(u.speaker), backgroundColor: t.card }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.get(u.speaker) }} />
                  <Text style={{ color: t.text, fontWeight: '600' }}>{u.speaker_name ?? u.speaker}</Text>
                  <Ionicons name="pencil" size={13} color={t.muted} />
                </Pressable>
              ))}
            </View>
            {unnamed && <Muted style={{ marginTop: 6, fontSize: 13 }}>Touchez un interlocuteur pour lui donner son nom : il sera appliqué partout, y compris dans le chat IA.</Muted>}
          </View>
        ) : null
      }
      ListFooterComponent={after.length > 0 ? <>{after.map((m) => <MarkerRow key={m.id} marker={m} onPress={onMarkerPress} onRename={onMarkerRename} />)}</> : null}
      renderItem={({ item, index }) => {
        const active = index === activeIndex
        return (
          <>
            {before.get(index)?.map((m) => (
              <MarkerRow key={m.id} marker={m} onPress={onMarkerPress} onRename={onMarkerRename} />
            ))}
          <Pressable
            disabled={!onUtterancePress}
            onPress={() => onUtterancePress?.(item)}
            style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: active ? t.primarySoft : 'transparent' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Pressable disabled={!onSpeakerPress} onPress={() => onSpeakerPress?.(item)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ color: colors.get(item.speaker), fontWeight: '700' }}>{item.speaker_name ?? item.speaker}</Text>
                {onSpeakerPress && <Ionicons name="pencil" size={12} color={t.muted} />}
              </Pressable>
              {showTimestamps && <Muted style={{ fontSize: 12 }}>{item.timestamp}</Muted>}
            </View>
            <Text selectable style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>
              <Highlighted text={item.text} query={query} color={t.text} mark="#fde04770" />
            </Text>
          </Pressable>
          </>
        )
      }}
    />
  )
}
