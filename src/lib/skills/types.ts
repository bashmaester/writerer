/** Agent Skills — portable SKILL.md bundles the coach can execute. */

export interface SkillMeta {
  /** kebab-case, matches the folder name in the spec. */
  name: string
  /** What it does AND when to use it — the routing signal. */
  description: string
  license?: string
  version?: string
  author?: string
  /** Restricts which editor tools the skill may call. */
  allowedTools?: string[]
}

export interface Skill extends SkillMeta {
  id: string
  /** Markdown body: the actual procedure. */
  body: string
  /** Level 3 progressive disclosure: read only when the body points at them. */
  resources: SkillResource[]
  builtin?: boolean
  addedAt: number
}

export interface SkillResource {
  path: string
  text: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  id: string
  name: string
  ok: boolean
  /** Rendered back into the transcript for the model. */
  output: string
}

export type RunPhase = 'idle' | 'thinking' | 'tool' | 'done' | 'error' | 'stopped'

export interface RunStep {
  n: number
  thought?: string
  calls: ToolCall[]
  results: ToolResult[]
}
