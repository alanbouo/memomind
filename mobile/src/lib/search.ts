/** Lower-case and strip accents, one character in, one out, so indices still match the original. */
export const fold = (s: string): string =>
  s
    .split('')
    .map((c) => c.normalize('NFD')[0].toLowerCase())
    .join('')

/** [start, end) ranges of every occurrence of `query` in `text`, ignoring case and accents. */
export function findRanges(text: string, query: string): [number, number][] {
  const q = fold(query.trim())
  if (!q) return []
  const hay = fold(text)
  const out: [number, number][] = []
  for (let i = hay.indexOf(q); i !== -1; i = hay.indexOf(q, i + q.length)) out.push([i, i + q.length])
  return out
}
