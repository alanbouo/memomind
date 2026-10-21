import { File } from 'expo-file-system'
import { readJson, writeJson } from './localStore'
import { getLocalPrefs } from './prefs'

/**
 * Voice recordings kept on the device (never uploaded unless the user taps "Transcrire").
 * The index lives in a JSON file next to the audio files in the permanent document directory.
 */
export interface Recording {
  id: string
  name: string
  uri: string
  createdAt: string // ISO, device clock
  durationMs: number
  /** Set once the file was sent for transcription (server-side id). */
  transcriptId?: number
}

/** A recording that started but was never stopped (app killed, crash): recovered on next launch. */
interface InProgress {
  uri: string
  name: string
  startedAt: string
}

interface Index {
  recordings: Recording[]
  inProgress?: InProgress
}

const INDEX = 'recordings.json'

const load = (): Index => readJson<Index>(INDEX, { recordings: [] })
const save = (index: Index) => writeJson(INDEX, index)

const fileOf = (uri: string) => new File(uri)
export const fileExists = (uri: string) => {
  try {
    return fileOf(uri).exists
  } catch {
    return false
  }
}
export const fileSize = (uri: string) => {
  try {
    return fileOf(uri).size ?? 0
  } catch {
    return 0
  }
}

export const removeFile = (uri: string) => {
  try {
    const f = fileOf(uri)
    if (f.exists) f.delete()
  } catch {
    // already gone
  }
}

// ---------- Library ----------
/** Newest first; entries whose file vanished are dropped. */
export function listRecordings(): Recording[] {
  const index = load()
  const alive = index.recordings.filter((r) => fileExists(r.uri))
  if (alive.length !== index.recordings.length) save({ ...index, recordings: alive })
  return alive.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const getRecording = (id: string) => listRecordings().find((r) => r.id === id)

export function addRecording(r: Omit<Recording, 'id' | 'createdAt'> & { createdAt?: string }): Recording {
  const index = load()
  const entry: Recording = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), ...r }
  save({ ...index, recordings: [entry, ...index.recordings] })
  return entry
}

export function updateRecording(id: string, patch: Partial<Recording>) {
  const index = load()
  save({ ...index, recordings: index.recordings.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
}

export function deleteRecording(id: string) {
  const index = load()
  const target = index.recordings.find((r) => r.id === id)
  if (target) removeFile(target.uri)
  save({ ...index, recordings: index.recordings.filter((r) => r.id !== id) })
}

/** The newest recording that was never sent: what the Transcribe screen offers to resume. */
export const latestDraft = (): Recording | undefined => listRecordings().find((r) => r.transcriptId === undefined)

export const totalSize = (): number => listRecordings().reduce((sum, r) => sum + fileSize(r.uri), 0)

/** Some transcriptions are finished: honour the "delete after transcription" preference. */
export function onTranscriptionsCompleted(transcriptIds: number[]) {
  if (transcriptIds.length === 0 || getLocalPrefs().keepRecordings) return
  const index = load()
  const done = new Set(transcriptIds)
  for (const r of index.recordings) if (r.transcriptId !== undefined && done.has(r.transcriptId)) removeFile(r.uri)
  save({ ...index, recordings: index.recordings.filter((r) => r.transcriptId === undefined || !done.has(r.transcriptId)) })
}

/** Detach a recording from its (failed) transcript so it shows up as a draft again. */
export function releaseRecording(transcriptId: number) {
  const index = load()
  save({ ...index, recordings: index.recordings.map((r) => (r.transcriptId === transcriptId ? { ...r, transcriptId: undefined } : r)) })
}

export const findByTranscript = (transcriptId: number) => listRecordings().find((r) => r.transcriptId === transcriptId)

// ---------- Crash recovery ----------
export function markRecordingStarted(uri: string, name: string) {
  save({ ...load(), inProgress: { uri, name, startedAt: new Date().toISOString() } })
}

export function markRecordingEnded() {
  const { inProgress: _gone, ...rest } = load()
  save(rest)
}

/** If a recording was cut short, keep what the file holds as a regular recording. */
export function recoverInterrupted(): Recording | null {
  const { inProgress } = load()
  if (!inProgress) return null
  markRecordingEnded()
  if (!fileExists(inProgress.uri) || fileSize(inProgress.uri) < 2048) {
    removeFile(inProgress.uri)
    return null
  }
  return addRecording({ name: `${inProgress.name} (récupéré)`, uri: inProgress.uri, durationMs: 0, createdAt: inProgress.startedAt })
}

export const mimeTypeFor = (uri: string): string =>
  uri.endsWith('.caf') ? 'audio/x-caf' : uri.endsWith('.aac') ? 'audio/aac' : 'audio/mp4'
