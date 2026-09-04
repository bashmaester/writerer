import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ChatMsg, CoachMode, DocRole, Project, RefDoc } from './lib/types'
import { MODE_LABEL, buildMessages, buildSynthesisMessages } from './lib/coach'
import { runCompletion } from './lib/providers'
import {
  ACCEPTED,
  exportDocx,
  exportHtml,
  exportPdf,
  exportText,
  extractText,
  wordCount,
} from './lib/files'
import { loadProject, loadSettings, saveProject, saveSettings, uid, defaultProject } from './lib/store'
import Settings from './components/Settings'
import Markdown from './components/Markdown'

const ROLES: DocRole[] = ['guideline', 'sample', 'template', 'reference', 'draft']
const MODES: CoachMode[] = ['analyze', 'critique', 'edit', 'evaluate', 'rewrite', 'critique-group']

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [project, setProject] = useState<Project>(loadProject)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [focus, setFocus] = useState('')
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<'draft' | 'refs'>('draft')
  const [importing, setImporting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveProject(project), [project])
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [project.messages.length])

  const provider = useMemo(
    () => settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0],
    [settings],
  )
  const patchProject = (p: Partial<Project>) =>
    setProject((prev) => ({ ...prev, ...p, updatedAt: Date.now() }))

  /* ---------------- file handling ---------------- */
  async function ingest(files: FileList | File[], role: DocRole) {
    setImporting(true)
    setError('')
    const added: RefDoc[] = []
    for (const f of Array.from(files)) {
      try {
        const text = await extractText(f)
        added.push({
          id: uid(),
          name: f.name,
          role,
          mime: f.type || 'text/plain',
          text,
          words: wordCount(text),
          addedAt: Date.now(),
          include: true,
        })
      } catch (e: any) {
        setError(`Could not read ${f.name}: ${e.message ?? e}`)
      }
    }
    setImporting(false)
    if (!added.length) return
    if (role === 'draft') {
      patchProject({ draft: added.map((d) => d.text).join('\n\n') })
      setTab('draft')
    } else {
      patchProject({ docs: [...project.docs, ...added] })
      setTab('refs')
    }
  }

  /* ---------------- generation ---------------- */
  function push(msg: Omit<ChatMsg, 'id' | 'createdAt'>): string {
    const id = uid()
    setProject((p) => ({
      ...p,
      messages: [...p.messages, { ...msg, id, createdAt: Date.now() }],
      updatedAt: Date.now(),
    }))
    return id
  }
  const appendTo = (id: string, chunk: string) =>
    setProject((p) => ({
      ...p,
      messages: p.messages.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)),
    }))

  async function run(mode: CoachMode, userText?: string) {
    if (!provider) return setError('Configure a provider in Settings first.')
    if (!project.draft.trim() && mode !== 'chat')
      return setError('Paste or upload your draft first.')
    setError('')
    setBusy(true)
    setProgress('')
    const ac = new AbortController()
    abortRef.current = ac
    const budget = settings.contextCharBudget

    try {
      if (mode === 'chat') {
        push({ role: 'user', content: userText ?? '' })
        const history = project.messages
          .slice(-6)
          .map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })) as any
        const id = push({ role: 'assistant', content: '', persona: 'Coach' })
        await runCompletion(
          provider,
          buildMessages({ project, mode, budget, userNote: userText, history, focus }),
          { signal: ac.signal, onToken: (t) => appendTo(id, t), onProgress: setProgress },
        )
      } else if (mode === 'critique-group') {
        const members = settings.personas.filter((p) => p.enabled)
        if (!members.length) throw new Error('Enable at least one critique-group member.')
        push({ role: 'user', content: `**Critique group session** — ${members.length} readers` })
        const collected: string[] = []
        for (const persona of members) {
          setProgress(`${persona.emoji} ${persona.name} is reading…`)
          const id = push({ role: 'assistant', content: '', persona: persona.name })
          const out = await runCompletion(
            provider,
            buildMessages({ project, mode, budget, persona, focus, userNote: note }),
            { signal: ac.signal, onToken: (t) => appendTo(id, t), onProgress: setProgress },
          )
          collected.push(out)
        }
        setProgress('Workshop leader is synthesizing…')
        const sid = push({ role: 'assistant', content: '', persona: 'Synthesis' })
        await runCompletion(provider, buildSynthesisMessages(project, budget, collected), {
          signal: ac.signal,
          onToken: (t) => appendTo(sid, t),
          onProgress: setProgress,
        })
      } else {
        push({ role: 'user', content: `**${MODE_LABEL[mode]}**${focus ? ` — focus: ${focus}` : ''}` })
        const id = push({ role: 'assistant', content: '', persona: MODE_LABEL[mode] })
        await runCompletion(
          provider,
          buildMessages({ project, mode, budget, focus, userNote: note }),
          { signal: ac.signal, onToken: (t) => appendTo(id, t), onProgress: setProgress },
        )
      }
      setNote('')
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
      setProgress('')
      abortRef.current = null
    }
  }

  function applyRewrite(content: string) {
    const m = /##\s*Rewrite\s*\n([\s\S]*?)(?:\n##\s|\s*$)/i.exec(content)
    const text = (m ? m[1] : content).trim()
    if (!text) return
    patchProject({ draft: text })
    setTab('draft')
  }

  async function exportAs(fmt: 'md' | 'txt' | 'docx' | 'pdf' | 'html', text: string, base: string) {
    const safe = base.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'writerer'
    if (fmt === 'md') return exportText(text, `${safe}.md`, 'text/markdown')
    if (fmt === 'txt') return exportText(text.replace(/[*_`#>]/g, ''), `${safe}.txt`)
    if (fmt === 'html') return exportHtml(text, `${safe}.html`)
    if (fmt === 'docx') return exportDocx(text, `${safe}.docx`)
    return exportPdf(text, `${safe}.pdf`)
  }

  const transcript = () =>
    project.messages
      .map((m) => (m.role === 'user' ? `\n---\n\n**You:** ${m.content}` : `\n### ${m.persona ?? 'Coach'}\n\n${m.content}`))
      .join('\n\n')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">✎</span>
          <div>
            <h1>Writerer</h1>
            <small>writing coach &amp; critique group</small>
          </div>
        </div>
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => patchProject({ name: e.target.value })}
        />
        <div className="row">
          <span className="pill" title={provider?.model}>
            {provider ? `${provider.label} · ${provider.model}` : 'no provider'}
          </span>
          <button className="ghost sm" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
          <button
            className="ghost sm"
            onClick={() => {
              if (confirm('Start a new empty project? Current work will be cleared.'))
                setProject(defaultProject())
            }}
          >
            New
          </button>
        </div>
      </header>

      <main className="cols">
        {/* -------- left: task + refs -------- */}
        <section className="col left">
          <h2>The assignment</h2>
          <label className="field">
            Task / prompt
            <textarea
              rows={5}
              placeholder="e.g. Write a 1,200-word grant abstract for the NSF CAREER program describing our work on…"
              value={project.task}
              onChange={(e) => patchProject({ task: e.target.value })}
            />
          </label>
          <label className="field">
            Intended audience
            <input
              placeholder="e.g. non-specialist review panel"
              value={project.audience}
              onChange={(e) => patchProject({ audience: e.target.value })}
            />
          </label>

          <h2>Reference materials</h2>
          <DropZone
            label="Drop guidelines, samples, templates, rubrics — PDF, DOCX, MD, TXT, HTML…"
            onFiles={(f, role) => ingest(f, role)}
          />
          {importing && <p className="hint">Extracting text…</p>}

          <ul className="doclist">
            {project.docs.map((d) => (
              <li key={d.id}>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) =>
                      patchProject({
                        docs: project.docs.map((x) =>
                          x.id === d.id ? { ...x, include: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  <span className="doc-name" title={d.name}>
                    {d.name}
                  </span>
                </label>
                <div className="row">
                  <select
                    value={d.role}
                    onChange={(e) =>
                      patchProject({
                        docs: project.docs.map((x) =>
                          x.id === d.id ? { ...x, role: e.target.value as DocRole } : x,
                        ),
                      })
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <span className="hint">{d.words.toLocaleString()}w</span>
                  <button
                    className="ghost sm"
                    onClick={() => patchProject({ draft: d.text, ...{} })}
                    title="Load this document into the draft editor"
                  >
                    → draft
                  </button>
                  <button
                    className="ghost sm"
                    onClick={() =>
                      patchProject({ docs: project.docs.filter((x) => x.id !== d.id) })
                    }
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
            {!project.docs.length && <p className="hint">No reference documents yet.</p>}
          </ul>
        </section>

        {/* -------- middle: draft -------- */}
        <section className="col mid">
          <div className="tabs">
            <button className={tab === 'draft' ? 'tab on' : 'tab'} onClick={() => setTab('draft')}>
              Draft
            </button>
            <button className={tab === 'refs' ? 'tab on' : 'tab'} onClick={() => setTab('refs')}>
              Context preview
            </button>
            <span className="spacer" />
            <span className="hint">{wordCount(project.draft).toLocaleString()} words</span>
          </div>

          {tab === 'draft' ? (
            <>
              <textarea
                className="editor"
                placeholder="Paste your draft here, or drop a file below…"
                value={project.draft}
                onChange={(e) => patchProject({ draft: e.target.value })}
              />
              <div className="row wrap">
                <label className="ghost sm filebtn">
                  ⬆ Upload draft
                  <input
                    type="file"
                    accept={ACCEPTED}
                    hidden
                    onChange={(e) => e.target.files && ingest(e.target.files, 'draft')}
                  />
                </label>
                <span className="hint">Export draft:</span>
                {(['md', 'txt', 'docx', 'pdf', 'html'] as const).map((f) => (
                  <button key={f} className="ghost sm" onClick={() => exportAs(f, project.draft, project.name)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="preview">
              <p className="hint">
                Exactly what the model receives as reference context (trimmed to your budget).
              </p>
              <pre>
                {project.docs
                  .filter((d) => d.include)
                  .map((d) => `[${d.role}] ${d.name} — ${d.words}w\n${d.text.slice(0, 1500)}…`)
                  .join('\n\n────────\n\n') || '(nothing included)'}
              </pre>
            </div>
          )}
        </section>

        {/* -------- right: coach -------- */}
        <section className="col right">
          <h2>Coaching</h2>
          <label className="field">
            Focus (optional)
            <input
              placeholder="e.g. the opening paragraph, or compliance with the word limit"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            />
          </label>
          <div className="modes">
            {MODES.map((m) => (
              <button key={m} className="mode" disabled={busy} onClick={() => run(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {error && <div className="error">{error}</div>}
          {busy && (
            <div className="busy">
              <span className="spin" /> {progress || 'Thinking…'}
              <button className="ghost sm" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            </div>
          )}

          <div className="feed" ref={feedRef}>
            {!project.messages.length && (
              <div className="empty">
                <p>
                  Add your task, drop in the guidelines and samples, paste your draft — then pick a
                  coaching mode.
                </p>
                <p className="hint">
                  <strong>Critique group</strong> runs every enabled reader in turn and then
                  synthesizes a revision plan.
                </p>
              </div>
            )}
            {project.messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="msg user">
                  <Markdown text={m.content} />
                </div>
              ) : (
                <div key={m.id} className="msg bot">
                  <div className="msg-head">
                    <strong>{m.persona ?? 'Coach'}</strong>
                    <span className="spacer" />
                    <button className="ghost sm" onClick={() => navigator.clipboard.writeText(m.content)}>
                      Copy
                    </button>
                    {/##\s*Rewrite/i.test(m.content) && (
                      <button className="ghost sm" onClick={() => applyRewrite(m.content)}>
                        Use as draft
                      </button>
                    )}
                    <select
                      className="mini"
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          exportAs(e.target.value as any, m.content, `${project.name}-${m.persona}`)
                        e.currentTarget.value = ''
                      }}
                    >
                      <option value="">Export…</option>
                      <option value="md">Markdown</option>
                      <option value="txt">Plain text</option>
                      <option value="docx">DOCX</option>
                      <option value="pdf">PDF</option>
                      <option value="html">HTML</option>
                    </select>
                  </div>
                  <Markdown text={m.content || '…'} />
                </div>
              ),
            )}
          </div>

          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault()
              const v = note.trim()
              if (!v || busy) return
              setNote('')
              run('chat', v)
            }}
          >
            <textarea
              rows={2}
              placeholder="Ask the coach anything — “is my thesis clear?”, “tighten paragraph 3”…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                  (e.currentTarget.form as HTMLFormElement).requestSubmit()
              }}
            />
            <button disabled={busy || !note.trim()}>Send</button>
          </form>
          <div className="row">
            <button
              className="ghost sm"
              disabled={!project.messages.length}
              onClick={() => exportAs('md', transcript(), `${project.name}-feedback`)}
            >
              Export all feedback
            </button>
            <button
              className="ghost sm"
              disabled={!project.messages.length}
              onClick={() => patchProject({ messages: [] })}
            >
              Clear
            </button>
          </div>
        </section>
      </main>

      {showSettings && (
        <Settings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

function DropZone({
  label,
  onFiles,
}: {
  label: string
  onFiles: (files: FileList | File[], role: DocRole) => void
}) {
  const [role, setRole] = useState<DocRole>('guideline')
  const [over, setOver] = useState(false)
  return (
    <div
      className={'drop' + (over ? ' over' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files, role)
      }}
    >
      <p>{label}</p>
      <div className="row">
        <select value={role} onChange={(e) => setRole(e.target.value as DocRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              add as: {r}
            </option>
          ))}
        </select>
        <label className="ghost sm filebtn">
          Browse…
          <input
            type="file"
            multiple
            accept={ACCEPTED}
            hidden
            onChange={(e) => e.target.files && onFiles(e.target.files, role)}
          />
        </label>
      </div>
    </div>
  )
}
