import { useState, useEffect, useRef } from 'react'
import { ArrowUp, Square, Copy, Check, RefreshCw, Trash2, Sparkles, List, ListChecks, Flag, Users } from 'lucide-react'
import { streamChatMessage, getChatHistory, clearChatHistory, api } from '../services/api'
import Markdown from './Markdown'

const SUGGESTIONS = [
  { icon: List, label: 'Summarize in 5 points', prompt: 'Summarize this transcript in 5 key points.' },
  { icon: ListChecks, label: 'Action items', prompt: 'What are the action items or tasks, and who owns each?' },
  { icon: Flag, label: 'Decisions made', prompt: 'What decisions were made?' },
  { icon: Users, label: 'Who said what?', prompt: 'Summarize what each speaker said.' },
]

function TypingDots() {
  return (
    <div className="flex gap-1.5 py-2" aria-label="The assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

function ChatInterface({ transcriptId }) {
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: sending ? 'auto' : 'smooth' })
  }, [messages, sending])

  const ask = async (text, regenerate = false) => {
    setError('')
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    // The question, and an empty answer that fills up as the text arrives.
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    const append = (chunk) =>
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        return last?.role === 'assistant' ? [...prev.slice(0, -1), { ...last, content: last.content + chunk }] : prev
      })
    try {
      await streamChatMessage(transcriptId, text, append, { regenerate, signal: controller.signal })
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.response?.data?.detail || err.message || 'Failed to send message.')
        // An answer that never started is dropped; a partial one stays.
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          return last?.role === 'assistant' && !last.content ? prev.slice(0, -1) : prev
        })
      }
    } finally {
      abortRef.current = null
      setSending(false)
    }
  }

  // Load the history; on a fresh conversation, run the user's saved default prompt once.
  const startPrompt = async () => {
    try {
      const { data } = await api.get('/settings')
      const prompt = data.default_user_prompt?.trim()
      if (prompt) await ask(prompt)
    } catch (err) {
      console.error('Failed to send default prompt:', err)
    }
  }

  useEffect(() => {
    let alive = true
    setMessages([])
    ;(async () => {
      try {
        const history = await getChatHistory(transcriptId)
        if (!alive) return
        setMessages(history)
        if (history.length === 0) await startPrompt()
      } catch (err) {
        console.error('Failed to load chat history:', err)
      }
    })()
    return () => {
      alive = false
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptId])

  const submit = async (text = inputMessage) => {
    const value = text.trim()
    if (!value || sending) return
    setInputMessage('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await ask(value)
  }

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || sending) return
    setMessages((prev) => (prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -2) : prev))
    ask(lastUser.content, true)
  }

  const copy = async (index) => {
    try {
      await navigator.clipboard.writeText(messages[index].content)
      setCopied(index)
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500)
    } catch {
      setError('Could not copy to the clipboard.')
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Start a new conversation? The current messages will be deleted.')) return
    try {
      await clearChatHistory(transcriptId)
      setMessages([])
      await startPrompt()
    } catch {
      setError('Failed to clear chat history')
    }
  }

  const lastIndex = messages.length - 1

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">AI Chat</h3>
        </div>
        {messages.length > 0 && !sending && (
          <button
            onClick={handleClearHistory}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
            title="Start a new conversation"
          >
            <Trash2 className="w-4 h-4" />
            New conversation
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center text-center py-10">
              <div className="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-primary-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Ask about this transcript</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">The AI answers from what was said in the recording.</p>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => submit(prompt)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-left text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-primary-600 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) =>
            msg.role === 'user' ? (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary-600 text-white px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div key={idx} className="flex gap-3 group">
                <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1 text-gray-900 dark:text-gray-100">
                  {msg.content ? <Markdown>{msg.content}</Markdown> : <TypingDots />}
                  {msg.content && !(sending && idx === lastIndex) && (
                    <div className="flex gap-1 mt-1.5 -ml-1.5 text-gray-400">
                      <button onClick={() => copy(idx)} title="Copy" className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200">
                        {copied === idx ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      {idx === lastIndex && (
                        <button onClick={regenerate} title="Regenerate" className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300 max-w-3xl mx-auto">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="max-w-3xl mx-auto flex items-end gap-2 rounded-3xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-4 pr-1.5 py-1.5 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20"
        >
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            onInput={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
            }}
            placeholder="Ask a question about this transcript…"
            aria-label="Your question"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 max-h-[140px]"
          />
          {sending ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              title="Stop"
              className="w-9 h-9 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              title="Send"
              className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

export default ChatInterface
