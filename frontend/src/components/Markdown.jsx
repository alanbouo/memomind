import { Fragment } from 'react'

// A small Markdown renderer for chat answers: headings, lists, quotes, code, tables, bold, italic, links.
// Partial text is fine (an unclosed ** just shows as typed until it closes), so it can render a stream.

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l)
const isSeparator = (l) => /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(l)
const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function parseBlocks(src) {
  const lines = src.replace(/\r/g, '').split('\n')
  const blocks = []
  let para = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flush()
      const code = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i])
      blocks.push({ kind: 'code', text: code.join('\n') })
    } else if (!line.trim()) {
      flush()
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push({ kind: 'hr' })
    } else if (/^#{1,4}\s/.test(line)) {
      flush()
      const m = /^(#{1,4})\s+(.*)$/.exec(line)
      blocks.push({ kind: 'h', level: m[1].length, text: m[2] })
    } else if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flush()
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const rx = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/
      const items = []
      for (; i < lines.length && rx.test(lines[i]); i++) items.push(lines[i].replace(rx, ''))
      i--
      blocks.push({ kind: ordered ? 'ol' : 'ul', items })
    } else if (/^\s*>/.test(line)) {
      flush()
      const quote = []
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''))
      i--
      blocks.push({ kind: 'quote', text: quote.join('\n') })
    } else if (isTableRow(line)) {
      flush()
      const rows = []
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

// Only http(s) and mailto links are made clickable.
const safeHref = (href) => (/^(https?:|mailto:)/i.test(href) ? href : null)

function inline(text) {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    if (/^\*\*.+\*\*$/.test(part) || /^__.+__$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (/^`.+`$/.test(part)) {
      return <code key={i} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.85em] font-mono">{part.slice(1, -1)}</code>
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      const href = safeHref(link[2])
      return href ? (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-primary-800 dark:text-primary-400 dark:text-primary-400 underline">{link[1]}</a>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      )
    }
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export default function Markdown({ children }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      {parseBlocks(children).map((b, i) => {
        switch (b.kind) {
          case 'p':
            return <p key={i} className="whitespace-pre-wrap">{inline(b.text)}</p>
          case 'h':
            return <p key={i} className={`font-semibold pt-1 ${b.level <= 2 ? 'text-base' : 'text-sm'}`}>{inline(b.text)}</p>
          case 'ul':
            return <ul key={i} className="list-disc pl-5 space-y-1">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
          case 'ol':
            return <ol key={i} className="list-decimal pl-5 space-y-1">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>
          case 'quote':
            return <blockquote key={i} className="border-l-4 border-primary-500 pl-3 text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{inline(b.text)}</blockquote>
          case 'code':
            return <pre key={i} className="rounded-lg bg-black/10 dark:bg-white/10 p-3 overflow-x-auto text-xs font-mono">{b.text}</pre>
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="min-w-full text-xs border border-gray-200 dark:border-gray-600">
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className={r === 0 ? 'bg-black/5 dark:bg-white/10 font-semibold' : 'border-t border-gray-200 dark:border-gray-600'}>
                        {row.map((cell, c) => <td key={c} className="px-2 py-1.5 align-top">{inline(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return <hr key={i} className="border-gray-200 dark:border-gray-600" />
        }
      })}
    </div>
  )
}
