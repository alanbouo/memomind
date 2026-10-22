import { useState, useRef } from 'react'
import { FileAudio, X, CheckCircle, AlertCircle, Plus, AlertTriangle } from 'lucide-react'
import { transcribeAudioGuest } from '../services/api'

function GuestUpload({ onTranscriptComplete }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [progressLabel, setProgressLabel] = useState('')
  const fileInputRef = useRef(null)

  const GUEST_MAX_SIZE = 5 * 1024 * 1024 // 5MB

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleFileSelect = (selectedFile) => {
    const validTypes = ['audio/m4a', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/webm', 'video/webm']

    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(m4a|mp3|wav|mp4|mov|m4v|webm)$/i)) {
      setStatus('error')
      setMessage('Invalid file type. Please upload an audio or video file (.m4a, .mp3, .wav, .mp4, .mov, .m4v, .webm)')
      return
    }

    if (selectedFile.size > GUEST_MAX_SIZE) {
      setStatus('error')
      setMessage('File too large for guest mode. Maximum is 5MB. Create an account for files up to 100MB.')
      return
    }

    setFile(selectedFile)
    setStatus(null)
    setMessage('')
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setProgress(0)
    setStatus(null)
    setMessage('')
    setProgressLabel('Uploading file...')

    try {
      const result = await transcribeAudioGuest(file, 'medium', (prog) => {
        setProgress(prog)
        if (prog < 25) {
          setProgressLabel('Uploading file...')
        } else if (prog < 50) {
          setProgressLabel('Processing audio...')
        } else if (prog < 75) {
          setProgressLabel('Transcribing with AI...')
        } else if (prog < 95) {
          setProgressLabel('Finalizing transcription...')
        } else {
          setProgressLabel('Almost done...')
        }
      })

      setStatus('success')
      setMessage('Transcription completed!')
      
      if (onTranscriptComplete) {
        onTranscriptComplete({ ...result, name: file.name })
      }
    } catch (error) {
      setStatus('error')
      const errorData = error.response?.data
      if (errorData?.upgrade_required) {
        setMessage(errorData.error)
      } else {
        setMessage(errorData?.error || 'Failed to transcribe audio. Please try again.')
      }
    } finally {
      setUploading(false)
    }
  }

  const removeFile = () => {
    setFile(null)
    setStatus(null)
    setMessage('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      {/* Guest Mode Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Guest Mode Limitations</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Max 5MB file size • Transcript not saved • Default AI prompts only
          </p>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-sm font-medium text-gray-700 mb-4">Audio File</h2>

      {/* File Input Area */}
      <div
        className={`relative rounded-lg transition-all ${
          dragActive ? 'ring-2 ring-blue-500' : ''
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {!file ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center border border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-gray-400 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleChange}
              accept=".m4a,.mp3,.wav,.mp4,.mov,.m4v,.webm,audio/*"
              className="hidden"
            />
            <span className="flex-1 text-gray-400">
              Click to select or drag audio file here
            </span>
            <button
              type="button"
              className="px-4 py-1.5 bg-blue-600 text-gray-900 text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              Browse
            </button>
          </div>
        ) : (
          <div className="flex items-center border border-gray-300 rounded-lg px-4 py-3">
            <FileAudio className="w-5 h-5 text-primary-800 dark:text-primary-400 mr-3" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
                {file.size > GUEST_MAX_SIZE * 0.8 && (
                  <span className="text-amber-600 ml-2">
                    (Close to 5MB limit)
                  </span>
                )}
              </p>
            </div>
            {!uploading && (
              <button
                onClick={removeFile}
                className="ml-2 text-gray-400 hover:text-red-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Supported formats hint */}
      {!file && (
        <p className="text-xs text-gray-500 mt-2">
          Supported: M4A, MP3, WAV, MP4, MOV, M4V, WEBM (Max 5MB in guest mode)
        </p>
      )}

      {/* Progress Bar */}
      {uploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{progressLabel}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Message */}
      {status && (
        <div
          className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
            status === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {status === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{message}</span>
        </div>
      )}

      {/* Main Action Button - only show when file is selected */}
      {file && !uploading && status !== 'success' && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full mt-6 py-3 bg-blue-600 text-gray-900 font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          Get Transcript & Summary
        </button>
      )}
    </div>
  )
}

export default GuestUpload
