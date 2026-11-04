import { AlertTriangle } from 'lucide-react'
import { transcribeAudioGuest } from '../services/api'
import Upload from './Upload'

// Same limit as the server's /transcribe/guest.
const GUEST_MAX_SIZE = 5 * 1024 * 1024

const progressLabel = (progress) => {
  if (progress < 25) return 'Envoi du fichier…'
  if (progress < 50) return "Traitement de l'audio…"
  if (progress < 75) return "Transcription par l'IA…"
  if (progress < 95) return 'Finalisation de la transcription…'
  return 'Presque terminé…'
}

function GuestUpload({ onTranscriptComplete }) {
  const submit = async (file, onProgress) => {
    const result = await transcribeAudioGuest(file, 'medium', onProgress)
    onTranscriptComplete?.({ ...result, name: file.name })
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Mode invité</p>
          <p className="text-xs text-amber-700 mt-0.5">
            5 Mo au maximum • Transcription non sauvegardée • Prompts IA par défaut
          </p>
        </div>
      </div>
      <Upload submit={submit} maxSize={GUEST_MAX_SIZE} progressLabel={progressLabel} />
    </div>
  )
}

export default GuestUpload
