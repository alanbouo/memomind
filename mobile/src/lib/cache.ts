import axios from 'axios'
import { readJson, removeByPrefix, writeJson } from './localStore'

/**
 * Offline reading: whatever was last fetched stays available without a network.
 * Files live in the app's private storage and are wiped on sign-out.
 */
const PREFIX = 'cache-'
const file = (key: string) => `${PREFIX}${key}.json`

const isOffline = (e: unknown) => axios.isAxiosError(e) && !e.response

/** Fetch and remember; with no network, fall back to the last copy (`stale: true`). */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await fetcher()
    try {
      writeJson(file(key), data)
    } catch {
      // a full disk must not break a successful fetch
    }
    return { data, stale: false }
  } catch (e) {
    if (isOffline(e)) {
      const hit = readJson<T | null>(file(key), null)
      if (hit !== null) return { data: hit, stale: true }
    }
    throw e
  }
}

export const readCached = <T,>(key: string): T | null => readJson<T | null>(file(key), null)

export const clearCache = () => removeByPrefix(PREFIX)
