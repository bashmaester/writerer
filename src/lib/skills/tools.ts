import type { Project, RefDoc } from '../types'
import { docStats, parseOutline } from '../outline'

/** Local to avoid pulling the document-import stack into the agent runtime. */
const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length

/**
 * The editor's tool surface. This is what makes Writerer agent-operable:
 * a skill can read the draft, inspect sources, and propose edits without
 * the model ever seeing the DOM.
 *
 * Every tool is pure w.r.t. the host: it takes the current project and
 * returns a patch plus a text result. The host applies patches, so all
 * mutations stay undoable and visible to the user.
 */

export interface ToolContext {
  project: Project
  /** Characters of a document to return before truncating. */
  readBudget: number
}

export interface ToolOutcome {
  output: string
  patch?: Partial<Project>
  /** Set when the tool produced a durable artifact for the user. */
  note?: string
}

export interface ToolDef {
  name: string
  description: string
  /** JSON-schema-ish parameter description, rendered into the prompt. */
  params: Record<string, string>
  mutates: boolean
  run: (args: Record<string, any>, ctx: ToolContext) => ToolOutcome
}

const clip = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n) + `\n…[truncated ${s.length - n} chars]`

function numberLines(text: string, from = 1): string {
  return text
    .split('\n')
    .map((l, i) => `${String(i + from).padStart(4)}| ${l}`)
    .join('\n')
}

function findDoc(project: Project, ref: string): RefDoc | undefined {
  const needle = String(ref ?? '').toLowerCase().trim()
  if (!needle) return undefined
  return (
    project.docs.find((d) => d.id === ref) ||
    project.docs.find((d) => d.name.toLowerCase() === needle) ||
    project.docs.find((d) => d.name.toLowerCase().includes(needle))
  )
}

