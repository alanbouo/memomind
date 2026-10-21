import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import Constants from 'expo-constants'
import { File, Paths, UploadType } from 'expo-file-system'
import { fetch as expoFetch } from 'expo/fetch'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveAccessToken,
} from './storage'

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl ?? 'https://api.memomind.space'

export const api = axios.create({ baseURL: API_URL, timeout: 30000 })

// Set by the auth provider so a failed refresh can sign the user out.
let onSessionExpired: (() => void) | null = null
export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  onSessionExpired = fn
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// A single in-flight refresh shared by all concurrent 401s.
let refreshing: Promise<string> | null = null

const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('No refresh token')
  const form = new FormData()
  form.append('refresh_token', refreshToken)
  const { data } = await axios.post(`${API_URL}/refresh`, form)
  await saveAccessToken(data.access_token)
  return data.access_token
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    if (error.response?.status === 401 && original && !original._retry && getRefreshToken()) {
      original._retry = true
      try {
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null
        })
        const token = await refreshing
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        await clearTokens()
        onSessionExpired?.()
      }
    }
    return Promise.reject(error)
  }
)

/** Human-readable message from an API error. */
export const errorMessage = (e: unknown, fallback = 'Une erreur est survenue'): string => {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { detail?: unknown; error?: string } | undefined
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) return (data.detail[0] as { msg?: string })?.msg ?? fallback
    if (data?.error) return data.error
    if (!e.response) return 'Impossible de joindre le serveur'
  } else if (e instanceof Error && e.message) {
    return e.message
  }
  return fallback
}

// ---------- Types ----------
export type TranscriptState = 'processing' | 'completed' | 'failed'

export interface TranscriptSummary {
  id: number
  status: TranscriptState
  error: string | null
  tags: string[]
  pinned: boolean
  transcript_id: string
  filename: string
  created_at: string
  word_count: number
  preview: string
  content: string
  speakers: string[]
}

export interface Utterance {
  speaker: string
  speaker_name: string
  text: string
  timestamp: string
  start_formatted: string
  /** Position in the audio, in milliseconds. */
  start?: number
  end?: number
}

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export interface UserSettings {
  default_language: string | null
  system_prompt_template: string | null
  default_user_prompt: string | null
  [key: string]: unknown
}

export interface PickedAudio {
  uri: string
  name: string
  mimeType: string
  /** Set for recordings kept on the device (see lib/recordings). */
  recordingId?: string
}

// ---------- Auth ----------
export const requestEmailCode = (email: string) =>
  axios.post(`${API_URL}/auth/email/request`, { email }).then((r) => r.data)

export const verifyEmailCode = (email: string, code: string) =>
  axios.post(`${API_URL}/auth/email/verify`, { email, code }).then((r) => r.data as { access_token: string; refresh_token: string })

export const socialLogin = (provider: 'google' | 'apple', idToken: string) =>
  axios
    .post(`${API_URL}/auth/social`, { provider, id_token: idToken })
    .then((r) => r.data as { access_token: string; refresh_token: string })

export const getCurrentUser = () => api.get<{ email: string }>('/me').then((r) => r.data)

// ---------- Transcription ----------
const buildAudioForm = (audio: PickedAudio) => {
  const form = new FormData()
  // React Native's FormData accepts { uri, name, type } for files.
  form.append('file', { uri: audio.uri, name: audio.name, type: audio.mimeType } as unknown as Blob)
  // Always the best quality: the app no longer exposes the setting.
  form.append('quality', 'high')
  return form
}

/**
 * Reports 0-100: upload = 0-25%, then simulated progress while the server
 * transcribes (the API is synchronous, as on the web client): 25-95%.
 * A ticker runs from the start so the bar always moves, even if the platform
 * never reports upload progress.
 */
const withProgress = async <T,>(
  send: (onUpload: (e: { loaded: number; total?: number }) => void) => Promise<T>,
  onProgress?: (pct: number) => void
): Promise<T> => {
  const startedAt = Date.now()
  let current = 0
  let sawUploadEvents = false
  let uploadDone = false
  const emit = () => onProgress?.(Math.round(current))
  emit()
  const timer = setInterval(() => {
    // Without upload events, assume the upload is over after a few seconds.
    const processing = uploadDone || (!sawUploadEvents && Date.now() - startedAt > 8000)
    current = processing
      ? Math.min(95, current + (current < 60 ? 1.5 : current < 80 ? 0.8 : 0.3))
      : Math.min(24, current + (sawUploadEvents ? 0 : 1))
    emit()
  }, 600)
  try {
    const result = await send((e) => {
      if (!e.total) return
      sawUploadEvents = true
      current = Math.max(current, Math.min(25, (e.loaded * 25) / e.total))
      if (e.loaded >= e.total) uploadDone = true
      emit()
    })
    current = 100
    emit()
    return result
  } finally {
    clearInterval(timer)
  }
}

// Transcription of long audio can take minutes.
const LONG_TIMEOUT = 15 * 60 * 1000

