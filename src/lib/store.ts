import type { AppSettings, Project, ProviderConfig } from './types'
import { DEFAULT_PERSONAS } from './coach'
import { PROVIDER_PRESETS } from './providers'

const SETTINGS_KEY = 'writerer.settings.v1'
const PROJECT_KEY = 'writerer.project.v1'

export const uid = () => Math.random().toString(36).slice(2, 10)

export function makeProvider(kind: ProviderConfig['kind']): ProviderConfig {
  const p = PROVIDER_PRESETS[kind]
  return {
    id: uid(),
    kind,
    label: p.label,
    baseUrl: p.baseUrl,
    apiKey: '',
    model: p.model,
    temperature: 0.4,
    maxTokens: 4096,
  }
}

export function defaultSettings(): AppSettings {
  const first = makeProvider('openrouter')
  return {
    providers: [first, makeProvider('ollama')],
    activeProviderId: first.id,
    personas: DEFAULT_PERSONAS,
    contextCharBudget: 40000,
  }
}

export function defaultProject(): Project {
  return {
    id: uid(),
    name: 'Untitled project',
    task: '',
    audience: '',
    draft: '',
    docs: [],
    messages: [],
    updatedAt: Date.now(),
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings()
    const s = { ...defaultSettings(), ...JSON.parse(raw) } as AppSettings
    if (!s.providers?.length) return defaultSettings()
    if (!s.personas?.length) s.personas = DEFAULT_PERSONAS
    return s
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(PROJECT_KEY)
    return raw ? { ...defaultProject(), ...JSON.parse(raw) } : defaultProject()
  } catch {
    return defaultProject()
  }
}

export function saveProject(p: Project) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(p))
  } catch {
    /* quota */
  }
}
