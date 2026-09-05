import type { Project, ProviderConfig } from '../types'
import type { LlmMessage } from '../providers'
import { runCompletion } from '../providers'
import { availableTools, toolCatalog, TOOL_MAP, type ToolContext } from './tools'
import { extractToolCalls } from './parse'
import type { Skill, ToolCall, ToolResult } from './types'

export interface RunEvent {
  type: 'thought' | 'token' | 'call' | 'result' | 'done' | 'error' | 'status'
  text?: string
  call?: ToolCall
  result?: ToolResult
}

export interface RunOptions {
  skill: Skill
  provider: ProviderConfig
  getProject: () => Project
  applyPatch: (p: Partial<Project>) => void
  onEvent: (e: RunEvent) => void
  signal: AbortSignal
  maxSteps?: number
  readBudget?: number
  /** Extra instruction from the user for this run. */
  userNote?: string
}

const PROTOCOL = `You operate this writing application by calling tools.

To call a tool, emit EXACTLY ONE fenced block per turn:

\`\`\`tool
{"tool": "read_draft", "args": {"with_line_numbers": true}}
\`\`\`

Rules of the loop:
- ONE tool call per message. Stop after the block; you will be given the result.
- Before the block, write one short line explaining why — no more.
- Never invent tool results. Wait for them.
- Never guess at the draft's contents: read it first.
- When editing, prefer replace_in_draft with text copied EXACTLY from a
  line-numbered read. If a replace fails, re-read and try a longer, unique anchor.
- When the procedure is complete, call "finish" with a Markdown summary.
- If the task cannot be completed, call "finish" and explain why.`

function systemPrompt(skill: Skill): string {
  return `You are an autonomous writing agent embedded in Writerer, the user's editor.

You have been given a SKILL: a procedure to execute on the user's document.
Follow it faithfully and literally. Do not substitute your own workflow.

=== SKILL: ${skill.name} ===
${skill.description}

${skill.body}
=== END SKILL ===

${skill.resources.length ? `Bundled resources (read via read_source if the skill references them):\n${skill.resources.map((r) => `  - ${r.path}`).join('\n')}\n\n` : ''}AVAILABLE TOOLS
${toolCatalog(skill.allowedTools)}

${PROTOCOL}`
}

function contextBrief(p: Project): string {
  return `CURRENT DOCUMENT STATE
title: ${p.name}
task: ${p.task.trim() || '(not stated)'}
audience: ${p.audience.trim() || '(unspecified)'}
draft: ${(p.draft.match(/\S+/g) ?? []).length} words
sources: ${p.docs.length ? p.docs.map((d) => `"${d.name}" [${d.role}]`).join(', ') : '(none)'}

Begin executing the skill now. Start by gathering what you need.`
}

export async function runSkill(opts: RunOptions): Promise<void> {
  const {
    skill,
    provider,
    getProject,
    applyPatch,
    onEvent,
    signal,
    maxSteps = 14,
    readBudget = 12000,
    userNote,
  } = opts

  const allowed = new Set(availableTools(skill.allowedTools).map((t) => t.name))

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt(skill) },
    {
      role: 'user',
      content: contextBrief(getProject()) + (userNote?.trim() ? `\n\nThe writer adds: ${userNote.trim()}` : ''),
    },
  ]

  for (let step = 1; step <= maxSteps; step++) {
    if (signal.aborted) return
    onEvent({ type: 'status', text: `Step ${step}/${maxSteps}` })

    let raw = ''
    try {
      raw = await runCompletion(provider, messages, {
        signal,
        onToken: (t) => onEvent({ type: 'token', text: t }),
      })
    } catch (e: any) {
      if (e?.name === 'AbortError' || signal.aborted) return
      onEvent({ type: 'error', text: e?.message ?? String(e) })
      return
    }

    const { calls, thought } = extractToolCalls(raw)
    if (thought) onEvent({ type: 'thought', text: thought })

    if (!calls.length) {
      // No tool call: nudge once, then treat the prose as the final answer.
      messages.push({ role: 'assistant', content: raw })
      if (step < maxSteps) {
        messages.push({
          role: 'user',
          content:
            'You did not emit a tool call. Respond with exactly one ```tool block, or call "finish" with your summary if the procedure is complete.',
        })
        continue
      }
      onEvent({ type: 'done', text: thought || raw })
      return
    }

    // Only the first call per turn is honoured, keeping the loop legible.
    const call = calls[0]
    messages.push({ role: 'assistant', content: raw })

    if (call.name === 'finish') {
      onEvent({ type: 'call', call })
      onEvent({ type: 'done', text: String(call.args.summary ?? thought ?? 'Done.') })
      return
    }

    const def = TOOL_MAP.get(call.name)
    let result: ToolResult

    if (!def) {
      result = {
        id: call.id,
        name: call.name,
        ok: false,
        output: `ERROR: unknown tool "${call.name}". Available: ${[...allowed].join(', ')}`,
      }
    } else if (!allowed.has(call.name)) {
      result = {
        id: call.id,
        name: call.name,
        ok: false,
        output: `ERROR: this skill is not permitted to use "${call.name}".`,
      }
    } else {
      onEvent({ type: 'call', call })
      try {
        const ctx: ToolContext = { project: getProject(), readBudget }
        const outcome = def.run(call.args, ctx)
        if (outcome.patch) applyPatch(outcome.patch)
        result = {
          id: call.id,
          name: call.name,
          ok: !outcome.output.startsWith('ERROR'),
          output: outcome.output,
        }
      } catch (e: any) {
        result = { id: call.id, name: call.name, ok: false, output: `ERROR: ${e?.message ?? e}` }
      }
    }

    onEvent({ type: 'result', result })
    messages.push({
      role: 'user',
      content: `TOOL RESULT (${result.name}):\n${result.output}`,
    })
  }

  onEvent({
    type: 'done',
    text: `Stopped after ${maxSteps} steps without an explicit finish. Any edits made so far are already in your draft.`,
  })
}
