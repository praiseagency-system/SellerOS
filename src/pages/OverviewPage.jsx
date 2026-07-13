// Overview — command center SellerOS, 3 domain: GMV Max Ads (affiliate),
// Performa Toko (marketplace sendiri), Kuadran Traffic. Read-only dari
// GmvMaxContext + QuadrantContext + loadStore (per-workspace). Dirender di
// dalam GmvMaxProvider (App.jsx) & QuadrantProvider (Layout).
import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp, Wallet, ShoppingCart, Gauge, Rocket, Building2, LayoutGrid,
  Calculator, Package, Megaphone, ArrowRight, Loader2, AlertTriangle, Receipt, Users,
} from 'lucide-react'
import { useGmvMax } from '../contexts/GmvMaxContext'
import { useQuadrant } from '../contexts/QuadrantContext'
import { StatCompact, DeltaBadge, fmtRp, fmtRpC, fmtRoasX } from '../components/gmvmax/ui'
import { loadStore } from '../data/storeDataset'
import { computeStore } from '../utils/storeAnalytics'

const nID = (v) => (v ?? 0).toLocaleString('id-ID')

// Header seksi domain + link "Buka".
function SectionHead({ icon: Icon, tone, title, onOpen }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`w-4 h-4 ${tone}`} />
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">{title}</h3>
      {onOpen && (
        <button onClick={onOpen} className="ml-auto text-[10px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5">
          Buka <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
// Kartu ajakan import kalau domain belum ada data.
function EmptyDomain({ text, cta, onClick }) {
  return (
    <div className="glass-card rounded-xl px-3.5 py-3 flex items-center gap-3">
      <p className="text-xs text-ink-faint flex-1">{text}</p>
      <button onClick={onClick} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent text-white flex-shrink-0">{cta}</button>
    </div>
  )
}

export default function OverviewPage({ onNavigate }) {
  const { typeTotals: tt, prev, periodName, campaigns, hasData: hasGmv, loading } = useGmvMax()
  const { productsWithQuadrant, hasData: hasQuad } = useQuadrant()

  // Data toko (per-workspace, async). null = sedang dimuat.
  const [store, setStore] = useState(null)
  useEffect(() => {
    let active = true
    loadStore().then(s => { if (active) setStore(s || { files: [], lines: [] }) })
      .catch(() => { if (active) setStore({ files: [], lines: [] }) })
    return () => { active = false }
  }, [])

  const storeStats = useMemo(
    () => (store && store.lines?.length ? computeStore(store.lines) : null),
    [store])

  // Hitung sebaran kuadran (1=HT·HC, 2=LT·HC, 3=HT·LC, 4=LT·LC).
  const quad = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const p of productsWithQuadrant) if (c[p.quadrant] != null) c[p.quadrant]++
    return c
  }, [productsWithQuadrant])

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>
  }
  const pt = prev?.typeTotals

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── GMV Max Ads (affiliate) ─────────────────────────────── */}
      <section>
        <SectionHead icon={Rocket} tone="text-blue-400" title="GMV Max Ads"
          onOpen={hasGmv ? () => onNavigate?.('gmv_dashboard') : null} />
        {hasGmv ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <StatCompact icon={TrendingUp} label="Total GMV" value={fmtRp(tt.all.revenue)}
              delta={<DeltaBadge cur={tt.all.revenue} prev={pt?.all.revenue} fmt={fmtRpC} />}
              sub={periodName || (prev ? `vs ${prev.name}` : null)} />
            <StatCompact icon={Wallet} label="Ad Spend" value={fmtRp(tt.all.cost)}
              delta={<DeltaBadge cur={tt.all.cost} prev={pt?.all.cost} fmt={fmtRpC} goodDown />} />
            <StatCompact icon={Gauge} label="ROAS" value={fmtRoasX(tt.all.roas)}
              sub={tt.all.cost > 0 ? `dari spend ${fmtRpC(tt.all.cost)}` : null} />
            <StatCompact icon={ShoppingCart} label="Orders" value={nID(tt.all.orders)}
              delta={<DeltaBadge cur={tt.all.orders} prev={pt?.all.orders} />}
              sub={`${nID(campaigns.length)} campaign aktif`} />
          </div>
        ) : (
          <EmptyDomain text="Belum ada data GMV Max — import export creative TikTok Shop."
            cta="Import" onClick={() => onNavigate?.('gmv_input')} />
        )}
      </section>

      {/* ── Performa Toko (marketplace sendiri) ──────────────────── */}
      <section>
        <SectionHead icon={Building2} tone="text-orange-400" title="Performa Toko"
          onOpen={storeStats ? () => onNavigate?.('performance') : null} />
        {store == null ? (
          <div className="glass-card rounded-xl px-3.5 py-3 text-xs text-ink-faint flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat data toko…
          </div>
        ) : storeStats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <StatCompact icon={TrendingUp} tone="green" label="GMV Toko" value={fmtRp(storeStats.overview.gmv)}
              sub={storeStats.marketplaces.slice(0, 3).map(m => `${m.name} ${Math.round(m.share)}%`).join(' · ')} />
            <StatCompact icon={Package} tone="violet" label="Pesanan" value={nID(storeStats.overview.orders)} />
            <StatCompact icon={Receipt} tone="amber" label="AOV" value={fmtRp(Math.round(storeStats.overview.aov))} />
            <StatCompact icon={Users} tone="blue" label="Pembeli" value={nID(storeStats.overview.buyers)} />
          </div>
        ) : (
          <EmptyDomain text="Belum ada data toko — import export pesanan Shopee / TikTok."
            cta="Import" onClick={() => onNavigate?.('performance')} />
        )}
      </section>

      {/* ── Kuadran Traffic ──────────────────────────────────────── */}
      <section>
        <SectionHead icon={LayoutGrid} tone="text-violet-400" title="Kuadran Traffic"
          onOpen={hasQuad ? () => onNavigate?.('quadrant') : null} />
        {hasQuad ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <QuadCell n={quad[1]} label="High traffic · High conv" cls="border-emerald-500/25 bg-emerald-500/[0.08]" />
              <QuadCell n={quad[3]} label="High traffic · Low conv" cls="border-amber-500/25 bg-amber-500/[0.08]" />
              <QuadCell n={quad[2]} label="Low traffic · High conv" cls="border-blue-500/25 bg-blue-500/[0.08]" />
              <QuadCell n={quad[4]} label="Low traffic · Low conv" cls="border-red-500/25 bg-red-500/[0.08]" />
            </div>
            <div className="glass-card rounded-xl px-3.5 py-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink-faint mb-0.5">Perlu perhatian</p>
                <p className="text-xs text-ink leading-relaxed">
                  {quad[3] > 0
                    ? <><b className="text-amber-400">{quad[3]} produk</b> traffic tinggi tapi konversi rendah — cek harga / halaman produk.</>
                    : 'Tak ada produk traffic-tinggi konversi-rendah. Kuadran sehat.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyDomain text="Belum ada data kuadran — import data performa produk marketplace."
            cta="Import" onClick={() => onNavigate?.('quadrant')} />
        )}
      </section>

      {/* ── Alat lain ────────────────────────────────────────────── */}
      <section>
        <SectionHead icon={Calculator} tone="text-ink-faint" title="Alat" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { id: 'calculator', icon: Calculator, title: 'Kalkulator Marketplace' },
            { id: 'products', icon: Package, title: 'Produk' },
            { id: 'campaign', icon: Megaphone, title: 'Campaign Pricing' },
          ].map(m => (
            <button key={m.id} onClick={() => onNavigate?.(m.id)}
              className="group glass-card rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 hover:border-accent/40 transition-colors">
              <m.icon className="w-4 h-4 text-blue-400/90 flex-shrink-0" />
              <span className="flex-1 text-left text-xs font-semibold text-ink truncate">{m.title}</span>
              <ArrowRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function QuadCell({ n, label, cls }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-lg font-semibold text-ink-strong tabular-nums leading-none">{n}</p>
      <p className="text-[9px] uppercase tracking-wide text-ink-faint mt-1">{label}</p>
    </div>
  )
}
