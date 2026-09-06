import TurndownService from 'turndown'

/**
 * HTML -> Markdown for a single edited block.
 *
 * Configured to match the style the rest of the app emits, so a block that is
 * edited and converted back looks like its neighbours rather than switching
 * bullet or emphasis characters mid-document.
 */
const td = new TurndownService({
  headingStyle: 'atx', // # Heading
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

// Strip anything a contenteditable might smuggle in.
td.remove(['script', 'style', 'meta', 'link', 'title'] as any)

// GFM strikethrough
td.addRule('strike', {
  filter: ['del', 's'] as any,
  replacement: (content) => `~~${content}~~`,
})

/**
 * Turndown pads list markers to a 4-char indent ("-   item"). That is valid
 * Markdown but rewrites every list the user touches, so emit the compact
 * "- item" / "1. item" form the rest of the document uses.
 */
td.addRule('compactListItem', {
  filter: 'li',
  replacement: (content, node) => {
    const body = content
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n')
      .replace(/\n/gm, '\n  ') // continuation lines align under the text
    const parent = node.parentNode as HTMLElement
    let prefix = '- '

    // GFM task item: recover the checkbox marker turndown would otherwise drop.
    const box = (node as HTMLElement).querySelector('input[type=checkbox]')
    if (box && (node as HTMLElement).firstElementChild === box) {
      const mark = box.hasAttribute('checked') ? '[x]' : '[ ]'
      const text = body.replace(/^\s+/, '')
      const tail = node.nextSibling ? '\n' : ''
      return `- ${mark} ${text}${tail}`
    }

    if (parent?.nodeName === 'OL') {
      const startAttr = parent.getAttribute('start')
      const start = startAttr ? Number(startAttr) : 1
      const i = Array.prototype.indexOf.call(parent.children, node)
      prefix = `${start + i}. `
    }
    const trailing = node.nextSibling && !/\n$/.test(body) ? '\n' : ''
    return prefix + body + trailing
  },
})

/** Browsers love wrapping lines in <div>; treat them as line breaks. */
td.addRule('divAsBreak', {
  filter: 'div',
  replacement: (content) => (content.trim() ? `${content}\n` : ''),
})

export function htmlToMarkdown(html: string): string {
  let out = td.turndown(html)
  // Turndown escapes a lot defensively; unescape sequences that are harmless
  // in running prose so round-tripping doesn't accumulate backslashes.
  out = out.replace(/\\([.\-+#*_`[\]()>!~])/g, (m, ch, off: number, s: string) => {
    // Keep the escape when the character really would start markup at line-start.
    const atLineStart = off === 0 || s[off - 1] === '\n'
    if (atLineStart && '-+#>'.includes(ch)) return m
    return ch
  })
  return out.trim()
}

/** Convert a whole document's worth of HTML (used by paste handling). */
export function pasteToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,svg,noscript').forEach((n) => n.remove())
  return htmlToMarkdown(doc.body.innerHTML).trim()
}
