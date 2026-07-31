import { useMemo, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { QUADRANT_CONFIG, fmtCompact } from '../utils/quadrantUtils'
import { buildActions } from '../utils/quadrantDetail'
import PlatformTag from './PlatformTag'

const URGENCY = {
  high:   { label: 'Segera',  cls: 'bg-red-500/12 text-red-300' },
  medium: { label: 'Menengah', cls: 'bg-amber-500/12 text-amber-300' },
  low:    { label: 'Santai',  cls: 'bg-green-500/12 text-green-300' },
}
const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'high', label: 'Segera' },
  { id: 'medium', label: 'Menengah' },
  { id: 'low', label: 'Santai' },
]

export default function ActionView({ products }) {
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => buildActions(products), [products])
  const shown = filter === 'all' ? rows : rows.filter(r => r.action.urgency === filter)
  const count = u => rows.filter(r => r.action.urgency === u).length

  if (!rows.length) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
        <ListChecks className="w-7 h-7 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Belum ada produk untuk dinilai.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-line/8 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink-strong">Daftar tindakan</p>
          <p className="text-[11px] text-ink-faint">Dari kuadran + arah CTR/CR periode ini · {rows.length} produk</p>
        </div>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                filter === f.id ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink hover:bg-fill/8'
              }`}>
              {f.label}{f.id !== 'all' && <span className="opacity-70"> · {count(f.id)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-line/8">
        {shown.map(p => {
          const cfg = QUADRANT_CONFIG[p.quadrant]
          const u = URGENCY[p.action.urgency]
          return (
            <div key={p.kode_produk} className="px-4 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="text-[13px] text-ink truncate max-w-sm" title={p.nama_produk}>{p.nama_produk}</p>
                  <PlatformTag product={p} />
                  {cfg && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ background: cfg.color + '22', color: cfg.color }}>Q{p.quadrant} · {cfg.short}</span>
                  )}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${u.cls}`}>{u.label}</span>
                </div>
                <p className="text-[11px] text-ink-faint mb-1">
                  {p.action.kondisi}
                  {p.ctr != null && <> · CTR {p.ctr.toFixed(2)}%</>}
                  {p.conversion_rate != null && <> · CR {p.conversion_rate.toFixed(2)}%</>}
                </p>
                <p className="text-[12px] text-ink-muted">{p.action.aksi}</p>
              </div>
              <span className="text-[11px] text-ink-faint tabular-nums flex-shrink-0">{fmtCompact(p.total_penjualan)}</span>
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-ink-faint">Tak ada produk dengan tingkat ini.</p>
        )}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-ink-muted border-t border-line/8">
        Saran dibaca dari aturan tetap: CTR turun ≥1 poin didahulukan (masalah etalase), lalu keranjang menumpuk tapi tak dibayar (masalah checkout), baru saran dasar per kuadran. Bukan tebakan model.
      </p>
    </div>
  )
}
