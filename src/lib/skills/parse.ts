import type { Skill, SkillMeta } from './types'
import type { ToolCall } from './types'

/** Minimal YAML frontmatter reader — enough for the SKILL.md spec's flat fields. */
export function parseFrontmatter(src: string): { meta: Record<string, any>; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src)
  if (!m) return { meta: {}, body: src.trim() }

  const meta: Record<string, any> = {}
  const lines = m[1].split(/\r?\n/)
  let key: string | null = null
  let block: string[] | null = null
  let listFor: string | null = null

  const flush = () => {
    if (key && block) meta[key] = block.join('\n').trim()
    key = null
    block = null
  }

  for (const raw of lines) {
    if (!raw.trim()) {
      if (block) block.push('')
      continue
    }
    // list item under a key
    const li = /^\s*-\s+(.*)$/.exec(raw)
    if (li && listFor) {
      ;(meta[listFor] ||= []).push(stripQuotes(li[1].trim()))
      continue
    }
    // continuation of a folded/literal block
    if (block && /^\s{2,}\S/.test(raw)) {
      block.push(raw.trim())
      continue
    }
    flush()
    listFor = null

    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(raw)
    if (!kv) continue
    const k = kv[1]
    const v = kv[2].trim()
    if (v === '>' || v === '|' || v === '>-' || v === '|-') {
      key = k
      block = []
    } else if (v === '') {
      listFor = k
      meta[k] = []
    } else if (v.startsWith('[') && v.endsWith(']')) {
      meta[k] = v
        .slice(1, -1)
        .split(',')
        .map((x) => stripQuotes(x.trim()))
        .filter(Boolean)
    } else {
      meta[k] = stripQuotes(v)
    }
  }
  flush()
  return { meta, body: m[2].trim() }
}

const stripQuotes = (s: string) =>
  (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))
    ? s.slice(1, -1)
    : s

export interface SkillValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function validateSkill(meta: Partial<SkillMeta>, body: string): SkillValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!meta.name) errors.push('Missing required field: name')
  else {
    if (meta.name.length > 64) errors.push('name must be 64 characters or fewer')
    if (!NAME_RE.test(meta.name))
      errors.push('name must be kebab-case (lowercase letters, digits, single hyphens)')
  }
  if (!meta.description) errors.push('Missing required field: description')
  else if (meta.description.length > 1024) errors.push('description must be 1024 characters or fewer')
  else if (meta.description.length < 40)
    warnings.push(
      'description is very short — it is the routing signal, so state what the skill does AND when to use it',
    )

  if (!body.trim()) errors.push('SKILL.md has no body — the agent would have no instructions')
  if (body.length > 40000) warnings.push('Body is large; consider moving detail into resources')

  return { ok: errors.length === 0, errors, warnings }
}

export function parseSkill(src: string, fallbackName = 'untitled-skill'): {
  skill: Omit<Skill, 'id' | 'addedAt'>
  validation: SkillValidation
} {
  const { meta, body } = parseFrontmatter(src)
  const name = String(meta.name ?? fallbackName)
  const validation = validateSkill({ ...meta, name }, body)
  return {
    skill: {
      name,
      description: String(meta.description ?? ''),
      license: meta.license,
      version: meta.version ? String(meta.version) : undefined,
      author: meta.author,
      allowedTools: Array.isArray(meta['allowed-tools'])
        ? meta['allowed-tools']
        : Array.isArray(meta.allowedTools)
          ? meta.allowedTools
          : undefined,
      body,
      resources: [],
    },
    validation,
  }
}

/**
 * Extract tool calls from model output.
 *
 * Local models are unreliable at native function calling, so the protocol is
 * plain text: a fenced ```tool block containing JSON. We also accept a bare
 * JSON object with a "tool" key, which small models emit often enough to matter.
 */
export function extractToolCalls(text: string): { calls: ToolCall[]; thought: string } {
  const calls: ToolCall[] = []
  let thought = text

  const fence = /```(?:tool|json|tool_call)?\s*\n([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) {
    const parsed = tryParseCall(m[1])
    if (parsed) {
      calls.push(parsed)
      thought = thought.replace(m[0], '')
    }
  }

  if (!calls.length) {
    // Bare object fallback — scan for a balanced {...} containing "tool".
    const start = text.indexOf('{')
    if (start !== -1) {
      for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
        const parsed = tryParseCall(text.slice(start, end + 1))
        if (parsed) {
          calls.push(parsed)
          thought = (text.slice(0, start) + text.slice(end + 1)).trim()
          break
        }
      }
    }
  }

  return { calls, thought: thought.trim() }
}

function tryParseCall(raw: string): ToolCall | null {
  const t = raw.trim()
  if (!t.startsWith('{')) return null
  let obj: any
  try {
    obj = JSON.parse(t)
  } catch {
    try {
      // tolerate trailing commas, a very common small-model slip
      obj = JSON.parse(t.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      return null
    }
  }
  const name = obj?.tool ?? obj?.name ?? obj?.function
  if (typeof name !== 'string') return null
  const args = obj.args ?? obj.arguments ?? obj.parameters ?? obj.input ?? {}
  return {
    id: Math.random().toString(36).slice(2, 8),
    name: name.trim(),
    args: typeof args === 'object' && args ? args : {},
  }
}
