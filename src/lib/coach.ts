import type { CoachMode, Persona, Project, RefDoc } from './types'
import type { LlmMessage } from './providers'

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'p-editor',
    name: 'The Developmental Editor',
    emoji: '🧭',
    brief:
      'Focuses on structure, argument, logic, pacing and whether the piece actually fulfils the assigned task. Big-picture first.',
    enabled: true,
  },
  {
    id: 'p-line',
    name: 'The Line Editor',
    emoji: '✒️',
    brief:
      'Obsessed with sentences: clarity, rhythm, diction, redundancy, mixed metaphors, tense and voice consistency. Quotes lines and rewrites them.',
    enabled: true,
  },
  {
    id: 'p-reader',
    name: 'The Target Reader',
    emoji: '👓',
    brief:
      'Reads as the actual intended audience. Reports honest reactions: where they got bored, confused, unconvinced, or delighted.',
    enabled: true,
  },
  {
    id: 'p-rubric',
    name: 'The Rubric Hawk',
    emoji: '📐',
    brief:
      'Cares only about the supplied guidelines, templates and rubric. Checks compliance item by item and flags every violation with a citation.',
    enabled: true,
  },
  {
    id: 'p-skeptic',
    name: 'The Skeptic',
    emoji: '🧨',
    brief:
      'Attacks weak evidence, unsupported claims, hand-waving and clichés. Steel-mans the opposing view and asks the hard question the writer avoided.',
    enabled: false,
  },
]

const BASE_ROLE = `You are Writerer, an exacting but generous writing coach. You never flatter. You give specific, actionable, quotable feedback anchored in the writer's actual text and in the reference materials they supplied. When you assert something is wrong, you show the line and offer a concrete fix. You respect the writer's voice: you improve it rather than replacing it with generic prose.`

const RULES = `Hard rules:
- Ground every claim in the DRAFT or the REFERENCE MATERIALS. Quote short excerpts (<25 words) when referring to the draft.
- If the references contain a rubric, template, word limit or style rule, treat it as binding and say so explicitly.
- Never invent facts, citations or sources that are not in the provided material.
- Prefer Markdown with clear headings. Be concise in praise, generous in specifics.`

export const MODE_LABEL: Record<CoachMode, string> = {
  analyze: 'Analyze',
  critique: 'Critique',
  edit: 'Line edit',
  evaluate: 'Evaluate / score',
  rewrite: 'Rewrite',
  'critique-group': 'Critique group',
  chat: 'Ask the coach',
}

const MODE_PROMPT: Record<CoachMode, string> = {
  analyze: `Perform a structural ANALYSIS of the draft. Output:
## Snapshot
One paragraph: what this piece currently is, and what the task says it should be.
## Structure map
A table or list of the sections/beats in order with their function and word share.
## Argument & evidence
What is claimed, what supports it, what is asserted without support.
## Voice & register
Compare to the samples/guidelines provided.
## Fit to the task
Explicit gap list between task requirements and current draft.`,

  critique: `Give a CRITIQUE. Output:
## What's working (be specific, cite lines)
## The three problems that matter most
For each: what it is, why it hurts the reader, the exact passage, and a concrete fix.
## Smaller notes
Bulleted, line-referenced.
## The one thing to do next`,

  edit: `Do a LINE EDIT. Work through the draft in order. For each edit output a bullet:
- **Original:** "…" → **Edited:** "…" — *reason (one clause)*
Group by section. Cover clarity, redundancy, weak verbs, hedging, passive voice where it hurts, tense/POV slips, punctuation, and any style rules from the references. End with a "## Patterns to watch" list of the writer's recurring habits.`,

  evaluate: `EVALUATE the draft against the task and any rubric in the references.
Produce a markdown table with columns: Criterion | Score /5 | Evidence | How to reach 5.
Derive criteria from the supplied rubric/guidelines if present; otherwise use: task fulfilment, structure, argument/evidence, style & voice, mechanics, audience fit.
Then give: **Overall: X/5** with a two-sentence justification, and a prioritized fix list (highest score gain first).`,

  rewrite: `REWRITE the draft so it fully satisfies the task and the reference materials while preserving the writer's voice.
Output exactly two sections:
## Rewrite
The complete rewritten piece, publication-ready, in Markdown. No commentary inside it.
## What I changed and why
A short bulleted changelog (max 10 bullets).`,

  'critique-group': '',
  chat: `Answer the writer's question as their coach, grounded in the draft, task and references. Be direct and practical.`,
}

function budgetedDocs(docs: RefDoc[], budget: number): string {
  const active = docs.filter((d) => d.include && d.text.trim())
  if (!active.length) return '(none provided)'
  const share = Math.max(1200, Math.floor(budget / active.length))
  return active
    .map((d) => {
      let text = d.text.trim()
      if (text.length > share)
        text =
          text.slice(0, Math.floor(share * 0.7)) +
          `\n\n…[trimmed ${text.length - share} chars]…\n\n` +
          text.slice(-Math.floor(share * 0.3))
      return `<document role="${d.role}" name="${d.name}">\n${text}\n</document>`
    })
    .join('\n\n')
}

export function buildContext(project: Project, budget: number): string {
  return `# TASK / ASSIGNMENT
${project.task.trim() || '(the writer has not stated the task; infer it and say so)'}

# INTENDED AUDIENCE
${project.audience.trim() || '(unspecified)'}

# REFERENCE MATERIALS
${budgetedDocs(project.docs, budget)}

# DRAFT (the writer's work under review)
<draft words="${(project.draft.trim().match(/\S+/g) ?? []).length}">
${project.draft.trim() || '(empty — the writer has not pasted a draft yet)'}
</draft>`
}

export function buildMessages(opts: {
  project: Project
  mode: CoachMode
  budget: number
  userNote?: string
  persona?: Persona
  history?: { role: 'user' | 'assistant'; content: string }[]
  focus?: string
}): LlmMessage[] {
  const { project, mode, budget, userNote, persona, history, focus } = opts
  const personaBlock = persona
    ? `\n\nYou are participating in a critique group as **${persona.name}** ${persona.emoji}. Your lens: ${persona.brief}\nStay in that lane — other members cover the rest. Open with "### ${persona.emoji} ${persona.name}" and keep it under 350 words. End with one line beginning "**Ask:**" posing a question to the writer.`
    : ''

  const system = `${BASE_ROLE}${personaBlock}\n\n${RULES}`

  const instruction = persona
    ? `Give your critique-group feedback on the draft below through your specific lens.`
    : MODE_PROMPT[mode] || MODE_PROMPT.chat

  const msgs: LlmMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: buildContext(project, budget) },
  ]
  for (const h of history ?? []) msgs.push(h)
  msgs.push({
    role: 'user',
    content: [
      instruction,
      focus?.trim() ? `\nFocus especially on: ${focus.trim()}` : '',
      userNote?.trim() ? `\nThe writer adds: ${userNote.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  })
  return msgs
}

export function buildSynthesisMessages(
  project: Project,
  budget: number,
  critiques: string[],
): LlmMessage[] {
  return [
    { role: 'system', content: `${BASE_ROLE}\n\n${RULES}` },
    { role: 'user', content: buildContext(project, budget) },
    {
      role: 'user',
      content: `Your critique group just delivered the following feedback:\n\n${critiques.join(
        '\n\n---\n\n',
      )}\n\nAs the workshop leader, synthesize it. Output:
## Where the group agrees
## Where the group disagrees (and what you'd do)
## Revision plan
A numbered list of at most 6 concrete steps, ordered by impact, each with an estimated effort (S/M/L).`,
    },
  ]
}
