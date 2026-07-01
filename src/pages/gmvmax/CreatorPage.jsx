// Creator — leaderboard kreator (rollup video per akun). Bar revenue gaya
// "Top 10 Affiliate" Praise. Video tanpa kreator digrup "Akun toko".
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, fmtRp, fmtRpC } from '../../components/gmvmax/ui'

export default function CreatorPage({ onOpenUpload }) {
  const { creators, thresholds, hasData } = useGmvMax()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    let l = creators.filter(c => c.cost > 0 || c.revenue > 0)
    if (q.trim()) {
      const s = q.toLowerCase()
      l = l.filter(c => (c.account || 'akun toko').toLowerCase().includes(s))
    }
    return l
  }, [creators, q])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const maxRev = Math.max(1, ...list.map(c => c.revenue))
  const rankColor = ['bg-amber-400', 'bg-slate-400', 'bg-orange-400']

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kreator…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-line/10 text-sm text-ink" />
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm space-y-1">
        {list.length === 0 && <p className="text-sm text-ink-faint py-8 text-center">Tidak ada kreator.</p>}
        {list.map((c, i) => (
          <div key={c.account || '__store__'} className="flex items-center gap-3 py-2 border-b border-line/5 last:border-0">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0
              ${i < 3 ? rankColor[i] : 'bg-fill/15 text-ink-muted'}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                {c.isStore ? 'Akun toko / tanpa kreator' : c.account}
              </p>
              <div className="h-1.5 bg-fill/10 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${(c.revenue / maxRev) * 100}%` }} />
              </div>
              <p className="text-xs text-ink-faint mt-0.5">{c.videoCount} video · spend {fmtRpC(c.cost)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-ink">{fmtRp(c.revenue)}</p>
              <div className="mt-0.5"><RoasBadge roas={c.roas} thresholds={thresholds} showLabel={false} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
