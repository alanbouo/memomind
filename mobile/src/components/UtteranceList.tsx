import { useEffect, useRef } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { Utterance } from '../lib/api'
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

export function UtteranceList({ utterances, showTimestamps, onSpeakerPress, onUtterancePress, activeIndex, query, focus, follow }: Props) {
  const t = useTheme()
  const list = useRef<FlatList<Utterance>>(null)
  const colors = new Map<string, string>()
  utterances.forEach((u) => {
    if (!colors.has(u.speaker)) colors.set(u.speaker, PALETTE[colors.size % PALETTE.length])
  })

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
      extraData={`${activeIndex}|${query}`}
      // Rows have no fixed height: when a jump lands on an unmeasured row, retry once it exists.
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
        setTimeout(() => list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }), 120)
      }}
      ListEmptyComponent={<Muted style={{ textAlign: 'center' }}>Aucun contenu.</Muted>}
      renderItem={({ item, index }) => {
        const active = index === activeIndex
        return (
          <Pressable
            disabled={!onUtterancePress}
            onPress={() => onUtterancePress?.(item)}
            style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: active ? t.primarySoft : 'transparent' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Pressable disabled={!onSpeakerPress} onPress={() => onSpeakerPress?.(item)}>
                <Text style={{ color: colors.get(item.speaker), fontWeight: '700' }}>{item.speaker_name ?? item.speaker}</Text>
              </Pressable>
              {showTimestamps && <Muted style={{ fontSize: 12 }}>{item.timestamp}</Muted>}
            </View>
            <Text selectable style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>
              <Highlighted text={item.text} query={query} color={t.text} mark="#fde04770" />
            </Text>
          </Pressable>
        )
      }}
    />
  )
}
