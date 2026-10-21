import { File, Paths } from 'expo-file-system'
import { router } from 'expo-router'
import { useIncomingShare } from 'expo-sharing'
import { useEffect } from 'react'
import { Alert } from 'react-native'
import { setPendingImport } from '../lib/incoming'

const AUDIO_EXTENSION = /\.(m4a|mp3|wav|aac|caf|ogg|oga|opus|flac|amr|3gp|mp4|mov|m4v|webm)$/i

/**
 * Receives an audio or video file shared from another app (WhatsApp, Voice Memos, Files…) and hands it
 * to the Transcribe screen, where the person checks it and taps "Transcrire".
 * Mounted only while signed in: a share received before that waits for the sign-in.
 */
export function IncomingShare() {
  const { resolvedSharedPayloads, clearSharedPayloads, error } = useIncomingShare()

  useEffect(() => {
    if (error) {
      clearSharedPayloads()
      Alert.alert('Import impossible', "Ce fichier n'a pas pu être lu.")
      return
    }
    const payload = resolvedSharedPayloads[0]
    if (!payload) return
    clearSharedPayloads()
    const uri = payload.contentUri
    const mime = payload.contentMimeType ?? ''
    const name = payload.originalName ?? 'audio'
    const isMedia = mime.startsWith('audio/') || mime.startsWith('video/') || AUDIO_EXTENSION.test(name)
    if (!uri || !isMedia) {
      Alert.alert('Fichier non pris en charge', 'MemoMind transcrit des fichiers audio ou vidéo.')
      return
    }
    try {
      // The source can disappear (shared container, temporary content URI): work on our own copy.
      const copy = new File(Paths.cache, `import-${Date.now()}-${name.replace(/[^\w.-]+/g, '_')}`)
      new File(uri).copy(copy)
      setPendingImport({ uri: copy.uri, name, mimeType: mime || 'application/octet-stream' })
      router.navigate('/')
    } catch {
      Alert.alert('Import impossible', "Ce fichier n'a pas pu être lu.")
    }
  }, [resolvedSharedPayloads, error, clearSharedPayloads])

  return null
}
