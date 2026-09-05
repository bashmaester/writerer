import { useState } from 'react'
import type { AppSettings, ProviderConfig, ProviderKind } from '../lib/types'
import { PROVIDER_PRESETS, listModels } from '../lib/providers'
import { makeProvider } from '../lib/store'
import type { CorsSupport } from '../lib/types'
import ModelPicker from './ModelPicker'

const CORS_LABEL: Record<CorsSupport, string> = {
  yes: '✓ browser-ready',
  no: '⚠ may need proxy',
  local: '⚙ needs CORS setup',
  'n/a': '✓ no network',
}
const CORS_TITLE: Record<CorsSupport, string> = {
  yes: 'Allows direct calls from the browser.',
  no: 'This endpoint often blocks browser calls; you may need a proxy or the local dev server.',
  local: 'A local server you must configure to accept this page’s origin.',
  'n/a': 'Runs inside the browser — no network request at all.',
}

/** Ollama needs to allow this exact origin; show a copyable command. */
function OllamaHelp() {
  const origin = location.origin
  const cmd = `OLLAMA_ORIGINS=${origin} ollama serve`
  return (
    <div className="cors-help">
      <strong>Ollama must allow this page’s origin ({origin}).</strong>
      <p>Quit Ollama completely, then start it with:</p>
      <pre>{cmd}</pre>
      <p>
        macOS app: <code>launchctl setenv OLLAMA_ORIGINS "{origin}"</code> then restart Ollama.
        <br />
        Windows: add <code>OLLAMA_ORIGINS</code> = <code>{origin}</code> as a user environment
        variable, then restart Ollama from the tray.
      </p>
      <button className="ghost sm" onClick={() => navigator.clipboard.writeText(cmd)}>
        Copy command
      </button>
      <p className="hint">
        Using <code>OLLAMA_ORIGINS=*</code> allows any site to reach your local models — prefer the
        exact origin above.
      </p>
    </div>
  )
}

