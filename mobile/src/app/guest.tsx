import { useState } from 'react'
import { Pressable, Share, Text, View } from 'react-native'
import { CONSENT_DECLINED, useAiConsent } from '../components/AiConsent'
import { ChatPanel } from '../components/ChatPanel'
import { Button, Muted, Screen } from '../components/ui'
import { UploadPanel } from '../components/UploadPanel'
import { UtteranceList } from '../components/UtteranceList'
import { errorMessage, sendChatMessageGuest, transcribeAudioGuest } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

export default function Guest() {
  const t = useTheme()
  const { guestResult, setGuestResult, signOut } = useAuth()
  const { ensure } = useAiConsent()
  const [tab, setTab] = useState<'text' | 'chat'>('text')

  if (!guestResult) {
    return (
      <Screen>
        <Muted style={{ marginBottom: 16 }}>Mode invité : la transcription n&apos;est pas sauvegardée. Créez un compte pour conserver votre historique.</Muted>
        <UploadPanel
          onSubmit={async (audio, onProgress) => {
            if (!(await ensure())) throw new Error(CONSENT_DECLINED)
            try {
              setGuestResult(await transcribeAudioGuest(audio, onProgress))
            } catch (e) {
              throw new Error(errorMessage(e, 'Échec de la transcription'))
            }
          }}
        />
        <Button title="Se connecter / créer un compte" variant="ghost" onPress={signOut} style={{ marginTop: 16 }} />
      </Screen>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', margin: 16, marginBottom: 0, borderRadius: 12, backgroundColor: t.border, padding: 3 }}>
        {(['text', 'chat'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: tab === k ? t.card : 'transparent' }}>
            <Text style={{ color: tab === k ? t.text : t.muted, fontWeight: '600' }}>{k === 'text' ? 'Transcription' : 'Chat IA'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'text' ? (
        <UtteranceList utterances={guestResult.utterances} showTimestamps />
      ) : (
        <ChatPanel
          send={async (m) => {
            if (!(await ensure())) throw new Error(CONSENT_DECLINED)
            return (await sendChatMessageGuest(m, guestResult.text)).response
          }}
        />
      )}
      <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
        <Button title="Partager" variant="secondary" style={{ flex: 1 }} onPress={() => Share.share({ message: guestResult.text })} />
        <Button title="Nouvelle" style={{ flex: 1 }} onPress={() => setGuestResult(null)} />
      </View>
    </View>
  )
}
