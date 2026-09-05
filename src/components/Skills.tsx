import { useMemo, useState } from 'react'
import type { Skill } from '../lib/skills/types'
import { makeSkill, SKILL_TEMPLATE } from '../lib/skills/store'
import { parseSkill } from '../lib/skills/parse'
import { TOOLS } from '../lib/skills/tools'

/** Library manager: browse, inspect, import, author and validate skills. */
export default function Skills({
  skills,
  onChange,
  onRun,
  onClose,
  busy,
}: {
  skills: Skill[]
  onChange: (s: Skill[]) => void
  onRun: (s: Skill) => void
  onClose: () => void
  busy: boolean
}) {
  const [selId, setSelId] = useState<string | null>(skills[0]?.id ?? null)
  const [editing, setEditing] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [msg, setMsg] = useState('')

  const sel = useMemo(() => skills.find((s) => s.id === selId) ?? null, [skills, selId])

  const validation = useMemo(() => {
    if (editing === null) return null
    return parseSkill(source).validation
  }, [editing, source])

  function startNew() {
    setEditing('new')
    setSource(SKILL_TEMPLATE)
    setMsg('')
  }

  function startEdit(s: Skill) {
    setEditing(s.id)
    setSource(toSource(s))
    setMsg('')
  }

  function commit() {
    const { skill, validation: v } = makeSkill(source)
    if (!v.ok) {
      setMsg(v.errors.join(' · '))
      return
    }
    if (editing && editing !== 'new') {
      onChange(skills.map((x) => (x.id === editing ? { ...skill, id: editing } : x)))
      setSelId(editing)
    } else {
      onChange([...skills, skill])
      setSelId(skill.id)
    }
    setEditing(null)
    setMsg('')
  }

  async function importFiles(files: FileList) {
    const added: Skill[] = []
    const problems: string[] = []
    for (const f of Array.from(files)) {
      const text = await f.text()
      const fallback = f.name
        .replace(/\.(md|markdown|txt)$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      const { skill, validation: v } = makeSkill(text, fallback || 'imported-skill')
      if (v.ok) added.push(skill)
      else problems.push(`${f.name}: ${v.errors.join(', ')}`)
    }
    if (added.length) {
      onChange([...skills, ...added])
      setSelId(added[0].id)
    }
    setMsg(
      [added.length ? `Imported ${added.length}.` : '', ...problems].filter(Boolean).join(' '),
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal skills-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Skills</h2>
          <button className="lnk" onClick={startNew}>
            new
          </button>
          <label className="lnk file">
            import SKILL.md
            <input
              type="file"
              accept=".md,.markdown,.txt"
              multiple
              hidden
              onChange={(e) => e.target.files && importFiles(e.target.files)}
            />
          </label>
          <button className="ghost sm" onClick={onClose}>
            Close
          </button>
        </header>

        {msg && <p className="skills-msg">{msg}</p>}

        <div className="skills-body">
          <ul className="skill-list">
            {skills.map((s) => (
              <li
                key={s.id}
                className={s.id === selId ? 'on' : ''}
                onClick={() => {
                  setSelId(s.id)
                  setEditing(null)
                }}
              >
                <span className="sk-name">{s.name}</span>
                {s.builtin && <span className="sk-tag">built-in</span>}
              </li>
            ))}
            {!skills.length && <p className="muted">No skills yet.</p>}
          </ul>

          <div className="skill-detail">
            {editing !== null ? (
              <>
                <p className="hint">
                  SKILL.md — YAML frontmatter (<code>name</code>, <code>description</code>, optional{' '}
                  <code>allowed-tools</code>) followed by the procedure.
                </p>
                <textarea
                  className="skill-src"
                  value={source}
                  spellCheck={false}
                  onChange={(e) => setSource(e.target.value)}
                />
                {validation && (
                  <div className="validation">
                    {validation.errors.map((e) => (
                      <div key={e} className="v-err">
                        ✗ {e}
                      </div>
                    ))}
                    {validation.warnings.map((w) => (
                      <div key={w} className="v-warn">
                        ! {w}
                      </div>
                    ))}
                    {validation.ok && !validation.warnings.length && (
                      <div className="v-ok">✓ valid</div>
                    )}
                  </div>
                )}
                <div className="row">
                  <button onClick={commit} disabled={!validation?.ok}>
                    Save skill
                  </button>
                  <button className="ghost sm" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : sel ? (
              <>
                <div className="sk-head">
                  <h3>{sel.name}</h3>
                  {sel.version && <span className="sk-tag">v{sel.version}</span>}
                </div>
                <p className="sk-desc">{sel.description}</p>

                <div className="sk-tools">
                  <span className="muted">tools:</span>
                  {(sel.allowedTools ?? TOOLS.map((t) => t.name)).map((t) => (
                    <span
                      key={t}
                      className={
                        'sk-tool' + (TOOLS.find((x) => x.name === t)?.mutates ? ' writes' : '')
                      }
                      title={TOOLS.find((x) => x.name === t)?.description}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                {(sel.allowedTools ?? []).some(
                  (t) => TOOLS.find((x) => x.name === t)?.mutates,
                ) && <p className="muted">This skill can modify your draft.</p>}

                <pre className="sk-body">{sel.body}</pre>

                <div className="row">
                  <button disabled={busy} onClick={() => onRun(sel)}>
                    Run skill
                  </button>
                  <button className="ghost sm" onClick={() => startEdit(sel)}>
                    {sel.builtin ? 'Duplicate & edit' : 'Edit'}
                  </button>
                  <button
                    className="ghost sm"
                    onClick={() => {
                      const blob = new Blob([toSource(sel)], { type: 'text/markdown' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `${sel.name}.md`
                      a.click()
                    }}
                  >
                    Export
                  </button>
                  {!sel.builtin && (
                    <button
                      className="lnk del"
                      onClick={() => {
                        onChange(skills.filter((x) => x.id !== sel.id))
                        setSelId(null)
                      }}
                    >
                      delete
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">Select a skill, or create one.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Re-serialise a skill back to SKILL.md text. */
export function toSource(s: Skill): string {
  const fm = [
    `name: ${s.builtin ? `${s.name}-copy` : s.name}`,
    `description: ${s.description}`,
    s.version ? `version: ${s.version}` : '',
    s.author ? `author: ${s.author}` : '',
    s.license ? `license: ${s.license}` : '',
    s.allowedTools?.length ? `allowed-tools: [${s.allowedTools.join(', ')}]` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return `---\n${fm}\n---\n\n${s.body}\n`
}
