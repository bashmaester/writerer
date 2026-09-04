import type { ProviderConfig, ProviderKind } from './types'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const PROVIDER_PRESETS: Record<
  ProviderKind,
  { label: string; baseUrl: string; model: string; needsKey: boolean; note: string }
> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    note: 'Official OpenAI chat completions API.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    needsKey: true,
    note: 'Hundreds of models behind one OpenAI-compatible key.',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    needsKey: true,
    note: 'Direct Claude API. Browser calls need the CORS-enabled header (sent automatically).',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    needsKey: false,
    note: 'Run `OLLAMA_ORIGINS=* ollama serve` so the browser may connect.',
  },
  lmstudio: {
    label: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    needsKey: false,
    note: 'Start the LM Studio local server, enable CORS in its settings.',
  },
  custom: {
    label: 'Custom OpenAI-compatible',
    baseUrl: 'http://localhost:8000/v1',
    model: 'my-model',
    needsKey: false,
    note: 'vLLM, llama.cpp server, LiteLLM, Together, Groq, anything /v1/chat/completions.',
  },
  webgpu: {
    label: 'In-browser WebGPU (WebLLM)',
    baseUrl: '',
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    needsKey: false,
    note: 'Fully local, no server. First run downloads model weights (~2GB).',
  },
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
  const res = await fetch(url, {
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
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/messages', {
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
  const headers: Record<string, string> = {}
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/models', { headers })
  if (!res.ok) throw new Error(`${res.status}`)
  const j = await res.json()
  return (j.data ?? []).map((m: any) => m.id).sort()
}
