import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from './Preview'
import RichBlock from './RichBlock'
import {
  splitBlocks,
  spliceBlock,
  removeBlock,
  insertAfter,
  LITERAL_BLOCKS,
} from '../lib/mdblocks'

/**
 * Editable rendered view.
 *
 * Edits are block-scoped: only the block the user touched is converted back
 * from HTML to Markdown and spliced into the source by offset. The rest of the
 * document is never round-tripped, so untouched Markdown stays byte-identical.
 *
 * Code blocks, tables and raw HTML can't survive an HTML round-trip faithfully,
 * so those are edited as source text instead.
 */
export default function RichEditor({
  value,
  onChange,
  fontSize,
  serif,
  scrollRatio,
  onScrollRatio,
}: {
  value: string
  onChange: (next: string) => void
  fontSize: number
  serif: boolean
  scrollRatio: number | null
  onScrollRatio?: (r: number) => void
}) {
  const blocks = useMemo(() => splitBlocks(value), [value])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [rawEdit, setRawEdit] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const selfScroll = useRef(false)
  const focusNext = useRef<number | null>(null)

  // Follow the editor pane's scroll.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || scrollRatio == null) return
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return
    selfScroll.current = true
    el.scrollTop = scrollRatio * max
    const t = setTimeout(() => (selfScroll.current = false), 60)
    return () => clearTimeout(t)
  }, [scrollRatio, value])

  // After a structural change, move focus to the intended block.
  useEffect(() => {
    if (focusNext.current == null) return
    const idx = focusNext.current
    focusNext.current = null
    const el = wrapRef.current?.querySelectorAll<HTMLElement>('.rich-block')[idx]
    if (el) {
      el.focus()
      const r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(true)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
    }
  }, [value])

  if (!value.trim()) {
    return (
      <div className={'rich-wrap' + (serif ? ' serif' : ' mono')} ref={wrapRef}>
        <div
          className="rich-empty"
          onClick={() => onChange('# Title\n\nStart writing.')}
        >
          Click to start writing.
        </div>
      </div>
    )
  }

  return (
    <div
      className={'rich-wrap' + (serif ? ' serif' : ' mono')}
      ref={wrapRef}
      onScroll={() => {
        if (selfScroll.current || !onScrollRatio) return
        const el = wrapRef.current!
        const max = el.scrollHeight - el.clientHeight
        if (max > 0) onScrollRatio(el.scrollTop / max)
      }}
    >
      <div className="md prose rich-doc" style={{ fontSize }}>
        {blocks.map((b, idx) => {
          const literal = LITERAL_BLOCKS.has(b.type)

          if (literal && rawEdit === b.i) {
            return (
              <textarea
                key={b.i}
                className="rich-raw"
                autoFocus
                defaultValue={b.src}
                spellCheck={false}
                onBlur={(e) => {
                  setRawEdit(null)
                  if (e.target.value !== b.src) onChange(spliceBlock(value, b, e.target.value))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur()
                }}
              />
            )
          }

          if (literal) {
            return (
              <div
                key={b.i}
                className="rich-literal"
                title="Click to edit as Markdown source"
                onClick={() => setRawEdit(b.i)}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(b.src) }}
              />
            )
          }

          return (
            <RichBlock
              key={b.i}
              html={renderMarkdown(b.src)}
              markdown={b.src}
              active={activeId === b.i}
              onFocus={() => setActiveId(b.i)}
              onCommit={(md) => {
                if (!md.trim()) {
                  focusNext.current = Math.max(0, idx - 1)
                  onChange(removeBlock(value, b))
                } else {
                  onChange(spliceBlock(value, b, md))
                }
              }}
              onSplit={() => {
                focusNext.current = idx + 1
                onChange(insertAfter(value, b)[0])
              }}
              onMergeBack={() => {
                if (blocks.length <= 1) return
                focusNext.current = Math.max(0, idx - 1)
                onChange(removeBlock(value, b))
              }}
              onNav={(dir) => {
                const t = idx + dir
                if (t < 0 || t >= blocks.length) return
                focusNext.current = t
                // no doc change: focus manually
                const el = wrapRef.current?.querySelectorAll<HTMLElement>('.rich-block')[t]
                el?.focus()
                focusNext.current = null
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
