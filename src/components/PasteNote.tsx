import { useEffect, useRef, useState } from 'react'
import type { DocRole, RefDoc } from '../lib/types'

const ROLES: DocRole[] = ['guideline', 'sample', 'template', 'reference', 'draft']

/**
 * Paste arbitrary text in as a reference or a free-form note — for sources that
 * can't be fetched (paywalled, login-walled, JS-rendered), text copied out of a
 * PDF viewer or email, or the writer's own working notes.
 */
export default function PasteNote({
  doc,
  initialRole = 'reference',
  onSave,
  onClose,
}: {
  /** When provided, edit this existing document instead of creating one. */
  doc?: RefDoc
  initialRole?: DocRole
  onSave: (name: string, text: string, role: DocRole, sourceUrl?: string) => void
  onClose: () => void
}) {
  const editing = !!doc
  const [name, setName] = useState(doc?.name ?? '')
  const [text, setText] = useState(doc?.text ?? '')
  const [role, setRole] = useState<DocRole>(doc?.role ?? initialRole)
  const [source, setSource] = useState(doc?.sourceUrl ?? '')
  const [pasteMsg, setPasteMsg] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) areaRef.current?.focus()
  }, [editing])

  const words = (text.trim().match(/\S+/g) ?? []).length

  /** Derive a sensible title from the first meaningful line. */
  const autoName = () => {
    const line = text
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .find((l) => l.length > 2)
    if (!line) return 'Pasted note'
    return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line
  }

  async function readClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) {
        setPasteMsg('Clipboard is empty.')
        return
      }
      setText((prev) => (prev ? prev + '\n\n' + t : t))
      setPasteMsg(`Pasted ${(t.match(/\S+/g) ?? []).length.toLocaleString()} words.`)
      setTimeout(() => setPasteMsg(''), 3000)
    } catch {
      // Firefox/Safari deny programmatic reads without a user gesture grant.
      setPasteMsg('Browser blocked clipboard access — use Ctrl/Cmd+V in the box.')
      areaRef.current?.focus()
    }
  }

  const save = () => {
    if (!text.trim()) return
    onSave(name.trim() || autoName(), text, role, source.trim() || undefined)
    onClose()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{editing ? 'Edit reference' : 'Paste a source or note'}</h2>
          <button className="ghost sm" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="modal-body">
          <p className="hint">
            {editing
              ? 'Review or trim this document. Cutting boilerplate here leaves more context budget for what matters.'
              : 'For pages that won’t import, text copied from a PDF or email, or your own working notes. Saved alongside your other reference material.'}
          </p>

          <div className="row wrap">
            <button className="ghost sm" onClick={readClipboard}>
              📋 Paste from clipboard
            </button>
            {text && (
              <button className="ghost sm" onClick={() => setText('')}>
                Clear
              </button>
            )}
            <span className="spacer" />
            <span className="hint">{words.toLocaleString()} words</span>
          </div>
          {pasteMsg && <p className="hint">{pasteMsg}</p>}

          <textarea
            ref={areaRef}
            className="paste-area"
            rows={14}
            placeholder="Paste or type here — Ctrl/Cmd+V works too…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
            }}
          />

          <div className="grid2">
            <label>
              Title
              <input
                placeholder={text ? autoName() : 'e.g. Editor’s feedback email'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Add as
              <select value={role} onChange={(e) => setRole(e.target.value as DocRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Source URL (optional — for attribution)
            <input
              placeholder="https://…"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>

          <div className="row">
            <button disabled={!text.trim()} onClick={save}>
              {editing ? 'Save changes' : role === 'draft' ? 'Use as draft' : 'Save reference'}
            </button>
            <span className="hint">⌘/Ctrl+Enter</span>
          </div>
        </div>
      </div>
    </div>
  )
}