/**
 * Sends a file to be transcribed. The server answers as soon as it has the file and
 * transcribes in the background, so the app can show the entry straight away (see
 * getTranscriptStatus). On iOS the upload carries on if the app goes to the background.
 */
export const uploadForTranscription = async (audio: PickedAudio, onProgress?: (pct: number) => void) => {
  // An authenticated call first, so an expired access token is refreshed before the upload.
  await getCurrentUser()
  const task = new File(audio.uri).createUploadTask(`${API_URL}/transcribe`, {
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: audio.mimeType,
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    parameters: { quality: 'high', background: 'true' },
    sessionType: 'background',
    onProgress: ({ bytesSent, totalBytes }) => totalBytes > 0 && onProgress?.(Math.min(100, Math.round((bytesSent * 100) / totalBytes))),
  })
  const res = await task.uploadAsync()
  let body: { database_id?: number; error?: string; detail?: unknown } = {}
  try {
    body = JSON.parse(res.body)
  } catch {
    // not JSON: handled below
  }
  if (res.status < 200 || res.status >= 300 || typeof body.database_id !== 'number') {
    throw new Error(body.error ?? (typeof body.detail === 'string' ? body.detail : "L'envoi a échoué"))
  }
  return { id: body.database_id }
}

export interface TranscriptStatus {
  id: number
  status: TranscriptState
  error: string | null
  filename: string
  tags: string[]
  pinned: boolean
}

export const getTranscriptStatus = (id: number) => api.get<TranscriptStatus>(`/transcripts/${id}/status`).then((r) => r.data)

export interface GuestResult {
  id: string
  text: string
  utterances: Utterance[]
}

export const transcribeAudioGuest = (audio: PickedAudio, onProgress?: (p: number) => void) =>
  withProgress(
    (onUploadProgress) =>
      axios
        .post<GuestResult>(`${API_URL}/transcribe/guest`, buildAudioForm(audio), {
          timeout: LONG_TIMEOUT,
          onUploadProgress,
        })
        .then((r) => r.data),
    onProgress
  )

// ---------- Transcripts ----------
export const listTranscripts = () => api.get<TranscriptSummary[]>('/transcripts/list').then((r) => r.data)

export const getTranscriptText = (id: number | string, timestamps = false) =>
  api
    .get<string>(`/transcripts/${id}`, { params: { format: 'txt', timestamps }, transformResponse: (d) => d })
    .then((r) => r.data)

export const getUtterances = (id: number) =>
  api
    .get<{ utterances: Utterance[]; speakers: Record<string, string> }>(`/transcripts/${id}/utterances`)
    .then((r) => r.data)

export const updateTranscript = (id: number, patch: { filename?: string; pinned?: boolean }) => api.patch(`/transcripts/${id}`, patch)

export const setTranscriptTags = (id: number, tags: string[]) =>
  api.put<{ tags: string[] }>(`/transcripts/${id}/tags`, { tags }).then((r) => r.data.tags)

/** Every tag the user has used, most used first: suggestions while tagging. */
export const listTags = () => api.get<{ tag: string; count: number }[]>('/tags').then((r) => r.data)

export const deleteTranscripts = (ids: number[]) => api.post<{ deleted: number }>('/transcripts/delete', { ids }).then((r) => r.data)

export const renameTranscript = (id: number, filename: string) =>
  api.patch(`/transcripts/${id}`, { filename }).then((r) => r.data)

export const deleteTranscript = (id: number) => api.delete(`/transcripts/${id}`).then((r) => r.data)

export const updateSpeakerMapping = (id: number, originalLabel: string, displayName: string) =>
  api.put(`/transcripts/${id}/speakers`, { original_label: originalLabel, display_name: displayName })

// ---------- Chat ----------
export const sendChatMessage = (id: number, message: string) =>
  api.post<ChatMessage>(`/chat/${id}`, { message }, { timeout: 120000 }).then((r) => r.data)

export const getChatHistory = (id: number) => api.get<ChatMessage[]>(`/chat/${id}/history`).then((r) => r.data)

export const clearChatHistory = (id: number) => api.delete(`/chat/${id}/history`)

export const sendChatMessageGuest = (message: string, transcriptText: string) => {
  const form = new FormData()
  form.append('message', message)
  form.append('transcript_text', transcriptText)
  return axios
    .post<{ response: string }>(`${API_URL}/chat/guest`, form, { timeout: 120000 })
    .then((r) => r.data)
}

// ---------- Settings / account ----------
export const getSettings = () => api.get<UserSettings>('/settings').then((r) => r.data)

export const updateSettings = (patch: Partial<UserSettings>) => api.put('/settings', patch)

export const deleteAccount = () => api.delete('/account')

// Fetches the ZIP of all transcripts and returns a local file ready to share.
export const downloadAccountExport = async (): Promise<string> => {
  // A cheap authenticated call first, so an expired access token gets refreshed.
  await getCurrentUser()
  const res = await expoFetch(`${API_URL}/account/export`, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
  if (!res.ok) throw new Error("L'export a échoué")
  const file = new File(Paths.cache, 'memomind-export.zip')
  if (file.exists) file.delete()
  file.create()
  file.write(await res.bytes())
  return file.uri
}
