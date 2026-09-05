import { useEffect, useState } from 'react'
import { renderMarkdown } from './Preview'

/**
 * Markdown for coach output. Shares the hardened renderer with the live
 * preview: raw tags are inert and javascript:/data: URLs are stripped.
 */
export default function Markdown({ text }: { text: string }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    try {
      setHtml(renderMarkdown(text))
    } catch {
      setHtml('')
    }
  }, [text])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
