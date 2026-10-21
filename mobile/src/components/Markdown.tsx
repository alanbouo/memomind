import { ReactNode } from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { Theme, useTheme } from '../lib/theme'

// A small Markdown renderer for chat answers: headings, lists, quotes, code, tables, bold, italic, links.
// Partial text is fine (an unclosed ** just shows as typed until it closes), so it can render a stream.

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'hr' }

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isSeparator = (l: string) => /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(l)
const splitRow = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i])
      blocks.push({ kind: 'code', text: code.join('\n') })
    } else if (!line.trim()) {
      flush()
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push({ kind: 'hr' })
    } else if (/^#{1,4}\s/.test(line)) {
      flush()
      const m = /^(#{1,4})\s+(.*)$/.exec(line)!
      blocks.push({ kind: 'h', level: m[1].length, text: m[2] })
    } else if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flush()
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const rx = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/
      const items: string[] = []
      for (; i < lines.length && rx.test(lines[i]); i++) items.push(lines[i].replace(rx, ''))
      i--
      blocks.push({ kind: ordered ? 'ol' : 'ul', items })
    } else if (/^\s*>/.test(line)) {
      flush()
      const quote: string[] = []
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''))
      i--
      blocks.push({ kind: 'quote', text: quote.join('\n') })
    } else if (isTableRow(line)) {
      flush()
      const rows: string[][] = []
      for (; i < lines.length && isTableRow(lines[i]); i++) if (!isSeparator(lines[i])) rows.push(splitRow(lines[i]))
      i--
      blocks.push({ kind: 'table', rows })
    } else {
      para.push(line)
    }
  }
  flush()
  return blocks
}

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g

function inline(text: string, t: Theme, base: object): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    if (/^\*\*.+\*\*$/.test(part) || /^__.+__$/.test(part)) return <Text key={i} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>
    if (/^`.+`$/.test(part)) return <Text key={i} style={[styles.inlineCode, { backgroundColor: t.border }]}>{part.slice(1, -1)}</Text>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      return (
        <Text key={i} style={{ color: t.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(link[2]).catch(() => {})}>
          {link[1]}
        </Text>
      )
    }
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <Text key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>
    return <Text key={i} style={base}>{part}</Text>
  })
}

export function Markdown({ children, color }: { children: string; color?: string }) {
  const t = useTheme()
  const fg = color ?? t.text
  const text = { color: fg, fontSize: 15, lineHeight: 22 }

  return (
    <View style={{ gap: 8 }}>
      {parseBlocks(children).map((b, i) => {
        switch (b.kind) {
          case 'p':
            return <Text key={i} selectable style={text}>{inline(b.text, t, text)}</Text>
          case 'h':
            return (
              <Text key={i} selectable style={[text, { fontWeight: '700', fontSize: b.level <= 2 ? 18 : 16, lineHeight: 24, marginTop: 4 }]}>
                {inline(b.text, t, text)}
              </Text>
            )
          case 'ul':
          case 'ol':
            return (
              <View key={i} style={{ gap: 4 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={[text, { width: 20, textAlign: b.kind === 'ol' ? 'right' : 'center', color: t.muted }]}>{b.kind === 'ol' ? `${j + 1}.` : '•'}</Text>
                    <Text selectable style={[text, { flex: 1 }]}>{inline(item, t, text)}</Text>
                  </View>
                ))}
              </View>
            )
          case 'quote':
            return (
              <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: t.primary, paddingLeft: 12 }}>
                <Text selectable style={[text, { color: t.muted }]}>{inline(b.text, t, { ...text, color: t.muted })}</Text>
              </View>
            )
          case 'code':
            return (
              <View key={i} style={[styles.codeBlock, { backgroundColor: t.border }]}>
                <Text selectable style={[styles.mono, { color: fg }]}>{b.text}</Text>
              </View>
            )
          case 'table':
            return (
              <View key={i} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 10, overflow: 'hidden' }}>
                {b.rows.map((row, r) => (
                  <View key={r} style={{ flexDirection: 'row', backgroundColor: r === 0 ? t.border : 'transparent', borderTopWidth: r === 0 ? 0 : 1, borderTopColor: t.border }}>
                    {row.map((cell, c) => (
                      <Text key={c} selectable style={[text, { flex: 1, padding: 8, fontSize: 14, lineHeight: 19, fontWeight: r === 0 ? '700' : '400' }]}>
                        {inline(cell, t, text)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )
          case 'hr':
            return <View key={i} style={{ height: 1, backgroundColor: t.border, marginVertical: 4 }} />
        }
      })}
    </View>
  )
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

const styles = StyleSheet.create({
  inlineCode: { fontFamily: MONO, fontSize: 13 },
  codeBlock: { borderRadius: 10, padding: 12 },
  mono: { fontFamily: MONO, fontSize: 13, lineHeight: 19 },
})
