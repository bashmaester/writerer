import type { CorsSupport, ProviderConfig, ProviderKind } from './types'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderPreset {
  label: string
  baseUrl: string
  model: string
  needsKey: boolean
  note: string
  /** Does the endpoint allow direct browser (CORS) calls? */
  cors: CorsSupport
  free?: string
  keyUrl?: string
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    needsKey: true,
    note: 'Hundreds of models behind one key, and CORS is fully open — the most reliable choice for the hosted site.',
    cors: 'yes',
    free: 'Many models with a `:free` suffix cost nothing.',
    keyUrl: 'https://openrouter.ai/keys',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    needsKey: true,
    note: 'Gemini via its OpenAI-compatible layer. Generous free tier and browser-friendly CORS.',
    cors: 'yes',
    free: 'Free tier with daily request limits — no card required.',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    needsKey: true,
    note: 'Extremely fast inference on open models. OpenAI-compatible.',
    cors: 'yes',
    free: 'Free tier with generous rate limits.',
    keyUrl: 'https://console.groq.com/keys',
  },
  cerebras: {
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
    needsKey: true,
    note: 'Very high token throughput on open models.',
    cors: 'yes',
    free: 'Free tier available.',
    keyUrl: 'https://cloud.cerebras.ai',
  },
  nvidia: {
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.3-70b-instruct',
    needsKey: true,
    note: 'NVIDIA-hosted NIM endpoints. May block direct browser calls — if it fails, use a proxy or run it from the local dev server.',
    cors: 'no',
    free: 'Free credits for developers on build.nvidia.com.',
    keyUrl: 'https://build.nvidia.com',
  },
  github: {
    label: 'GitHub Models',
    baseUrl: 'https://models.github.ai/inference',
    model: 'openai/gpt-4o-mini',
    needsKey: true,
    note: 'Free access to GPT, Llama, Phi and more with a GitHub PAT (needs the models:read scope). Browser CORS is not guaranteed — use a proxy if blocked.',
    cors: 'no',
    free: 'Free for experimentation, rate-limited per PAT.',
    keyUrl: 'https://github.com/settings/personal-access-tokens',
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    needsKey: true,
    note: 'Mistral’s hosted API, OpenAI-compatible.',
    cors: 'no',
    free: 'Free experimentation tier.',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    note: 'Official OpenAI chat completions API.',
    cors: 'yes',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    needsKey: true,
    note: 'Direct Claude API. The CORS opt-in header is sent for you.',
    cors: 'yes',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    needsKey: false,
    note: 'Ollama must be told to accept this page’s origin — see the CORS help below.',
    cors: 'local',
  },
  lmstudio: {
    label: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    needsKey: false,
    note: 'Start the local server and enable CORS in LM Studio’s server settings.',
    cors: 'local',
  },
  custom: {
    label: 'Custom OpenAI-compatible',
    baseUrl: 'http://localhost:8000/v1',
    model: 'my-model',
    needsKey: false,
    note: 'vLLM, llama.cpp, LiteLLM, Together, DeepSeek, Fireworks — anything serving /chat/completions.',
    cors: 'local',
  },
  webgpu: {
    label: 'In-browser WebGPU (WebLLM)',
    baseUrl: '',
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    needsKey: false,
    note: 'Runs entirely in your browser. No key, no server, no CORS. First run downloads weights (~2GB).',
    cors: 'n/a',
    free: 'Completely free and private.',
  },
}

/** Providers whose /models listing is unavailable or shaped differently. */
const NO_MODEL_LIST: ProviderKind[] = ['github']

/**
 * A failed fetch() gives the browser's opaque "Failed to fetch". Turn that into
 * provider-specific, actionable guidance.
 */
export function corsHelp(cfg: ProviderConfig): string {
  const preset = PROVIDER_PRESETS[cfg.kind]
  const httpsPage = location.protocol === 'https:'
  const localTarget = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(cfg.baseUrl)

  if (localTarget) {
    const origin = location.origin
    if (cfg.kind === 'ollama')
      return `Could not reach Ollama at ${cfg.baseUrl}.\n\nOllama must be told to accept requests from this page. Stop it, then restart with:\n\n    OLLAMA_ORIGINS=${origin} ollama serve\n\n(macOS app: launchctl setenv OLLAMA_ORIGINS "${origin}" then restart Ollama. Windows: set OLLAMA_ORIGINS as a user environment variable, then restart.)\n\nAlso confirm the server is actually running: curl ${cfg.baseUrl}/models`
    if (cfg.kind === 'lmstudio')
      return `Could not reach LM Studio at ${cfg.baseUrl}.\n\nOpen LM Studio → Developer / Local Server, start the server, and enable "CORS" (allow cross-origin requests). Then retry.`
    return `Could not reach ${cfg.baseUrl}.\n\nMake sure the server is running and sends CORS headers allowing ${origin}.${
      httpsPage ? ' Some browsers also block http:// requests from an https:// page.' : ''
    }`
  }

  return `Could not reach ${cfg.label}.\n\nThis is usually CORS: ${
    preset.cors === 'no'
      ? `${cfg.label} does not reliably allow direct browser calls.`
      : 'the endpoint refused the browser request.'
  }\n\nOptions: check your API key and base URL, pick a browser-friendly provider (OpenRouter, Gemini, Groq, OpenAI, Anthropic), run Writerer locally, or put a CORS proxy in front of this endpoint.`
}

