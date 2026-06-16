import { QUADRANT_CONFIG } from '../utils/quadrantUtils'

export default function QuadrantSummary({ products, activeQuadrant, onQuadrantClick, compact, dark }) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  products.forEach(p => { counts[p.quadrant] = (counts[p.quadrant] || 0) + 1 })

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {[3, 1, 4, 2].map(q => {
          const cfg = QUADRANT_CONFIG[q]
          const active = activeQuadrant === q
          return (
            <button
              key={q}
              onClick={() => onQuadrantClick(q)}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs transition-all ${
                active
                  ? 'border-current text-white'
                  : dark
                    ? 'border-line/10 text-ink-muted hover:border-line/20 bg-fill/5'
                    : 'border-gray-200 text-ink-faint hover:border-gray-300 bg-white'
              }`}
              style={active ? { background: cfg.color, borderColor: cfg.color } : {}}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: active ? 'white' : cfg.color }}
              />
              <span className="font-medium">{cfg.short}</span>
              <span
                className={`font-bold text-sm ${active ? 'text-ink-strong' : ''}`}
                style={!active ? { color: cfg.color } : {}}
              >
                {counts[q]}
              </span>
            </button>
          )
        })}
        {activeQuadrant && (
          <button
            onClick={() => onQuadrantClick(activeQuadrant)}
            className="text-xs text-ink-muted hover:text-ink-faint px-2"
          >
            × Reset filter
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map(q => {
        const cfg = QUADRANT_CONFIG[q]
        const active = activeQuadrant === q
        return (
          <button
            key={q}
            onClick={() => onQuadrantClick(q)}
            className={`
              text-left rounded-2xl border p-4 transition-all bg-white
              ${active ? `${cfg.border} ring-2` : 'border-gray-100 hover:border-gray-200'}
            `}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: cfg.color + '22', color: cfg.color }}
              >
                Q{q}
              </span>
              <span className="text-2xl font-bold text-gray-800">{counts[q]}</span>
            </div>
            <p className="text-xs font-medium text-ink-faint mt-2">{cfg.short}</p>
            <p className="text-xs text-ink-muted leading-snug mt-0.5">{cfg.desc}</p>
          </button>
        )
      })}
    </div>
  )
}
