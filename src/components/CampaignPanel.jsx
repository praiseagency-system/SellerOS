import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Megaphone, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, Search, Package,
  ArrowRight, CalendarRange, AlertTriangle,
} from 'lucide-react'
import { listCampaigns, saveCampaign, deleteCampaign } from '../data/campaigns'
import { computeCalc, productStatus } from '../utils/calc'

const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
function marginCls(m) {
  if (m == null || isNaN(m)) return 'text-ink-faint'
  return m >= 30 ? 'text-green-400' : m >= 20 ? 'text-yellow-400' : 'text-red-400'
}
function fmtDate(d) {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dateRange(c) {
  const a = fmtDate(c.startDate), b = fmtDate(c.endDate)
  if (a && b) return `${a} – ${b}`
  if (a) return `mulai ${a}`
  if (b) return `s/d ${b}`
  return 'tanpa tanggal'
}

// Proyeksi satu produk pada harga campaign-nya.
function projectProduct(p) {
  const normal = p.calc || computeCalc(p.state || {})
  const campaignPrice = +p.state?.jualCampaign || 0
  const camp = campaignPrice ? computeCalc({ ...(p.state || {}), jual: campaignPrice }) : null
  return {
    hasCampaignPrice: !!campaignPrice,
    campaignPrice,
    normalMargin: normal?.marginNoAd ?? null,
    campMargin: camp?.marginNoAd ?? null,
    campProfit: camp?.profitNoAd ?? null,
  }
}

export default function CampaignPanel({ products }) {
  const [campaigns, setCampaigns] = useState([])
  const [editing, setEditing]   = useState(null)  // campaign / {} (baru) / null (tutup)
  const [expanded, setExpanded] = useState(null)
  const [loadErr, setLoadErr]   = useState(false)

  const reload = useCallback(async () => {
    try { setCampaigns(await listCampaigns()); setLoadErr(false) }
    catch (e) { console.error(e); setLoadErr(true) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])), [products]
  )

  async function handleSave(form) {
    try { await saveCampaign(form); setEditing(null); await reload() }
    catch (e) { console.error(e); alert('Gagal menyimpan campaign.') }
  }
  async function handleDelete(id) {
    if (!confirm('Hapus campaign ini?')) return
    try { await deleteCampaign(id); await reload() }
    catch (e) { console.error(e); alert('Gagal menghapus campaign.') }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm text-ink-muted">
          {campaigns.length} campaign · proyeksi margin di harga campaign tiap produk
        </p>
        <button onClick={() => setEditing({})}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Campaign Baru
        </button>
      </div>

      {loadErr && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
          Tabel <code>campaigns</code> belum tersedia. Jalankan migrasi <code>0008_campaigns.sql</code> di Supabase → SQL Editor terlebih dahulu.
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-surface border border-line/8 rounded-2xl flex flex-col items-center justify-center text-center p-12 min-h-[240px]">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-ink">Belum ada campaign</p>
          <p className="text-xs text-ink-faint mt-1 max-w-[300px]">
            Buat event campaign (mis. 6.6, Payday Sale), pilih produk yang ikut, lalu lihat proyeksi margin di harga campaign masing-masing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <CampaignCard key={c.id} c={c} productMap={productMap}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(x => x === c.id ? null : c.id)}
              onEdit={() => setEditing(c)}
              onDelete={() => handleDelete(c.id)} />
          ))}
        </div>
      )}

      {editing && (
        <CampaignModal initial={editing} products={products}
          onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function CampaignCard({ c, productMap, expanded, onToggle, onEdit, onDelete }) {
  const linked = c.productIds.map(id => productMap[id]).filter(Boolean)
  const missing = c.productIds.length - linked.length
  const Chevron = expanded ? ChevronDown : ChevronRight

  // Agregat proyeksi
  const agg = useMemo(() => {
    const proj = linked.map(projectProduct)
    const withPrice = proj.filter(p => p.hasCampaignPrice)
    const noPrice = proj.length - withPrice.length
    const losing = withPrice.filter(p => p.campMargin != null && p.campMargin < 0).length
    const thin = withPrice.filter(p => p.campMargin != null && p.campMargin >= 0 && p.campMargin < 20).length
    const avgMargin = withPrice.length
      ? withPrice.reduce((s, p) => s + (p.campMargin || 0), 0) / withPrice.length
      : null
    return { total: proj.length, withPrice: withPrice.length, noPrice, losing, thin, avgMargin }
  }, [linked])

  return (
    <div className="bg-surface border border-line/8 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Chevron className="w-4 h-4 text-ink-faint flex-shrink-0" />
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-4 h-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-strong truncate">{c.name}</p>
            <p className="text-[11px] text-ink-faint truncate flex items-center gap-1">
              <CalendarRange className="w-3 h-3" />{dateRange(c)} · {c.productIds.length} produk
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          {agg.avgMargin != null && (
            <span className={`text-xs font-semibold tabular-nums ${marginCls(agg.avgMargin)}`}>
              ~{agg.avgMargin.toFixed(0)}%
            </span>
          )}
          {(agg.losing > 0 || agg.noPrice > 0) && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-500/10 rounded-lg px-1.5 py-1">
              <AlertTriangle className="w-3 h-3" />{agg.losing > 0 ? `${agg.losing} rugi` : `${agg.noPrice} no harga`}
            </span>
          )}
          <button title="Edit" onClick={onEdit}
            className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/8 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button title="Hapus" onClick={onDelete}
            className="p-1.5 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line/8">
          {/* Agregat */}
          <div className="grid grid-cols-4 gap-px bg-line/8">
            <Stat label="Produk" value={agg.total} />
            <Stat label="Avg Margin" value={agg.avgMargin != null ? `${agg.avgMargin.toFixed(0)}%` : '—'} cls={marginCls(agg.avgMargin)} />
            <Stat label="Rugi" value={agg.losing} cls={agg.losing > 0 ? 'text-red-400' : 'text-ink-strong'} />
            <Stat label="Belum set harga" value={agg.noPrice} cls={agg.noPrice > 0 ? 'text-amber-300' : 'text-ink-strong'} />
          </div>

          {/* Per produk */}
          <div className="px-4 py-3 space-y-2">
            {linked.length === 0 ? (
              <p className="text-xs text-ink-faint py-2">Belum ada produk terkait. Klik edit untuk memilih produk.</p>
            ) : linked.map(p => {
              const pr = projectProduct(p)
              return (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  {p.image && <img src={p.image} alt="" className="w-7 h-7 rounded-md object-cover border border-line/10 flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-strong truncate text-[13px]">{p.name}</p>
                    <p className="text-[11px] text-ink-faint truncate">{PLATFORM_LABEL[p.platform] || p.platform}</p>
                  </div>
                  {pr.hasCampaignPrice ? (
                    <>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-ink-faint leading-none mb-0.5">Harga Campaign</p>
                        <p className="text-[13px] font-semibold text-ink-strong tabular-nums">{fmt(pr.campaignPrice)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 w-[120px] justify-end">
                        <span className={`text-[12px] font-semibold tabular-nums ${marginCls(pr.normalMargin)}`}>{pr.normalMargin != null ? `${pr.normalMargin.toFixed(1)}%` : '—'}</span>
                        <ArrowRight className="w-3 h-3 text-ink-faint" />
                        <span className={`text-[12px] font-semibold tabular-nums ${marginCls(pr.campMargin)}`}>{pr.campMargin != null ? `${pr.campMargin.toFixed(1)}%` : '—'}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-amber-300 flex-shrink-0">Belum set Harga Campaign</span>
                  )}
                </div>
              )
            })}
            {missing > 0 && (
              <p className="text-[11px] text-ink-faint pt-1">{missing} produk terkait sudah dihapus.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, cls = 'text-ink-strong' }) {
  return (
    <div className="bg-surface px-3 py-2.5 text-center">
      <p className="text-[10px] text-ink-faint">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}

function CampaignModal({ initial, products, onSave, onClose }) {
  const [name, setName]         = useState(initial.name ?? '')
  const [startDate, setStart]   = useState(initial.startDate ?? '')
  const [endDate, setEnd]       = useState(initial.endDate ?? '')
  const [productIds, setIds]    = useState(initial.productIds ?? [])
  const [q, setQ]               = useState('')
  const [busy, setBusy]         = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? products.filter(p => p.name.toLowerCase().includes(s)) : products
  }, [products, q])

  function toggle(id) {
    setIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    await onSave({ id: initial.id, name: name.trim(), startDate, endDate, productIds })
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-surface w-full max-w-md rounded-2xl border border-line/10 shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <h2 className="font-semibold text-ink-strong">{initial.id ? 'Edit Campaign' : 'Campaign Baru'}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Nama Campaign <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="mis. Payday Sale Juli"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Tanggal Mulai</label>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)}
                className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Tanggal Selesai</label>
              <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} min={startDate || undefined}
                className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Produk yang Ikut <span className="text-ink-faint font-normal">({productIds.length} dipilih)</span>
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk..."
                className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
            </div>
            <div className="border border-line/10 rounded-xl divide-y divide-line/8 max-h-48 overflow-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-ink-faint text-center py-6 flex flex-col items-center gap-1">
                  <Package className="w-4 h-4" />{products.length === 0 ? 'Belum ada produk tersimpan' : 'Tidak ada produk cocok'}
                </p>
              ) : filtered.map(p => {
                const hasCamp = !!(+p.state?.jualCampaign || 0)
                return (
                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-fill/5">
                    <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => toggle(p.id)}
                      className="accent-blue-600 w-4 h-4 flex-shrink-0" />
                    {p.image && <img src={p.image} alt="" className="w-7 h-7 rounded-md object-cover border border-line/10 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink-strong truncate">{p.name}</p>
                      <p className="text-[11px] text-ink-faint truncate">
                        {PLATFORM_LABEL[p.platform] || p.platform}
                        {hasCamp ? ` · campaign ${fmt(+p.state.jualCampaign)}` : ' · belum set harga campaign'}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
            <p className="text-[11px] text-ink-faint mt-1.5">Harga campaign diatur per produk di Kalkulator (kolom "Harga Campaign").</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line/8 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink transition-colors">Batal</button>
          <button type="submit" disabled={!name.trim() || busy}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  )
}
