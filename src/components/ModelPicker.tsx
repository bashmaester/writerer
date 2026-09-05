import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Model combobox. A native <input list> + <datalist> filters options against
 * whatever is already typed, so a pre-filled model name hides every other
 * choice. This is a real dropdown: it always shows the full list, supports
 * free typing for models the endpoint won't enumerate, and is keyboard driven.
 */
export default function ModelPicker({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // query === null means "not filtering" — show every option.
  const shown = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const commit = (v: string) => {
    onChange(v)
    setQuery(null)
    setOpen(false)
  }

  return (
    <div className="combo" ref={wrapRef}>
      <div className="combo-field">
        <input
          value={query ?? value}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (!open) return setOpen(true)
              setActive((i) => Math.min(i + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && open && shown[active]) {
              e.preventDefault()
              commit(shown[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              setQuery(null)
            }
          }}
        />
        <button
          type="button"
          className="combo-toggle"
          aria-label="Show models"
          tabIndex={-1}
          onClick={() => {
            setQuery(null)
            setActive(Math.max(0, options.indexOf(value)))
            setOpen((o) => !o)
          }}
        >
          ▾
        </button>
      </div>

      {open && (
        <ul className="combo-list" ref={listRef}>
          {shown.map((o, i) => (
            <li
              key={o}
              className={
                (i === active ? 'on ' : '') + (o === value ? 'sel' : '')
              }
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(o)
              }}
            >
              {o}
            </li>
          ))}
          {!shown.length && (
            <li className="none">
              {options.length
                ? 'No match — press Test / fetch models or type a name.'
                : 'No models loaded yet. Press “Test / fetch models”, or just type the name.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
