/** Markdown heading navigation, in the spirit of Left's marker list. */
export interface Marker {
  level: number
  title: string
  /** Character offset of the heading line in the source. */
  offset: number
  /** 0-based line number. */
  line: number
  words: number
}

/** Parse ATX headings (#, ##, ###) into a flat marker list with word counts. */
export function parseOutline(text: string): Marker[] {
  const lines = text.split('\n')
  const out: Marker[] = []
  let offset = 0
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence) {
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
      if (m) {
        out.push({
          level: m[1].length,
          title: m[2].trim(),
          offset,
          line: i,
          words: 0,
        })
      }
    }
    offset += line.length + 1
  }

  // Words belonging to each section = text until the next heading.
  const total = text.length
  for (let i = 0; i < out.length; i++) {
    const start = out[i].offset
    const end = i + 1 < out.length ? out[i + 1].offset : total
    out[i].words = (text.slice(start, end).match(/\S+/g) ?? []).length
  }
  return out
}

export interface DocStats {
  words: number
  chars: number
  lines: number
  paragraphs: number
  sentences: number
  /** Rough reading time in minutes at 220 wpm. */
  readingMinutes: number
}

export function docStats(text: string): DocStats {
  const words = (text.match(/\S+/g) ?? []).length
  return {
    words,
    chars: text.length,
    lines: text ? text.split('\n').length : 0,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    sentences: (text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []).length,
    readingMinutes: Math.max(1, Math.round(words / 220)),
  }
}
