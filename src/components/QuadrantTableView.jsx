import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react'
import { QUADRANT_CONFIG, fmtNum, fmtCompact } from '../utils/quadrantUtils'

const MOVE_ICON = {
  up:   { Icon: TrendingUp,   cls: 'text-green-500', title: 'Naik kuadran' },
  down: { Icon: TrendingDown, cls: 'text-red-400',   title: 'Turun kuadran' },
  same: { Icon: Minus,        cls: 'text-ink',  title: 'Tetap' },
  new:  { Icon: Sparkles,     cls: 'text-blue-400',  title: 'Produk baru' },
}

function MoveBadge({ moved, prevQ }) {
  if (!moved) return null
  const { Icon, cls, title } = MOVE_ICON[moved] || MOVE_ICON.same
  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0" title={`${title}${prevQ ? ` (dari Q${prevQ})` : ''}`}>
      <Icon className={`w-3 h-3 ${cls}`} />
      {prevQ && moved !== 'same' && moved !== 'new' && (
        <span className={`text-xs font-bold ${cls}`}>Q{prevQ}</span>
      )}
    </span>
  )
}

function QuadrantTable({ quadrant, products, isCompare, trafficLabel = 'Pengunjung' }) {
  const cfg = QUADRANT_CONFIG[quadrant]
  const sorted = useMemo(
    () => [...products].sort((a, b) => (b.pengunjung ?? 0) - (a.pengunjung ?? 0)),
    [products]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${cfg.bgLabel} flex-shrink-0`}>
        <span className={`text-xs font-bold tracking-wide ${cfg.textLabel}`}>
          {cfg.label}
        </span>
        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-fill/20 ${cfg.textLabel}`}>
          {products.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 text-xs">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface2 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left text-ink-faint font-medium border-b border-line/5 w-6">#</th>
              <th className="px-2 py-1.5 text-left text-ink-faint font-medium border-b border-line/5 min-w-32">Nama</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5 whitespace-nowrap">{trafficLabel}</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5">%ATC</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5">CR</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5">ROAS</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5">Sales</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5 whitespace-nowrap">Qty Sold</th>
              <th className="px-2 py-1.5 text-right text-ink-faint font-medium border-b border-line/5">Stok</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.kode_produk} className="border-b border-line/5 hover:bg-fill/3 transition-colors">
                <td className="px-2 py-1.5 text-ink-faint">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1 min-w-0">
                    {isCompare && <MoveBadge moved={p.quadrant_moved} prevQ={p.prev_quadrant} />}
                    <span className="text-ink font-medium line-clamp-1 min-w-0" title={p.nama_produk}>
                      {p.nama_produk}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right text-ink font-mono tabular-nums">
                  {fmtNum(p.pengunjung)}
                </td>
                <td className="px-2 py-1.5 text-right text-ink-muted">
                  {p.atc_rate !== null ? `${p.atc_rate?.toFixed(2)}%` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  <span className={
                    p.conversion_rate >= 2 ? 'text-green-600' :
                    p.conversion_rate >= 1 ? 'text-yellow-600' : 'text-red-500'
                  }>
                    {p.conversion_rate?.toFixed(2)}%
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-ink-muted">
                  {p.roas !== null && p.roas !== undefined ? p.roas?.toFixed(2) : '-'}
                </td>
                <td className="px-2 py-1.5 text-right text-ink-faint tabular-nums">
                  {fmtCompact(p.total_penjualan)}
                </td>
                <td className="px-2 py-1.5 text-right text-ink-faint tabular-nums font-mono">
                  {fmtNum(p.pesanan)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {p.stok !== null && p.stok !== undefined
                    ? <span className={p.stok === 0 ? 'text-red-500 font-medium' : 'text-ink-faint'}>{fmtNum(p.stok)}</span>
                    : <span className="text-ink">-</span>
                  }
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-ink italic">
                  Tidak ada produk
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function QuadrantTableView({ products, isCompare, trafficLabel = 'Pengunjung' }) {
  const byQuadrant = useMemo(() => {
    const groups = { 1: [], 2: [], 3: [], 4: [] }
    products.forEach(p => groups[p.quadrant]?.push(p))
    return groups
  }, [products])

  return (
    <div className="relative bg-surface rounded-2xl border border-line/5 overflow-hidden" style={{ height: 'calc(100vh - 260px)', minHeight: 500 }}>
      {/* Axis labels */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="bg-surface border border-line/10 rounded-b-lg px-4 py-0.5 text-xs font-bold text-ink-muted tracking-widest uppercase shadow-sm">
          Traffic
        </div>
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <div className="bg-surface border border-line/10 rounded-l-lg px-1 py-3 text-xs font-bold text-ink-muted tracking-widest uppercase shadow-sm" style={{ writingMode: 'vertical-rl' }}>
          Conversion
        </div>
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-2 h-full">
        {/* Top-left: Q3 High Traffic Low Conversion */}
        <div className="border-r border-b border-line/5 overflow-hidden">
          <QuadrantTable quadrant={3} products={byQuadrant[3]} isCompare={isCompare} trafficLabel={trafficLabel} />
        </div>
        {/* Top-right: Q1 High Traffic High Conversion */}
        <div className="border-b border-line/5 overflow-hidden">
          <QuadrantTable quadrant={1} products={byQuadrant[1]} isCompare={isCompare} trafficLabel={trafficLabel} />
        </div>
        {/* Bottom-left: Q4 Low Traffic Low Conversion */}
        <div className="border-r border-line/5 overflow-hidden">
          <QuadrantTable quadrant={4} products={byQuadrant[4]} isCompare={isCompare} trafficLabel={trafficLabel} />
        </div>
        {/* Bottom-right: Q2 Low Traffic High Conversion */}
        <div className="overflow-hidden">
          <QuadrantTable quadrant={2} products={byQuadrant[2]} isCompare={isCompare} trafficLabel={trafficLabel} />
        </div>
      </div>
    </div>
  )
}
