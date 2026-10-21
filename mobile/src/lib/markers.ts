import { readJson, removeByPrefix, writeJson } from './localStore'

/**
 * Markers ("repères") dropped while recording, to find a moment again in the transcript.
 * They stay on the device, like the audio, but outlive it: a transcript keeps its markers
 * after the recording has been deleted.
 */
export interface Marker {
  id: string
  /** Position in the recording, in milliseconds. */
  atMs: number
  label: string
}

const PREFIX = 'markers-'
const file = (transcriptId: number) => `${PREFIX}${transcriptId}.json`

export const getMarkers = (transcriptId: number): Marker[] => readJson<Marker[]>(file(transcriptId), [])

export function setMarkers(transcriptId: number, markers: Marker[]) {
  if (markers.length === 0) return
  writeJson(file(transcriptId), markers)
}

export function renameMarker(transcriptId: number, markerId: string, label: string) {
  writeJson(file(transcriptId), getMarkers(transcriptId).map((m) => (m.id === markerId ? { ...m, label } : m)))
}

export const clearMarkers = () => removeByPrefix(PREFIX)

export const newMarker = (atMs: number, count: number): Marker => ({
  id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  atMs,
  label: `Repère ${count + 1}`,
})
