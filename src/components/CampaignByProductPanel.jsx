// Tab Produk → "Campaign per Produk".
//  - Rekap: tiap produk ikut campaign apa saja (harga, margin, approval,
//    pendaftaran), bisa dibuka matriks harga per varian.
//  - Tidak ikut campaign: produk × campaign berjalan / akan datang yang tidak
//    diikuti, beserta alasannya; alasan manual dicatat lewat SkipReasonModal.
// Semua logika data di utils/campaignByProduct.js.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, ChevronDown, Grid3x3, ExternalLink, Calculator, NotebookPen, RefreshCw, AlertTriangle } from 'lucide-react'
import { listCampaigns, setCampaignSkipped } from '../data/campaigns'
import { getProfile } from '../data/identity'
import { supabase } from '../lib/supabase'
import { fmt, fmtPct, marginCls, approvalStatusOfItem } from '../utils/campaignPricing'
import { periodsSummary } from '../utils/campaignPeriods'
import { REGISTRATION } from '../utils/campaignRegistration'
import { productVariations } from '../utils/product'
import {
  productCampaignRows, productGapRows, gapSummary, approvalLabel, isOpenCampaign,
  PHASE, GAP_REASON, GAP_REASON_ORDER, replaceProductSkips, removeProductSkips,
} from '../utils/campaignByProduct'
import { PlatformIcon } from './PlatformIcon'
import Modal from './Modal'
import SkipReasonModal from './SkipReasonModal'

const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }

const PHASE_CLS = {
  running:  'bg-green-500/12 text-green-300',
  upcoming: 'bg-blue-600/15 text-blue-300',
  ended:    'bg-fill/10 text-ink-muted',
}
const APPROVAL_CLS = {
  approved: 'bg-green-500/12 text-green-300',
  pending:  'bg-amber-500/12 text-amber-300',
  mixed:    'bg-amber-500/12 text-amber-300',
  rejected: 'bg-red-500/12 text-red-300',
}
const REASON_CLS = {
  rejected: { badge: 'bg-red-500/15 text-red-300',       dot: 'bg-red-400' },
  margin:   { badge: 'bg-orange-500/15 text-orange-300', dot: 'bg-orange-400' },
  noprice:  { badge: 'bg-amber-500/14 text-amber-300',   dot: 'bg-amber-300' },
  nohpp:    { badge: 'bg-yellow-200/12 text-yellow-200', dot: 'bg-yellow-200' },
  excluded: { badge: 'bg-violet-500/16 text-violet-300', dot: 'bg-violet-300' },
  manual:   { badge: 'bg-teal-500/15 text-teal-300',     dot: 'bg-teal-300' },
  none:     { badge: 'bg-fill/10 text-ink',              dot: 'bg-ink-muted' },
}
const REASON_HINT = {
  rejected: 'tercatat di approval',
  margin: 'deteksi otomatis',
  noprice: 'deteksi otomatis',
  nohpp: 'deteksi otomatis',
  excluded: 'tercatat di campaign',
  manual: 'alasan diisi admin',
  none: 'bisa ikut, belum ada alasan',
}

const range = (r, f) => (!r ? '—' : r.min === r.max ? f(r.min) : `${f(r.min)} – ${f(r.max)}`)
const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const campName = c => c.name || 'Tanpa Nama'

