import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChatMessage, errorMessage } from '../lib/api'
import { useTheme } from '../lib/theme'
import { ErrorText, Muted } from './ui'

interface Props {
  loadHistory?: () => Promise<ChatMessage[]>
  send: (message: string) => Promise<string>
  onClear?: () => Promise<void>
  /** Resolves the prompt to send automatically when the conversation is empty. */
  autoPrompt?: () => Promise<string | null>
}

export function ChatPanel({ loadHistory, send, onClear, autoPrompt }: Props) {
  const t = useTheme()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useRef<FlatList<ChatMessage>>(null)

  const ask = useCallback(
    async (text: string) => {
      setError(null)
      setSending(true)
      setMessages((m) => [...m, { role: 'user', content: text }])
      try {
        const reply = await send(text)
        setMessages((m) => [...m, { role: 'assistant', content: reply }])
      } catch (e) {
        setError(errorMessage(e, "Le message n'a pas pu être envoyé"))
      } finally {
        setSending(false)
      }
    },
    [send]
  )

  // Load the history; on a fresh conversation, run the user's saved default prompt once.
  const autoRan = useRef(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const history = (await loadHistory?.().catch(() => [])) ?? []
      if (!alive) return
      setMessages(history)
      if (history.length === 0 && autoPrompt && !autoRan.current) {
        autoRan.current = true
        const prompt = await autoPrompt().catch(() => null)
        if (alive && prompt) await ask(prompt)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHistory])

  const submit = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    await ask(text)
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>Posez une question sur cette transcription.</Muted>}
        renderItem={({ item }) => {
          const mine = item.role === 'user'
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? t.bubbleUser : t.bubbleAi }]}>
              <Text selectable style={{ color: mine ? '#fff' : t.text, fontSize: 15, lineHeight: 21 }}>
                {item.content}
              </Text>
            </View>
          )
        }}
        ListFooterComponent={sending ? <ActivityIndicator style={{ marginTop: 8 }} color={t.primary} /> : null}
      />
      <View style={{ paddingHorizontal: 16 }}>
        <ErrorText>{error}</ErrorText>
      </View>
      <View style={[styles.bar, { borderTopColor: t.border, backgroundColor: t.card }]}>
        {onClear && messages.length > 0 && (
          <Pressable
            accessibilityLabel="Effacer la conversation"
            onPress={() => onClear().then(() => setMessages([])).catch((e) => setError(errorMessage(e)))}
            style={{ paddingHorizontal: 8 }}
          >
            <Text style={{ color: t.muted, fontSize: 18 }}>🗑</Text>
          </Pressable>
        )}
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Votre question…"
          placeholderTextColor={t.muted}
          multiline
          style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
        />
        <Pressable
          onPress={submit}
          disabled={!input.trim() || sending}
          style={[styles.send, { backgroundColor: t.primary, opacity: !input.trim() || sending ? 0.5 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Envoyer</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 42, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  send: { height: 42, borderRadius: 21, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
})
