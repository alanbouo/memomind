import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChatMessage, errorMessage } from '../lib/api'
import { useTheme } from '../lib/theme'
import { Markdown } from './Markdown'
import { ErrorText } from './ui'

const SUGGESTIONS = [
  { icon: 'list-outline', label: 'Résumer en 5 points', prompt: 'Résume cette transcription en 5 points clés.' },
  { icon: 'checkbox-outline', label: 'Actions à faire', prompt: 'Quelles sont les actions ou tâches à faire, et qui en est responsable ?' },
  { icon: 'flag-outline', label: 'Décisions prises', prompt: 'Quelles décisions ont été prises ?' },
  { icon: 'people-outline', label: 'Qui a dit quoi ?', prompt: 'Résume ce que chaque intervenant a dit.' },
] as const

export interface SendContext {
  /** Call with each piece of the answer as it arrives. */
  onText: (chunk: string) => void
  /** True when asking the same question again. */
  regenerate: boolean
  signal: AbortSignal
}

interface Props {
  loadHistory?: () => Promise<ChatMessage[]>
  /** Resolves with the full answer; streaming senders also report pieces through ctx.onText. */
  send: (message: string, ctx: SendContext) => Promise<string>
  onClear?: () => Promise<void>
  /** Resolves the prompt to send automatically when the conversation is empty. */
  autoPrompt?: () => Promise<string | null>
  /** Space kept under the input bar when the keyboard is closed (the home indicator). */
  bottomInset?: number
}

function TypingDots() {
  const t = useTheme()
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)))
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.delay(480 - i * 160),
        ])
      )
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [dots])
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 8 }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.muted, opacity: v }} />
      ))}
    </View>
  )
}

function Avatar() {
  const t = useTheme()
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
      <Ionicons name="sparkles" size={15} color={t.primary} />
    </View>
  )
}

