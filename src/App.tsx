import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { fetchUrlAsDoc } from './lib/fetchUrl'
import { docStats, parseOutline, type Marker } from './lib/outline'
import { useDragResize, useLayout } from './lib/layout'
import Settings from './components/Settings'
import Markdown from './components/Markdown'
import PasteNote from './components/PasteNote'
import Outline from './components/Outline'

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
  const [urlStatus, setUrlStatus] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [editDoc, setEditDoc] = useState<RefDoc | null>(null)
  const [caretLine, setCaretLine] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const { layout, set, toggle } = useLayout()

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveProject(project), [project])
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [project.messages.length])

  const provider = useMemo(
    () => settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0],
    [settings],
  )
  const patchProject = useCallback(
    (p: Partial<Project>) => setProject((prev) => ({ ...prev, ...p, updatedAt: Date.now() })),
    [],
  )

  const markers = useMemo(() => parseOutline(project.draft), [project.draft])
  const stats = useMemo(() => docStats(project.draft), [project.draft])

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Escape' && layout.zen) return set('zen', false)
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === '\\') {
        e.preventDefault()
        toggle('zen')
      } else if (k === '1') {
        e.preventDefault()
        toggle('left')
      } else if (k === '2') {
        e.preventDefault()
        toggle('right')
      } else if (k === '0') {
        e.preventDefault()
        toggle('outline')
      } else if (k === ',') {
        e.preventDefault()
        setShowSettings(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout.zen, set, toggle])

  const dragLeft = useDragResize('left', layout.leftW, (w) => set('leftW', w))
  const dragRight = useDragResize('right', layout.rightW, (w) => set('rightW', w))

  /* ---------------- editor ---------------- */
  const syncCaret = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    setCaretLine(el.value.slice(0, el.selectionStart).split('\n').length - 1)
  }, [])

  const jumpTo = useCallback((m: Marker) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(m.offset, m.offset)
    // Approximate scroll: put the heading near the top third of the viewport.
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 26
    el.scrollTop = Math.max(0, m.line * lineH - el.clientHeight / 3)
    setCaretLine(m.line)
  }, [])

  // Typewriter mode keeps the caret line centred.
  useEffect(() => {
    if (!layout.typewriter) return
    const el = editorRef.current
    if (!el) return
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 26
    const target = caretLine * lineH - el.clientHeight / 2 + lineH
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [caretLine, layout.typewriter])

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

  async function ingestUrl(rawUrl: string, role: DocRole) {
    setImporting(true)
    setError('')
    setUrlStatus('Fetching…')
    try {
      const page = await fetchUrlAsDoc(rawUrl, setUrlStatus)
      const doc: RefDoc = {
        id: uid(),
        name: page.title,
        role,
        mime: 'text/markdown',
        text: page.text,
        words: wordCount(page.text),
        addedAt: Date.now(),
        include: true,
        sourceUrl: page.url,
      }
      if (role === 'draft') {
        patchProject({ draft: page.text })
        setTab('draft')
      } else {
        patchProject({ docs: [...project.docs, doc] })
        setTab('refs')
      }
      setUrlStatus(
        `Imported ${doc.words.toLocaleString()} words${page.via !== 'direct' ? ` via ${page.via}` : ''}.`,
      )
      setTimeout(() => setUrlStatus(''), 4000)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setUrlStatus('')
    } finally {
      setImporting(false)
    }
  }

  function savePasted(name: string, text: string, role: DocRole, sourceUrl?: string) {
    if (role === 'draft') {
      patchProject({ draft: text })
      setTab('draft')
      return
    }
    const doc: RefDoc = {
      id: uid(),
      name,
      role,
      mime: 'text/plain',
      text,
      words: wordCount(text),
      addedAt: Date.now(),
      include: true,
      sourceUrl,
    }
    patchProject({ docs: [...project.docs, doc] })
    setTab('refs')
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
    if (layout.zen) set('zen', false)
    if (!layout.right) set('right', true)
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
        push({ role: 'user', content: `${MODE_LABEL[mode]}${focus ? ` — focus: ${focus}` : ''}` })
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
      .map((m) =>
        m.role === 'user'
          ? `\n---\n\n**You:** ${m.content}`
          : `\n### ${m.persona ?? 'Coach'}\n\n${m.content}`,
      )
      .join('\n\n')

  const zen = layout.zen
  const showLeft = layout.left && !zen
  const showRight = layout.right && !zen

  return (
    <div className={'app' + (zen ? ' zen' : '')}>
      {/* ================= top bar ================= */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">/</span>
          <input
            className="project-name"
            value={project.name}
            spellCheck={false}
            onChange={(e) => patchProject({ name: e.target.value })}
          />
        </div>

        <div className="tb-group">
          <button
            className={'tb' + (layout.left ? ' on' : '')}
            onClick={() => toggle('left')}
            title="Toggle sources panel (⌘1)"
          >
            Sources
          </button>
          <button
            className={'tb' + (layout.outline ? ' on' : '')}
            onClick={() => toggle('outline')}
            title="Toggle outline (⌘0)"
          >
            Outline
          </button>
          <button
            className={'tb' + (layout.right ? ' on' : '')}
            onClick={() => toggle('right')}
            title="Toggle coach panel (⌘2)"
          >
            Coach
          </button>
        </div>

        <span className="tb-spacer" />

        <div className="tb-group">
          <button className="tb" onClick={() => toggle('zen')} title="Distraction-free (⌘\)">
            {zen ? 'Exit focus' : 'Focus'}
          </button>
          <button
            className="tb"
            onClick={() => setShowSettings(true)}
            title="Settings (⌘,)"
          >
            {provider ? provider.model.split('/').pop() : 'no model'}
          </button>
          <button
            className="tb"
            onClick={() => {
              if (confirm('Start a new empty project? Current work will be cleared.'))
                setProject(defaultProject())
            }}
            title="New project"
          >
            New
          </button>
        </div>
      </header>

      <main className="cols">
        {/* ================= sources ================= */}
        {showLeft && (
          <>
            <aside className="pane left" style={{ width: layout.leftW }}>
              <div className="pane-inner">
                <h2>Assignment</h2>
                <textarea
                  className="flat"
                  rows={4}
                  placeholder="The task: what are you writing, for whom, how long?"
                  value={project.task}
                  onChange={(e) => patchProject({ task: e.target.value })}
                />
                <input
                  className="flat"
                  placeholder="Intended audience"
                  value={project.audience}
                  onChange={(e) => patchProject({ audience: e.target.value })}
                />

                <h2>
                  Sources
                  <span className="h2-count">{project.docs.length || ''}</span>
                </h2>
                <DropZone
                  onFiles={(f, role) => ingest(f, role)}
                  onUrl={(u, role) => ingestUrl(u, role)}
                  busy={importing}
                  status={urlStatus}
                  onPaste={() => setShowPaste(true)}
                />

                <ul className="doclist">
                  {project.docs.map((d) => (
                    <li key={d.id} className={d.include ? '' : 'off'}>
                      <div className="doc-top">
                        <input
                          type="checkbox"
                          checked={d.include}
                          title="Include in the context sent to the model"
                          onChange={(e) =>
                            patchProject({
                              docs: project.docs.map((x) =>
                                x.id === d.id ? { ...x, include: e.target.checked } : x,
                              ),
                            })
                          }
                        />
                        <span className="doc-name" title={d.sourceUrl ?? d.name}>
                          {d.name}
                        </span>
                        <span className="doc-w">{d.words.toLocaleString()}</span>
                      </div>
                      <div className="doc-actions">
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
                        {d.sourceUrl && (
                          <a
                            className="lnk"
                            href={d.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={d.sourceUrl}
                          >
                            source
                          </a>
                        )}
                        <span className="tb-spacer" />
                        <button className="lnk" onClick={() => setEditDoc(d)}>
                          edit
                        </button>
                        <button className="lnk" onClick={() => patchProject({ draft: d.text })}>
                          to draft
                        </button>
                        <button
                          className="lnk del"
                          onClick={() =>
                            patchProject({ docs: project.docs.filter((x) => x.id !== d.id) })
                          }
                        >
                          remove
                        </button>
                      </div>
                    </li>
                  ))}
                  {!project.docs.length && (
                    <p className="muted">
                      Nothing yet. Add the guidelines, samples or rubric the coach should judge
                      your work against.
                    </p>
                  )}
                </ul>
              </div>
            </aside>
            <div className="grip" onPointerDown={dragLeft} title="Drag to resize" />
          </>
        )}

        {/* ================= editor ================= */}
        <section className="pane mid">
          {layout.outline && tab === 'draft' && (
            <div className="outline-col">
              <div className="outline-head">{project.name || 'untitled'}</div>
              <Outline markers={markers} activeLine={caretLine} onJump={jumpTo} />
            </div>
          )}

          <div className="editor-col">
            {!zen && (
              <div className="mid-tabs">
                <button
                  className={'tb' + (tab === 'draft' ? ' on' : '')}
                  onClick={() => setTab('draft')}
                >
                  Draft
                </button>
                <button
                  className={'tb' + (tab === 'refs' ? ' on' : '')}
                  onClick={() => setTab('refs')}
                >
                  Context
                </button>
                <span className="tb-spacer" />
                <label className="ghost-file" title="Upload a draft">
                  open
                  <input
                    type="file"
                    accept={ACCEPTED}
                    hidden
                    onChange={(e) => e.target.files && ingest(e.target.files, 'draft')}
                  />
                </label>
                <select
                  className="mini"
                  value=""
                  title="Export the draft"
                  onChange={(e) => {
                    if (e.target.value) exportAs(e.target.value as any, project.draft, project.name)
                    e.currentTarget.value = ''
                  }}
                >
                  <option value="">save as…</option>
                  <option value="md">Markdown</option>
                  <option value="txt">Plain text</option>
                  <option value="docx">DOCX</option>
                  <option value="pdf">PDF</option>
                  <option value="html">HTML</option>
                </select>
              </div>
            )}

            {tab === 'draft' ? (
              <textarea
                ref={editorRef}
                className={'editor' + (layout.serif ? ' serif' : ' mono')}
                style={{ fontSize: layout.fontSize }}
                placeholder="Write."
                spellCheck
                value={project.draft}
                onChange={(e) => {
                  patchProject({ draft: e.target.value })
                  syncCaret()
                }}
                onClick={syncCaret}
                onKeyUp={syncCaret}
                onSelect={syncCaret}
              />
            ) : (
              <div className="context-view">
                <p className="muted">
                  Exactly what the model receives as reference context, trimmed to your budget.
                </p>
                <pre>
                  {project.docs
                    .filter((d) => d.include)
                    .map((d) => `[${d.role}] ${d.name} — ${d.words}w\n\n${d.text.slice(0, 1500)}…`)
                    .join('\n\n────────────\n\n') || 'Nothing included.'}
                </pre>
              </div>
            )}

            <footer className="statusbar">
              <span>{stats.words.toLocaleString()} words</span>
              <span>{stats.chars.toLocaleString()} chars</span>
              <span>{stats.paragraphs} ¶</span>
              <span>~{stats.readingMinutes} min read</span>
              <span className="tb-spacer" />
              <button
                className="lnk"
                onClick={() => set('fontSize', Math.max(12, layout.fontSize - 1))}
                title="Smaller text"
              >
                A−
              </button>
              <button
                className="lnk"
                onClick={() => set('fontSize', Math.min(28, layout.fontSize + 1))}
                title="Larger text"
              >
                A+
              </button>
              <button className="lnk" onClick={() => toggle('serif')}>
                {layout.serif ? 'serif' : 'mono'}
              </button>
              <button
                className={'lnk' + (layout.typewriter ? ' active' : '')}
                onClick={() => toggle('typewriter')}
                title="Keep the current line centred"
              >
                typewriter
              </button>
            </footer>
          </div>
        </section>

        {/* ================= coach ================= */}
        {showRight && (
          <>
            <div className="grip" onPointerDown={dragRight} title="Drag to resize" />
            <aside className="pane right" style={{ width: layout.rightW }}>
              <div className="pane-inner">
                <h2>Coach</h2>
                <input
                  className="flat"
                  placeholder="Focus (optional) — e.g. the opening, or the word limit"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                />
                <div className="modes">
                  {MODES.map((m) => (
                    <button key={m} className="mode" disabled={busy} onClick={() => run(m)}>
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="error">
                    {error}
                    <button className="lnk" onClick={() => setError('')}>
                      dismiss
                    </button>
                  </div>
                )}
                {busy && (
                  <div className="busy">
                    <span className="dot" />
                    <span>{progress || 'Thinking…'}</span>
                    <span className="tb-spacer" />
                    <button className="lnk" onClick={() => abortRef.current?.abort()}>
                      stop
                    </button>
                  </div>
                )}

                <div className="feed" ref={feedRef}>
                  {!project.messages.length && !busy && (
                    <p className="muted">
                      Add your task and sources, write a draft, then choose a mode. Critique group
                      runs every enabled reader in turn and synthesizes a revision plan.
                    </p>
                  )}
                  {project.messages.map((m) =>
                    m.role === 'user' ? (
                      <div key={m.id} className="msg user">
                        {m.content}
                      </div>
                    ) : (
                      <div key={m.id} className="msg bot">
                        <div className="msg-head">
                          <strong>{m.persona ?? 'Coach'}</strong>
                          <span className="tb-spacer" />
                          <button
                            className="lnk"
                            onClick={() => navigator.clipboard.writeText(m.content)}
                          >
                            copy
                          </button>
                          {/##\s*Rewrite/i.test(m.content) && (
                            <button className="lnk" onClick={() => applyRewrite(m.content)}>
                              use as draft
                            </button>
                          )}
                          <select
                            className="mini"
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                exportAs(
                                  e.target.value as any,
                                  m.content,
                                  `${project.name}-${m.persona}`,
                                )
                              e.currentTarget.value = ''
                            }}
                          >
                            <option value="">save…</option>
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
                    className="flat"
                    rows={2}
                    placeholder="Ask the coach…  (⌘↵)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                        (e.currentTarget.form as HTMLFormElement).requestSubmit()
                    }}
                  />
                </form>
                <div className="feed-actions">
                  <button
                    className="lnk"
                    disabled={!project.messages.length}
                    onClick={() => exportAs('md', transcript(), `${project.name}-feedback`)}
                  >
                    export all
                  </button>
                  <button
                    className="lnk"
                    disabled={!project.messages.length}
                    onClick={() => patchProject({ messages: [] })}
                  >
                    clear
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}
      </main>

      {showPaste && <PasteNote onSave={savePasted} onClose={() => setShowPaste(false)} />}

      {editDoc && (
        <PasteNote
          key={editDoc.id}
          doc={editDoc}
          initialRole={editDoc.role}
          onSave={(name, text, role, sourceUrl) =>
            patchProject({
              docs: project.docs.map((x) =>
                x.id === editDoc.id
                  ? { ...x, name, text, role, sourceUrl, words: wordCount(text) }
                  : x,
              ),
            })
          }
          onClose={() => setEditDoc(null)}
        />
      )}

      {showSettings && (
        <Settings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

function DropZone({
  onFiles,
  onUrl,
  onPaste,
  busy,
  status,
}: {
  onFiles: (files: FileList | File[], role: DocRole) => void
  onUrl: (url: string, role: DocRole) => void
  onPaste: () => void
  busy: boolean
  status: string
}) {
  const [role, setRole] = useState<DocRole>('guideline')
  const [over, setOver] = useState(false)
  const [url, setUrl] = useState('')

  const submitUrl = () => {
    const v = url.trim()
    if (!v || busy) return
    onUrl(v, role)
    setUrl('')
  }

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
        if (e.dataTransfer.files.length) return onFiles(e.dataTransfer.files, role)
        const dropped =
          e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
        if (dropped && /^https?:\/\//i.test(dropped.trim())) onUrl(dropped.trim(), role)
      }}
    >
      <div className="drop-row">
        <select
          className="mini"
          value={role}
          onChange={(e) => setRole(e.target.value as DocRole)}
          title="How should the coach treat what you add?"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              as {r}
            </option>
          ))}
        </select>
        <label className="lnk file">
          file
          <input
            type="file"
            multiple
            accept={ACCEPTED}
            hidden
            onChange={(e) => e.target.files && onFiles(e.target.files, role)}
          />
        </label>
        <button className="lnk" onClick={onPaste}>
          paste
        </button>
      </div>

      <div className="drop-url">
        <input
          className="flat"
          type="url"
          placeholder="drop a file, or paste a link…"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text')
            if (t && (t.includes('\n') || t.trim().length > 400)) {
              e.preventDefault()
              onPaste()
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitUrl()
            }
          }}
        />
        {!!url.trim() && (
          <button className="lnk" disabled={busy} onClick={submitUrl}>
            add
          </button>
        )}
      </div>
      {(busy || status) && <p className="muted">{status || 'Reading…'}</p>}
    </div>
  )
}
