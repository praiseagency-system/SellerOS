// Dashboard GMV Max — ringkasan performa (video-only), meniru layout Lacak:
// 3 kartu total + 3 kartu tier + 3 top-list.
import { Wallet, TrendingUp, ShoppingCart } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { StatCard, SectionTitle, fmtRp, fmtRpC, fmtRoasX, VideoLabel, EmptyState } from '../../components/gmvmax/ui'

export default function DashboardPage({ onOpenUpload }) {
  const { dashboard: d, hasData } = useGmvMax()
  if (!hasData) return <EmptyState title="Belum ada data GMV Max"
    desc="Upload file export creative TikTok Shop untuk mulai melacak performa."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const { totals, tiers } = d
  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={TrendingUp} tone="green" label="Total Revenue" value={fmtRp(totals.revenue)}
          sub={`ROAS ${fmtRoasX(totals.roas)} · ${totals.videoCount} video ber-spend`} />
        <StatCard icon={Wallet} tone="red" label="Total Cost" value={fmtRp(totals.cost)} />
        <StatCard icon={ShoppingCart} tone="violet" label="Total Orders" value={totals.orders.toLocaleString('id-ID')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TierCard tone="green" label="Bagus (Tinggi)" tier={tiers.bagus}
          note={totals.potensiCount ? `${totals.potensiCount} di antaranya "Potensi" (spend receh)` : null} />
        <TierCard tone="amber" label="Sedang" tier={tiers.sedang} />
        <TierCard tone="red" label="Buruk (Rendah)" tier={tiers.buruk} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopList tone="green" title="Top Bagus" items={tiers.bagus.top} />
        <TopList tone="amber" title="Top Sedang" items={tiers.sedang.top} />
        <TopList tone="red" title="Buruk Terburuk" items={tiers.buruk.top} />
      </div>
    </div>
  )
}

function TierCard({ tone, label, tier, note }) {
  const c = tone === 'green' ? 'text-emerald-500' : tone === 'amber' ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${c}`}>{label}</span>
        <span className="text-2xl font-bold text-ink-strong">{tier.count}</span>
      </div>
      <p className="text-xs text-ink-faint mt-2">ROAS agregat</p>
      <p className={`text-lg font-semibold ${c}`}>{fmtRoasX(tier.roas)}</p>
      {note && <p className="text-xs text-ink-faint mt-1">{note}</p>}
    </div>
  )
}

function TopList({ tone, title, items }) {
  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
      <SectionTitle tone={tone}>{title}</SectionTitle>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint py-4 text-center">Tidak ada</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((v, i) => (
            <li key={v.videoId} className="flex items-center gap-3">
              <span className="text-xs text-ink-faint w-4">{i + 1}.</span>
              <div className="flex-1 min-w-0"><VideoLabel title={v.title} account={v.account} videoId={v.videoId} compact linkVideo /></div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-ink">{fmtRoasX(v.lifetime.roas)}</p>
                <p className="text-xs text-ink-faint">{fmtRpC(v.lifetime.revenue)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