export function ChatPanel({ loadHistory, send, onClear, autoPrompt, bottomInset = 0 }: Props) {
  const t = useTheme()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [overlap, setOverlap] = useState(0)
  const list = useRef<FlatList<ChatMessage>>(null)
  const root = useRef<View>(null)
  const abort = useRef<AbortController | null>(null)

  // Lift the bar above the iOS keyboard by however much of this panel it covers (Android resizes by itself).
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      root.current?.measureInWindow((_x, y, _w, h) => {
        const keyboardTop = e.endCoordinates.screenY
        setOverlap(Math.max(0, y + h - keyboardTop))
      })
    })
    const hide = Keyboard.addListener('keyboardWillHide', () => setOverlap(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const ask = useCallback(
    async (text: string, regenerate = false) => {
      setError(null)
      setSending(true)
      const controller = new AbortController()
      abort.current = controller
      // The question and an empty answer that fills up as the text arrives.
      setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }])
      const append = (chunk: string) =>
        setMessages((m) => {
          const last = m[m.length - 1]
          return last?.role === 'assistant' ? [...m.slice(0, -1), { ...last, content: last.content + chunk }] : m
        })
      try {
        await send(text, { onText: append, regenerate, signal: controller.signal })
      } catch (e) {
        if (!controller.signal.aborted) {
          // The connection can drop (app in the background) while the server goes on and saves the answer: resync before complaining.
          const history = await loadHistory?.().catch(() => null)
          if (history && history[history.length - 1]?.role === 'assistant') {
            setMessages(history)
            return
          }
          setError(errorMessage(e, "Le message n'a pas pu être envoyé"))
          // An answer that never started is dropped; a partial one stays.
          setMessages((m) => (m[m.length - 1]?.role === 'assistant' && !m[m.length - 1].content ? m.slice(0, -1) : m))
        }
      } finally {
        abort.current = null
        setSending(false)
      }
    },
    [send, loadHistory]
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
      abort.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHistory])

  const submit = async (text = input) => {
    const value = text.trim()
    if (!value || sending) return
    setInput('')
    await ask(value)
  }

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || sending) return
    setMessages((m) => (m[m.length - 1]?.role === 'assistant' ? m.slice(0, -2) : m))
    ask(lastUser.content, true)
  }

  const copy = async (index: number) => {
    await Clipboard.setStringAsync(messages[index].content)
    setCopied(index)
    setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500)
  }

  const confirmClear = () =>
    Alert.alert('Effacer la conversation ?', 'Les messages de ce chat seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => onClear?.().then(() => setMessages([])).catch((e) => setError(errorMessage(e))) },
    ])

  const canSend = input.trim().length > 0

  return (
    <View ref={root} style={{ flex: 1 }}>
      {onClear && messages.length > 0 && !sending && (
        <Pressable onPress={confirmClear} hitSlop={8} accessibilityLabel="Effacer la conversation" style={styles.clear}>
          <Ionicons name="trash-outline" size={15} color={t.muted} />
          <Text style={{ color: t.muted, fontSize: 13 }}>Effacer la conversation</Text>
        </Pressable>
      )}
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: 16, gap: 18, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: !sending })}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Ionicons name="sparkles" size={26} color={t.primary} />
            </View>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Posez une question</Text>
            <Text style={{ color: t.muted, textAlign: 'center', marginBottom: 20, paddingHorizontal: 24 }}>
              L&apos;IA répond à partir du contenu de cette transcription.
            </Text>
            <View style={{ alignSelf: 'stretch', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s.label} onPress={() => submit(s.prompt)} style={[styles.suggestion, { borderColor: t.border, backgroundColor: t.card }]}>
                  <Ionicons name={s.icon} size={18} color={t.primary} />
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '500' }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          if (item.role === 'user') {
            return (
              <View style={[styles.bubble, { backgroundColor: t.bubbleUser }]}>
                <Text selectable style={{ color: '#fff', fontSize: 15, lineHeight: 21 }}>
                  {item.content}
                </Text>
              </View>
            )
          }
          const streaming = sending && index === messages.length - 1
          const isLast = index === messages.length - 1
          return (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar />
              <View style={{ flex: 1 }}>
                {item.content ? <Markdown>{item.content}</Markdown> : <TypingDots />}
                {!streaming && item.content !== '' && (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 6, marginLeft: -6 }}>
                    <Pressable onPress={() => copy(index)} hitSlop={6} accessibilityLabel="Copier la réponse" style={styles.action}>
                      <Ionicons name={copied === index ? 'checkmark' : 'copy-outline'} size={16} color={copied === index ? t.success : t.muted} />
                    </Pressable>
                    {isLast && (
                      <Pressable onPress={regenerate} hitSlop={6} accessibilityLabel="Régénérer la réponse" style={styles.action}>
                        <Ionicons name="refresh" size={16} color={t.muted} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            </View>
          )
        }}
      />
      {error && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: (overlap > 0 ? overlap : bottomInset) + 10, backgroundColor: t.bg }}>
        <View style={[styles.inputWrap, { borderColor: t.border, backgroundColor: t.card }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question…"
            placeholderTextColor={t.muted}
            multiline
            style={[styles.input, { color: t.text }]}
          />
          {sending ? (
            <Pressable onPress={() => abort.current?.abort()} accessibilityLabel="Arrêter" style={[styles.send, { backgroundColor: t.text }]}>
              <Ionicons name="stop" size={16} color={t.bg} />
            </Pressable>
          ) : (
            <Pressable onPress={() => submit()} disabled={!canSend} accessibilityLabel="Envoyer" style={[styles.send, { backgroundColor: t.primary, opacity: canSend ? 1 : 0.35 }]}>
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  clear: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 8, marginRight: 16 },
  bubble: { maxWidth: '85%', alignSelf: 'flex-end', borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  action: { padding: 6, borderRadius: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, gap: 8 },
  input: { flex: 1, maxHeight: 120, minHeight: 36, fontSize: 15, paddingTop: Platform.OS === 'ios' ? 8 : 6, paddingBottom: Platform.OS === 'ios' ? 8 : 6 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})