function Badge({ cls, children }) {
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${cls}`}>{children}</span>
}

function ProductThumb({ p }) {
  return p.image
    ? <img src={p.image} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover border border-line/10 flex-shrink-0" />
    : <div aria-hidden="true" className="w-10 h-10 rounded-lg bg-fill/5 border border-line/10 flex items-center justify-center text-xs font-semibold text-ink-muted flex-shrink-0">{initials(p.name)}</div>
}

function ProductHead({ p, meta }) {
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <ProductThumb p={p} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-fill/8 text-ink-muted flex-shrink-0">
            <PlatformIcon id={p.platform} className="w-3 h-3" />{PLATFORM_LABEL[p.platform] || p.platform}
          </span>
          <span className="text-sm font-semibold text-ink-strong truncate">{p.name}</span>
        </div>
        <p className="text-[11px] text-ink-muted truncate mt-0.5">{meta}</p>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, cls = 'text-ink-strong' }) {
  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
      <p className="text-[11px] text-ink-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}{sub && <span className="text-sm font-medium text-ink-muted"> {sub}</span>}</p>
    </div>
  )
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-0.5 p-0.5 bg-fill/5 border border-line/10 rounded-xl">
      {options.map(([v, l, n]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          className={`px-3 py-1.5 rounded-[10px] text-[13px] font-semibold transition-colors ${value === v ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'}`}>
          {l}{n != null && <span className={`ml-1.5 text-[11px] px-1.5 rounded ${value === v ? 'bg-white/20' : 'bg-orange-500/15 text-orange-300'}`}>{n}</span>}
        </button>
      ))}
    </div>
  )
}

function productMeta(p) {
  const n = productVariations(p).length
  return [n > 1 ? `${n} varian` : null, p.sku || productVariations(p)[0]?.sku || null].filter(Boolean).join(' · ') || 'tanpa SKU'
}

