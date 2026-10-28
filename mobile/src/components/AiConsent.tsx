import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { Linking, Modal, ScrollView, Text, View } from 'react-native'
import { grantAiConsent, hasAiConsent } from '../lib/prefs'
import { useTheme } from '../lib/theme'
import { Button, Muted } from './ui'

const PRIVACY_URL = 'https://memomind.space/privacy'

interface ConsentApi {
  /** Resolves true once the user has agreed (asking if they have not yet), false if they decline. */
  ensure: () => Promise<boolean>
}

const ConsentContext = createContext<ConsentApi | null>(null)

/** Thrown when the user declines: callers show it as a plain message. */
export const CONSENT_DECLINED = "Sans votre accord, MemoMind ne peut pas envoyer vos données aux services d'IA."

export function useAiConsent(): ConsentApi {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useAiConsent must be used inside AiConsentProvider')
  return ctx
}

export function AiConsentProvider({ children }: { children: ReactNode }) {
  const t = useTheme()
  const [visible, setVisible] = useState(false)
  const pending = useRef<((ok: boolean) => void)[]>([])

  const ensure = useCallback(() => {
    if (hasAiConsent()) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      pending.current.push(resolve)
      setVisible(true)
    })
  }, [])

  const answer = (ok: boolean) => {
    if (ok) grantAiConsent()
    setVisible(false)
    pending.current.splice(0).forEach((resolve) => resolve(ok))
  }

  return (
    <ConsentContext.Provider value={{ ensure }}>
      {children}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => answer(false)}>
        <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: 20 }}>
            <ScrollView>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', marginBottom: 12 }}>Vos données et l&apos;IA</Text>
              <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, marginBottom: 10 }}>
                Pour fonctionner, MemoMind fait appel à deux services d&apos;IA tiers :
              </Text>
              <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, marginBottom: 8 }}>
                <Text style={{ fontWeight: '700' }}>• AssemblyAI</Text> reçoit votre enregistrement audio pour le transcrire.
              </Text>
              <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, marginBottom: 12 }}>
                <Text style={{ fontWeight: '700' }}>• Anthropic (Claude)</Text> reçoit le texte de la transcription pour en écrire le titre et le résumé, et vos messages quand vous utilisez le chat IA. Pour répondre à une question qui dépasse la transcription, le chat peut lancer une recherche web à partir de vos termes.
              </Text>
              <Muted style={{ marginBottom: 16 }}>
                Le fichier audio est supprimé du serveur MemoMind dès que la transcription est terminée. Vous pouvez retirer votre accord à tout moment dans Préférences.
              </Muted>
              <Text onPress={() => Linking.openURL(PRIVACY_URL)} style={{ color: t.primary, marginBottom: 20, fontWeight: '600' }}>
                Lire la politique de confidentialité
              </Text>
              <Button title="Accepter et continuer" onPress={() => answer(true)} />
              <Button title="Refuser" variant="ghost" onPress={() => answer(false)} style={{ marginTop: 8 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ConsentContext.Provider>
  )
}
