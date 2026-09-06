import { Lexer } from 'marked'

/**
 * Split Markdown into top-level blocks that carry their exact source range.
 *
 * This is what makes WYSIWYG editing non-destructive: when the user edits one
 * block we convert only that block back to Markdown and splice it into the
 * original source by character offset. Every other byte of the document is
 * preserved exactly as the author wrote it — no normalising of bullet
 * characters, emphasis markers, link style or escaping.
 */
export interface MdBlock {
  /** Stable-ish index within the document. */
  i: number
  /** Raw Markdown source of this block, without the trailing blank lines. */
  src: string
  /** Character offset of `src` within the document. */
  start: number
  /** Character offset just past `src`. */
  end: number
  /** marked token type: paragraph, heading, list, code, blockquote, table… */
  type: string
}

/**
 * Blocks whose Markdown is too structural to reconstruct faithfully from
 * rendered HTML. These stay source-edited even in rich mode.
 */
export const LITERAL_BLOCKS = new Set(['code', 'html', 'table'])

export function splitBlocks(src: string): MdBlock[] {
  let tokens: any[]
  try {
    tokens = Lexer.lex(src)
  } catch {
    return [{ i: 0, src, start: 0, end: src.length, type: 'paragraph' }]
  }

  const blocks: MdBlock[] = []
  let pos = 0
  let i = 0

  for (const t of tokens) {
    const raw: string = t.raw ?? ''
    if (!raw) continue

    // Locate the raw text; tokens are emitted in order so a forward scan is safe.
    const at = src.indexOf(raw, pos)
    const start = at === -1 ? pos : at
    const end = start + raw.length

    if (t.type === 'space') {
      pos = end
      continue
    }

    // Trim trailing newlines out of the block body but keep them in the gap.
    const body = raw.replace(/\n+$/, '')
    blocks.push({ i: i++, src: body, start, end: start + body.length, type: t.type })
    pos = end
  }

  if (!blocks.length) {
    return [{ i: 0, src: '', start: 0, end: 0, type: 'paragraph' }]
  }
  return blocks
}

/**
 * Replace one block's source, returning the new document.
 * Everything outside [block.start, block.end) is untouched.
 */
export function spliceBlock(doc: string, block: MdBlock, next: string): string {
  return doc.slice(0, block.start) + next + doc.slice(block.end)
}

/** Remove a block and the blank line that followed it. */
export function removeBlock(doc: string, block: MdBlock): string {
  let end = block.end
  const after = doc.slice(end)
  const m = after.match(/^\n{1,2}/)
  if (m) end += m[0].length
  const out = doc.slice(0, block.start) + doc.slice(end)
  return out
}

/** Insert a new empty paragraph after the given block; returns [doc, caretOffset]. */
export function insertAfter(doc: string, block: MdBlock, text = ''): [string, number] {
  const insertAt = block.end
  const chunk = `\n\n${text}`
  return [doc.slice(0, insertAt) + chunk + doc.slice(insertAt), insertAt + 2]
}
