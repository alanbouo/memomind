import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import Constants from 'expo-constants'
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
  }
  return fallback
}

// ---------- Types ----------
export type Quality = 'low' | 'medium' | 'high'

export interface TranscriptSummary {
  id: number
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
}

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export interface UserSettings {
  default_quality: Quality
  theme: string
  [key: string]: unknown
}

export interface PickedAudio {
  uri: string
  name: string
  mimeType: string
}

// ---------- Auth ----------
export const register = (email: string, password: string) =>
  axios.post(`${API_URL}/register`, { email, password }).then((r) => r.data)

export const login = async (email: string, password: string) => {
  const params = new URLSearchParams({ username: email, password })
  const { data } = await axios.post(`${API_URL}/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data as { access_token: string; refresh_token: string }
}

export const socialLogin = (provider: 'google' | 'apple', idToken: string) =>
  axios
    .post(`${API_URL}/auth/social`, { provider, id_token: idToken })
    .then((r) => r.data as { access_token: string; refresh_token: string })

export const getCurrentUser = () => api.get<{ email: string }>('/me').then((r) => r.data)

export const requestPasswordReset = (email: string) =>
  axios.post(`${API_URL}/forgot-password`, { email }).then((r) => r.data)

// ---------- Transcription ----------
const buildAudioForm = (audio: PickedAudio, quality: Quality) => {
  const form = new FormData()
  // React Native's FormData accepts { uri, name, type } for files.
  form.append('file', { uri: audio.uri, name: audio.name, type: audio.mimeType } as unknown as Blob)
  form.append('quality', quality)
  return form
}

/**
 * Uploads then simulates progress while the server transcribes (the API is
 * synchronous, as on the web client): upload = 0-25%, processing = 25-95%.
 */
const withProgress = async <T,>(
  send: (onUpload: (e: { loaded: number; total?: number }) => void) => Promise<T>,
  onProgress?: (pct: number) => void
): Promise<T> => {
  let timer: ReturnType<typeof setInterval> | null = null
  let current = 0
  try {
    const result = await send((e) => {
      if (!onProgress || !e.total || timer) return
      current = Math.round((e.loaded * 25) / e.total)
      onProgress(current)
      if (e.loaded >= e.total) {
        current = 25
        timer = setInterval(() => {
          current = Math.min(95, current + (current < 60 ? 2 : current < 80 ? 1 : 0.5))
          onProgress(Math.round(current))
        }, 800)
      }
    })
    onProgress?.(100)
    return result
  } finally {
    if (timer) clearInterval(timer)
  }
}

// Transcription of long audio can take minutes.
const LONG_TIMEOUT = 15 * 60 * 1000

export const transcribeAudio = (audio: PickedAudio, quality: Quality, onProgress?: (p: number) => void) =>
  withProgress(
    (onUploadProgress) =>
      api
        .post<{ id: string; database_id: number }>('/transcribe', buildAudioForm(audio, quality), {
          timeout: LONG_TIMEOUT,
          onUploadProgress,
        })
        .then((r) => r.data),
    onProgress
  )

export interface GuestResult {
  id: string
  text: string
  utterances: Utterance[]
}

export const transcribeAudioGuest = (audio: PickedAudio, quality: Quality, onProgress?: (p: number) => void) =>
  withProgress(
    (onUploadProgress) =>
      axios
        .post<GuestResult>(`${API_URL}/transcribe/guest`, buildAudioForm(audio, quality), {
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

export const changePassword = (current_password: string, new_password: string) =>
  api.post('/account/change-password', { current_password, new_password })

export const deleteAccount = () => api.delete('/account')
