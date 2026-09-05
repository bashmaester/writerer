import type { Marker } from '../lib/outline'

/**
 * Left-style marker list: heading titles in the margin, counts right-aligned,
 * indentation by level. Clicking scrolls the editor to that heading.
 */
export default function Outline({
  markers,
  activeLine,
  onJump,
}: {
  markers: Marker[]
  activeLine: number
  onJump: (m: Marker) => void
}) {
  if (!markers.length) {
    return (
      <div className="outline empty-outline">
        <p>
          No markers. Begin a line with <code>#</code> or <code>##</code> to create one.
        </p>
      </div>
    )
  }

  // The active marker is the last one at or above the caret.
  let activeIdx = -1
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].line <= activeLine) activeIdx = i
    else break
  }

  return (
    <nav className="outline">
      {markers.map((m, i) => (
        <button
          key={`${m.line}-${i}`}
          className={'omark' + (i === activeIdx ? ' on' : '')}
          style={{ paddingLeft: 2 + (m.level - 1) * 12 }}
          onClick={() => onJump(m)}
          title={m.title}
        >
          <span className="otitle">
            {m.level > 1 && <span className="odash">– </span>}
            {m.title}
          </span>
          <span className="ocount">{m.words}</span>
        </button>
      ))}
    </nav>
  )
}
