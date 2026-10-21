import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { errorMessage, listTags, setTranscriptTags } from '../lib/api'
import { useTheme } from '../lib/theme'
import { ErrorText } from './ui'

/** A small read-only label. */
export function TagChip({ tag, active, onPress, onRemove }: { tag: string; active?: boolean; onPress?: () => void; onRemove?: () => void }) {
  const t = useTheme()
  return (
    <Pressable
      disabled={!onPress && !onRemove}
      onPress={onRemove ?? onPress}
      accessibilityLabel={onRemove ? `Retirer le tag ${tag}` : `Tag ${tag}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        minHeight: 28,
        borderRadius: 14,
        backgroundColor: active ? t.primary : t.primarySoft,
      }}
    >
      <Text style={{ color: active ? t.onPrimary : t.primary, fontSize: 13, fontWeight: '600' }}>#{tag}</Text>
      {onRemove && <Ionicons name="close" size={14} color={active ? t.onPrimary : t.primary} />}
    </Pressable>
  )
}

/** Tags of one transcript: remove with ×, add by typing (existing tags are suggested). Saved immediately. */
export function TagEditor({ transcriptId, tags = [], onChange }: { transcriptId: number; tags?: string[]; onChange: (tags: string[]) => void }) {
  const t = useTheme()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [known, setKnown] = useState<{ tag: string; count: number }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adding) return
    let alive = true
    listTags()
      .then((l) => alive && setKnown(l))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [adding])

  const save = async (next: string[]) => {
    const previous = tags
    onChange(next) // optimistic
    setError(null)
    try {
      onChange(await setTranscriptTags(transcriptId, next))
    } catch (e) {
      onChange(previous)
      setError(errorMessage(e, 'Impossible de modifier les tags'))
    }
  }

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 30)
    setText('')
    if (tag && !tags.includes(tag)) save([...tags, tag])
  }

  const typed = text.trim().replace(/^#/, '').toLowerCase()
  const suggestions = known.filter((k) => !tags.includes(k.tag) && k.tag.includes(typed)).slice(0, 8)

  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        {tags.map((tag) => (
          <TagChip key={tag} tag={tag} onRemove={() => save(tags.filter((x) => x !== tag))} />
        ))}
        <Pressable
          accessibilityLabel="Ajouter un tag"
          onPress={() => setAdding((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' }}
        >
          <Ionicons name={adding ? 'chevron-up' : 'add'} size={14} color={t.muted} />
          <Text style={{ color: t.muted, fontSize: 13 }}>{tags.length === 0 ? 'Ajouter un tag' : 'Tag'}</Text>
        </Pressable>
      </ScrollView>
      {adding && (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Nouveau tag, puis Entrée"
            placeholderTextColor={t.muted}
            autoFocus
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => add(text)}
            style={{ minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, color: t.text, paddingHorizontal: 12, fontSize: 15 }}
          />
          {suggestions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.map((k) => (
                <TagChip key={k.tag} tag={k.tag} onPress={() => add(k.tag)} />
              ))}
            </View>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  )
}
