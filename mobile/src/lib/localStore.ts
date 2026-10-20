import { Directory, File, Paths } from 'expo-file-system'

/** Tiny JSON-file store in the app's permanent document directory (device-local, never synced). */
export function readJson<T>(name: string, fallback: T): T {
  try {
    const file = new File(Paths.document, name)
    return file.exists ? (JSON.parse(file.textSync()) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  const file = new File(Paths.document, name)
  if (!file.exists) file.create()
  file.write(JSON.stringify(value))
}

/** Delete every stored JSON file whose name starts with `prefix`. */
export function removeByPrefix(prefix: string): void {
  try {
    for (const entry of new Directory(Paths.document).list()) {
      if (entry instanceof File && entry.name.startsWith(prefix)) entry.delete()
    }
  } catch {
    // nothing to clean
  }
}
