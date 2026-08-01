import { useMemo, useState } from 'react'
import { Filter, Info, AlertTriangle, X } from 'lucide-react'
import { fmtNum, fmtIDR } from '../utils/quadrantUtils'
import {
  funnelStages, funnelSections, funnelMedians, weakestStage, opportunityOf, dataConfidence, STAGE,
} from '../utils/quadrantScoring'

// Corong konversi. Dua aturan tampilan yang dijaga:
// • Angka asli SELALU terbaca — bar hanya bahasa visual, dan kalau bar terlalu
//   pendek nilainya pindah ke luar bar, tidak pernah tertutup.
// • Metrik hasil turunan (mis. impresi dari klik ÷ CTR) diberi label estimasi,
//   tak pernah ditampilkan seolah angka mentah.

const SOURCE_BADGE = {
  observed: null,
  estimated: { label: 'estimasi', cls: 'bg-amber-500/12 text-amber-300' },
  fallback: { label: 'fallback', cls: 'bg-amber-500/12 text-amber-300' },
}

const pctTxt = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
const ppTxt = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`

const SORTS = [
  { id: 'potential', label: 'Potensi GMV terbesar' },
  { id: 'leak', label: 'Kebocoran terbesar' },
  { id: 'traffic', label: 'Traffic terbesar' },
  { id: 'gap', label: 'Conversion gap terbesar' },
  { id: 'gmv', label: 'GMV terbesar' },
]

function StageBar({ stage, max, compact }) {
  const badge = SOURCE_BADGE[stage.source]
  const widthPct = max > 0 ? Math.max(2, (stage.value / max) * 100) : 2
  // Kalau bar terlalu sempit untuk memuat teks, angka ditaruh DI LUAR bar.
  const inside = widthPct >= 28
  const valueTxt = stage.isCurrency ? fmtIDR(stage.value) : fmtNum(stage.value)
  return (
    <div className={compact ? 'py-1.5' : 'py-2'}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[12px] text-ink-muted">{stage.label}</span>
        {badge && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badge.cls}`} title={stage.warning}>
            {badge.label}
          </span>
        )}
        {stage.rate != null && (
          <span className="text-[11px] text-ink-faint">{stage.rateLabel} {stage.rate.toFixed(2)}%</span>
        )}
        {stage.deltaPct != null && (
          <span className={`text-[11px] ${stage.deltaPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pctTxt(stage.deltaPct)} vs periode lalu
          </span>
        )}
        {stage.deltaPp != null && (
          <span className={`text-[11px] ${stage.deltaPp >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {ppTxt(stage.deltaPp)}
          </span>
        )}
        {stage.benchmarkPp != null && (
          <span className={`text-[11px] ${stage.benchmarkPp >= 0 ? 'text-green-400' : 'text-amber-300'}`}>
            {ppTxt(stage.benchmarkPp)} vs benchmark
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="h-8 rounded-lg bg-blue-600/25 flex items-center px-2.5 min-w-[8px] flex-shrink-0"
            style={{ width: `${widthPct}%` }} title={valueTxt}>
            {inside && <span className="text-[13px] font-semibold text-blue-100 tabular-nums truncate">{valueTxt}</span>}
          </div>
          {!inside && <span className="text-[13px] font-semibold text-ink-strong tabular-nums flex-shrink-0">{valueTxt}</span>}
        </div>
        {stage.dropCount != null && (
          <span className="text-[11px] text-red-400 tabular-nums flex-shrink-0 w-40 text-right">
            −{fmtNum(stage.dropCount)} ({stage.dropPct.toFixed(1)}%)
          </span>
        )}
      </div>
    </div>
  )
}

// Tiga bagian corong v3. Pesanan & GMV BUKAN tahap corong — satu pembeli bisa
// membuat lebih dari satu pesanan, jadi keduanya dirender sebagai metrik hasil.
export function FunnelSections({ sections, compact }) {
  if (!sections) return null
  const maxProduct = Math.max(...(sections.product || []).map(s => s.value ?? 0), 1)
  const maxExposure = Math.max(...(sections.exposure || []).map(s => s.value ?? 0), 1)
  return (
    <div className="space-y-3">
      {sections.exposure?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-1">Exposure</p>
          <div className="divide-y divide-line/8">
            {sections.exposure.map(s => (
              <StageBar key={s.key} compact={compact}
                stage={{ ...s, source: s.source, warning: s.warning || s.hint }} max={maxExposure} />
            ))}
          </div>
        </div>
      )}
      {sections.product?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-1">Product conversion</p>
          <div className="divide-y divide-line/8">
            {sections.product.map(s => <StageBar key={s.key} compact={compact} stage={s} max={maxProduct} />)}
          </div>
        </div>
      )}
      <div>
        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-1">Business output</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
          <span className="text-ink-muted">Pesanan <b className="text-ink-strong tabular-nums">{sections.output?.orders ? fmtNum(sections.output.orders.value) : '—'}</b></span>
          <span className="text-ink-muted">GMV <b className="text-ink-strong tabular-nums">{sections.output?.gmv ? fmtIDR(sections.output.gmv.value) : '—'}</b></span>
          <span className="text-ink-muted" title="Satu pembeli bisa membuat lebih dari satu pesanan — selisih Pembeli ke Pesanan bukan kebocoran.">
            Pesanan per Pembeli <b className="text-ink-strong tabular-nums">{sections.output?.ordersPerBuyer ? sections.output.ordersPerBuyer.value.toFixed(2) : '—'}</b>
          </span>
        </div>
      </div>
    </div>
  )
}

