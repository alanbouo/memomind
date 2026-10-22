import { useState, useRef, useEffect } from 'react'
import { FileAudio, X, AlertCircle, Plus, Mic, Square, Upload as UploadIcon } from 'lucide-react'
import { startTranscription } from '../services/api'

const MAX_SIZE = 100 * 1024 * 1024
const QUALITIES = [['low', 'Rapide'], ['medium', 'Équilibrée'], ['high', 'Haute']]

const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

// The best container this browser can record to (Safari: mp4, others: webm).
const recorderFormat = () => {
  if (typeof MediaRecorder === 'undefined') return null
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

function Upload({ onTranscriptStarted, defaultQuality = 'medium' }) {
  const [file, setFile] = useState(null)
  const [quality, setQuality] = useState(defaultQuality)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState(null) // 'success' | 'error'
  const [message, setMessage] = useState('')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia) && recorderFormat() !== null

  useEffect(() => setQuality(defaultQuality), [defaultQuality])

  // The player for what was recorded or picked; released when replaced.
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [recording])

  // Leaving the page must release the microphone.
  useEffect(() => () => recorderRef.current?.stream?.getTracks().forEach((t) => t.stop()), [])

  const fail = (text) => {
    setStatus('error')
    setMessage(text)
  }

  const select = (picked) => {
    const ok = picked.type.startsWith('audio/') || picked.type.startsWith('video/') || /\.(m4a|mp3|wav|mp4|mov|m4v|webm|ogg|aac|flac)$/i.test(picked.name)
    if (!ok) return fail('Format non pris en charge. Choisissez un fichier audio ou vidéo (.m4a, .mp3, .wav, .mp4, .mov, .webm…).')
    if (picked.size > MAX_SIZE) return fail('Ce fichier dépasse 100 Mo.')
    setFile(picked)
    setStatus(null)
    setMessage('')
  }

  const drag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const drop = (e) => {
    drag(e)
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) select(e.dataTransfer.files[0])
  }

  const startRecording = async () => {
    setStatus(null)
    setMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = recorderFormat()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const type = recorder.mimeType || 'audio/webm'
        const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')
        setFile(new File(chunksRef.current, `enregistrement-${stamp}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type }))
      }
      recorder.start()
      recorderRef.current = recorder
      setFile(null)
      setElapsed(0)
      setRecording(true)
    } catch {
      fail("Le micro n'est pas accessible. Autorisez-le dans votre navigateur, ou importez un fichier.")
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setRecording(false)
  }

  const reset = () => {
    setFile(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const send = async () => {
    if (!file) return
    setUploading(true)
    setProgress(0)
    setStatus(null)
    setMessage('')
    try {
      await startTranscription(file, quality, setProgress)
      reset()
      onTranscriptStarted?.()
    } catch (error) {
      fail(error.response?.data?.error || error.response?.data?.detail || "L'envoi a échoué. Réessayez.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card">
      <p className="label-bracket mb-4">enregistrer</p>

      <div
        className={`rounded-lg transition-all ${dragActive ? 'ring-2 ring-primary-500' : ''}`}
        onDragEnter={drag}
        onDragLeave={drag}
        onDragOver={drag}
        onDrop={drop}
      >
        {recording ? (
          <div className="flex flex-col items-center gap-4 py-8 border border-primary-600/60 rounded-lg">
            <div className="flex items-center gap-3 font-mono text-2xl text-gray-900 dark:text-white">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
              {clock(elapsed)}
            </div>
            <button onClick={stopRecording} className="btn-primary flex items-center gap-2"><Square className="w-4 h-4" />Arrêter</button>
          </div>
        ) : !file ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {canRecord && (
              <button onClick={startRecording} className="flex flex-col items-center gap-2 py-8 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors">
                <Mic className="w-7 h-7 text-primary-800 dark:text-primary-400" />
                <span className="font-medium text-gray-900 dark:text-white">Enregistrer</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">avec le micro</span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center gap-2 py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 transition-colors ${canRecord ? '' : 'sm:col-span-2'}`}
            >
              <UploadIcon className="w-7 h-7 text-primary-800 dark:text-primary-400" />
              <span className="font-medium text-gray-900 dark:text-white">Importer un fichier</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">ou glissez-le ici</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && select(e.target.files[0])}
              accept=".m4a,.mp3,.wav,.mp4,.mov,.m4v,.webm,.ogg,.aac,.flac,audio/*,video/*"
              className="hidden"
            />
          </div>
        ) : (
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3">
            <div className="flex items-center">
              <FileAudio className="w-5 h-5 text-primary-800 dark:text-primary-400 mr-3 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} Mo</p>
              </div>
              {!uploading && (
                <button onClick={reset} aria-label="Retirer le fichier" className="ml-2 text-gray-400 hover:text-red-600 transition-colors"><X className="w-5 h-5" /></button>
              )}
            </div>
            {preview && !uploading && file.type.startsWith('audio/') && <audio src={preview} controls className="w-full mt-3" />}
          </div>
        )}
      </div>

      {!file && !recording && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">M4A, MP3, WAV, MP4, MOV, WEBM… jusqu'à 100 Mo.</p>
      )}

      {file && !uploading && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">Qualité :</span>
          <div className="flex gap-2">
            {QUALITIES.map(([q, label]) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-3 py-1 text-sm rounded-md font-medium transition-all ${quality === q ? 'bg-primary-600 text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {uploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Envoi du fichier…</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div className="bg-primary-600 h-2 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="mt-4 flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {file && !uploading && (
        <button onClick={send} className="btn-primary w-full mt-6 py-3 flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" />
          Transcrire
        </button>
      )}
    </div>
  )
}

export default Upload
