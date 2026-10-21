import { readJson, writeJson } from './localStore'

/** Settings that belong to this device, not the account: they are never sent to the server. */
export interface LocalPrefs {
  /** Keep audio on the device after it was transcribed (default). Otherwise it is deleted. */
  keepRecordings: boolean
  /** When the user agreed to their audio and text being processed by AI services (ISO), if they did. */
  aiConsentAt?: string
}

const FILE = 'prefs.json'

export const getLocalPrefs = (): LocalPrefs => ({ keepRecordings: true, ...readJson<Partial<LocalPrefs>>(FILE, {}) })

const update = (patch: Partial<LocalPrefs>) => writeJson(FILE, { ...getLocalPrefs(), ...patch })

export const setKeepRecordings = (keepRecordings: boolean) => update({ keepRecordings })

export const hasAiConsent = () => getLocalPrefs().aiConsentAt !== undefined
export const grantAiConsent = () => update({ aiConsentAt: new Date().toISOString() })
export const revokeAiConsent = () => update({ aiConsentAt: undefined })
