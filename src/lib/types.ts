export type ProviderKind =
  | 'openai'
  | 'openrouter'
  | 'anthropic'
  | 'gemini'
  | 'github'
  | 'nvidia'
  | 'groq'
  | 'mistral'
  | 'cerebras'
  | 'ollama'
  | 'lmstudio'
  | 'custom'
  | 'webgpu'

/** Whether the provider sends CORS headers allowing direct browser calls. */
export type CorsSupport = 'yes' | 'no' | 'local' | 'n/a'

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  label: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export type DocRole = 'guideline' | 'sample' | 'template' | 'reference' | 'draft'

export interface RefDoc {
  id: string
  name: string
  role: DocRole
  mime: string
  text: string
  words: number
  addedAt: number
  include: boolean
}

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  persona?: string
  createdAt: number
}

export type CoachMode =
  | 'analyze'
  | 'critique'
  | 'edit'
  | 'evaluate'
  | 'rewrite'
  | 'critique-group'
  | 'chat'

export interface Persona {
  id: string
  name: string
  emoji: string
  brief: string
  enabled: boolean
}

export interface Project {
  id: string
  name: string
  task: string
  audience: string
  draft: string
  docs: RefDoc[]
  messages: ChatMsg[]
  updatedAt: number
}

export interface AppSettings {
  providers: ProviderConfig[]
  activeProviderId: string
  personas: Persona[]
  contextCharBudget: number
}
