// Creator — leaderboard kreator (rollup video per akun). Bar revenue gaya
// "Top 10 Affiliate" Praise. Video tanpa kreator digrup "Akun toko".
import { useState, useMemo } from 'react'
import { Search, Users, Clapperboard, Wallet, TrendingUp, Target, ShoppingCart } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, StatCard, DeltaBadge, fmtRp, fmtRpC, fmtRoasX } from '../../components/gmvmax/ui'

const n = (v) => v.toLocaleString('id-ID')
const creatorBase = (arr) => arr.filter(c => c.cost > 0 || c.revenue > 0)
function sumCreators(arr) {
  const s = { kreator: arr.length, video: 0, cost: 0, revenue: 0, orders: 0, roas: null }
  for (const c of arr) {
    s.video += c.videoCount || 0
    s.cost += c.cost || 0
    s.revenue += c.revenue || 0
    s.orders += c.orders || 0
  }
  s.roas = s.cost > 0 ? s.revenue / s.cost : null
  return s
}

export default function CreatorPage({ onOpenUpload }) {
  const { creators, thresholds, hasData, prev, periodName } = useGmvMax()
  const [q, setQ] = useState('')

  const base = useMemo(() => creatorBase(creators), [creators])
  const list = useMemo(() => {
    if (!q.trim()) return base
    const s = q.toLowerCase()
    return base.filter(c => (c.account || 'akun toko').toLowerCase().includes(s))
  }, [base, q])

  const sum = useMemo(() => sumCreators(base), [base])
  const prevSum = useMemo(() => (prev ? sumCreators(creatorBase(prev.creators)) : null), [prev])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const maxRev = Math.max(1, ...list.map(c => c.revenue))
  const rankColor = ['bg-amber-400', 'bg-slate-400', 'bg-orange-400']

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {periodName && prev && (
        <p className="text-sm text-ink-muted -mb-1">{periodName} <span className="text-ink-faint">· vs {prev.name}</span></p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} tone="violet" label="Total Kreator" value={n(sum.kreator)}
          delta={<DeltaBadge cur={sum.kreator} prev={prevSum?.kreator} />} />
        <StatCard icon={Clapperboard} tone="blue" label="Total Video" value={n(sum.video)}
          delta={<DeltaBadge cur={sum.video} prev={prevSum?.video} />} />
        <StatCard icon={Wallet} tone="amber" label="Total Cost" value={fmtRpC(sum.cost)}
          delta={<DeltaBadge cur={sum.cost} prev={prevSum?.cost} fmt={fmtRpC} goodDown />} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue (GMV)" value={fmtRpC(sum.revenue)}
          delta={<DeltaBadge cur={sum.revenue} prev={prevSum?.revenue} fmt={fmtRpC} />} />
        <StatCard icon={Target} tone="blue" label="ROAS" value={fmtRoasX(sum.roas)}
          delta={<DeltaBadge cur={sum.roas} prev={prevSum?.roas} fmt={(v) => v.toFixed(1) + 'x'} />} />
        <StatCard icon={ShoppingCart} tone="blue" label="Total Orders" value={n(sum.orders)}
          delta={<DeltaBadge cur={sum.orders} prev={prevSum?.orders} />} />
      </div>

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