export const TOOLS: ToolDef[] = [
  {
    name: 'get_task',
    description: 'Read the assignment, intended audience, and a list of available sources.',
    params: {},
    mutates: false,
    run: (_a, { project }) => ({
      output: [
        `TASK: ${project.task.trim() || '(not stated)'}`,
        `AUDIENCE: ${project.audience.trim() || '(unspecified)'}`,
        `SOURCES (${project.docs.length}):`,
        ...project.docs.map(
          (d) =>
            `  - "${d.name}" [${d.role}] ${d.words}w${d.include ? '' : ' (excluded)'}${
              d.sourceUrl ? ` <${d.sourceUrl}>` : ''
            }`,
        ),
      ].join('\n'),
    }),
  },
  {
    name: 'read_draft',
    description:
      'Read the current draft. Use with_line_numbers when you intend to edit, so you can reference lines precisely.',
    params: {
      with_line_numbers: 'boolean, optional (default false)',
      start_line: 'number, optional 1-based',
      end_line: 'number, optional inclusive',
    },
    mutates: false,
    run: (a, { project, readBudget }) => {
      const lines = project.draft.split('\n')
      const from = Math.max(1, Number(a.start_line) || 1)
      const to = Math.min(lines.length, Number(a.end_line) || lines.length)
      const slice = lines.slice(from - 1, to).join('\n')
      if (!slice.trim()) return { output: '(the draft is empty)' }
      const body = a.with_line_numbers ? numberLines(slice, from) : slice
      return { output: clip(body, readBudget) }
    },
  },
  {
    name: 'get_outline',
    description: 'List the draft’s Markdown headings with per-section word counts.',
    params: {},
    mutates: false,
    run: (_a, { project }) => {
      const m = parseOutline(project.draft)
      if (!m.length) return { output: '(no headings)' }
      return {
        output: m
          .map((x) => `${'  '.repeat(x.level - 1)}L${x.level} line ${x.line + 1}: ${x.title} — ${x.words}w`)
          .join('\n'),
      }
    },
  },
  {
    name: 'get_stats',
    description: 'Word, character, paragraph, sentence counts and reading time for the draft.',
    params: {},
    mutates: false,
    run: (_a, { project }) => {
      const s = docStats(project.draft)
      return {
        output: `words=${s.words} chars=${s.chars} lines=${s.lines} paragraphs=${s.paragraphs} sentences=${s.sentences} reading_minutes=${s.readingMinutes}`,
      }
    },
  },
  {
    name: 'read_source',
    description:
      'Read one reference document by name or id. Use get_task first to see what is available.',
    params: { name: 'string — document name or id', max_chars: 'number, optional' },
    mutates: false,
    run: (a, { project, readBudget }) => {
      const d = findDoc(project, a.name)
      if (!d)
        return {
          output: `No source matches "${a.name}". Available: ${
            project.docs.map((x) => `"${x.name}"`).join(', ') || '(none)'
          }`,
        }
      const budget = Math.min(Number(a.max_chars) || readBudget, 60000)
      return { output: `# ${d.name} [${d.role}]\n\n${clip(d.text, budget)}` }
    },
  },
  {
    name: 'search_sources',
    description:
      'Case-insensitive search across all included sources. Returns matching lines with context — cheaper than reading whole documents.',
    params: { query: 'string', max_hits: 'number, optional (default 20)' },
    mutates: false,
    run: (a, { project }) => {
      const q = String(a.query ?? '').toLowerCase().trim()
      if (!q) return { output: 'Provide a query.' }
      const max = Number(a.max_hits) || 20
      const hits: string[] = []
      for (const d of project.docs.filter((x) => x.include)) {
        const lines = d.text.split('\n')
        for (let i = 0; i < lines.length && hits.length < max; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            hits.push(`"${d.name}" line ${i + 1}: ${lines[i].trim().slice(0, 240)}`)
          }
        }
      }
      return { output: hits.length ? hits.join('\n') : `No matches for "${a.query}".` }
    },
  },
  {
    name: 'search_draft',
    description: 'Find lines in the draft matching a string or /regex/.',
    params: { query: 'string or /regex/', max_hits: 'number, optional' },
    mutates: false,
    run: (a, { project }) => {
      const raw = String(a.query ?? '')
      if (!raw) return { output: 'Provide a query.' }
      let re: RegExp
      const m = /^\/(.*)\/([gimsu]*)$/.exec(raw)
      try {
        re = m ? new RegExp(m[1], m[2].replace('g', '') + 'i') : null!
      } catch (e: any) {
        return { output: `Bad regex: ${e.message}` }
      }
      const max = Number(a.max_hits) || 30
      const out: string[] = []
      project.draft.split('\n').forEach((l, i) => {
        if (out.length >= max) return
        const hit = re ? re.test(l) : l.toLowerCase().includes(raw.toLowerCase())
        if (hit) out.push(`${i + 1}| ${l.trim().slice(0, 240)}`)
      })
      return { output: out.length ? out.join('\n') : 'No matches.' }
    },
  },
  {
    name: 'replace_in_draft',
    description:
      'Replace an exact substring in the draft. `find` must match EXACTLY once unless all=true. This is the preferred way to make surgical edits.',
    params: {
      find: 'string — exact text to replace',
      replace: 'string — replacement',
      all: 'boolean, optional — replace every occurrence',
    },
    mutates: true,
    run: (a, { project }) => {
      const find = String(a.find ?? '')
      const replace = String(a.replace ?? '')
      if (!find) return { output: 'ERROR: `find` is required.' }
      const count = project.draft.split(find).length - 1
      if (count === 0)
        return {
          output: `ERROR: no match for that text. Use read_draft with_line_numbers=true and copy the text exactly, including punctuation.`,
        }
      if (count > 1 && !a.all)
        return {
          output: `ERROR: "${find.slice(0, 40)}…" appears ${count} times. Include more surrounding text to disambiguate, or pass all=true.`,
        }
      const draft = a.all
        ? project.draft.split(find).join(replace)
        : project.draft.replace(find, replace)
      return {
        output: `Replaced ${a.all ? count : 1} occurrence(s). Draft is now ${wordCount(draft)} words.`,
        patch: { draft },
      }
    },
  },
  {
    name: 'replace_lines',
    description: 'Replace an inclusive 1-based line range with new text.',
    params: { start_line: 'number', end_line: 'number', text: 'string' },
    mutates: true,
    run: (a, { project }) => {
      const lines = project.draft.split('\n')
      const from = Number(a.start_line)
      const to = Number(a.end_line)
      if (!from || !to || from < 1 || to > lines.length || from > to)
        return { output: `ERROR: invalid range ${from}–${to}; the draft has ${lines.length} lines.` }
      const next = [...lines.slice(0, from - 1), String(a.text ?? ''), ...lines.slice(to)].join('\n')
      return {
        output: `Replaced lines ${from}–${to}. Draft is now ${wordCount(next)} words.`,
        patch: { draft: next },
      }
    },
  },
  {
    name: 'append_to_draft',
    description: 'Append text to the end of the draft.',
    params: { text: 'string' },
    mutates: true,
    run: (a, { project }) => {
      const add = String(a.text ?? '')
      if (!add.trim()) return { output: 'ERROR: nothing to append.' }
      const draft = project.draft ? `${project.draft}\n\n${add}` : add
      return { output: `Appended ${wordCount(add)} words.`, patch: { draft } }
    },
  },
  {
    name: 'set_draft',
    description:
      'Replace the ENTIRE draft. Use only for a full rewrite — prefer replace_in_draft for targeted changes.',
    params: { text: 'string' },
    mutates: true,
    run: (a) => {
      const text = String(a.text ?? '')
      if (!text.trim()) return { output: 'ERROR: refusing to blank the draft.' }
      return { output: `Draft replaced — ${wordCount(text)} words.`, patch: { draft: text } }
    },
  },
  {
    name: 'add_note',
    description:
      'Save a finding, critique or checklist as a reference note the writer keeps after the run.',
    params: { title: 'string', text: 'string' },
    mutates: true,
    run: (a, { project }) => {
      const title = String(a.title ?? 'Skill note').slice(0, 120)
      const text = String(a.text ?? '')
      if (!text.trim()) return { output: 'ERROR: empty note.' }
      const doc: RefDoc = {
        id: Math.random().toString(36).slice(2, 10),
        name: title,
        role: 'reference',
        mime: 'text/markdown',
        text,
        words: wordCount(text),
        addedAt: Date.now(),
        include: false,
      }
      return {
        output: `Saved note "${title}" (${doc.words} words).`,
        patch: { docs: [...project.docs, doc] },
        note: title,
      }
    },
  },
  {
    name: 'finish',
    description:
      'End the run. Provide a concise Markdown summary of what you found and changed — this is what the writer reads.',
    params: { summary: 'string — Markdown' },
    mutates: false,
    run: (a) => ({ output: String(a.summary ?? 'Done.') }),
  },
]

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]))

/** Render the tool list for the system prompt, honouring allowed-tools. */
export function toolCatalog(allowed?: string[]): string {
  const list = allowed?.length ? TOOLS.filter((t) => allowed.includes(t.name)) : TOOLS
  return list
    .map((t) => {
      const p = Object.entries(t.params)
        .map(([k, v]) => `      "${k}": ${v}`)
        .join('\n')
      return `- ${t.name}${t.mutates ? '  [modifies the document]' : ''}\n    ${t.description}${
        p ? `\n    args:\n${p}` : '\n    args: none'
      }`
    })
    .join('\n')
}

export function availableTools(allowed?: string[]): ToolDef[] {
  return allowed?.length ? TOOLS.filter((t) => allowed.includes(t.name)) : TOOLS
}
