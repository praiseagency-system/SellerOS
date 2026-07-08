// Dashboard GMV Max — ringkasan performa (video-only), meniru layout Lacak:
// strip "Hari ini" + grafik tren + 3 kartu total + 3 kartu tier + 3 top-list.
import { Wallet, TrendingUp, ShoppingCart, CalendarDays } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { StatCard, DeltaBadge, SectionTitle, TrendBars, fmtRp, fmtRpC, fmtRoasX, VideoLabel, EmptyState } from '../../components/gmvmax/ui'

export default function DashboardPage({ onOpenUpload }) {
  const { dashboard: d, typeTotals: tt, hasData, prev, periodName, dailyDelta: dd, trend, period } = useGmvMax()
  if (!hasData) return <EmptyState title="Belum ada data GMV Max"
    desc="Upload file export creative TikTok Shop untuk mulai melacak performa."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const { tiers } = d
  const pt = prev?.typeTotals
  const brk = (get) => `Video ${fmtRpC(get(tt.video))} · Card ${fmtRpC(get(tt.card))}`
  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {periodName && (
        <p className="text-sm text-ink-muted -mb-1">
          {period === 'all' ? periodName : <>Snapshot s/d <span className="text-ink font-medium">{periodName}</span></>}
          {prev && <span className="text-ink-faint"> · dibanding {prev.name}</span>}
        </p>
      )}

      {dd && (dd.cost > 0 || dd.revenue > 0) && <DailyStrip dd={dd} />}
      {period !== 'all' && trend.length > 1 && (
        <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
          <SectionTitle right={<Legend />}>Tren harian bulan ini</SectionTitle>
          <TrendBars series={trend} />
          <p className="text-xs text-ink-faint mt-2">Angka per hari = selisih tiap snapshot (spend & revenue yang bertambah hari itu).</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={TrendingUp} tone="green" label="Total Revenue" value={fmtRp(tt.all.revenue)}
          delta={<DeltaBadge cur={tt.all.revenue} prev={pt?.all.revenue} fmt={fmtRpC} />}
          sub={`ROAS ${fmtRoasX(tt.all.roas)} · ${brk(o => o.revenue)}`} />
        <StatCard icon={Wallet} tone="red" label="Total Cost" value={fmtRp(tt.all.cost)}
          delta={<DeltaBadge cur={tt.all.cost} prev={pt?.all.cost} fmt={fmtRpC} goodDown />}
          sub={brk(o => o.cost)} />
        <StatCard icon={ShoppingCart} tone="violet" label="Total Orders" value={tt.all.orders.toLocaleString('id-ID')}
          delta={<DeltaBadge cur={tt.all.orders} prev={pt?.all.orders} />}
          sub={`Video ${tt.video.orders.toLocaleString('id-ID')} · Card ${tt.card.orders.toLocaleString('id-ID')}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TierCard tone="green" label="Bagus (Tinggi)" tier={tiers.bagus}
          note={d.totals.potensiCount ? `${d.totals.potensiCount} di antaranya "Potensi" (spend receh)` : null} />
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

// Strip angka incremental "hari ini" (selisih snapshot terpilih − sebelumnya).
function DailyStrip({ dd }) {
  const neg = v => v < 0
  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
          <CalendarDays className="w-4 h-4" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          {dd.firstOfMonth ? `${dd.windowLabel} · sejak awal bulan` : dd.windowLabel}
        </span>
        {!dd.firstOfMonth && dd.prevName
          ? <span className="text-xs text-ink-faint">{dd.label} vs {dd.prevName}</span>
          : <span className="text-xs text-ink-faint">s/d {dd.label}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Cell label="Revenue" value={fmtRp(dd.revenue)} tone={neg(dd.revenue) ? 'red' : 'green'} />
        <Cell label="Cost" value={fmtRp(dd.cost)} tone="red" />
        <Cell label="Orders" value={dd.orders.toLocaleString('id-ID')} tone="violet" />
        <Cell label="ROAS" value={fmtRoasX(dd.roas)} tone={dd.roas == null ? 'muted' : 'ink'} />
      </div>
    </div>
  )
}
const CELL_TONE = { green: 'text-emerald-500', red: 'text-red-500', violet: 'text-violet-500', ink: 'text-ink-strong', muted: 'text-ink-faint' }
function Cell({ label, value, tone = 'ink' }) {
  return (
    <div>
      <p className="text-xs text-ink-faint mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${CELL_TONE[tone]}`}>{value}</p>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-faint">
      <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Revenue</span>
      <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Cost</span>
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
