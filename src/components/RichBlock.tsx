import { useEffect, useRef } from 'react'
import { htmlToMarkdown } from '../lib/html2md'

/**
 * One directly-editable rendered block.
 *
 * The DOM is only written on mount and when the block is not focused, so
 * React never yanks the caret out from under the user mid-typing. On blur (or
 * Escape/Enter-out) the HTML is converted back to Markdown and handed up.
 */
export default function RichBlock({
  html,
  markdown,
  active,
  onFocus,
  onCommit,
  onSplit,
  onMergeBack,
  onNav,
}: {
  html: string
  markdown: string
  active: boolean
  onFocus: () => void
  onCommit: (md: string) => void
  onSplit: () => void
  onMergeBack: () => void
  onNav: (dir: -1 | 1) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dirty = useRef(false)

  // Only sync DOM from props while the user is not editing this block.
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    if (el.innerHTML !== html) el.innerHTML = html
  }, [html])

  function commit() {
    const el = ref.current
    if (!el || !dirty.current) return
    dirty.current = false
    const next = htmlToMarkdown(el.innerHTML)
    if (next !== markdown) onCommit(next)
  }

  return (
    <div
      ref={ref}
      className={'rich-block' + (active ? ' active' : '')}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={() => {
        dirty.current = true
      }}
      onFocus={onFocus}
      onBlur={commit}
      onPaste={(e) => {
        // Paste as Markdown-flavoured plain text, never foreign styles.
        const html = e.clipboardData.getData('text/html')
        const text = e.clipboardData.getData('text/plain')
        if (!html && !text) return
        e.preventDefault()
        const md = html ? htmlToMarkdown(html) : text
        document.execCommand('insertText', false, md)
        dirty.current = true
      }}
      onKeyDown={(e) => {
        const el = ref.current!
        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
          el.blur()
          return
        }
        // Enter at the very end of a block creates a new paragraph below.
        if (e.key === 'Enter' && !e.shiftKey) {
          const sel = window.getSelection()
          const atEnd =
            sel &&
            sel.isCollapsed &&
            sel.focusNode &&
            isAtEnd(el, sel.focusNode, sel.focusOffset)
          if (atEnd) {
            e.preventDefault()
            commit()
            onSplit()
            return
          }
        }
        // Backspace in an empty block removes it.
        if (e.key === 'Backspace' && !el.textContent?.trim()) {
          e.preventDefault()
          dirty.current = false
          onMergeBack()
          return
        }
        // Arrow out of the block at its edges.
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const sel = window.getSelection()
          if (!sel?.isCollapsed) return
          const dir = e.key === 'ArrowUp' ? -1 : 1
          const edge =
            dir === -1
              ? isAtStart(el, sel.focusNode!, sel.focusOffset)
              : isAtEnd(el, sel.focusNode!, sel.focusOffset)
          if (edge) {
            e.preventDefault()
            commit()
            onNav(dir)
          }
        }
      }}
    />
  )
}

function isAtEnd(root: HTMLElement, node: Node, offset: number): boolean {
  const r = document.createRange()
  r.selectNodeContents(root)
  r.setStart(node, offset)
  return r.toString().trim() === ''
}

function isAtStart(root: HTMLElement, node: Node, offset: number): boolean {
  const r = document.createRange()
  r.selectNodeContents(root)
  r.setEnd(node, offset)
  return r.toString().trim() === ''
}
