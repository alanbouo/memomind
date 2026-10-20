/**
 * The API stores naive UTC timestamps ("2026-10-20T22:04:00" with no zone), which
 * JS would read as local time. Treat a zone-less string as UTC.
 */
export const parseServerDate = (iso: string): Date => new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`)

/** "20 oct. 2026 à 00:04", in the device's locale and time zone. */
export const formatDateTime = (iso: string): string => {
  const d = parseServerDate(iso)
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-21-00-04" from the device's local clock, for default file names. */
export const localStamp = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`
