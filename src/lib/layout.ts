import { useCallback, useEffect, useState } from 'react'

export interface LayoutState {
  left: boolean
  right: boolean
  outline: boolean
  leftW: number
  rightW: number
  /** Distraction-free: hide everything but the editor. */
  zen: boolean
  serif: boolean
  fontSize: number
  /** Keep the caret line vertically centred while typing. */
  typewriter: boolean
}

const KEY = 'writerer.layout.v1'

export const DEFAULT_LAYOUT: LayoutState = {
  left: true,
  right: true,
  outline: true,
  leftW: 300,
  rightW: 420,
  zen: false,
  serif: true,
  fontSize: 16,
  typewriter: false,
}

export const MIN_W = 210
export const MAX_W = 640

export function useLayout() {
  const [layout, setLayout] = useState<LayoutState>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? { ...DEFAULT_LAYOUT, ...JSON.parse(raw) } : DEFAULT_LAYOUT
    } catch {
      return DEFAULT_LAYOUT
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      /* ignore */
    }
  }, [layout])

  const set = useCallback(
    <K extends keyof LayoutState>(k: K, v: LayoutState[K]) =>
      setLayout((l) => ({ ...l, [k]: v })),
    [],
  )
  const toggle = useCallback(
    (k: 'left' | 'right' | 'outline' | 'zen' | 'serif' | 'typewriter') =>
      setLayout((l) => ({ ...l, [k]: !l[k] })),
    [],
  )

  return { layout, set, toggle, setLayout }
}

/** Pointer-driven column resizing. `side` decides which way drag increases width. */
export function useDragResize(
  side: 'left' | 'right',
  width: number,
  onChange: (w: number) => void,
) {
  return useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      document.body.classList.add('resizing')

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        const next = side === 'left' ? startW + dx : startW - dx
        onChange(Math.max(MIN_W, Math.min(MAX_W, next)))
      }
      const up = () => {
        document.body.classList.remove('resizing')
        el.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [side, width, onChange],
  )
}
