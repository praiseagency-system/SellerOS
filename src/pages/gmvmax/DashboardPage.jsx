// Dashboard GMV Max — ringkasan performa (video-only), meniru layout Lacak:
// strip "Hari ini" + grafik tren + 3 kartu total + 3 kartu tier + 3 top-list.
import { useState, useEffect } from 'react'
import { Wallet, TrendingUp, ShoppingCart, CalendarDays, ArrowRight } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { StatCompact, DeltaBadge, SectionTitle, TrendBars, fmtRp, fmtRpC, fmtRoasX, VideoLabel, EmptyState } from '../../components/gmvmax/ui'

export default function DashboardPage({ onOpenUpload, onNavigate }) {
  const { dashboard: d, typeTotals: tt, hasData, prev, periodName, dailyDelta: dd, trend, period, channels } = useGmvMax()
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
          <span className="text-ink font-medium">{periodName}</span>
          {prev && <span className="text-ink-faint"> · dibanding {prev.name}</span>}
        </p>
      )}

      {dd && (dd.cost > 0 || dd.revenue > 0) && <DailyStrip dd={dd} />}
      {period !== 'all' && trend.length > 1 && (
        <div className="glass-card rounded-xl p-4">
          <SectionTitle right={<Legend />}>Tren harian bulan ini</SectionTitle>
          <TrendBars series={trend} />
          <p className="text-xs text-ink-faint mt-2">Angka per hari = spend &amp; revenue hari itu (dari file harian yang diupload).</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <StatCompact icon={TrendingUp} label="Total Revenue" value={fmtRp(tt.all.revenue)}
          delta={<DeltaBadge cur={tt.all.revenue} prev={pt?.all.revenue} fmt={fmtRpC} />}
          sub={`ROAS ${fmtRoasX(tt.all.roas)} · ${brk(o => o.revenue)}`} />
        <StatCompact icon={Wallet} label="Total Cost" value={fmtRp(tt.all.cost)}
          delta={<DeltaBadge cur={tt.all.cost} prev={pt?.all.cost} fmt={fmtRpC} goodDown />}
          sub={brk(o => o.cost)} />
        <StatCompact icon={ShoppingCart} label="Total Orders" value={tt.all.orders.toLocaleString('id-ID')}
          delta={<DeltaBadge cur={tt.all.orders} prev={pt?.all.orders} />}
          sub={`Video ${tt.video.orders.toLocaleString('id-ID')} · Card ${tt.card.orders.toLocaleString('id-ID')}`} />
      </div>

      <ChannelStrip channels={channels} onNavigate={onNavigate} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <TierCard tone="green" label="Bagus (Tinggi)" tier={tiers.bagus}
          note={d.totals.potensiCount ? `${d.totals.potensiCount} di antaranya "Potensi" (spend receh)` : null} />
        <TierCard tone="amber" label="Sedang" tier={tiers.sedang} />
        <TierCard tone="red" label="Buruk (Rendah)" tier={tiers.buruk} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
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
    <div className="glass-card rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <CalendarDays className="w-3.5 h-3.5 text-blue-400/90" />
        <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">
          {dd.firstOfMonth ? `${dd.windowLabel} · sejak awal bulan` : dd.windowLabel}
        </span>
        {!dd.firstOfMonth && dd.prevName
          ? <span className="text-xs text-ink-faint">{dd.label} vs {dd.prevName}</span>
          : <span className="text-xs text-ink-faint">s/d {dd.label}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

// Strip ringkas perbandingan channel (B) — klik → halaman Channel (A).
function ChannelStrip({ channels, onNavigate }) {
  const total = channels?.total || 0
  if (!total) return null
  const CH = [
    { key: 'video', label: 'Video', bar: 'bg-blue-500' },
    { key: 'card', label: 'Product card', bar: 'bg-emerald-500' },
    { key: 'live', label: 'Live', bar: 'bg-orange-500' },
  ]
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0)
  return (
    <button onClick={() => onNavigate?.('gmv_channel')}
      className="w-full glass-card rounded-xl p-3.5 text-left hover:border-blue-600/40 transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">Channel · Video / Card / Live</span>
        <span className="text-xs text-blue-400 inline-flex items-center gap-1 opacity-80 group-hover:opacity-100">Detail <ArrowRight className="w-3 h-3" /></span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
        {CH.map(c => <div key={c.key} className={c.bar} style={{ width: `${pct(channels[c.key].revenue)}%` }} />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CH.map(c => (
          <div key={c.key} className="min-w-0">
            <p className="text-[11px] text-ink-faint flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${c.bar}`} />{c.label}</p>
            <p className="text-sm font-semibold text-ink-strong tabular-nums">{fmtRpC(channels[c.key].revenue)}</p>
            <p className="text-[10px] text-ink-faint">{pct(channels[c.key].revenue).toFixed(0)}% · {fmtRoasX(channels[c.key].roas)}</p>
          </div>
        ))}
      </div>
    </button>
  )
}

function TierCard({ tone, label, tier, note }) {
  const c = tone === 'green' ? 'text-emerald-500' : tone === 'amber' ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="glass-card rounded-xl px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-medium uppercase tracking-widest ${c}`}>{label}</span>
        <span className="text-lg font-semibold text-ink-strong tabular-nums">{tier.count}</span>
      </div>
      <p className={`text-sm font-semibold mt-1 ${c}`}>{fmtRoasX(tier.roas)} <span className="text-[10px] font-normal text-ink-faint">ROAS agregat</span></p>
      {note && <p className="text-[10px] text-ink-faint mt-0.5 truncate">{note}</p>}
    </div>
  )
}

// Top-list dengan animasi "spotlight" (opsi B, dipilih user 2026-07-12):
// posisi baris diam, sorotan biru bergilir tiap 1,6 dtk. Pause saat kursor di
// atas list, dan mati total bila user set prefers-reduced-motion.
function TopList({ tone, title, items }) {
  const [spot, setSpot] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || items.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setSpot(s => (s + 1) % items.length), 1600)
    return () => clearInterval(id)
  }, [items.length, paused])
  return (
    <div className="glass-card rounded-xl p-4">
      <SectionTitle tone={tone}>{title}</SectionTitle>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint py-4 text-center">Tidak ada</p>
      ) : (
        <ol className="space-y-1" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {items.map((v, i) => (
            <li key={v.videoId}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-all duration-500 ${
                i === spot && !paused ? 'bg-accent/15 opacity-100' : 'opacity-60 hover:opacity-100'
              }`}>
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
