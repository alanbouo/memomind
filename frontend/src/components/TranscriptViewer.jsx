import { useState, useMemo, useRef } from 'react'
import {
  FileText, Download, Calendar, FileJson, MessageCircle, Check, X, Trash2, Pencil, AlertTriangle, Search,
  FileAudio, Copy, CheckCheck, Clock, Pin, Archive, ArchiveRestore, RefreshCw, Sparkles, Loader2,
} from 'lucide-react'
import api, {
  getTranscriptUtterances, getTranscriptStatus, updateSpeakerMapping, renameTranscript, deleteTranscript,
  updateTranscript, generateSummary,
} from '../services/api'
import ChatInterface from './ChatInterface'
import { TagChip, TagEditor } from './Tags'
import { formatRange, renderTranscriptText } from '../utils/time'

const formatWordCount = (count) => (count ? `${count >= 1000 ? `${(count / 1000).toFixed(1)} k` : count} mots` : null)

const formatDate = (iso, long = false) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Short excerpts around each match of `query` inside `content`
const getMatchSnippets = (content, query, maxSnippets = 3, contextChars = 40) => {
  if (!content || !query) return []
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const snippets = []
  let index = lowerContent.indexOf(lowerQuery)
  while (index !== -1 && snippets.length < maxSnippets) {
    const start = Math.max(0, index - contextChars)
    const end = Math.min(content.length, index + query.length + contextChars)
    snippets.push({
      before: (start > 0 ? '…' : '') + content.slice(start, index),
      match: content.slice(index, index + query.length),
      after: content.slice(index + query.length, end) + (end < content.length ? '…' : ''),
    })
    index = lowerContent.indexOf(lowerQuery, index + query.length)
  }
  return snippets
}

