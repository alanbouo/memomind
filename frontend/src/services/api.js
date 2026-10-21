import axios from 'axios'
import { getToken, setToken, getRefreshToken, clearTokens } from '../utils/auth'

// Get API URL from build-time env var, runtime config, or default to /api
const getApiUrl = () => {
  // First try build-time environment variable
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== '__VITE_API_URL__') {
    return import.meta.env.VITE_API_URL
  }
  // Then try runtime config
  if (window.APP_CONFIG?.API_URL && window.APP_CONFIG.API_URL !== '__VITE_API_URL__') {
    return window.APP_CONFIG.API_URL
  }
  // Default to /api for development proxy
  return '/api'
}

const API_BASE_URL = getApiUrl()

export const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = getRefreshToken()
        const formData = new FormData()
        formData.append('refresh_token', refreshToken)

        const response = await axios.post(`${API_BASE_URL}/refresh`, formData)
        const { access_token } = response.data

        setToken(access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`

        return api(originalRequest)
      } catch (refreshError) {
        clearTokens()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// Passwordless sign-in: ask for an e-mailed code, then exchange it for tokens.
export const requestEmailCode = async (email) => {
  const response = await axios.post(`${API_BASE_URL}/auth/email/request`, { email })
  return response.data
}

export const verifyEmailCode = async (email, code) => {
  const response = await axios.post(`${API_BASE_URL}/auth/email/verify`, { email, code })
  return response.data
}

export const getCurrentUser = async () => {
  const response = await api.get('/me')
  return response.data
}

export const transcribeAudio = async (file, quality = 'high', onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('quality', quality)

  // Simulate transcription progress after upload
  let uploadComplete = false
  let simulationInterval = null
  let currentProgress = 0

  const startProgressSimulation = () => {
    uploadComplete = true
    currentProgress = 25 // Start from 25% after upload
    
    // Gradually increase progress from 25% to 95%
    simulationInterval = setInterval(() => {
      if (currentProgress < 95) {
        // Slower progression as we get higher
        const increment = currentProgress < 60 ? 2 : currentProgress < 80 ? 1 : 0.5
        currentProgress = Math.min(95, currentProgress + increment)
        if (onProgress) {
          onProgress(Math.round(currentProgress))
        }
      }
    }, 800) // Update every 800ms
  }

  try {
    const response = await api.post('/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total && !uploadComplete) {
          // Upload phase: 0-25%
          const uploadProgress = Math.round((progressEvent.loaded * 25) / progressEvent.total)
          onProgress(uploadProgress)
          
          // Start simulation when upload is complete
          if (progressEvent.loaded === progressEvent.total) {
            startProgressSimulation()
          }
        }
      }
    })

    // Clear simulation interval
    if (simulationInterval) {
      clearInterval(simulationInterval)
    }
    
    // Final progress: 100%
    if (onProgress) {
      onProgress(100)
    }

    return response.data
  } catch (error) {
    // Clear simulation on error
    if (simulationInterval) {
      clearInterval(simulationInterval)
    }
    throw error
  }
}

export const getTranscript = async (transcriptId, format = 'txt') => {
  const response = await api.get(`/transcripts/${transcriptId}`, {
    params: { format }
  })
  return response.data
}

export const checkHealth = async () => {
  const response = await axios.get(`${API_BASE_URL}/health`)
  return response.data
}

// Transcript management
export const listTranscripts = async () => {
  const response = await api.get('/transcripts/list')
  return response.data
}

export const renameTranscript = async (transcriptId, filename) => {
  const response = await api.patch(`/transcripts/${transcriptId}`, { filename })
  return response.data
}

export const deleteTranscript = async (transcriptId) => {
  const response = await api.delete(`/transcripts/${transcriptId}`)
  return response.data
}

// Chat functions
export const sendChatMessage = async (transcriptId, message) => {
  const response = await api.post(`/chat/${transcriptId}`, { message })
  return response.data
}

// Streams the answer: calls onText with each piece, resolves with the full text.
// Falls back to a single request when the server has no streaming endpoint yet.
export const streamChatMessage = async (transcriptId, message, onText, { regenerate = false, signal } = {}) => {
  await api.get('/me') // refreshes an expired token through the interceptor
  const response = await fetch(`${API_BASE_URL}/chat/${transcriptId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ message, regenerate }),
    signal,
  })
  if (response.status === 404 || response.status === 405) {
    const reply = (await sendChatMessage(transcriptId, message)).content
    onText(reply)
    return reply
  }
  if (!response.ok || !response.body) {
    let detail = ''
    try {
      detail = (await response.json()).detail
    } catch {
      // keep the generic message
    }
    throw new Error(detail || 'Failed to send message')
  }

  // Newline-delimited JSON: {"t": text} chunks, then {"done": true} or {"error": ...}
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      const event = JSON.parse(line)
      if (event.error) throw new Error(event.error)
      if (event.t) {
        full += event.t
        onText(event.t)
      }
    }
  }
  return full
}

