import { useEffect, useState } from 'react'
import { marked } from 'marked'

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

/** Renders markdown with all raw HTML escaped first (no dangerous passthrough). */
export default function Markdown({ text }: { text: string }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let alive = true
    Promise.resolve(marked.parse(escapeHtml(text), { breaks: true })).then((h) => {
      if (alive) setHtml(h as string)
    })
    return () => {
      alive = false
    }
  }, [text])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