function IconButton({ label, onClick, tone = 'text-primary-800 dark:text-primary-400', children }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label={label}
      title={label}
      className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${tone}`}
    >
      {children}
    </button>
  )
}

function TranscriptViewer({ transcripts, onTranscriptDeleted, onTranscriptChanged }) {
  const [selected, setSelected] = useState(null)
  const [data, setData] = useState({ utterances: [], speakers: {}, summary: null })
  const [suggested, setSuggested] = useState([])
  const [loading, setLoading] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [editingSpeaker, setEditingSpeaker] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [error, setError] = useState('')
  const opened = useRef(0) // guards against a slow response for a transcript that was closed or replaced

  const q = query.trim().toLowerCase()
  const hasArchived = transcripts.some((t) => t.archived)

  // Every tag in use, most used first, for the filter row.
  const allTags = useMemo(() => {
    const counts = new Map()
    for (const t of transcripts) for (const tag of t.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag)
  }, [transcripts])
  const activeTag = tagFilter && allTags.includes(tagFilter) ? tagFilter : null

  const filtered = transcripts.filter((t) => {
    if (Boolean(t.archived) !== showArchived) return false
    if (activeTag && !(t.tags || []).includes(activeTag)) return false
    if (!q) return true
    return `${t.filename} ${t.content || ''} ${(t.tags || []).join(' ')} ${(t.speakers || []).join(' ')}`.toLowerCase().includes(q)
  })

  const flash = (message) => {
    setError(message)
    setTimeout(() => setError(''), 4000)
  }

  const patch = (dbId, changes) => onTranscriptChanged?.(dbId, changes)

  const open = async (transcript) => {
    const ticket = ++opened.current
    setLoading(true)
    setSelected(transcript)
    setData({ utterances: [], speakers: {}, summary: null })
    setSuggested([])
    try {
      const [content, status] = await Promise.all([
        getTranscriptUtterances(transcript.database_id),
        getTranscriptStatus(transcript.database_id).catch(() => null),
      ])
      if (ticket !== opened.current) return
      setData(content)
      setSuggested(status?.suggested_tags || [])
    } catch {
      if (ticket === opened.current) flash('Impossible de charger la transcription')
    } finally {
      if (ticket === opened.current) setLoading(false)
    }
  }

  const close = () => {
    opened.current++
    setSelected(null)
    setShowChat(false)
    setCopied(false)
    setEditingSpeaker(null)
  }

  const download = async (transcript, format) => {
    try {
      const response = await api.get(`/transcripts/${transcript.id}`, {
        params: format === 'txt' ? { format, timestamps: showTimestamps } : { format },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${transcript.filename.replace(/\.[^.]+$/, '')}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      flash('Le téléchargement a échoué')
    }
  }

  const speakerName = (label) => data.speakers[label] || label

  const startEditing = (label) => {
    setEditingSpeaker(label)
    // Still the default label (A, B…): start empty rather than make the user erase it.
    setEditValue(speakerName(label) !== label ? speakerName(label) : '')
  }

  const saveSpeaker = async () => {
    if (!editValue.trim()) return
    try {
      await updateSpeakerMapping(selected.database_id, editingSpeaker, editValue.trim())
      setData((prev) => ({ ...prev, speakers: { ...prev.speakers, [editingSpeaker]: editValue.trim() } }))
      setEditingSpeaker(null)
    } catch {
      flash("Impossible de renommer l'interlocuteur")
    }
  }

  const saveRename = async (transcript) => {
    const name = renameValue.trim()
    setRenaming(null)
    if (!name || name === transcript.filename) return
    try {
      await renameTranscript(transcript.database_id, name)
      patch(transcript.database_id, { filename: name })
      if (selected?.database_id === transcript.database_id) setSelected({ ...selected, filename: name })
    } catch {
      flash('Impossible de renommer la transcription')
    }
  }

  const toggle = async (transcript, key) => {
    const value = !transcript[key]
    try {
      await updateTranscript(transcript.database_id, { [key]: value })
      // An archived entry loses its pin (the server does the same).
      patch(transcript.database_id, key === 'archived' && value ? { archived: true, pinned: false } : { [key]: value })
    } catch {
      flash('La modification a échoué')
    }
  }

  const confirmDelete = async () => {
    const target = deleteConfirm
    setDeleteConfirm(null)
    if (!target) return
    try {
      await deleteTranscript(target.database_id)
      if (selected?.database_id === target.database_id) close()
      onTranscriptDeleted?.(target.database_id)
    } catch {
      flash('La suppression a échoué')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(renderTranscriptText(data.utterances, speakerName, showTimestamps))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      flash('Copie impossible')
    }
  }

  const regenerate = async () => {
    setSummarizing(true)
    try {
      const result = await generateSummary(selected.database_id)
      setData((prev) => ({ ...prev, summary: result.summary }))
      setSuggested(result.suggested_tags || [])
      patch(selected.database_id, { summary: result.summary, filename: result.filename ?? selected.filename })
      if (result.filename) setSelected((prev) => ({ ...prev, filename: result.filename }))
    } catch (e) {
      flash(e.response?.data?.detail || 'Le résumé n’a pas pu être généré')
    } finally {
      setSummarizing(false)
    }
  }

  const speakerButton = (label, className) =>
    editingSpeaker === label ? (
      <span className="inline-flex items-center gap-1">
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder="Nom"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveSpeaker()
            if (e.key === 'Escape') setEditingSpeaker(null)
          }}
          className="text-sm border border-primary-500 dark:bg-gray-700 dark:text-white rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 w-36"
        />
        <button onClick={saveSpeaker} aria-label="Enregistrer" className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"><Check className="w-4 h-4" /></button>
        <button onClick={() => setEditingSpeaker(null)} aria-label="Annuler" className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"><X className="w-4 h-4" /></button>
      </span>
    ) : (
      <button onClick={() => startEditing(label)} title="Renommer l’interlocuteur" className={className}>
        {speakerName(label)}
        <Pencil className="w-3 h-3 opacity-50" />
      </button>
    )

  if (transcripts.length === 0) {
    return (
      <div className="card text-center py-12">
        <FileText className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Aucune transcription pour le moment</h3>
        <p className="text-gray-500 dark:text-gray-400">Enregistrez ou importez un fichier audio pour commencer.</p>
      </div>
    )
  }

  const labels = [...new Set((data.utterances || []).map((u) => u.speaker))]

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="p-3 rounded-lg text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">{error}</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher dans les transcriptions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field pl-10 py-2.5"
        />
      </div>

      {(allTags.length > 0 || hasArchived) && (
        <div className="flex flex-wrap gap-1.5">
          {hasArchived && <TagChip tag={showArchived ? 'retour' : 'archivées'} active={showArchived} onClick={() => setShowArchived((v) => !v)} />}
          <TagChip tag="tous" active={!activeTag} onClick={() => setTagFilter(null)} />
          {allTags.map((tag) => <TagChip key={tag} tag={tag} active={activeTag === tag} onClick={() => setTagFilter(activeTag === tag ? null : tag)} />)}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">
          {q || activeTag ? 'Aucun résultat.' : showArchived ? 'Aucune transcription archivée.' : 'Aucune transcription.'}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((t) => {
          const processing = t.status === 'processing'
          const failed = t.status === 'failed'
          const snippets = q && !processing ? getMatchSnippets(t.content, query.trim()) : []
          return (
            <div
              key={t.database_id}
              onClick={() => !processing && !failed && open(t)}
              className={`card ${processing || failed ? '' : 'cursor-pointer hover:border-primary-600/60'} animate-slide-up`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {renaming === t.database_id ? (
                    <div className="flex items-center gap-2 mb-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(t)
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                      />
                      <button onClick={() => saveRename(t)} aria-label="Enregistrer" className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setRenaming(null)} aria-label="Annuler" className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                      {t.pinned && <Pin className="w-3.5 h-3.5 text-primary-700 dark:text-primary-400 shrink-0" aria-label="Épinglée" />}
                      <span className="truncate">{t.filename}</span>
                    </h3>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{formatDate(t.timestamp)}</span>
                    {t.word_count > 0 && <span className="flex items-center gap-1.5"><FileAudio className="w-4 h-4" />{formatWordCount(t.word_count)}</span>}
                    {(t.speakers || []).length > 0 && <span className="truncate">{t.speakers.join(', ')}</span>}
                  </div>
                </div>

                <div className="flex shrink-0">
                  {!processing && !failed && (
                    <>
                      <IconButton label="Renommer" onClick={() => { setRenaming(t.database_id); setRenameValue(t.filename) }}><Pencil className="w-4 h-4" /></IconButton>
                      {!t.archived && <IconButton label={t.pinned ? 'Désépingler' : 'Épingler'} onClick={() => toggle(t, 'pinned')}><Pin className={`w-4 h-4 ${t.pinned ? 'fill-current' : ''}`} /></IconButton>}
                      <IconButton label={t.archived ? 'Désarchiver' : 'Archiver'} onClick={() => toggle(t, 'archived')}>
                        {t.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </IconButton>
                    </>
                  )}
                  <IconButton label="Supprimer" tone="text-red-600 dark:text-red-400" onClick={() => setDeleteConfirm(t)}><Trash2 className="w-4 h-4" /></IconButton>
                </div>
              </div>

              {(t.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">{t.tags.map((tag) => <TagChip key={tag} tag={tag} />)}</div>
              )}

              {processing ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Transcription en cours…</p>
              ) : failed ? (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">Échec : {t.error || 'la transcription a échoué'}</p>
              ) : snippets.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                  {snippets.map((s, i) => (
                    <p key={i} className="text-sm text-gray-600 dark:text-gray-400">
                      {s.before}<mark className="bg-primary-200 dark:bg-primary-600/40 text-gray-900 dark:text-white rounded px-0.5">{s.match}</mark>{s.after}
                    </p>
                  ))}
                </div>
              ) : (t.summary || t.preview) ? (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{t.summary || t.preview}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-0 sm:p-4 z-50" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-gray-800 sm:rounded-xl max-w-7xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{selected.filename}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{formatDate(selected.timestamp, true)}</p>
                </div>
                <button onClick={close} aria-label="Fermer" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-6 h-6" /></button>
              </div>
              <div className="mt-3">
                <TagEditor
                  transcriptId={selected.database_id}
                  tags={selected.tags || []}
                  onChange={(tags) => {
                    setSelected((prev) => ({ ...prev, tags }))
                    patch(selected.database_id, { tags })
                  }}
                  suggested={suggested}
                  onSuggestedChange={setSuggested}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {[
                  [showTimestamps ? 'Masquer les horodatages' : 'Afficher les horodatages', Clock, showTimestamps, () => setShowTimestamps(!showTimestamps)],
                  [showChat ? 'Masquer le chat' : 'Chat IA', MessageCircle, showChat, () => setShowChat(!showChat)],
                ].map(([label, Icon, on, run]) => (
                  <button
                    key={label}
                    onClick={run}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${on ? 'bg-primary-600 text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
                <button
                  onClick={copy}
                  disabled={!data.utterances?.length}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${copied ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copié !' : 'Copier le texte'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
              <div className={`${showChat ? 'md:w-2/5 h-1/2 md:h-auto' : 'w-full'} p-4 sm:p-6 overflow-y-auto md:border-r border-b md:border-b-0 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900`}>
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
                ) : (
                  <div className="space-y-5">
                    {(data.summary || data.utterances?.length > 0) && (
                      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/60 p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <p className="label-bracket">résumé</p>
                          <button
                            onClick={regenerate}
                            disabled={summarizing}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary-800 dark:text-primary-400 hover:underline disabled:opacity-50"
                          >
                            {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : data.summary ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {data.summary ? 'Régénérer' : 'Générer un résumé'}
                          </button>
                        </div>
                        {data.summary && <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{data.summary}</p>}
                      </div>
                    )}

                    {labels.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                        <p className="label-bracket mb-2">interlocuteurs</p>
                        <div className="flex flex-wrap gap-2">
                          {labels.map((label) => (
                            <span key={label}>
                              {speakerButton(label, 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-200 hover:border-primary-500 transition-colors')}
                            </span>
                          ))}
                        </div>
                        {labels.some((l) => speakerName(l) === l) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Cliquez sur un interlocuteur pour le nommer. Le nom s’applique partout, y compris dans le chat IA.</p>
                        )}
                      </div>
                    )}

                    {data.utterances?.length > 0 ? (
                      data.utterances.map((u, index) => {
                        // A monologue is split into many segments: label the speaker only when it changes.
                        const newSpeaker = index === 0 || data.utterances[index - 1].speaker !== u.speaker
                        return (
                          <div key={index} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                            {(newSpeaker || showTimestamps) && (
                              <div className="flex items-center gap-2 mb-2">
                                {newSpeaker && speakerButton(u.speaker, 'inline-flex items-center gap-1.5 text-sm font-bold text-primary-800 dark:text-primary-400')}
                                {showTimestamps && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded" title={`Début : ${u.start_formatted || formatRange(u.start)}`}>
                                    {u.timestamp || formatRange(u.start, u.end)}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{u.text}</p>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        <p>Aucune donnée structurée pour cette transcription.</p>
                        <p className="text-sm mt-2">Elle est peut-être ancienne, ou son traitement a échoué.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showChat && (
                <div className="md:w-3/5 flex-1 flex flex-col bg-white dark:bg-gray-800 min-h-0">
                  <ChatInterface transcriptId={selected.database_id} />
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-end gap-3">
              <button onClick={() => download(selected, 'txt')} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />Télécharger en TXT</button>
              <button onClick={() => download(selected, 'json')} className="btn-secondary flex items-center gap-2"><FileJson className="w-4 h-4" />Télécharger en JSON</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" role="alertdialog" aria-modal="true">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">Supprimer la transcription ?</h3>
            <p className="text-gray-900 dark:text-white font-medium text-center mb-2 truncate">« {deleteConfirm.filename} »</p>
            <p className="text-sm text-red-600 dark:text-red-400 text-center mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">Annuler</button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TranscriptViewer
