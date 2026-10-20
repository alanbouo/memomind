import { router } from 'expo-router'
import { Screen } from '../../components/ui'
import { UploadPanel } from '../../components/UploadPanel'
import { errorMessage, transcribeAudio } from '../../lib/api'

export default function Transcribe() {
  return (
    <Screen>
      <UploadPanel
        onSubmit={async (audio, onProgress) => {
          try {
            const res = await transcribeAudio(audio, onProgress)
            router.push({ pathname: '/transcript/[id]', params: { id: String(res.database_id) } })
          } catch (e) {
            throw new Error(errorMessage(e, 'Échec de la transcription'))
          }
        }}
      />
    </Screen>
  )
}