export default function Settings({
  settings,
  onChange,
  onClose,
}: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
  onClose: () => void
}) {
  const [models, setModels] = useState<Record<string, string[]>>({})
  const [status, setStatus] = useState<Record<string, string>>({})

  const patch = (id: string, p: Partial<ProviderConfig>) =>
    onChange({
      ...settings,
      providers: settings.providers.map((x) => (x.id === id ? { ...x, ...p } : x)),
    })

  async function probe(cfg: ProviderConfig) {
    setStatus((s) => ({ ...s, [cfg.id]: 'Checking…' }))
    try {
      const list = await listModels(cfg)
      setModels((m) => ({ ...m, [cfg.id]: list }))
      setStatus((s) => ({ ...s, [cfg.id]: `✓ ${list.length} models` }))
    } catch (e: any) {
      setStatus((s) => ({ ...s, [cfg.id]: `✗ ${e.message ?? e}` }))
    }
  }

  function add(kind: ProviderKind) {
    const p = makeProvider(kind)
    onChange({ ...settings, providers: [...settings.providers, p], activeProviderId: p.id })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="modal-body">
          <section>
            <h3>AI providers</h3>
            <p className="hint">
              Keys are stored only in this browser's localStorage and calls go straight from your
              browser to the provider. For local engines (Ollama, LM Studio) make sure CORS is
              enabled.
            </p>

            {settings.providers.map((p) => {
              const preset = PROVIDER_PRESETS[p.kind]
              const active = p.id === settings.activeProviderId
              return (
                <div key={p.id} className={'provider' + (active ? ' active' : '')}>
                  <div className="provider-head">
                    <label className="radio">
                      <input
                        type="radio"
                        checked={active}
                        onChange={() => onChange({ ...settings, activeProviderId: p.id })}
                      />
                      <input
                        className="label-in"
                        value={p.label}
                        onChange={(e) => patch(p.id, { label: e.target.value })}
                      />
                    </label>
                    <span className="tag">{preset.label}</span>
                    <span className={`tag cors-${preset.cors}`} title={CORS_TITLE[preset.cors]}>
                      {CORS_LABEL[preset.cors]}
                    </span>
                    <button
                      className="ghost sm"
                      onClick={() => {
                        const rest = settings.providers.filter((x) => x.id !== p.id)
                        if (!rest.length) return
                        onChange({
                          ...settings,
                          providers: rest,
                          activeProviderId: active ? rest[0].id : settings.activeProviderId,
                        })
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <p className="hint">
                    {preset.note}
                    {preset.free && <> <span className="free">Free: {preset.free}</span></>}
                    {preset.keyUrl && (
                      <>
                        {' '}
                        <a href={preset.keyUrl} target="_blank" rel="noreferrer">
                          Get a key ↗
                        </a>
                      </>
                    )}
                  </p>

                  {p.kind === 'ollama' && <OllamaHelp />}
                  {p.kind === 'lmstudio' && (
                    <pre className="cors-help">
                      LM Studio → Developer / Local Server → start the server and turn ON
                      &quot;CORS&quot;, then Test below.
                    </pre>
                  )}

                  <div className="grid2">
                    {p.kind !== 'webgpu' && (
                      <label>
                        Base URL
                        <input
                          value={p.baseUrl}
                          onChange={(e) => patch(p.id, { baseUrl: e.target.value })}
                        />
                      </label>
                    )}
                    {preset.needsKey && (
                      <label>
                        API key
                        <input
                          type="password"
                          placeholder="sk-…"
                          value={p.apiKey}
                          onChange={(e) => patch(p.id, { apiKey: e.target.value })}
                        />
                      </label>
                    )}
                    <label>
                      Model
                      <ModelPicker
                        value={p.model}
                        options={models[p.id] ?? []}
                        placeholder="model name"
                        onChange={(v) => patch(p.id, { model: v })}
                      />
                    </label>
                    <label>
                      Temperature: {p.temperature.toFixed(2)}
                      <input
                        type="range"
                        min={0}
                        max={1.2}
                        step={0.05}
                        value={p.temperature}
                        onChange={(e) => patch(p.id, { temperature: +e.target.value })}
                      />
                    </label>
                    <label>
                      Max output tokens
                      <input
                        type="number"
                        min={256}
                        step={256}
                        value={p.maxTokens}
                        onChange={(e) => patch(p.id, { maxTokens: +e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="row">
                    <button className="ghost sm" onClick={() => probe(p)}>
                      Test / fetch models
                    </button>
                    <span className="hint">{status[p.id]}</span>
                  </div>
                </div>
              )
            })}

            <div className="row wrap">
              <span className="hint">Add provider:</span>
              {(Object.keys(PROVIDER_PRESETS) as ProviderKind[]).map((k) => (
                <button key={k} className="ghost sm" onClick={() => add(k)}>
                  + {PROVIDER_PRESETS[k].label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Critique group members</h3>
            <p className="hint">Each enabled member reviews your draft through their own lens.</p>
            {settings.personas.map((p) => (
              <div key={p.id} className="persona">
                <label className="row">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        personas: settings.personas.map((x) =>
                          x.id === p.id ? { ...x, enabled: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  <strong>
                    {p.emoji} {p.name}
                  </strong>
                </label>
                <textarea
                  rows={2}
                  value={p.brief}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      personas: settings.personas.map((x) =>
                        x.id === p.id ? { ...x, brief: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="ghost sm"
              onClick={() =>
                onChange({
                  ...settings,
                  personas: [
                    ...settings.personas,
                    {
                      id: Math.random().toString(36).slice(2),
                      name: 'New member',
                      emoji: '🗣️',
                      brief: 'Describe this reviewer’s lens…',
                      enabled: true,
                    },
                  ],
                })
              }
            >
              + Add member
            </button>
          </section>

          <section>
            <h3>Context budget</h3>
            <label>
              Characters of reference material sent per request:{' '}
              <strong>{settings.contextCharBudget.toLocaleString()}</strong>
              <input
                type="range"
                min={8000}
                max={200000}
                step={4000}
                value={settings.contextCharBudget}
                onChange={(e) => onChange({ ...settings, contextCharBudget: +e.target.value })}
              />
            </label>
            <p className="hint">
              Long documents are trimmed head-and-tail to fit. Lower this if your model has a small
              context window.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
