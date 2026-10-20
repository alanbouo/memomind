import { router } from 'expo-router'
import { Screen } from '../../components/ui'
import { UploadPanel } from '../../components/UploadPanel'
import { errorMessage, renameTranscript, uploadForTranscription } from '../../lib/api'
import { updateRecording } from '../../lib/recordings'

export default function Transcribe() {
  return (
    <Screen>
      <UploadPanel
        persist
        onSubmit={async (audio, onProgress) => {
          let id: number
          try {
            ;({ id } = await uploadForTranscription(audio, onProgress))
          } catch (e) {
            throw new Error(errorMessage(e, e instanceof Error ? e.message : "L'envoi a échoué"))
          }
          // Remember which entry this recording became, and give it a readable name.
          if (audio.recordingId) updateRecording(audio.recordingId, { transcriptId: id })
          renameTranscript(id, audio.name).catch(() => {})
          router.push({ pathname: '/transcript/[id]', params: { id: String(id) } })
        }}
      />
    </Screen>
  )
}