function SkippedDrawer({ items, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-surface border-l border-line/15 shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/10 sticky top-0 bg-surface">
          <p className="text-sm font-semibold text-ink-strong">{items.length} produk tidak dianalisis</p>
          <button onClick={onClose} className="p-1 rounded-lg text-ink-faint hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-ink-faint">
            Produk berikut dilewati karena data funnel-nya tak cukup untuk dihitung. Perbaiki di sumber import lalu import ulang periode ini.
          </p>
          {items.map(it => (
            <div key={it.product.kode_produk} className="rounded-xl border border-line/10 bg-fill/5 p-3">
              <p className="text-[13px] text-ink">{it.product.shortName || it.product.nama_produk}</p>
              <p className="text-[10px] text-ink-faint mb-2">
                {(it.product.platforms || []).map(p => p.platform).join(' + ') || '—'} · {it.product.displayCode || it.product.kode_produk}
              </p>
              <ul className="space-y-1">
                {it.missing.map(m => (
                  <li key={m.field} className="text-[11px] text-amber-300 flex items-start gap-1.5">
                    <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                    <span><b className="font-semibold">{m.field}</b>: {m.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-ink-faint mt-2">Saran: {it.advice}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Alasan sebuah produk tak bisa dianalisis — dibedakan null vs nol.
function missingFields(p) {
  const out = []
  if (p.qualifiedTraffic == null) out.push({ field: 'qualified traffic', reason: 'tidak tersedia di file import (null)' })
  else if (p.qualifiedTraffic === 0) out.push({ field: 'qualified traffic', reason: 'nilainya nol pada periode ini' })
  if (p.conversionRate == null) out.push({ field: 'conversion rate', reason: 'tak bisa dihitung karena pembeli/traffic tak tersedia' })
  if (p.atcRate == null) out.push({ field: 'ATC rate', reason: 'kolom ATC users tidak ada di file' })
  if (p.gmv == null) out.push({ field: 'GMV', reason: 'kolom penjualan tidak dikenali' })
  return out
}

export default function FunnelView({ products, benchmark, previousByKey, onOpenProduct }) {
  const [openId, setOpenId] = useState(null)
  const [sort, setSort] = useState('potential')
  const [showSkipped, setShowSkipped] = useState(false)

  const medians = useMemo(() => funnelMedians(products), [products])

  const { rows, skipped, totals } = useMemo(() => {
    const rows = [], skipped = []
    for (const p of products || []) {
      const stages = funnelStages(p, { benchmark, previous: previousByKey?.[p.canonicalProductId || p.kode_produk] })
      const usable = stages.filter(s => s.key !== STAGE.GMV).length >= 2 && p.qualifiedTraffic > 0
      if (!usable) {
        skipped.push({ product: p, missing: missingFields(p), advice: 'Pastikan file import memuat klik unik, ATC users, dan pembeli.' })
        continue
      }
      const opp = opportunityOf(p, benchmark)
      const conf = dataConfidence(p)
      rows.push({ p, stages, opp, conf, weak: weakestStage(p, medians) })
    }
    // Total funnel gabungan: dijumlah dari cacah tiap produk. Exposure hanya
    // dijumlah dari produk yang punya nilainya (bukan disamarkan jadi nol).
    const totals = {}
    const add = (k, v) => { if (v != null) totals[k] = (totals[k] ?? 0) + v }
    for (const r of rows) {
      add('impressions', r.p.impressions ?? r.p.metrics?.impressions)
      add('uniqueViewers', r.p.uniqueViewers ?? r.p.metrics?.uniqueViewers)
      add('qualifiedTraffic', r.p.qualifiedTraffic)
      add('atcUsers', r.p.atcRate != null && r.p.qualifiedTraffic != null
        ? Math.round(r.p.qualifiedTraffic * (r.p.atcRate / 100)) : r.p.metrics?.atcUsers)
      add('buyers', r.p.buyers ?? r.p.metrics?.buyers)
      add('orders', r.p.orders ?? r.p.metrics?.orders)
      add('gmv', r.p.gmv ?? r.p.metrics?.gmv)
    }
    return { rows, skipped, totals }
  }, [products, benchmark, previousByKey, medians])

  const sorted = useMemo(() => {
    const arr = [...rows]
    const n = v => (v == null ? -1 : v)
    switch (sort) {
      case 'leak': return arr.sort((a, b) => n(b.weak ? b.weak.mid - b.weak.value : null) - n(a.weak ? a.weak.mid - a.weak.value : null))
      case 'traffic': return arr.sort((a, b) => n(b.p.qualifiedTraffic) - n(a.p.qualifiedTraffic))
      case 'gap': return arr.sort((a, b) => n(b.opp.conversionGap) - n(a.opp.conversionGap))
      case 'gmv': return arr.sort((a, b) => n(b.p.gmv) - n(a.p.gmv))
      default:
        // Potensi rupiah dulu; kalau tak bisa dihitung, jatuh ke traffic,
        // lalu conversion gap, lalu GMV berjalan.
        return arr.sort((a, b) =>
          n(b.opp.potentialGmv) - n(a.opp.potentialGmv) ||
          n(b.p.qualifiedTraffic) - n(a.p.qualifiedTraffic) ||
          n(b.opp.conversionGap) - n(a.opp.conversionGap) ||
          n(b.p.gmv) - n(a.p.gmv))
    }
  }, [rows, sort])

  if (!rows.length) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
        <Filter className="w-7 h-7 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Data periode ini belum cukup untuk membentuk corong.</p>
        <p className="text-xs text-ink-faint mt-1 max-w-md mx-auto">
          Corong butuh minimal dua tahap terisi (klik dan pembeli) serta traffic lebih dari nol.
          {skipped.length > 0 && ' Klik di bawah untuk melihat produk yang dilewati.'}
        </p>
        {skipped.length > 0 && (
          <button onClick={() => setShowSkipped(true)} className="mt-3 text-xs font-semibold text-blue-400 hover:underline">
            {skipped.length} produk tidak dianalisis
          </button>
        )}
        {showSkipped && <SkippedDrawer items={skipped} onClose={() => setShowSkipped(false)} />}
      </div>
    )
  }

  const aggregate = funnelSections({
    qualifiedTraffic: totals.qualifiedTraffic ?? totals[STAGE.CLICK] ?? null,
    atcRate: (totals.qualifiedTraffic ?? totals[STAGE.CLICK]) > 0
      ? ((totals.atcUsers ?? totals[STAGE.ATC] ?? 0) / (totals.qualifiedTraffic ?? totals[STAGE.CLICK])) * 100 : null,
    buyers: totals.buyers ?? totals[STAGE.BUYER] ?? null,
    orders: totals.orders ?? null,
    gmv: totals.gmv ?? totals[STAGE.GMV] ?? null,
    impressions: totals.impressions ?? totals[STAGE.IMPRESSION] ?? null,
    uniqueViewers: totals.uniqueViewers ?? null,
    platforms: [],
  })

  return (
    <div className="space-y-4">
      {/* Corong gabungan — lebar penuh, tak lagi kartu sempit */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-ink-strong">Corong keseluruhan</p>
            <p className="text-[11px] text-ink-faint">{rows.length} produk dianalisis · nilai dijumlah dari cacah tiap produk</p>
          </div>
          {skipped.length > 0 && (
            <button onClick={() => setShowSkipped(true)}
              className="text-[11px] font-semibold text-amber-300 hover:underline flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />{skipped.length} produk tidak dianalisis
            </button>
          )}
        </div>
        <FunnelSections sections={aggregate} />
      </div>

      {/* Corong per produk */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line/8 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-ink-strong">Corong per produk</p>
            <p className="text-[11px] text-ink-faint">
              Diurutkan berdasarkan potensi rupiah, bukan persentase kebocoran — produk kecil tak naik ke atas hanya karena CR-nya 0%.
            </p>
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="bg-fill/5 border border-line/10 rounded-lg px-2 py-1.5 text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-blue-600">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="divide-y divide-line/8">
          {sorted.map(({ p, opp, conf, weak }) => {
            const key = p.canonicalProductId || p.kode_produk
            const open = openId === key
            return (
              <div key={key} className="px-4 py-3">
                <button onClick={() => setOpenId(open ? null : key)} className="w-full flex items-center gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink truncate" title={p.nama_produk}>{p.shortName || p.nama_produk}</p>
                    <p className="text-[11px] text-ink-faint truncate">
                      {weak && weak.behindPp > 0
                        ? <>tahap terlemah: <span className="text-amber-300">{weak.label}</span> · {ppTxt(-weak.behindPp)} vs median</>
                        : 'semua tahap setara atau di atas median'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] text-ink-faint leading-none mb-0.5">Potensi GMV</p>
                    <span className="text-[13px] font-semibold text-ink-strong tabular-nums">
                      {opp.potentialGmv == null ? '—' : fmtIDR(Math.round(opp.potentialGmv))}
                    </span>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                    conf.level === 'high' ? 'bg-green-500/12 text-green-300'
                      : conf.level === 'medium' ? 'bg-amber-500/12 text-amber-300' : 'bg-gray-600/20 text-gray-400'
                  }`} title={conf.reasons.join(' · ') || 'data lengkap'}>
                    {conf.level === 'high' ? 'yakin tinggi' : conf.level === 'medium' ? 'yakin sedang' : 'yakin rendah'}
                  </span>
                </button>
                {open && (
                  <div className="mt-3 rounded-xl border border-line/10 bg-fill/5 px-3 py-2">
                    <FunnelSections sections={funnelSections(p, {})} compact />
                    <div className="py-2 mt-1 border-t border-line/8 flex items-center gap-3 flex-wrap">
                      <span className="text-[11px] text-ink-faint">
                        Gap konversi {opp.conversionGap == null ? '—' : `${opp.conversionGap.toFixed(2)} pp`} ·
                        potensi {opp.potentialOrders == null ? '—' : `${Math.round(opp.potentialOrders)} pesanan`} ·
                        AOV {opp.aov == null ? '—' : fmtIDR(Math.round(opp.aov))}
                      </span>
                      {opp.reason && <span className="text-[11px] text-amber-300">{opp.reason}</span>}
                      {onOpenProduct && (
                        <button onClick={() => onOpenProduct(p)} className="ml-auto text-[11px] font-semibold text-blue-400 hover:underline">
                          Buka detail produk
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="px-4 py-2.5 text-[11px] text-ink-muted border-t border-line/8 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Selisih antar-rate ditulis dalam percentage point (pp). Nilai bertanda "estimasi" tidak berasal langsung dari file import.
        </p>
      </div>

      {showSkipped && <SkippedDrawer items={skipped} onClose={() => setShowSkipped(false)} />}
    </div>
  )
}