export default function CampaignByProductPanel({ products, onOpenProduct, onOpenCampaigns }) {
  const [campaigns, setCampaigns] = useState([])
  const [loadErr, setLoadErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actor, setActor] = useState({ email: '', name: '' })
  const [view, setView] = useState('rekap') // rekap | gap
  const [search, setSearch] = useState('')
  const [fMarket, setFMarket] = useState('all')
  const [phase, setPhase] = useState('all')
  const [hideEmpty, setHideEmpty] = useState(true)
  const [open, setOpen] = useState(() => new Set())
  const [reason, setReason] = useState('all')
  const [fCampaign, setFCampaign] = useState('all')
  const [matrixFor, setMatrixFor] = useState(null)
  const [skipFor, setSkipFor] = useState(null) // { product, campaignId }

  const reload = useCallback(async () => {
    try { setCampaigns(await listCampaigns()); setLoadErr(false) }
    catch (e) { console.error(e); setLoadErr(true) }
    finally { setLoading(false) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return
      const email = data?.user?.email || ''
      let name = ''
      try { name = (await getProfile(data?.user?.id))?.name || '' } catch { /* profil opsional */ }
      if (active) setActor({ email, name })
    })
    return () => { active = false }
  }, [])

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])

  // ── Rekap ────────────────────────────────────────────────────────────────
  const rekap = useMemo(() => products.map(p => ({ p, rows: productCampaignRows(p, campaigns, productMap) })), [products, campaigns, productMap])
  const gaps = useMemo(() => products.map(p => {
    const rows = productGapRows(p, campaigns, productMap)
    return { p, rows, sum: gapSummary(p, campaigns, rows) }
  }), [products, campaigns, productMap])
  const gapTotal = gaps.reduce((s, g) => s + g.rows.length, 0)

  const stats = useMemo(() => {
    const joined = rekap.filter(r => r.rows.length).length
    const runningCamps = campaigns.filter(c => rekap.some(r => r.rows.some(x => x.campaign.id === c.id && x.phase === 'running'))).length
    let pending = 0
    for (const r of rekap) for (const x of r.rows) if (x.phase !== 'ended') pending += x.approval.pending
    const noOpen = rekap.filter(r => !r.rows.some(x => x.phase !== 'ended')).length
    return { joined, runningCamps, pending, noOpen }
  }, [rekap, campaigns])

  const q = search.trim().toLowerCase()
  const matchProduct = p => !q || `${p.name} ${p.sku || ''} ${productVariations(p).map(v => v.sku || '').join(' ')}`.toLowerCase().includes(q)

  const rekapList = rekap
    .filter(({ p }) => fMarket === 'all' || p.platform === fMarket)
    .map(({ p, rows }) => {
      const hitByCampaign = q && rows.some(x => campName(x.campaign).toLowerCase().includes(q) || (x.campaign.parentCampaign || '').toLowerCase().includes(q))
      return { p, rows, all: rows, show: matchProduct(p) || hitByCampaign }
    })
    .filter(x => x.show)
    .map(x => ({ ...x, rows: x.rows.filter(r => phase === 'all' || r.phase === phase) }))
    .filter(x => !hideEmpty || x.all.length)

  const openCampaignOptions = useMemo(() => campaigns.filter(c => isOpenCampaign(c)), [campaigns])

  const gapList = gaps
    .filter(({ p }) => (fMarket === 'all' || p.platform === fMarket) && matchProduct(p))
    .map(g => ({ ...g, all: g.rows, rows: g.rows.filter(r => (reason === 'all' || r.reason === reason) && (fCampaign === 'all' || r.campaign.id === fCampaign)) }))
    .filter(g => g.rows.length)

  const reasonCounts = useMemo(() => {
    const m = Object.fromEntries(GAP_REASON_ORDER.map(k => [k, 0]))
    for (const g of gaps) for (const r of g.rows) {
      if (fCampaign !== 'all' && r.campaign.id !== fCampaign) continue
      m[r.reason]++
    }
    return m
  }, [gaps, fCampaign])

  function toggle(id) {
    setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  // ── Simpan alasan manual ─────────────────────────────────────────────────
  async function saveSkip({ product, campaignIds, entries, removeIds }) {
    try {
      for (const id of campaignIds) {
        const c = campaigns.find(x => x.id === id); if (!c) continue
        await setCampaignSkipped(c.id, replaceProductSkips(c.skipped, product.id, entries, c.items))
      }
      for (const id of removeIds || []) {
        const c = campaigns.find(x => x.id === id); if (!c) continue
        await setCampaignSkipped(c.id, removeProductSkips(c.skipped, product.id))
      }
      setSkipFor(null)
      await reload()
    } catch (e) {
      console.error(e)
      const m = e?.message || ''
      alert(/skipped|column|schema cache/i.test(m)
        ? 'Kolom "skipped" belum ada. Jalankan migrasi 0069_campaign_skipped.sql di Supabase → SQL Editor dulu.'
        : `Gagal menyimpan alasan.${m ? `\n\n${m}` : ''}`)
    }
  }

  if (loadErr) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 p-8 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-ink">Gagal memuat campaign.</p>
        <button onClick={reload} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300"><RefreshCw className="w-3.5 h-3.5" />Coba lagi</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Tampilan" value={view} onChange={setView}
          options={[['rekap', 'Rekap'], ['gap', 'Tidak ikut campaign', gapTotal]]} />
        <p className="text-[13px] text-ink-muted">
          {view === 'gap'
            ? <>Dibandingkan dengan <strong className="text-ink font-semibold">{openCampaignOptions.length} campaign</strong> yang sedang berjalan atau akan datang di marketplace yang sama</>
            : <>{campaigns.length} campaign · {products.length} produk</>}
        </p>
      </div>

      {view === 'rekap' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Produk ikut campaign" value={stats.joined} sub={`/ ${products.length} produk`} />
          <Stat label="Campaign berjalan hari ini" value={stats.runningCamps} cls="text-green-400" />
          <Stat label="Varian menunggu approval" value={stats.pending} cls="text-amber-300" />
          <Stat label="Produk tanpa campaign aktif" value={stats.noOpen} cls="text-orange-300" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Cari produk</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" aria-hidden="true" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={view === 'rekap' ? 'Cari nama produk / SKU / nama campaign...' : 'Cari nama produk / SKU...'}
            className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        </label>
        {view === 'gap' && (
          <label>
            <span className="sr-only">Campaign</span>
            <select value={fCampaign} onChange={e => setFCampaign(e.target.value)}
              className="bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-blue-600/40 max-w-[280px]">
              <option value="all" className="bg-surface">Semua campaign berjalan &amp; akan datang</option>
              {openCampaignOptions.map(c => (
                <option key={c.id} value={c.id} className="bg-surface">{campName(c)}{c.parentCampaign ? ` · ${c.parentCampaign}` : ''}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="sr-only">Marketplace</span>
          <select value={fMarket} onChange={e => setFMarket(e.target.value)}
            className="bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-blue-600/40">
            <option value="all" className="bg-surface">Semua Marketplace</option>
            <option value="tiktok" className="bg-surface">TikTok</option>
            <option value="shopee" className="bg-surface">Shopee</option>
          </select>
        </label>
        {view === 'rekap' && (
          <>
            <Segmented label="Status campaign" value={phase} onChange={setPhase}
              options={[['all', 'Semua'], ['running', PHASE.running.label], ['upcoming', PHASE.upcoming.label], ['ended', PHASE.ended.label]]} />
            <label className="flex items-center gap-2 px-1 py-2 text-[13px] text-ink-muted cursor-pointer">
              <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} className="accent-blue-600 w-4 h-4" />
              Sembunyikan produk tanpa campaign
            </label>
          </>
        )}
      </div>

      {view === 'gap' && (
        <div role="group" aria-label="Saring menurut alasan" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
          {['all', ...GAP_REASON_ORDER].map(k => {
            const on = reason === k
            const n = k === 'all' ? Object.values(reasonCounts).reduce((a, b) => a + b, 0) : reasonCounts[k]
            return (
              <button key={k} onClick={() => setReason(k)} aria-pressed={on}
                className={`text-left p-3 rounded-2xl border transition-colors ${on ? 'bg-blue-600/12 border-blue-500/70' : 'bg-surface border-line/10 hover:border-line/25'}`}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
                  <span aria-hidden="true" className={`w-2 h-2 rounded-sm ${k === 'all' ? 'bg-blue-400' : REASON_CLS[k].dot}`} />
                  {k === 'all' ? 'Semua alasan' : GAP_REASON[k].label}
                </span>
                <span className="block mt-1.5 text-xl font-bold text-ink-strong tabular-nums">{n}</span>
                <span className="block text-[10px] text-ink-faint">{k === 'all' ? 'produk × campaign' : REASON_HINT[k]}</span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : view === 'rekap' ? (
        <RekapList list={rekapList} open={open} onToggle={toggle} onMatrix={setMatrixFor} onOpenCampaigns={onOpenCampaigns}
          onSkip={p => { setView('gap'); setSearch(p.name) }} />
      ) : (
        <GapList list={gapList} onOpenProduct={onOpenProduct} onOpenCampaigns={onOpenCampaigns}
          onSkip={(product, campaignId) => setSkipFor({ product, campaignId })} />
      )}

      {matrixFor && <MatrixModal product={matrixFor} campaigns={campaigns} productMap={productMap} onClose={() => setMatrixFor(null)} />}
      {skipFor && (
        <SkipReasonModal
          product={skipFor.product}
          initialCampaignId={skipFor.campaignId}
          gapRows={gaps.find(g => g.p.id === skipFor.product.id)?.rows || []}
          campaigns={campaigns}
          actor={actor}
          onClose={() => setSkipFor(null)}
          onSave={saveSkip} />
      )}
    </div>
  )
}

// ── Rekap ──────────────────────────────────────────────────────────────────
function RekapList({ list, open, onToggle, onMatrix, onOpenCampaigns, onSkip }) {
  if (!list.length) {
    return <div className="bg-surface rounded-2xl border border-line/10 p-10 text-center text-sm text-ink-muted">Tidak ada produk yang cocok.</div>
  }
  return (
    <div className="flex flex-col gap-3">
      {list.map(({ p, rows, all }) => {
        const isOpen = open.has(p.id)
        const running = all.filter(r => r.phase === 'running').length
        const upcoming = all.filter(r => r.phase === 'upcoming').length
        const prices = all.filter(r => r.phase !== 'ended' && r.price).flatMap(r => [r.price.min, r.price.max])
        const priceR = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null
        return (
          <div key={p.id} className="bg-surface border border-line/10 rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => onToggle(p.id)} aria-expanded={isOpen}
              className="w-full flex flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-fill/[0.03] transition-colors">
              <ProductHead p={p} meta={productMeta(p)} />
              <div className="flex flex-wrap items-center gap-1.5">
                {all.length > 0 && <Badge cls="bg-fill/8 text-ink-muted">{all.length} campaign</Badge>}
                {running > 0 && <Badge cls={PHASE_CLS.running}>{running} berjalan</Badge>}
                {upcoming > 0 && <Badge cls={PHASE_CLS.upcoming}>{upcoming} akan datang</Badge>}
                {!all.length && <Badge cls="bg-amber-500/12 text-amber-300">Belum ikut campaign</Badge>}
              </div>
              <div className="text-right min-w-[150px]">
                <p className="text-[11px] text-ink-muted">Harga campaign aktif</p>
                <p className="text-[13px] font-semibold text-ink tabular-nums">{range(priceR, fmt)}</p>
              </div>
              <ChevronDown aria-hidden="true" className={`w-4 h-4 text-ink-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="border-t border-line/8 px-4 pb-4">
                {rows.length ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[920px] text-[13px]">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-ink-muted">
                            <th className="py-3 px-2 font-semibold">Campaign</th>
                            <th className="py-3 px-2 font-semibold">Periode</th>
                            <th className="py-3 px-2 font-semibold">Status</th>
                            <th className="py-3 px-2 font-semibold">Varian ikut</th>
                            <th className="py-3 px-2 font-semibold text-right">Harga campaign</th>
                            <th className="py-3 px-2 font-semibold text-right">Margin</th>
                            <th className="py-3 px-2 font-semibold">Approval</th>
                            <th className="py-3 px-2 font-semibold">Pendaftaran</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => {
                            const ap = approvalLabel(r.approval)
                            const reg = REGISTRATION[r.registration]
                            return (
                              <tr key={r.campaign.id} className="border-t border-line/6 align-top">
                                <td className="py-3 px-2 max-w-[280px]">
                                  <p className="font-semibold text-ink">{campName(r.campaign)}</p>
                                  {r.campaign.parentCampaign && <p className="text-[11px] text-ink-muted mt-0.5">{r.campaign.parentCampaign}</p>}
                                </td>
                                <td className="py-3 px-2 text-ink-muted whitespace-nowrap">{periodsSummary(r.campaign) || '—'}</td>
                                <td className="py-3 px-2"><Badge cls={PHASE_CLS[r.phase]}>{r.status.label}</Badge></td>
                                <td className="py-3 px-2 text-ink-muted">{r.variantsIn} / {r.variantsTotal}</td>
                                <td className="py-3 px-2 text-right font-semibold text-ink tabular-nums whitespace-nowrap">{range(r.price, fmt)}</td>
                                <td className={`py-3 px-2 text-right font-semibold tabular-nums whitespace-nowrap ${r.margin ? marginCls(r.margin.min) : 'text-ink-faint'}`}
                                  title={r.margin ? `Margin terburuk (termasuk beban voucher co-funded). Target ${r.target}%` : 'HPP belum diisi'}>
                                  {range(r.margin, fmtPct)}
                                </td>
                                <td className="py-3 px-2"><Badge cls={APPROVAL_CLS[ap.key]}>{ap.label}</Badge></td>
                                <td className="py-3 px-2"><Badge cls={reg.cls}>{reg.short}</Badge></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                      <p className="text-[11px] text-ink-muted">Harga &amp; margin = rentang varian yang ikut. Margin memakai beban voucher co-funded bila ada.</p>
                      <div className="flex gap-2">
                        <button onClick={onOpenCampaigns} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/15 text-ink-muted hover:text-ink">
                          <ExternalLink className="w-3.5 h-3.5" />Buka halaman Campaign
                        </button>
                        <button onClick={() => onMatrix(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700">
                          <Grid3x3 className="w-3.5 h-3.5" />Matriks harga per varian
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <p className="text-[13px] text-ink-muted">{all.length ? 'Tidak ada campaign dengan status ini untuk produk ini.' : 'Produk ini belum masuk campaign mana pun.'}</p>
                    <button onClick={() => onSkip(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/15 text-ink-muted hover:text-ink">
                      Lihat alasannya
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tidak ikut campaign ────────────────────────────────────────────────────
function GapAction({ row, product, onOpenProduct, onOpenCampaigns, onSkip }) {
  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap'
  if (row.reason === 'none' || row.reason === 'manual') {
    return (
      <button onClick={() => onSkip(product, row.campaign.id)} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
        <NotebookPen className="w-3.5 h-3.5" />{row.reason === 'manual' ? 'Ubah alasan' : 'Catat alasan'}
      </button>
    )
  }
  if (row.reason === 'margin' || row.reason === 'noprice' || row.reason === 'nohpp') {
    const label = row.reason === 'margin' ? 'Lihat kalkulasi' : row.reason === 'noprice' ? 'Isi harga campaign' : 'Isi HPP'
    return (
      <button onClick={() => onOpenProduct?.(product)} className={`${btn} border border-line/15 text-ink-muted hover:text-ink`}>
        <Calculator className="w-3.5 h-3.5" />{label}
      </button>
    )
  }
  return (
    <button onClick={onOpenCampaigns} className={`${btn} border border-line/15 text-ink-muted hover:text-ink`}>
      <ExternalLink className="w-3.5 h-3.5" />Buka campaign
    </button>
  )
}

function GapList({ list, onOpenProduct, onOpenCampaigns, onSkip }) {
  if (!list.length) {
    return <div className="bg-surface rounded-2xl border border-line/10 p-10 text-center text-sm text-ink-muted">Tidak ada produk yang terlewat dengan filter ini.</div>
  }
  return (
    <div className="flex flex-col gap-3">
      {list.map(({ p, rows, sum }) => (
        <div key={p.id} className="bg-surface border border-line/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 border-b border-line/8">
            <ProductHead p={p} meta={`${productMeta(p)}${sum.joinedAny ? ' · ikut sebagian' : ' · tidak ikut satu pun campaign aktif'}`} />
            <Badge cls="bg-fill/8 text-ink">{sum.missed} dari {sum.open} campaign terlewat</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-muted">
                  <th className="py-2.5 pl-4 pr-2 font-semibold w-[26%]">Campaign yang tidak diikuti</th>
                  <th className="py-2.5 px-2 font-semibold">Varian</th>
                  <th className="py-2.5 px-2 font-semibold">Alasan</th>
                  <th className="py-2.5 px-2 font-semibold w-[32%]">Detail</th>
                  <th className="py-2.5 px-2 font-semibold">Sumber</th>
                  <th className="py-2.5 pl-2 pr-4"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className="border-t border-line/6 align-top">
                    <td className="py-3 pl-4 pr-2">
                      <p className="font-semibold text-ink">{campName(r.campaign)}</p>
                      <p className="text-[11px] text-ink-muted mt-1">
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-px rounded mr-1 ${PHASE_CLS[r.phase]}`}>{r.status.label}</span>
                        {periodsSummary(r.campaign)}{r.campaign.parentCampaign ? ` · ${r.campaign.parentCampaign}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-2 text-ink-muted">{r.variantText}</td>
                    <td className="py-3 px-2"><Badge cls={REASON_CLS[r.reason].badge}>{GAP_REASON[r.reason].label}</Badge></td>
                    <td className="py-3 px-2 text-ink-muted leading-relaxed">{r.detail}</td>
                    <td className="py-3 px-2 text-[11px] text-ink-muted whitespace-nowrap">{r.source}</td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <GapAction row={r} product={p} onOpenProduct={onOpenProduct} onOpenCampaigns={onOpenCampaigns} onSkip={onSkip} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Matriks harga per varian ───────────────────────────────────────────────
function MatrixModal({ product, campaigns, productMap, onClose }) {
  const rows = productCampaignRows(product, campaigns, productMap)
  const vars = productVariations(product)
  const cell = (r, idx) => {
    const it = r.items.find(x => x.varIdx === idx)
    if (!it) return null
    const single = productCampaignRows(product, [{ ...r.campaign, items: [it] }], productMap)[0]
    return { price: +it.price || 0, margin: single?.margin?.min ?? null, status: approvalStatusOfItem(r.campaign.approvals, it) }
  }
  const APPROVAL_TXT = { approved: ['Disetujui', 'text-green-300'], pending: ['Menunggu', 'text-amber-300'], rejected: ['Ditolak', 'text-red-300'] }
  return (
    <Modal title={`Harga campaign per varian · ${product.name}`} subtitle={`${vars.length} varian · ${rows.length} campaign`} onClose={onClose} maxWidth="max-w-6xl">
      <div className="p-5">
        {!rows.length ? <p className="text-sm text-ink-muted">Produk ini belum ikut campaign.</p> : (
          <div className="overflow-x-auto">
            <table className="text-[13px] w-full">
              <thead>
                <tr className="text-left align-bottom">
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wide text-ink-muted font-semibold">Varian</th>
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wide text-ink-muted font-semibold text-right">Normal</th>
                  <th className="py-2 px-2 text-[10px] uppercase tracking-wide text-ink-muted font-semibold text-right border-r border-line/8">HPP</th>
                  {rows.map(r => (
                    <th key={r.campaign.id} className="py-2 px-2 text-right min-w-[120px]">
                      <Badge cls={PHASE_CLS[r.phase]}>{r.status.label}</Badge>
                      <p className="mt-1.5 text-xs font-semibold text-ink whitespace-nowrap">{campName(r.campaign)}</p>
                      <p className="text-[11px] font-normal text-ink-muted whitespace-nowrap">{periodsSummary(r.campaign)}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vars.map((v, idx) => (
                  <tr key={idx} className="border-t border-line/6 align-top">
                    <td className="py-3 px-2">
                      <p className="font-semibold text-ink">{v.name || product.name}</p>
                      <p className="text-[11px] text-ink-muted">{v.sku || '—'}</p>
                    </td>
                    <td className="py-3 px-2 text-right text-ink-muted tabular-nums">{fmt(+v.jual || +v.hargaCoret || null)}</td>
                    <td className="py-3 px-2 text-right text-ink-muted tabular-nums border-r border-line/8">{+v.hpp ? fmt(+v.hpp) : '—'}</td>
                    {rows.map(r => {
                      const c = cell(r, idx)
                      if (!c) return <td key={r.campaign.id} className="py-3 px-2 text-right text-ink-faint">—<p className="text-[11px]">tidak ikut</p></td>
                      const [aTxt, aCls] = APPROVAL_TXT[c.status] || APPROVAL_TXT.pending
                      return (
                        <td key={r.campaign.id} className="py-3 px-2 text-right tabular-nums">
                          <p className="font-semibold text-ink">{fmt(c.price)}</p>
                          <p className={`text-xs font-semibold ${marginCls(c.margin)}`}>{c.margin == null ? 'margin —' : `margin ${fmtPct(c.margin)}`}</p>
                          <p className={`text-[11px] ${aCls}`}>{aTxt}</p>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-muted mt-3">Margin = margin terburuk setelah biaya platform dan beban voucher penjual (co-funded). — = varian tidak ikut campaign itu.</p>
      </div>
    </Modal>
  )
}
