import type { Skill } from './types'
import { parseSkill } from './parse'
import { BUILTIN_SKILLS } from './builtin'

const KEY = 'writerer.skills.v1'
const uid = () => Math.random().toString(36).slice(2, 10)

function buildBuiltins(): Skill[] {
  return BUILTIN_SKILLS.map((src) => {
    const { skill } = parseSkill(src)
    return { ...skill, id: `builtin-${skill.name}`, builtin: true, addedAt: 0 }
  })
}

export function loadSkills(): Skill[] {
  const builtins = buildBuiltins()
  try {
    const raw = localStorage.getItem(KEY)
    const custom: Skill[] = raw ? JSON.parse(raw) : []
    // Built-ins are re-derived from source each load so updates ship with the app.
    return [...builtins, ...custom.filter((s) => !s.builtin)]
  } catch {
    return builtins
  }
}

export function saveSkills(skills: Skill[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(skills.filter((s) => !s.builtin)))
  } catch {
    /* quota */
  }
}

export function makeSkill(src: string, fallbackName?: string) {
  const { skill, validation } = parseSkill(src, fallbackName)
  return { skill: { ...skill, id: uid(), addedAt: Date.now() } as Skill, validation }
}

export const SKILL_TEMPLATE = `---
name: my-skill
description: What this skill does, and when the coach should use it. Include the phrases a writer would actually say, because this text is the routing signal.
version: 1.0.0
allowed-tools: [get_task, read_draft, get_outline, replace_in_draft, add_note, finish]
---

# My skill

## Procedure

1. Call \`get_task\` to understand the assignment.
2. Call \`read_draft\` with \`with_line_numbers: true\`.
3. …your steps here…
4. Call \`finish\` with a Markdown summary.

## Rules

- Be specific about what to change and what to leave alone.
- Quote the draft when making a claim about it.
`
