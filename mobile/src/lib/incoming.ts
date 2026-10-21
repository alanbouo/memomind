import { PickedAudio } from './api'

/** A file shared to the app from another one, waiting for the Transcribe screen to pick it up. */
let pending: PickedAudio | null = null
const listeners = new Set<() => void>()

export const setPendingImport = (audio: PickedAudio) => {
  pending = audio
  listeners.forEach((l) => l())
}

export const takePendingImport = (): PickedAudio | null => {
  const audio = pending
  pending = null
  return audio
}

export const onPendingImport = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
