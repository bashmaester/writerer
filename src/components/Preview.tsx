import { useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'

/**
 * Live rendered view of the draft.
 *
 * Raw HTML in the source is escaped before parsing, so a pasted <script> is
 * shown as text rather than executed. That keeps the preview safe without a
 * sanitiser dependency, at the cost of not supporting inline HTML — the right
 * trade for a writing tool whose output is Markdown.
 */

/**
 * Neutralise raw HTML without destroying Markdown syntax.
 *
 * Escaping `>` wholesale would break blockquotes, so we escape only `<`,
 * which is all that is needed to stop a tag from being parsed as HTML.
 */
function neutraliseTags(s: string) {
  return s.replace(/</g, '&lt;')
}

/** Block javascript:/data:/vbscript: URLs from becoming live links. */
const SAFE_URL = /^(https?:|mailto:|tel:|ftp:|#|\/|\.|[^a-z0-9+.-]|$)/i

function isSafeUrl(href: string): boolean {
  const t = href.trim().replace(/[\u0000-\u001f\s]/g, '')
  if (/^[a-z0-9+.-]*:/i.test(t)) return SAFE_URL.test(t)
  return true // relative or bare
}

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    link({ href, title, tokens }: any) {
      const text = this.parser.parseInline(tokens)
      if (!isSafeUrl(href)) return text
      const t = title ? ` title="${title}"` : ''
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer nofollow">${text}</a>`
    },
    image({ href, title, text }: any) {
      if (!isSafeUrl(href)) return text
      const t = title ? ` title="${title}"` : ''
      return `<img src="${href}" alt="${text}"${t} loading="lazy">`
    },
  },
})

export function renderMarkdown(src: string): string {
  return md.parse(neutraliseTags(src), { async: false }) as string
}

export default function Preview({
  text,
  scrollRatio,
  onScrollRatio,
  fontSize,
  serif,
}: {
  text: string
  /** 0–1 scroll position of the editor; null means "don't follow". */
  scrollRatio: number | null
  onScrollRatio?: (r: number) => void
  fontSize: number
  serif: boolean
}) {
  const [html, setHtml] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selfScroll = useRef(false)

  // Debounce so very fast typing doesn't re-parse on every keystroke.
  const [debounced, setDebounced] = useState(text)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 90)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    try {
      setHtml(renderMarkdown(debounced))
    } catch {
      setHtml('<p class="prev-err">Could not render this Markdown.</p>')
    }
  }, [debounced])

  // Follow the editor's scroll position.
  useEffect(() => {
    const el = ref.current
    if (!el || scrollRatio == null) return
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return
    selfScroll.current = true
    el.scrollTop = scrollRatio * max
    const id = setTimeout(() => (selfScroll.current = false), 60)
    return () => clearTimeout(id)
  }, [scrollRatio, html])

  const empty = useMemo(() => !debounced.trim(), [debounced])

  return (
    <div
      className={'preview-pane' + (serif ? ' serif' : ' mono')}
      ref={ref}
      onScroll={() => {
        if (selfScroll.current || !onScrollRatio) return
        const el = ref.current!
        const max = el.scrollHeight - el.clientHeight
        if (max > 0) onScrollRatio(el.scrollTop / max)
      }}
    >
      {empty ? (
        <p className="prev-empty">Nothing to preview yet.</p>
      ) : (
        <div
          className="md prose"
          style={{ fontSize }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}