export interface StreamOpts {
  signal?: AbortSignal
  onToken?: (t: string) => void
  onProgress?: (info: string) => void
}

async function readSSE(
  res: Response,
  extract: (json: any) => string | undefined,
  onToken?: (t: string) => void,
): Promise<string> {
  if (!res.body) throw new Error('No response body')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() ?? ''
    for (const line of parts) {
      const l = line.trim()
      if (!l.startsWith('data:')) continue
      const payload = l.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const piece = extract(JSON.parse(payload))
        if (piece) {
          out += piece
          onToken?.(piece)
        }
      } catch {
        /* ignore partial */
      }
    }
  }
  return out
}

async function openAiCompatible(
  cfg: ProviderConfig,
  messages: LlmMessage[],
  opts: StreamOpts,
): Promise<string> {
  const url = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  if (cfg.kind === 'openrouter') {
    headers['HTTP-Referer'] = location.origin
    headers['X-Title'] = 'Writerer'
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      signal: opts.signal,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream: true,
      }),
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    throw new Error(corsHelp(cfg))
  }
  if (!res.ok) throw new Error(`${cfg.label}: ${res.status} ${await res.text().catch(() => '')}`)
  return readSSE(res, (j) => j?.choices?.[0]?.delta?.content, opts.onToken)
}

async function anthropic(
  cfg: ProviderConfig,
  messages: LlmMessage[],
  opts: StreamOpts,
): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const rest = messages.filter((m) => m.role !== 'system')
  let res: Response
  try {
    res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        system: system || undefined,
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        stream: true,
      }),
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    throw new Error(corsHelp(cfg))
  }
  if (!res.ok) throw new Error(`Anthropic: ${res.status} ${await res.text().catch(() => '')}`)
  return readSSE(
    res,
    (j) => (j?.type === 'content_block_delta' ? j?.delta?.text : undefined),
    opts.onToken,
  )
}

let webllmEngine: any = null
let webllmModel = ''

async function webgpu(
  cfg: ProviderConfig,
  messages: LlmMessage[],
  opts: StreamOpts,
): Promise<string> {
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser.')
  const webllm: any = await import('@mlc-ai/web-llm')
  if (!webllmEngine || webllmModel !== cfg.model) {
    opts.onProgress?.('Loading model into the browser…')
    webllmEngine = await webllm.CreateMLCEngine(cfg.model, {
      initProgressCallback: (p: any) => opts.onProgress?.(p.text),
    })
    webllmModel = cfg.model
  }
  const chunks = await webllmEngine.chat.completions.create({
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: true,
  })
  let out = ''
  for await (const c of chunks) {
    const piece = c?.choices?.[0]?.delta?.content
    if (piece) {
      out += piece
      opts.onToken?.(piece)
    }
  }
  return out
}

export async function runCompletion(
  cfg: ProviderConfig,
  messages: LlmMessage[],
  opts: StreamOpts = {},
): Promise<string> {
  if (cfg.kind === 'webgpu') return webgpu(cfg, messages, opts)
  if (cfg.kind === 'anthropic') return anthropic(cfg, messages, opts)
  if (!cfg.baseUrl) throw new Error(`${cfg.label}: no base URL configured.`)
  return openAiCompatible(cfg, messages, opts)
}

export async function listModels(cfg: ProviderConfig): Promise<string[]> {
  if (cfg.kind === 'webgpu') {
    const webllm: any = await import('@mlc-ai/web-llm')
    return (webllm.prebuiltAppConfig?.model_list ?? []).map((m: any) => m.model_id)
  }
  if (cfg.kind === 'anthropic') {
    const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/models', {
      headers: {
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const j = await res.json()
    return (j.data ?? []).map((m: any) => m.id)
  }
  if (NO_MODEL_LIST.includes(cfg.kind))
    throw new Error(`${cfg.label} has no browser-listable model index — type the model name manually.`)
  const headers: Record<string, string> = {}
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  let res: Response
  try {
    res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/models', { headers })
  } catch {
    throw new Error(corsHelp(cfg))
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 200))
  const j = await res.json()
  return (j.data ?? []).map((m: any) => m.id).sort()
}
