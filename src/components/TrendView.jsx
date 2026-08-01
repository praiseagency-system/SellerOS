import { useMemo, useState } from 'react'
import { History, Info } from 'lucide-react'
import { QUADRANT_CONFIG, fmtNum, fmtCompact } from '../utils/quadrantUtils'
import {
  buildTrendRows, filterTrendRows, sortTrendRows, TREND_FILTERS, TREND_SORTS,
  BENCHMARK_MODE, BENCHMARK_HINT, CAUSE,
} from '../utils/trendAnalysis'

// Tren + Perubahan dalam satu tempat: bukan cuma jejak kuadran, tapi juga
// PENYEBAB perpindahannya (traffic, konversi, atau ambang yang bergeser).

const METRICS = [
  { id: 'quadrant', label: 'Kuadran' },
  { id: 'qualifiedTraffic', label: 'Traffic' },
  { id: 'ctr', label: 'CTR' },
  { id: 'atcRate', label: 'ATC' },
  { id: 'conversionRate', label: 'CR' },
  { id: 'gmv', label: 'GMV' },
]

const CAUSE_CLS = {
  [CAUSE.BENCHMARK]: 'bg-blue-600/15 text-blue-300',
  [CAUSE.NEW]: 'bg-blue-600/15 text-blue-300',
  [CAUSE.INACTIVE]: 'bg-gray-600/20 text-gray-400',
  [CAUSE.MISSING]: 'bg-gray-600/20 text-gray-400',
}
const pctTxt = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
const ppTxt = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`

function Cell({ cell, metric }) {
  if (!cell) return <span className="text-ink-faint text-[11px]" title="Produk tak ada di periode ini">—</span>
  if (metric === 'quadrant') {
    const cfg = QUADRANT_CONFIG[cell.quadrant]
    if (!cfg) return <span className="text-ink-faint text-[11px]">—</span>
    const tip = [
      `Traffic ${fmtNum(cell.qualifiedTraffic)} (ambang ${fmtNum(cell.benchmark?.trafficThreshold)})`,
      `CR ${cell.conversionRate?.toFixed(2)}% (ambang ${cell.benchmark?.conversionThreshold?.toFixed(2)}%)`,
      `GMV ${fmtCompact(cell.gmv)}`,
      cell.platformsLabel ? `Marketplace: ${cell.platformsLabel}` : null,
    ].filter(Boolean).join('\n')
    return (
      <span title={tip} className="text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-help"
        style={{ background: cfg.color + '22', color: cfg.color }}>Q{cell.quadrant}</span>
    )
  }
  const v = cell[metric]
  if (v == null) return <span className="text-ink-faint text-[11px]">—</span>
  if (metric === 'qualifiedTraffic') return <span className="text-[11px] text-ink tabular-nums">{fmtNum(v)}</span>
  if (metric === 'gmv') return <span className="text-[11px] text-ink tabular-nums">{fmtCompact(v)}</span>
  return <span className="text-[11px] text-ink tabular-nums">{v.toFixed(2)}%</span>
}

export default function TrendView({ views, manualBenchmark, onOpenProduct }) {
  const [metric, setMetric] = useState('quadrant')
  const [benchMode, setBenchMode] = useState(BENCHMARK_MODE.DYNAMIC)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('gmv')

  const trend = useMemo(
    () => buildTrendRows(views || [], { benchmarkMode: benchMode, manualBenchmark }),
    [views, benchMode, manualBenchmark],
  )
  const shown = useMemo(
    () => sortTrendRows(filterTrendRows(trend.rows, filter), sort),
    [trend.rows, filter, sort],
  )

  if (!views || views.length < 2) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
        <History className="w-7 h-7 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Belum ada riwayat yang cukup untuk menampilkan Tren.</p>
        <p className="text-xs text-ink-faint mt-1">
          Import minimal dua periode dari marketplace yang sama, lalu buka lagi tab ini.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-line/8 space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-ink-strong">Tren &amp; perubahan</p>
            <p className="text-[11px] text-ink-faint">{trend.periods.length} periode · {shown.length} dari {trend.rows.length} produk</p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {METRICS.map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  metric === m.id ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink hover:bg-fill/8'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-ink-faint" title={BENCHMARK_HINT}>Benchmark:</span>
          {[[BENCHMARK_MODE.DYNAMIC, 'Dinamis'], [BENCHMARK_MODE.FIXED, 'Tetap']].map(([id, label]) => (
            <button key={id} onClick={() => setBenchMode(id)} title={BENCHMARK_HINT}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                benchMode === id ? 'bg-fill/15 text-ink' : 'text-ink-muted hover:text-ink hover:bg-fill/8'}`}>
              {label}
            </button>
          ))}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="ml-2 bg-fill/5 border border-line/10 rounded-lg px-2 py-1 text-[11px] text-ink focus:outline-none">
            {TREND_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="bg-fill/5 border border-line/10 rounded-lg px-2 py-1 text-[11px] text-ink focus:outline-none">
            {TREND_SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* Legenda kuadran — selalu terlihat */}
        <div className="flex gap-3 flex-wrap">
          {[1, 2, 3, 4].map(q => {
            const cfg = QUADRANT_CONFIG[q]
            return (
              <span key={q} className="text-[10px] text-ink-faint flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: cfg.color }} />
                Q{q} = {cfg.label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-line/8">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-ink-muted min-w-44">Produk</th>
              {trend.periods.map(p => (
                <th key={p.periodValue || p.label} className="px-3 py-2 text-center text-[11px] font-medium text-ink-muted whitespace-nowrap">{p.label}</th>
              ))}
              <th className="px-3 py-2 text-left text-[11px] font-medium text-ink-muted min-w-52">Baca</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-ink-muted whitespace-nowrap">GMV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/5">
            {shown.map(r => (
              <tr key={r.key} className="hover:bg-fill/5 transition-colors">
                <td className="px-3 py-2">
                  <button onClick={() => onOpenProduct?.(r)} className="text-left min-w-0" title={r.nama_produk}>
                    <p className="text-ink line-clamp-1 max-w-[220px]">{r.shortName || r.nama_produk}</p>
                    <p className="text-[10px] text-ink-faint">{r.displayCode || ''}</p>
                  </button>
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-3 py-2 text-center whitespace-nowrap"><Cell cell={c} metric={metric} /></td>
                ))}
                <td className="px-3 py-2">
                  <p className={`text-[11px] font-medium ${
                    r.move.benchmarkOnly ? 'text-blue-300'
                      : r.move.moved ? (r.move.better ? 'text-green-400' : 'text-red-400') : 'text-ink-muted'}`}>
                    {r.move.headline}
                  </p>
                  <p className="text-[10px] text-ink-faint">
                    {r.move.cause === CAUSE.NEW || r.move.cause === CAUSE.INACTIVE || r.move.cause === CAUSE.MISSING
                      ? r.move.label
                      : <>Traffic {pctTxt(r.move.deltaTrafficPct)} · CR {ppTxt(r.move.deltaConversionPp)}</>}
                  </p>
                  {r.move.benchmarkOnly && (
                    <p className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded inline-block ${CAUSE_CLS[CAUSE.BENCHMARK]}`}>
                      {r.move.label}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <p className="text-[11px] text-ink tabular-nums">{r.last?.gmv != null ? fmtCompact(r.last.gmv) : '—'}</p>
                  <p className={`text-[10px] tabular-nums ${
                    r.deltaGmvPct == null ? 'text-ink-faint' : r.deltaGmvPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.deltaGmvPct == null ? '—' : `${pctTxt(r.deltaGmvPct)} vs periode lalu`}
                  </p>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={trend.periods.length + 3} className="px-3 py-8 text-center text-xs text-ink-faint">
                Tak ada produk yang cocok dengan filter ini.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[11px] text-ink-muted border-t border-line/8 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        {BENCHMARK_HINT} Perpindahan yang hanya disebabkan pergeseran ambang tidak dihitung sebagai membaik atau memburuk.
      </p>
    </div>
  )
}