export const getChatHistory = async (transcriptId) => {
  const response = await api.get(`/chat/${transcriptId}/history`)
  return response.data
}

export const clearChatHistory = async (transcriptId) => {
  const response = await api.delete(`/chat/${transcriptId}/history`)
  return response.data
}

// Speaker management
export const getTranscriptUtterances = async (transcriptId) => {
  const response = await api.get(`/transcripts/${transcriptId}/utterances`)
  return response.data
}

export const updateSpeakerMapping = async (transcriptId, originalLabel, displayName) => {
  const response = await api.put(`/transcripts/${transcriptId}/speakers`, {
    original_label: originalLabel,
    display_name: displayName
  })
  return response.data
}

// ============== Guest Mode Functions ==============

// A transcript made as a guest is kept for the tab's session so it can be saved once the person signs in.
const GUEST_KEY = 'memomind-guest-transcript'

export const rememberGuestTranscript = (result) => {
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify({ filename: result.name, text: result.text, json_response: result.json_response ?? null }))
  } catch { /* storage full or blocked: the transcript just won't carry over */ }
}

export const forgetGuestTranscript = () => {
  try { sessionStorage.removeItem(GUEST_KEY) } catch { /* nothing to forget */ }
}

/** Saves the remembered guest transcript to the signed-in account. Resolves true if one was saved. */
export const adoptGuestTranscript = async () => {
  let saved = null
  try { saved = JSON.parse(sessionStorage.getItem(GUEST_KEY)) } catch { /* none */ }
  if (!saved) return false
  try {
    await api.post('/transcripts/import', saved)
    forgetGuestTranscript()
    return true
  } catch {
    return false
  }
}

export const transcribeAudioGuest = async (file, quality = 'medium', onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('quality', quality)

  let uploadComplete = false
  let simulationInterval = null
  let currentProgress = 0

  const startProgressSimulation = () => {
    uploadComplete = true
    currentProgress = 25
    
    simulationInterval = setInterval(() => {
      if (currentProgress < 95) {
        const increment = currentProgress < 60 ? 2 : currentProgress < 80 ? 1 : 0.5
        currentProgress = Math.min(95, currentProgress + increment)
        if (onProgress) {
          onProgress(Math.round(currentProgress))
        }
      }
    }, 800)
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/transcribe/guest`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total && !uploadComplete) {
          const uploadProgress = Math.round((progressEvent.loaded * 25) / progressEvent.total)
          onProgress(uploadProgress)
          
          if (progressEvent.loaded === progressEvent.total) {
            startProgressSimulation()
          }
        }
      }
    })

    if (simulationInterval) {
      clearInterval(simulationInterval)
    }
    
    if (onProgress) {
      onProgress(100)
    }

    return response.data
  } catch (error) {
    if (simulationInterval) {
      clearInterval(simulationInterval)
    }
    throw error
  }
}

export const sendChatMessageGuest = async (message, transcriptText) => {
  const formData = new FormData()
  formData.append('message', message)
  formData.append('transcript_text', transcriptText)
  
  const response = await axios.post(`${API_BASE_URL}/chat/guest`, formData)
  return response.data
}

export default api
