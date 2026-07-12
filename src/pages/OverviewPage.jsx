// Overview — landing "command center" SellerOS. FASE UI-2: kartu metrik live,
// read-only dari GmvMaxContext (tanpa mengubah logika data/sync apa pun).
// Dirender di dalam GmvMaxProvider (lihat App.jsx) bersama halaman gmv_* agar
// data tidak dimuat ulang saat pindah Overview ↔ GMV Max.
import {
  TrendingUp, Wallet, ShoppingCart, Gauge, Megaphone as CampaignIcon,
  LineChart, Calculator, LayoutGrid, Package, Megaphone, ArrowRight, Clock, Loader2,
} from 'lucide-react'
import { useGmvMax } from '../contexts/GmvMaxContext'
import { StatCompact, DeltaBadge, fmtRp, fmtRpC, fmtRoasX } from '../components/gmvmax/ui'

// Selisih hari dari 'YYYY-MM-DD' ke hari ini (UTC) — untuk indikator freshness.
function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (isNaN(d)) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Pintasan modul: id = target navigasi (route state di App.jsx).
const MODULES = [
  { id: 'gmv_dashboard', icon: LineChart,  title: 'GMV Max Monitoring',
    desc: 'Performa iklan GMV Max: video, produk, creator, insight & boost.' },
  { id: 'calculator',    icon: Calculator, title: 'Kalkulator Marketplace',
    desc: 'Hitung fee, margin, dan harga rekomendasi per marketplace.' },
  { id: 'quadrant',      icon: LayoutGrid, title: 'Affiliate Monitoring',
    desc: 'Kuadran traffic × conversion + performa toko per periode.' },
  { id: 'products',      icon: Package,    title: 'Produk',
    desc: 'Database produk, harga, dan kesehatan margin.' },
  { id: 'campaign',      icon: Megaphone,  title: 'Campaign Pricing',
    desc: 'Rencanakan & pantau harga event campaign per marketplace.' },
]

export default function OverviewPage({ onNavigate }) {
  const { typeTotals: tt, prev, periodName, campaigns, imports, hasData, loading } = useGmvMax()

  if (loading) {
    return <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  }

  const pt = prev?.typeTotals
  const latest = imports[0] || null
  const lag = daysSince(latest?.snapshot_date)
  const fresh = lag != null && lag <= 2

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Strip status data: periode aktif + freshness snapshot GMV Max terakhir */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 text-ink-faint">
          <Clock className="w-3.5 h-3.5" />
          {hasData && periodName
            ? <>Periode GMV Max: <span className="text-ink font-medium">{periodName}</span></>
            : 'Belum ada data GMV Max'}
        </span>
        {hasData && (
          <span className={`px-2 py-0.5 rounded-full border text-xs ${fresh
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
            {fresh ? 'Data terkini' : lag != null ? `Snapshot ${lag} hari lalu` : 'Freshness tak diketahui'}
          </span>
        )}
      </div>

      {/* Kartu metrik utama — compact glass, live dari GMV Max (read-only) */}
      {hasData ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatCompact icon={TrendingUp} label="Total GMV" value={fmtRp(tt.all.revenue)}
            delta={<DeltaBadge cur={tt.all.revenue} prev={pt?.all.revenue} fmt={fmtRpC} />}
            sub={prev ? `vs ${prev.name}` : null} />
          <StatCompact icon={Wallet} label="Ad Spend" value={fmtRp(tt.all.cost)}
            delta={<DeltaBadge cur={tt.all.cost} prev={pt?.all.cost} fmt={fmtRpC} goodDown />}
            sub={prev ? `vs ${prev.name}` : null} />
          <StatCompact icon={Gauge} label="ROAS" value={fmtRoasX(tt.all.roas)}
            sub={tt.all.cost > 0 ? `dari spend ${fmtRpC(tt.all.cost)}` : null} />
          <StatCompact icon={ShoppingCart} label="Orders" value={tt.all.orders.toLocaleString('id-ID')}
            delta={<DeltaBadge cur={tt.all.orders} prev={pt?.all.orders} />}
            sub={`${campaigns.length.toLocaleString('id-ID')} campaign aktif`} />
        </div>
      ) : (
        <div className="glass-card rounded-xl p-6 text-center">
          <p className="text-ink-strong font-semibold mb-1">Belum ada data GMV Max</p>
          <p className="text-sm text-ink-faint max-w-md mx-auto mb-4">
            Import file export creative TikTok Shop untuk mengaktifkan kartu GMV, spend, ROAS, dan orders di sini.
          </p>
          <button onClick={() => onNavigate?.('gmv_input')}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">
            Ke Import Data
          </button>
        </div>
      )}

      {/* Info ringkas snapshot & campaign */}
      {hasData && latest && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <CampaignIcon className="w-3.5 h-3.5" />
          <span>Snapshot terakhir: <span className="text-ink-muted font-medium">{latest.name}</span></span>
          <span className="opacity-50">·</span>
          <span>{imports.length.toLocaleString('id-ID')} snapshot tersimpan</span>
        </div>
      )}

      {/* Pintasan modul — baris glass compact */}
      <div>
        <h3 className="text-[10px] font-medium uppercase tracking-widest text-ink-faint mb-2">Modul</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MODULES.map(m => (
            <button key={m.id} onClick={() => onNavigate?.(m.id)}
              className="group text-left glass-card rounded-xl px-3.5 py-2.5 flex items-center gap-2.5
                hover:border-accent/40 transition-colors">
              <m.icon className="w-4 h-4 text-blue-400/90 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-ink truncate">{m.title}</span>
                <span className="block text-[10px] text-ink-faint truncate">{m.desc}</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
