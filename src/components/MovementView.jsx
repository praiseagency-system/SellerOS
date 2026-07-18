import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Sparkles, ArrowRight } from 'lucide-react'
import { QUADRANT_CONFIG, fmtNum, fmtCompact } from '../utils/quadrantUtils'
import { movementSummary } from '../utils/compareData'

const MOVE_CONFIG = {
  up:   { label: 'Naik Kuadran',  color: '#16a34a', icon: TrendingUp },
  down: { label: 'Turun Kuadran', color: '#dc2626', icon: TrendingDown },
  same: { label: 'Tetap',         color: '#64748b', icon: Minus },
  new:  { label: 'Produk Baru',   color: '#0891b2', icon: Sparkles },
}

function DeltaCell({ value, suffix = '%', decimals = 1, invert = false }) {
  if (value === null || value === undefined) return <span className="text-ink">-</span>
  const positive = invert ? value < 0 : value > 0
  const negative = invert ? value > 0 : value < 0
  const fmt = (Math.abs(value)).toFixed(decimals)
  return (
    <span className={`font-medium tabular-nums ${positive ? 'text-green-600' : negative ? 'text-red-500' : 'text-ink-muted'}`}>
      {value > 0 ? '+' : value < 0 ? '-' : ''}
      {fmt}{suffix}
    </span>
  )
}

function QuadrantFlow({ prev, curr }) {
  const prevCfg = prev ? QUADRANT_CONFIG[prev] : null
  const currCfg = QUADRANT_CONFIG[curr]
  if (!prevCfg || prev === curr) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: currCfg.color + '22', color: currCfg.color }}>
        Q{curr}
      </span>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
        style={{ background: prevCfg.color + '22', color: prevCfg.color }}>
        Q{prev}
      </span>
      <ArrowRight className="w-3 h-3 text-ink-muted" />
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
        style={{ background: currCfg.color + '22', color: currCfg.color }}>
        Q{curr}
      </span>
    </div>
  )
}

export default function MovementView({ products }) {
  const [filter, setFilter] = useState('all') // all | up | down | same | new

  const summary = useMemo(() => movementSummary(products), [products])

  const sorted = useMemo(() => {
    const order = { up: 0, new: 1, same: 2, down: 3 }
    const list = filter === 'all' ? products : products.filter(p => p.quadrant_moved === filter)
    return [...list].sort((a, b) => {
      if (order[a.quadrant_moved] !== order[b.quadrant_moved])
        return order[a.quadrant_moved] - order[b.quadrant_moved]
      // Within same movement type, sort by delta pengunjung desc
      return (b.delta_pengunjung ?? -Infinity) - (a.delta_pengunjung ?? -Infinity)
    })
  }, [products, filter])

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {['up', 'down', 'same', 'new'].map(type => {
          const cfg = MOVE_CONFIG[type]
          const Icon = cfg.icon
          const active = filter === type
          return (
            <button key={type} onClick={() => setFilter(filter === type ? 'all' : type)}
              className={`
                text-left rounded-2xl border p-4 transition-all bg-surface
                ${active ? 'ring-2 border-current' : 'border-line/10 hover:border-line/20'}
              `}
              style={active ? { ringColor: cfg.color, borderColor: cfg.color } : {}}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                <span className="text-2xl font-bold text-ink-strong">{summary[type] || 0}</span>
              </div>
              <p className="text-xs font-medium text-ink-faint">{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-line/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-line/10 flex items-center gap-3">
          <h3 className="font-semibold text-ink-strong text-sm">Detail Perubahan</h3>
          <span className="text-xs text-ink-muted">{sorted.length} produk</span>
          {filter !== 'all' && (
            <button onClick={() => setFilter('all')}
              className="text-xs text-ink-muted hover:text-ink-faint ml-auto">
              × Reset filter
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/10">
                <th className="px-4 py-2 text-left text-xs font-medium text-ink-muted min-w-48">Produk</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-ink-muted whitespace-nowrap">Pergerakan</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Δ Traffic</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Traffic Lalu</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Traffic Ini</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Δ CR</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">CR Lalu</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">CR Ini</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Δ ROAS</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Δ Sales</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted whitespace-nowrap">Sales Ini</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/5">
              {sorted.map(p => {
                const moveCfg = MOVE_CONFIG[p.quadrant_moved]
                return (
                  <tr key={p.kode_produk} className="hover:bg-fill/5 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-ink line-clamp-2 max-w-xs">{p.nama_produk}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{p.kode_produk}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
                          style={{ background: moveCfg.color + '22', color: moveCfg.color }}>
                          {moveCfg.label}
                        </span>
                        <QuadrantFlow prev={p.prev_quadrant} curr={p.quadrant} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaCell value={p.delta_pengunjung} suffix="%" />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-muted tabular-nums">
                      {p.prev_pengunjung !== undefined ? fmtNum(p.prev_pengunjung) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-faint tabular-nums font-medium">
                      {fmtNum(p.pengunjung)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaCell value={p.delta_conversion} suffix="%" decimals={2} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-muted tabular-nums">
                      {p.prev_conversion_rate !== undefined ? `${p.prev_conversion_rate?.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums"
                      style={{ color: p.conversion_rate >= 2 ? '#16a34a' : p.conversion_rate >= 1 ? '#ca8a04' : '#dc2626' }}>
                      {p.conversion_rate?.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaCell value={p.delta_roas} suffix="" decimals={2} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaCell value={p.delta_penjualan} suffix="%" />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-faint tabular-nums">
                      {fmtCompact(p.total_penjualan)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="text-center py-12 text-ink-muted text-sm">
              Tidak ada produk dengan status ini
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
