import { useEffect, useState } from 'react'
import { Plus, X, Sparkles, Hash } from 'lucide-react'
import { listTags, setTranscriptTags, setSuggestedTags } from '../services/api'

export function TagChip({ tag, active, onClick, onRemove }) {
  const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors'
  const tone = active
    ? 'bg-primary-600 border-primary-600 text-gray-900'
    : 'bg-gray-100 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
  const content = (
    <>
      <Hash className="w-3 h-3 opacity-60" />
      {tag}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Retirer le tag ${tag}`}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onKeyDown={(e) => e.key === 'Enter' && onRemove()}
          className="ml-0.5 hover:text-red-600 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} ${tone} hover:border-primary-500`}>{content}</button>
  ) : (
    <span className={`${base} ${tone}`}>{content}</span>
  )
}

const clean = (raw) => raw.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 30)

/** Tags of one transcript: remove with ×, add by typing (existing tags are proposed), AI proposals to accept or dismiss. Saved at once. */
export function TagEditor({ transcriptId, tags, onChange, suggested = [], onSuggestedChange }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [known, setKnown] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!adding) return
    let alive = true
    listTags().then((l) => alive && setKnown(l)).catch(() => {})
    return () => { alive = false }
  }, [adding])

  const save = async (next) => {
    const previous = tags
    onChange(next) // optimistic
    setError('')
    try {
      onChange(await setTranscriptTags(transcriptId, next))
    } catch {
      onChange(previous)
      setError('Impossible de modifier les tags')
    }
  }

  const add = (raw) => {
    const tag = clean(raw)
    setText('')
    if (tag && !tags.includes(tag)) save([...tags, tag])
  }

  const dismiss = (tag) => {
    const rest = suggested.filter((x) => x !== tag)
    onSuggestedChange?.(rest)
    setSuggestedTags(transcriptId, rest).catch(() => {})
  }

  const typed = clean(text)
  const proposals = known.filter((k) => !tags.includes(k.tag) && k.tag.includes(typed)).slice(0, 8)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => <TagChip key={tag} tag={tag} onRemove={() => save(tags.filter((x) => x !== tag))} />)}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-500"
        >
          <Plus className="w-3 h-3" />
          {tags.length === 0 ? 'Ajouter un tag' : 'Tag'}
        </button>
      </div>

      {suggested.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary-700 dark:text-primary-400" aria-label="Suggestions de l'IA" />
          {suggested.map((tag) => (
            <span key={tag} className="inline-flex items-center rounded-full border border-dashed border-primary-600/60 text-xs">
              <button
                type="button"
                onClick={() => {
                  add(tag)
                  onSuggestedChange?.(suggested.filter((x) => x !== tag))
                }}
                className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 text-primary-800 dark:text-primary-400 hover:bg-primary-600/10 rounded-l-full"
                title="Ajouter ce tag"
              >
                <Plus className="w-3 h-3" />
                {tag}
              </button>
              <button type="button" onClick={() => dismiss(tag)} aria-label={`Ignorer ${tag}`} className="pr-1.5 py-0.5 text-gray-400 hover:text-red-600 rounded-r-full">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add(text)
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Nouveau tag, puis Entrée"
            className="input-field text-sm py-1.5"
          />
          {proposals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {proposals.map((k) => <TagChip key={k.tag} tag={k.tag} onClick={() => add(k.tag)} />)}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
