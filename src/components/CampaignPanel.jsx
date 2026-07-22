import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Megaphone, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, Search, Package,
  CalendarRange, AlertTriangle, ArrowLeft, Save, FileText,
} from 'lucide-react'
import Modal from './Modal'
import { listCampaigns, saveCampaign, deleteCampaign } from '../data/campaigns'
import { loadStore } from '../data/storeDataset'
import { computeCalc } from '../utils/calc'
import { productFees, productVariations } from '../utils/product'

const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
const PLATFORM_CLS = {
  tiktok: 'bg-gray-700/60 text-gray-300',
  shopee: 'bg-orange-500/15 text-orange-300',
}
const fmt = n => (n == null || isNaN(n)) ? '—' : 'Rp' + Math.round(n).toLocaleString('id-ID')
function marginCls(m) {
  if (m == null || isNaN(m)) return 'text-ink-faint'
  return m >= 30 ? 'text-green-400' : m >= 20 ? 'text-yellow-400' : 'text-red-400'
}
function fmtDate(d) {
  if (!d) return null
  const dt = new Date(d); if (isNaN(dt)) return d
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dateRange(c) {
  const a = fmtDate(c.startDate), b = fmtDate(c.endDate)
  if (a && b) return `${a} – ${b}`
  if (a) return `mulai ${a}`
  if (b) return `s/d ${b}`
  return 'tanpa tanggal'
}

// Margin sebuah item (varian pada harga campaign) berdasarkan produknya.
// sellerPerUnit: beban voucher co-funded yang ditanggung penjual per unit (Rp),
// dipotong dari harga jual seperti field `voucher` di kalkulator. Default 0.
function itemMargin(item, productMap, sellerPerUnit = 0) {
  const p = productMap[item.productId]
  if (!p) return null
  const fees = productFees(p)
  const v = productVariations(p)[item.varIdx]
  if (!v) return null
  const calc = computeCalc({ ...fees, hpp: v.hpp, jual: item.price, voucher: String(+sellerPerUnit || 0) })
  return calc ? calc.marginNoAd : null
}

// Efek satu voucher pada satu varian di harga campaign tertentu.
// Asumsi: customer mengisi cart dengan varian ini sampai lolos min. pesanan,
// sehingga menghasilkan "pcs untuk dapat voucher" + beban penjual per unit.
function voucherEffect(voucher, price) {
  const p = +price || 0
  if (p <= 0) return null
  const discPct   = +voucher.discPct  || 0
  const maxDisc   = +voucher.maxDisc   || 0
  const minOrder  = +voucher.minOrder  || 0
  const sellerPct = +voucher.sellerPct || 0
  const sellerCap = +voucher.sellerCap || 0
  const pcs = minOrder > 0 ? Math.max(1, Math.ceil(minOrder / p)) : 1
  const orderValue = pcs * p
  let discount = orderValue * discPct / 100
  if (maxDisc > 0) discount = Math.min(discount, maxDisc)
  let sellerCost = discount * sellerPct / 100
  if (sellerCap > 0) sellerCost = Math.min(sellerCost, sellerCap)
  const sellerPerUnit = pcs > 0 ? sellerCost / pcs : 0
  const custPerUnit = p - discount / pcs
  return { pcs, orderValue, discount, sellerCost, sellerPerUnit, custPerUnit }
}

// Daftar tier voucher valid dari sebuah voucherConfig (aman untuk campaign lama).
function voucherList(voucherConfig) {
  const vs = voucherConfig && Array.isArray(voucherConfig.vouchers) ? voucherConfig.vouchers : []
  return vs.filter(v => (+v.discPct || 0) > 0)
}
function fmtPct(n) { return (n == null || isNaN(n)) ? '—' : `${(+n).toFixed(0)}%` }
function campaignAgg(items, productMap) {
  const margins = items.map(it => itemMargin(it, productMap)).filter(m => m != null)
  const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null
  const losing = margins.filter(m => m < 0).length
  const noPrice = items.filter(it => !(+it.price > 0)).length
  return { count: items.length, products: new Set(items.map(it => it.productId)).size, avg, losing, noPrice }
}

// Monitoring: cocokkan item (varian by SKU) ke pesanan Performa Toko di dalam
// window tanggal campaign → aktual (unit, GMV, harga aktual, margin aktual).
function monitorCampaign(campaign, storeLines, productMap) {
  const hasWindow = !!(campaign.startDate || campaign.endDate)
  const start = campaign.startDate ? new Date(campaign.startDate + 'T00:00:00').getTime() : -Infinity
  const end = campaign.endDate ? new Date(campaign.endDate + 'T23:59:59').getTime() : Infinity
  const inWin = storeLines.filter(l => l.ok && l.t >= start && l.t <= end)
  const bySku = new Map()   // Seller SKU (k) → lines
  const byKid = new Map()   // TikTok platform SKU ID (kid) → lines
  for (const l of inWin) {
    const k = (l.k || '').toLowerCase().trim()
    if (k) { if (!bySku.has(k)) bySku.set(k, []); bySku.get(k).push(l) }
    const kid = (l.kid || '').toLowerCase().trim()
    if (kid) { if (!byKid.has(kid)) byKid.set(kid, []); byKid.get(kid).push(l) }
  }
  const items = (campaign.items || []).map(it => {
    // Match: try platform SKU ID (variationId from catalog) first — more precise,
    // avoids false matches when two platforms share the same Seller SKU string.
    const p = productMap[it.productId]
    const variation = p ? productVariations(p)[it.varIdx] : null
    const varId = (variation?.variationId || '').toLowerCase().trim()
    const lines = (varId && byKid.get(varId)) || bySku.get((it.sku || '').toLowerCase().trim()) || []
    const units = lines.reduce((s, l) => s + l.q, 0)
    const gmv = lines.reduce((s, l) => s + l.r, 0)
    const actualPrice = units ? gmv / units : null
    let actMargin = null, estProfit = null
    if (p && actualPrice) {
      const fees = productFees(p); const v = variation
      if (v) {
        const ac = computeCalc({ ...fees, hpp: v.hpp, jual: String(Math.round(actualPrice)) })
        actMargin = ac?.marginNoAd ?? null
        estProfit = ac ? ac.profitNoAd * units : null
      }
    }
    return { ...it, units, gmv, actualPrice, actMargin, estProfit, sold: units > 0 }
  })
  return {
    hasWindow, hasStore: storeLines.length > 0,
    ordersInWindow: new Set(inWin.map(l => l.o)).size,
    items,
    totalUnits: items.reduce((s, r) => s + r.units, 0),
    totalGmv: items.reduce((s, r) => s + r.gmv, 0),
    totalProfit: items.reduce((s, r) => s + (r.estProfit || 0), 0),
    soldSku: items.filter(r => r.sold).length,
  }
}

export default function CampaignPanel({ products }) {
  const [campaigns, setCampaigns] = useState([])
  const [editing, setEditing]   = useState(null)  // campaign / {} (baru) / null
  const [expanded, setExpanded] = useState(null)
  const [loadErr, setLoadErr]   = useState(false)
  const [storeLines, setStoreLines] = useState([])

  const reload = useCallback(async () => {
    try { setCampaigns(await listCampaigns()); setLoadErr(false) }
    catch (e) { console.error(e); setLoadErr(true) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])
  // Data Performa Toko (untuk monitoring aktual).
  useEffect(() => {
    let active = true
    loadStore().then(s => { if (active) setStoreLines(s?.lines || []) }).catch(() => {})
    return () => { active = false }
  }, [])

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])

  async function handleSave(form) {
    try { await saveCampaign(form); setEditing(null); await reload() }
    catch (e) { console.error(e); alert('Gagal menyimpan campaign.') }
  }
  async function handleDelete(id) {
    if (!confirm('Hapus campaign ini?')) return
    try { await deleteCampaign(id); await reload() }
    catch (e) { console.error(e); alert('Gagal menghapus campaign.') }
  }

  // Editor full-page menggantikan daftar saat membuat/mengedit.
  if (editing) {
    return <CampaignEditor initial={editing} products={products} productMap={productMap}
      onSave={handleSave} onClose={() => setEditing(null)} />
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm text-ink-muted">{campaigns.length} campaign · proyeksi margin di harga campaign per varian</p>
        <button onClick={() => setEditing({})}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Campaign Baru
        </button>
      </div>

      {loadErr && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
          Tabel/kolom campaign belum lengkap. Jalankan migrasi <code>0008_campaigns.sql</code> &amp; <code>0009_campaign_items.sql</code> di Supabase → SQL Editor.
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-line/10 shadow-sm flex flex-col items-center justify-center text-center p-12 min-h-[240px]">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-ink">Belum ada campaign</p>
          <p className="text-xs text-ink-faint mt-1 max-w-[300px]">
            Buat event campaign (mis. 6.6), pilih produk &amp; varian, atur harga campaign tiap varian, lihat proyeksi margin.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const agg = campaignAgg(c.items || [], productMap)
            const mon = monitorCampaign(c, storeLines, productMap)
            const open = expanded === c.id
            const Chevron = open ? ChevronDown : ChevronRight
            return (
              <div key={c.id} className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpanded(x => x === c.id ? null : c.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Chevron className="w-4 h-4 text-ink-faint flex-shrink-0" />
                    <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center flex-shrink-0">
                      <Megaphone className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-semibold text-ink-strong truncate">{c.name}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${PLATFORM_CLS[c.platform] || PLATFORM_CLS.tiktok}`}>
                          {PLATFORM_LABEL[c.platform] || c.platform}
                        </span>
                        {c.voucherConfig?.kind === 'cofunded' && voucherList(c.voucherConfig).length > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-blue-600/12 text-blue-300">
                            Co-funded · {voucherList(c.voucherConfig).length} voucher
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-faint truncate flex items-center gap-1">
                        <CalendarRange className="w-3 h-3" />{dateRange(c)} · {agg.products} produk · {agg.count} varian
                      </p>
                      {c.description && (
                        <p className="text-[11px] text-ink-faint truncate mt-0.5">{c.description}</p>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {agg.avg != null && <span className={`text-xs font-semibold tabular-nums ${marginCls(agg.avg)}`}>~{agg.avg.toFixed(0)}%</span>}
                    {(agg.losing > 0 || agg.noPrice > 0) && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-500/10 rounded-lg px-1.5 py-1">
                        <AlertTriangle className="w-3 h-3" />{agg.losing > 0 ? `${agg.losing} rugi` : `${agg.noPrice} no harga`}
                      </span>
                    )}
                    <button title="Edit" onClick={() => setEditing(c)} className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/8 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button title="Hapus" onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {open && (
                  <div className="border-t border-line/8 px-4 py-3 space-y-1.5">
                    {(c.items || []).length === 0 ? (
                      <p className="text-xs text-ink-faint py-1">Belum ada varian. Klik edit untuk menambah.</p>
                    ) : (c.items || []).map((it, i) => {
                      const m = itemMargin(it, productMap)
                      const gone = !productMap[it.productId]
                      const cvs = voucherList(c.voucherConfig)
                      return (
                        <div key={i}>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="text-ink-strong truncate text-[13px]">{it.name || '(varian)'}{gone && <span className="text-ink-faint"> · produk dihapus</span>}</p>
                              <p className="text-[11px] text-ink-faint truncate">{it.sku || 'tanpa SKU'}</p>
                            </div>
                            <span className="text-[13px] font-semibold text-ink-strong tabular-nums flex-shrink-0">{fmt(+it.price)}</span>
                            <span className={`text-[12px] font-semibold tabular-nums w-14 text-right flex-shrink-0 ${marginCls(m)}`}>{m != null ? `${m.toFixed(1)}%` : '—'}</span>
                          </div>
                          {cvs.length > 0 && <VoucherLines item={it} productMap={productMap} vouchers={cvs} kind={c.voucherConfig?.kind || 'normal'} />}
                        </div>
                      )
                    })}

                    {/* Monitoring: hasil aktual dari Performa Toko */}
                    {mon.hasWindow && (
                      <div className="mt-2 pt-2.5 border-t border-line/8">
                        <p className="text-xs font-semibold text-ink-muted mb-1.5">Hasil Aktual <span className="font-normal text-ink-faint">· dari Performa Toko, cocok by SKU</span></p>
                        {!mon.hasStore ? (
                          <p className="text-[11px] text-ink-faint">Belum ada data Performa Toko. Upload laporan pesanan yang mencakup window campaign.</p>
                        ) : mon.ordersInWindow === 0 ? (
                          <p className="text-[11px] text-ink-faint">Tidak ada pesanan di window {dateRange(c)} pada data yang ter-upload.</p>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted mb-2">
                              <span>Pesanan window: <b className="text-ink-strong">{mon.ordersInWindow}</b></span>
                              <span>Unit (produk campaign): <b className="text-ink-strong">{mon.totalUnits}</b></span>
                              <span>GMV: <b className="text-ink-strong">{fmt(mon.totalGmv)}</b></span>
                              <span>Est. profit: <b className={mon.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt(mon.totalProfit)}</b></span>
                            </div>
                            {mon.items.filter(r => r.sold).length === 0 ? (
                              <p className="text-[11px] text-ink-faint">Tidak ada SKU campaign yang cocok terjual di window ini.</p>
                            ) : mon.items.filter(r => r.sold).map((r, i) => (
                              <div key={i} className="flex items-center gap-3 text-sm">
                                <div className="min-w-0 flex-1">
                                  <p className="text-ink truncate text-[13px]">{r.name || r.sku}</p>
                                  <p className="text-[11px] text-ink-faint truncate">{r.units} terjual · harga aktual {fmt(r.actualPrice)}</p>
                                </div>
                                <span className="text-[10px] text-ink-faint flex-shrink-0">proyeksi {itemMargin(r, productMap) != null ? `${itemMargin(r, productMap).toFixed(0)}%` : '—'} →</span>
                                <span className={`text-[12px] font-semibold tabular-nums w-14 text-right flex-shrink-0 ${marginCls(r.actMargin)}`}>{r.actMargin != null ? `${r.actMargin.toFixed(1)}%` : '—'}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CampaignEditor({ initial, products, productMap, onSave, onClose }) {
  const [name, setName]           = useState(initial.name ?? '')
  const [platform, setPlatform]   = useState(initial.platform ?? 'tiktok')
  const [description, setDesc]    = useState(initial.description ?? '')
  const [startDate, setStart]     = useState(initial.startDate ?? '')
  const [endDate, setEnd]         = useState(initial.endDate ?? '')
  const [items, setItems]         = useState(initial.items ?? [])
  const [campaignType, setCampaignType] = useState(initial.voucherConfig?.kind ?? 'normal')
  const [vouchers, setVouchers]   = useState(() => {
    const vs = initial.voucherConfig?.vouchers
    return Array.isArray(vs) && vs.length ? vs.map(v => ({ ...v })) : []
  })
  const [showPicker, setShowPicker] = useState(false)
  const [busy, setBusy]           = useState(false)

  // Untuk mode Normal cukup satu voucher (diskon platform); pastikan ada slot 0.
  const normalVoucher = vouchers[0] ?? { discPct: '', maxDisc: '', minOrder: '' }
  function setVoucherField(i, field, val) {
    setVouchers(prev => {
      const next = prev.length ? prev.map(v => ({ ...v })) : [{ discPct: '', maxDisc: '', minOrder: '', sellerPct: '', sellerCap: '' }]
      while (next.length <= i) next.push({ discPct: '', maxDisc: '', minOrder: '', sellerPct: '', sellerCap: '' })
      next[i][field] = val
      return next
    })
  }
  function addVoucher() {
    setVouchers(prev => [...prev, { discPct: '', maxDisc: '', minOrder: '', sellerPct: '', sellerCap: '' }])
  }
  function removeVoucher(i) { setVouchers(prev => prev.filter((_, idx) => idx !== i)) }

  // Voucher aktif untuk preview per-varian (yang punya diskon > 0).
  const activeVouchers = useMemo(
    () => vouchers.filter(v => (+v.discPct || 0) > 0),
    [vouchers],
  )
  function buildVoucherConfig() {
    const kept = vouchers.filter(v => (+v.discPct || 0) > 0 || (+v.maxDisc || 0) > 0 || (+v.minOrder || 0) > 0)
    const norm = kept.map(v => ({
      discPct: v.discPct ?? '', maxDisc: v.maxDisc ?? '', minOrder: v.minOrder ?? '',
      sellerPct: campaignType === 'cofunded' ? (v.sellerPct ?? '') : '',
      sellerCap: campaignType === 'cofunded' ? (v.sellerCap ?? '') : '',
    }))
    return { kind: campaignType, vouchers: norm }
  }

  // Item dikelompokkan per produk (urut sesuai produk).
  const byProduct = useMemo(() => {
    const groups = new Map()
    for (const it of items) {
      if (!groups.has(it.productId)) groups.set(it.productId, [])
      groups.get(it.productId).push(it)
    }
    return [...groups.entries()]
  }, [items])

  const agg = useMemo(() => campaignAgg(items, productMap), [items, productMap])
  const enrolledIds = useMemo(() => new Set(items.map(it => it.productId)), [items])

  function addProduct(p) {
    const vars = productVariations(p)
    const add = vars.map((v, idx) => ({
      productId: p.id, varIdx: idx,
      sku: v.sku || '', name: v.name ? `${p.name} - ${v.name}` : p.name,
      price: String(+v.jualCampaign || +v.jual || ''),
    }))
    setItems(prev => [...prev.filter(it => it.productId !== p.id), ...add])
  }
  function removeProduct(productId) { setItems(prev => prev.filter(it => it.productId !== productId)) }
  function setPrice(productId, varIdx, price) {
    setItems(prev => prev.map(it => (it.productId === productId && it.varIdx === varIdx) ? { ...it, price } : it))
  }

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    await onSave({ id: initial.id, name: name.trim(), platform, description, startDate, endDate, items, voucherConfig: buildVoucherConfig() })
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      {/* Header editor */}
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={submit} disabled={!name.trim() || busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            <Save className="w-4 h-4" />{busy ? 'Menyimpan…' : (initial.id ? 'Perbarui' : 'Simpan')}
          </button>
        </div>
      </div>

      {/* Nama + platform + tanggal */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Nama Campaign <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="mis. Payday Sale Juli"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          </div>
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

        {/* Platform */}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Platform</label>
          <div className="flex gap-2">
            {[['tiktok', 'TikTok'], ['shopee', 'Shopee']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setPlatform(id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  platform === id
                    ? id === 'tiktok' ? 'bg-gray-700 text-white border-gray-600' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                    : 'border-line/10 text-ink-muted hover:border-line/20 hover:text-ink'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Deskripsi */}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            <FileText className="w-3.5 h-3.5 inline mr-1" />Deskripsi <span className="font-normal text-ink-faint">(opsional)</span>
          </label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={2}
            placeholder="mis. Diskon 30% + gratis ongkir, berlaku untuk produk tas & dompet, min. pembelian Rp50.000"
            className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50 resize-none" />
        </div>
      </div>

      {/* Jenis campaign + voucher */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Jenis Campaign</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ['normal',   'Campaign Normal', 'Tanpa biaya ditanggung bersama. Diskon ditanggung platform — margin penjual tak berubah.'],
              ['cofunded', 'Co-funded Voucher', 'Voucher berjenjang, biaya dibagi platform / penjual. Beban penjual dipotong dari margin.'],
            ].map(([id, label, desc]) => (
              <button key={id} type="button" onClick={() => setCampaignType(id)}
                className={`text-left px-4 py-3 rounded-xl border transition-all ${
                  campaignType === id
                    ? 'bg-blue-600/10 border-blue-500/40'
                    : 'border-line/10 hover:border-line/25'
                }`}>
                <p className={`text-[13px] font-semibold ${campaignType === id ? 'text-blue-300' : 'text-ink-strong'}`}>{label}</p>
                <p className="text-[11px] text-ink-faint mt-0.5 leading-snug">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {campaignType === 'normal' ? (
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Diskon platform ke customer <span className="font-normal text-ink-faint">(opsional — untuk melihat harga yang diterima customer)</span></label>
            <div className="flex flex-wrap items-end gap-3">
              <NumField label="Diskon %" suffix="%" value={normalVoucher.discPct} onChange={v => setVoucherField(0, 'discPct', v)} w="w-24" />
              <NumField label="Maks. potongan" prefix="Rp" value={normalVoucher.maxDisc} onChange={v => setVoucherField(0, 'maxDisc', v)} w="w-36" />
              <NumField label="Min. pesanan" prefix="Rp" value={normalVoucher.minOrder} onChange={v => setVoucherField(0, 'minOrder', v)} w="w-36" />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-ink-muted">Voucher ditanggung bersama <span className="font-normal text-ink-faint">· salin persis dari halaman campaign</span></label>
              <button type="button" onClick={addVoucher}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-line/15 text-ink-muted hover:text-ink hover:border-line/30 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Tambah Voucher
              </button>
            </div>
            {activeVouchers.length === 0 && vouchers.length === 0 && (
              <p className="text-[11px] text-ink-faint mb-2">Belum ada voucher. Klik "Tambah Voucher" lalu isi tiap tier (mis. Diskon 35% / 30% / 25%).</p>
            )}
            <div className="space-y-2">
              {vouchers.map((v, i) => {
                const sellerPct = +v.sellerPct || 0
                return (
                  <div key={i} className="rounded-xl border border-line/10 bg-fill/5 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-ink-muted">Voucher {i + 1}{(+v.discPct || 0) > 0 ? ` · Diskon ${(+v.discPct).toFixed(0)}%` : ''}</span>
                      <button type="button" onClick={() => removeVoucher(i)} className="text-ink-faint hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex flex-wrap items-end gap-2.5">
                      <NumField label="Diskon %" suffix="%" value={v.discPct} onChange={val => setVoucherField(i, 'discPct', val)} w="w-20" />
                      <NumField label="Maks. potongan" prefix="Rp" value={v.maxDisc} onChange={val => setVoucherField(i, 'maxDisc', val)} w="w-32" />
                      <NumField label="Min. pesanan" prefix="Rp" value={v.minOrder} onChange={val => setVoucherField(i, 'minOrder', val)} w="w-32" />
                      <NumField label="Penjual %" suffix="%" value={v.sellerPct} onChange={val => setVoucherField(i, 'sellerPct', val)} w="w-20" />
                      <NumField label="Batas penjual" prefix="Rp" value={v.sellerCap} onChange={val => setVoucherField(i, 'sellerCap', val)} w="w-32" />
                      {(+v.discPct || 0) > 0 && (
                        <span className="text-[10px] text-ink-faint pb-2">Platform {(100 - sellerPct).toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Agregat */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Produk" value={agg.products} />
        <Stat label="Varian" value={agg.count} />
        <Stat label="Avg Margin" value={agg.avg != null ? `${agg.avg.toFixed(0)}%` : '—'} cls={marginCls(agg.avg)} />
        <Stat label="Varian Rugi" value={agg.losing} cls={agg.losing ? 'text-red-400' : 'text-ink-strong'} />
      </div>

      {/* Tabel produk + varian */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line/8">
          <p className="text-sm font-semibold text-ink-strong">Produk &amp; Harga Campaign</p>
          <button onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/15 text-ink-muted hover:text-ink hover:border-line/30 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Tambah Produk
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-8 h-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">Belum ada produk. Klik "Tambah Produk".</p>
          </div>
        ) : (
          <div className="divide-y divide-line/8">
            {byProduct.map(([productId, its]) => {
              const p = productMap[productId]
              return (
                <div key={productId} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[13px] font-semibold text-ink-strong truncate">
                      {p ? p.name : '(produk dihapus)'} <span className="text-ink-faint font-normal">· {its.length} varian</span>
                    </p>
                    <button onClick={() => removeProduct(productId)} className="text-ink-faint hover:text-red-400 flex-shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-1.5">
                    {its.map(it => {
                      const m = itemMargin(it, productMap)
                      const v = p ? productVariations(p)[it.varIdx] : null
                      const normal = v ? (+v.jual || 0) : 0
                      return (
                        <div key={it.varIdx}>
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-ink truncate">{v?.name?.trim() || it.name || `Varian ${it.varIdx + 1}`}</p>
                              <p className="text-[11px] text-ink-faint truncate">{it.sku || 'tanpa SKU'}{normal ? ` · normal ${fmt(normal)}` : ''}</p>
                            </div>
                            <div className="relative flex items-center flex-shrink-0 w-32">
                              <span className="absolute left-2.5 text-[11px] text-ink-faint">Rp</span>
                              <input type="number" min="0" value={it.price}
                                onChange={e => setPrice(it.productId, it.varIdx, e.target.value)}
                                placeholder="harga campaign"
                                className="w-full bg-fill/5 border border-line/10 rounded-lg pl-8 pr-2 py-1.5 text-[13px] text-ink-strong tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
                            </div>
                            <span className={`text-[12px] font-semibold tabular-nums w-14 text-right flex-shrink-0 ${marginCls(m)}`}>{m != null ? `${m.toFixed(1)}%` : '—'}</span>
                          </div>
                          <VoucherLines item={it} productMap={productMap} vouchers={activeVouchers} kind={campaignType} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-ink-faint px-5 py-3 border-t border-line/8">
          Harga campaign default dari "Harga Campaign" tiap varian (price list), bisa diubah khusus campaign ini. Margin dihitung dari HPP &amp; biaya varian.
        </p>
      </div>

      {showPicker && (
        <ProductPicker products={products} enrolledIds={enrolledIds}
          onAdd={addProduct} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}

function ProductPicker({ products, enrolledIds, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? products.filter(p => p.name.toLowerCase().includes(s)) : products
  }, [products, q])
  return (
    <Modal title="Tambah Produk ke Campaign" subtitle="Semua varian produk akan ikut (harga default dari price list)"
      onClose={onClose} maxWidth="max-w-md">
      <div className="p-5">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk..." autoFocus
            className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        </div>
        <div className="border border-line/10 rounded-xl divide-y divide-line/8 max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-ink-faint text-center py-6 flex flex-col items-center gap-1"><Package className="w-4 h-4" />Tidak ada produk</p>
          ) : filtered.map(p => {
            const added = enrolledIds.has(p.id)
            return (
              <button key={p.id} onClick={() => !added && onAdd(p)} disabled={added}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${added ? 'opacity-50' : 'hover:bg-fill/5'}`}>
                {p.image && <img src={p.image} alt="" className="w-7 h-7 rounded-md object-cover border border-line/10 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink-strong truncate">{p.name}</p>
                  <p className="text-[11px] text-ink-faint truncate">{PLATFORM_LABEL[p.platform] || p.platform} · {p.summary?.count || 1} varian</p>
                </div>
                {added ? <span className="text-[11px] text-green-400 flex-shrink-0">ditambah</span>
                       : <Plus className="w-4 h-4 text-ink-faint flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

function NumField({ label, value, onChange, prefix, suffix, w = 'w-28' }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-ink-faint mb-1">{label}</label>
      <div className={`relative flex items-center ${w}`}>
        {prefix && <span className="absolute left-2.5 text-[11px] text-ink-faint">{prefix}</span>}
        <input type="number" min="0" value={value ?? ''} onChange={e => onChange(e.target.value)}
          className={`w-full bg-fill/5 border border-line/10 rounded-lg py-1.5 text-[13px] text-ink-strong tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/40 ${prefix ? 'pl-8' : 'pl-2.5'} ${suffix ? 'pr-6' : 'pr-2.5'}`} />
        {suffix && <span className="absolute right-2.5 text-[11px] text-ink-faint">{suffix}</span>}
      </div>
    </div>
  )
}

// Rincian per-varian untuk tiap tier voucher: pcs untuk dapat voucher, harga
// yang diterima customer, dan (co-funded) margin setelah beban penjual.
function VoucherLines({ item, productMap, vouchers, kind }) {
  if (!vouchers.length || !(+item.price > 0)) return null
  return (
    <div className="mt-1.5 space-y-1">
      {vouchers.map((v, i) => {
        const eff = voucherEffect(v, item.price)
        if (!eff) return null
        const m = kind === 'cofunded' ? itemMargin(item, productMap, eff.sellerPerUnit) : null
        return (
          <div key={i} className="flex items-center gap-2 text-[11px] text-ink-faint">
            <span className="inline-flex items-center justify-center min-w-[36px] px-1 py-0.5 rounded bg-blue-600/12 text-blue-300 font-semibold tabular-nums">{fmtPct(v.discPct)}</span>
            {(+v.minOrder || 0) > 0 && <span className="tabular-nums text-ink-muted">{eff.pcs} pcs</span>}
            <span className="tabular-nums">cust <b className="text-ink-muted font-semibold">{fmt(eff.custPerUnit)}</b></span>
            {kind === 'cofunded' && (
              <>
                <span className="tabular-nums">beban {fmt(eff.sellerPerUnit)}</span>
                <span className={`ml-auto font-semibold tabular-nums ${marginCls(m)}`}>{m != null ? `${m.toFixed(1)}%` : '—'}</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, cls = 'text-ink-strong' }) {
  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm px-4 py-3 text-center">
      <p className="text-[10px] text-ink-faint">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}
