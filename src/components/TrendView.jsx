import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { QUADRANT_CONFIG, fmtNum, fmtCompact } from '../utils/quadrantUtils'
import { buildTrend } from '../utils/quadrantDetail'

const VERDICT_CLS = {
  turun:         'bg-red-500/12 text-red-300',
  'naik-turun':  'bg-amber-500/12 text-amber-300',
  stabil:        'bg-gray-600/20 text-gray-400',
  membaik:       'bg-green-500/12 text-green-300',
  baru:          'bg-gray-600/20 text-gray-400',
}

const METRICS = [
  { id: 'quadrant', label: 'Kuadran' },
  { id: 'pengunjung', label: 'Traffic' },
  { id: 'ctr', label: 'CTR' },
  { id: 'conversion_rate', label: 'CR' },
]

function Cell({ cell, metric }) {
  if (!cell) return <span className="text-ink-faint text-[11px]">–</span>
  if (metric === 'quadrant') {
    const cfg = QUADRANT_CONFIG[cell.quadrant]
    if (!cfg) return <span className="text-ink-faint text-[11px]">–</span>
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: cfg.color + '22', color: cfg.color }}>Q{cell.quadrant}</span>
    )
  }
  const v = cell[metric]
  if (v == null) return <span className="text-ink-faint text-[11px]">–</span>
  if (metric === 'pengunjung') return <span className="text-[11px] text-ink tabular-nums">{fmtNum(v)}</span>
  return <span className="text-[11px] text-ink tabular-nums">{v.toFixed(2)}%</span>
}

export default function TrendView({ sessions, platform, settings }) {
  const [metric, setMetric] = useState('quadrant')
  const trend = useMemo(() => buildTrend(sessions, platform, settings), [sessions, platform, settings])

  if (!trend.enough) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
        <History className="w-7 h-7 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Butuh minimal 2 periode untuk melihat tren.</p>
        <p className="text-xs text-ink-faint mt-1">
          Baru ada {trend.periods.length} periode tersimpan untuk platform ini. Import periode lain lalu buka lagi tab ini.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-line/8 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink-strong">Tren lintas periode</p>
          <p className="text-[11px] text-ink-faint">{trend.periods.length} periode · {trend.rows.length} produk · yang memburuk ditaruh di atas</p>
        </div>
        <div className="flex gap-1">
          {METRICS.map(m => (
            <button key={m.id} type="button" onClick={() => setMetric(m.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                metric === m.id ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink hover:bg-fill/8'
              }`}>{m.label}</button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line/8">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-ink-muted min-w-48">Produk</th>
              {trend.periods.map(s => (
                <th key={s.id || s.label} className="px-3 py-2 text-center text-[11px] font-medium text-ink-muted whitespace-nowrap">{s.label}</th>
              ))}
              <th className="px-3 py-2 text-right text-[11px] font-medium text-ink-muted whitespace-nowrap">Baca</th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-ink-muted whitespace-nowrap">Sales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/5">
            {trend.rows.map(r => (
              <tr key={r.kode_produk} className="hover:bg-fill/5 transition-colors">
                <td className="px-3 py-2">
                  <p className="text-ink line-clamp-1 max-w-xs" title={r.nama_produk}>{r.nama_produk}</p>
                  <p className="text-[10px] text-ink-faint">{r.kode_produk}</p>
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-3 py-2 text-center whitespace-nowrap"><Cell cell={c} metric={metric} /></td>
                ))}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${VERDICT_CLS[r.verdict.key]}`}>
                    {r.verdict.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-ink-faint tabular-nums whitespace-nowrap">
                  {r.last?.total_penjualan != null ? fmtCompact(r.last.total_penjualan) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[11px] text-ink-muted border-t border-line/8">
        "–" berarti produk tak ada di periode itu (belum ada / tak terjual / belum di-import). Hanya periode dari platform yang sama yang disandingkan.
      </p>
    </div>
  )
}
