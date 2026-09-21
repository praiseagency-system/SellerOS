import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Megaphone, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, Search, Package,
  CalendarRange, AlertTriangle, ArrowLeft, Save, FileText, Link2, ExternalLink, Folder, RefreshCw, Share2, Copy,
  Users, Eye, EyeOff, Bell, Check, ClipboardCheck, ClipboardList, ClipboardX,
  Clock } from 'lucide-react'
import Modal from './Modal'
import { listCampaigns, saveCampaign, deleteCampaign, ensureShareToken, regenerateShareToken, updateApprovalSettings, setCampaignRegistration, setCampaignApprovals } from '../data/campaigns'
import { getProfile } from '../data/identity'
import {
  REGISTRATION, registrationStatus, registrationBadge,
  registrationDetail, buildRegistration, registrationTotals,
  registrationUrgent, registrationAlert, registrationReason,
  registrationSheet, skuText,
} from '../utils/campaignRegistration'
import { getPortalSettings, updatePortalSettings, ensurePortalToken, regeneratePortalToken, setCampaignPortalHidden } from '../data/campaignPortal'
import { loadStore } from '../data/storeDataset'
import { computeCalc } from '../utils/calc'
import { productFees, productVariations } from '../utils/product'
import {
  fmt, marginCls, fmtPct, hrefOf, itemMargin, itemCalc, totalFee, feeBreakdown, voucherEffect, voucherList,
  worthVerdict, worstProductMargin, DEFAULT_TARGET_MARGIN,
  APPROVAL, approvalSummary, skuApprovalSummary,
  approvalStatusOfItem, hasOwnApproval, approvalLogOfProduct, productApprovalStatus,
  activeItems, isExcluded, excludeSuggestions, reasonLabel, itemKey, variantLabel, applySkuDecision,
} from '../utils/campaignPricing'
import {
  campaignActivity, activityTotals, newKeys, fmtAgo, getSeenAt, setSeenAt,
} from '../utils/campaignActivity'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { supabase } from '../lib/supabase'
import {
  campaignPeriods, campaignStatus, periodsSummary, periodRange, periodRangeShort,
  periodLabel, periodStatus, periodSpan, activeDays, inAnyPeriod, inPeriod, sortPeriods,
} from '../utils/campaignPeriods'
import { decisionUrgency } from '../utils/campaignUrgency'
import { searchTokens, matchesCampaign } from '../utils/campaignSearch'

// Tanggal + jam untuk riwayat persetujuan.
function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const EMPTY_KEYS = new Set()

const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
const PLATFORM_CLS = {
  tiktok: 'bg-gray-700/60 text-gray-300',
  shopee: 'bg-orange-500/15 text-orange-300',
}
const dateRange = periodsSummary

// Agregat campaign — varian yang dikecualikan tidak ikut dihitung sama sekali.
function campaignAgg(allItems, productMap) {
  const items = activeItems(allItems)
  const margins = items.map(it => itemMargin(it, productMap)).filter(m => m != null)
  const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null
  const losing = margins.filter(m => m < 0).length
  const noPrice = items.filter(it => !(+it.price > 0)).length
  return {
    count: items.length, products: new Set(items.map(it => it.productId)).size,
    avg, losing, noPrice, excluded: (allItems || []).length - items.length,
  }
}

// Monitoring: cocokkan item (varian by SKU) ke pesanan Performa Toko di dalam
// periode efektif campaign → aktual (unit, GMV, harga aktual, margin aktual).
// Campaign bisa punya beberapa periode; hari jeda di antaranya TIDAK dihitung.
function monitorCampaign(campaign, storeLines, productMap) {
  const periods = campaignPeriods(campaign)
  const hasWindow = periods.length > 0
  const inWin = storeLines.filter(l => l.ok && inAnyPeriod(l.t, periods))
  const overall = aggregateLines(campaign, inWin, productMap)
  // Rincian per periode (hanya total) — total gabungan tetap yang utama.
  const perPeriod = periods.length > 1
    ? periods.map((p, i) => {
      const lines = inWin.filter(l => inPeriod(l.t, p))
      const a = aggregateLines(campaign, lines, productMap)
      return {
        ...p, label: periodLabel(p, i), status: periodStatus(p),
        ordersInWindow: a.ordersInWindow, totalUnits: a.totalUnits,
        totalGmv: a.totalGmv, totalProfit: a.totalProfit,
      }
    })
    : []
  return { hasWindow, hasStore: storeLines.length > 0, periods, perPeriod, ...overall }
}

// Agregasi satu himpunan baris pesanan → per-item + total campaign.
function aggregateLines(campaign, inWin, productMap) {
  const bySku = new Map()   // Seller SKU (k) → lines
  const byKid = new Map()   // TikTok platform SKU ID (kid) → lines
  for (const l of inWin) {
    const k = (l.k || '').toLowerCase().trim()
    if (k) { if (!bySku.has(k)) bySku.set(k, []); bySku.get(k).push(l) }
    const kid = (l.kid || '').toLowerCase().trim()
    if (kid) { if (!byKid.has(kid)) byKid.set(kid, []); byKid.get(kid).push(l) }
  }
  const items = activeItems(campaign.items).map(it => {
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
  const [sharing, setSharing]   = useState(null)  // campaign yang dibagikan (modal)
  const [portalOpen, setPortalOpen] = useState(false)
  const [loadErr, setLoadErr]   = useState(false)
  const [storeLines, setStoreLines] = useState([])
  const [platformTab, setPlatformTab] = useState(null)   // null = ikut isi data
  const [openFolders, setOpenFolders] = useState(() => new Set())
  const [closedFolders, setClosedFolders] = useState(() => new Set())
  // Penanda "keputusan client baru": batas waktu terakhir dilihat (per device,
  // per workspace) + email kita sendiri supaya keputusan admin lewat /approve
  // tidak ikut terhitung sebagai kabar dari client.
  const wsId = getCurrentWorkspaceId()
  const [seenAt, setSeen] = useState(() => getSeenAt(wsId))
  const [selfEmail, setSelfEmail] = useState('')
  const [selfName, setSelfName] = useState('')
  const [regFor, setRegFor] = useState(null)   // campaign yang status daftarnya diubah
  const [filter, setFilter] = useState('all')  // all | new | needreg | pending
  const [query, setQuery] = useState('')

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

  useEffect(() => {
    let active = true
    supabase.auth.getUser()
      .then(async ({ data }) => {
        if (!active) return
        setSelfEmail(data?.user?.email || '')
        // Nama tampilan dipakai sebagai "didaftarkan oleh" yang dibaca client.
        try { const pr = await getProfile(data?.user?.id); if (active) setSelfName(pr?.name || '') } catch { /* profil opsional */ }
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  // Nama campaign induk yang sudah ada, dipisah per platform — induk TikTok
  // tak disarankan saat membuat campaign Shopee (dan sebaliknya).
  const parentSuggestions = useMemo(() => {
    const m = { tiktok: new Set(), shopee: new Set() }
    for (const c of campaigns) {
      const key = (c.parentCampaign || '').trim()
      if (key) m[c.platform === 'shopee' ? 'shopee' : 'tiktok'].add(key)
    }
    return { tiktok: [...m.tiktok], shopee: [...m.shopee] }
  }, [campaigns])
  // Keputusan client yang masuk sejak terakhir dilihat, per campaign.
  const activity = useMemo(() => {
    const m = new Map()
    for (const c of campaigns) m.set(c.id, campaignActivity(c, seenAt, selfEmail))
    return m
  }, [campaigns, seenAt, selfEmail])
  const totals = useMemo(() => activityTotals(campaigns, seenAt, selfEmail), [campaigns, seenAt, selfEmail])
  const newCountOf = useCallback(c => activity.get(c.id)?.count || 0, [activity])
  // Pekerjaan tertinggal: sudah di-ACC client tapi belum ada catatan pendaftaran.
  const regAlert = useMemo(() => registrationAlert(campaigns), [campaigns])
  const needRegOf = useCallback(c => regAlert.ids.has(c.id), [regAlert])
  // Campaign yang masih menunggu keputusan (ada SKU aktif berstatus pending).
  const pendingOf = useCallback(c => { const s = approvalSummary(c); return s.pending }, [])

  function markSeen() {
    const iso = new Date().toISOString()
    setSeenAt(wsId, iso)
    setSeen(iso)
    setFilter(f => (f === 'new' ? 'all' : f))
  }

  // Pencarian: nama campaign / induk / produk / SKU. Berlaku di kedua tab,
  // jadi angka di tab ikut menunjukkan di platform mana hasilnya berada.
  const searching = query.trim() !== ''
  const found = useMemo(() => {
    const tokens = searchTokens(query)
    return tokens.length ? campaigns.filter(c => matchesCampaign(c, tokens, productMap)) : campaigns
  }, [campaigns, query, productMap])

  // Jumlah campaign per platform (untuk label tab).
  const platformCount = useMemo(() => {
    const n = { tiktok: 0, shopee: 0 }
    for (const c of found) n[c.platform === 'shopee' ? 'shopee' : 'tiktok']++
    return n
  }, [found])
  // Tab aktif: pilihan user, atau otomatis ke platform yang ada isinya.
  const tab = platformTab || (platformCount.tiktok === 0 && platformCount.shopee > 0 ? 'shopee' : 'tiktok')
  // Campaign di tab platform yang aktif, dikelompokkan per judul induk.
  // Yang tanpa induk tampil langsung sebagai kartu (tanpa folder).
  const { folders, loose } = useMemo(() => {
    const inTab = found
      .filter(c => (c.platform === 'shopee' ? 'shopee' : 'tiktok') === tab)
      .filter(c => filter === 'all'
        || (filter === 'new' ? newCountOf(c) > 0
          : filter === 'needreg' ? needRegOf(c)
          : pendingOf(c) > 0))
    // Naik ke atas: kabar baru dari client dulu, lalu pendaftaran yang
    // tertinggal (yang mendesak lebih dulu lagi). Urutan lain tetap.
    const rank = c => (newCountOf(c) > 0 ? 4 : 0) + (registrationUrgent(c) ? 2 : needRegOf(c) ? 1 : 0)
    const sorted = [...inTab].sort((a, b) => rank(b) - rank(a))
    const order = [], map = new Map(), loose = []
    for (const c of sorted) {
      const key = (c.parentCampaign || '').trim()
      if (!key) { loose.push(c); continue }
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key).push(c)
    }
    return { folders: order.map(key => ({ key, items: map.get(key) })), loose }
  }, [found, tab, filter, newCountOf, pendingOf, needRegOf])

  // Daftar datar: folder judul + sub-campaign yang terbuka, lalu campaign
  // tanpa induk. Satu loop render — folder cuma baris pembuka.
  const rows = useMemo(() => {
    const out = []
    for (const f of folders) {
      const fresh = f.items.reduce((n, c) => n + newCountOf(c), 0)
      // Folder dengan kabar baru terbuka sendiri, kecuali sudah ditutup manual.
      // Saat mencari, folder yang berisi hasil ikut terbuka.
      const open = openFolders.has(f.key)
        || ((searching || fresh > 0 || f.items.some(needRegOf)) && !closedFolders.has(f.key))
      const span = periodSpan(f.items.flatMap(c => campaignPeriods(c)))
      out.push({
        type: 'folder', key: f.key, count: f.items.length, open, fresh,
        needReg: f.items.filter(needRegOf).length,
        running: f.items.filter(c => campaignStatus(c).key === 'running').length,
        range: (span.start || span.end) ? periodRange({ start: span.start, end: span.end }) : 'tanpa tanggal',
      })
      if (open) for (const c of f.items) out.push({ type: 'card', c, nested: true })
    }
    for (const c of loose) out.push({ type: 'card', c, nested: false })
    return out
  }, [folders, loose, openFolders, closedFolders, newCountOf, needRegOf, searching])

  // Folder dibuka manual vs ditutup manual disimpan terpisah: folder yang
  // terbuka otomatis karena ada kabar baru harus tetap bisa ditutup.
  function toggleFolder(key, isOpen) {
    if (isOpen) {
      setOpenFolders(prev => { const n = new Set(prev); n.delete(key); return n })
      setClosedFolders(prev => new Set(prev).add(key))
    } else {
      setClosedFolders(prev => { const n = new Set(prev); n.delete(key); return n })
      setOpenFolders(prev => new Set(prev).add(key))
    }
  }

  async function handleSave(form) {
    try { await saveCampaign(form); setEditing(null); await reload() }
    catch (e) {
      console.error(e)
      const msg = /registration_deadline/i.test(e?.message || '')
        ? 'Gagal menyimpan: kolom "registration_deadline" belum ada. Jalankan migrasi 0063_campaign_registration_deadline.sql di Supabase → SQL Editor.'
        : /periods/i.test(e?.message || '')
        ? 'Gagal menyimpan: kolom "periods" belum ada. Jalankan migrasi 0042_campaign_periods.sql di Supabase → SQL Editor.'
        : `Gagal menyimpan campaign.${e?.message ? `\n\n${e.message}` : ''}`
      alert(msg)
    }
  }
  // Sembunyikan/tampilkan satu campaign di portal client (kolom portal_hidden).
  async function handleTogglePortal(c) {
    try { await setCampaignPortalHidden(c.id, !c.portalHidden); await reload() }
    catch (e) { console.error(e); alert('Gagal mengubah tampilan portal. Pastikan migrasi 0060 sudah dijalankan.') }
  }
  // Simpan status pendaftaran ke marketplace (kolom registration, migrasi 0062).
  async function handleRegistration(c, form) {
    const payload = buildRegistration(form, { email: selfEmail, name: selfName })
    try { await setCampaignRegistration(c.id, payload); setRegFor(null); await reload() }
    catch (e) {
      console.error(e)
      const m = e?.message || ''
      alert(/registration|column|schema cache/i.test(m)
        ? 'Kolom "registration" belum ada. Jalankan migrasi 0062_campaign_registration.sql di Supabase → SQL Editor dulu.'
        : `Gagal menyimpan status pendaftaran.${m ? `\n\n${m}` : ''}`)
    }
  }

  // Keputusan admin per SKU langsung dari daftar (tanpa membuka editor).
  // Disimpan hanya ke kolom approvals supaya tak ikut menimpa items/periods.
  async function handleSkuDecision(c, it, status) {
    const next = applySkuDecision(c.approvals, it, status, { email: selfEmail, name: selfName })
    try { await setCampaignApprovals(c.id, next); await reload() }
    catch (e) { console.error(e); alert(`Gagal menyimpan keputusan.${e?.message ? `\n\n${e.message}` : ''}`) }
  }

  async function handleDelete(id) {
    if (!confirm('Hapus campaign ini?')) return
    try { await deleteCampaign(id); await reload() }
    catch (e) { console.error(e); alert('Gagal menghapus campaign.') }
  }

  // Editor full-page menggantikan daftar saat membuat/mengedit.
  if (editing) {
    return <CampaignEditor initial={editing} products={products} productMap={productMap}
      parentSuggestions={parentSuggestions} onSave={handleSave} onClose={() => setEditing(null)} />
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm text-ink-muted">
          {campaigns.length} campaign terdaftar
          {(() => { const r = campaigns.filter(c => campaignStatus(c).key === 'running').length
            return r > 0 ? <> · <span className="text-green-400 font-medium">{r} berjalan</span></> : null })()}
          {(() => { const rt = registrationTotals(campaigns)
            if (!rt.done && !rt.progress) return null
            return <> · <span className="text-blue-300 font-medium">{rt.done} sudah didaftarkan</span>
              {rt.progress > 0 ? <span className="text-amber-300"> · {rt.progress} sedang diproses</span> : null}</> })()}
          {' '}· proyeksi margin di harga campaign per varian
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setPortalOpen(true)} title="Satu link untuk client melihat semua campaign"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-line/15 text-ink-muted hover:text-ink hover:border-line/30 transition-colors">
            <Users className="w-4 h-4" /> Portal Client
          </button>
          <button onClick={() => setEditing({ platform: tab })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Campaign Baru
          </button>
        </div>
      </div>

      {loadErr && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
          Tabel/kolom campaign belum lengkap. Jalankan migrasi <code>0008_campaigns.sql</code>, <code>0009_campaign_items.sql</code> &amp; <code>0042_campaign_periods.sql</code> di Supabase → SQL Editor.
        </div>
      )}

      {/* Kabar dari client: keputusan yang masuk sejak terakhir dilihat */}
      {totals.count > 0 && (
        <div className="mb-3 px-4 py-3 rounded-2xl bg-blue-600/8 border border-blue-500/25 flex items-center gap-3 flex-wrap">
          <Bell className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <p className="text-[13px] text-ink flex-1 min-w-[200px]">
            <b className="font-semibold text-ink-strong">{totals.count} keputusan client baru</b>
            {' '}di {totals.campaigns} campaign sejak terakhir dilihat
          </p>
          <button onClick={markSeen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-line/20 text-ink-muted hover:text-ink hover:border-line/35 transition-colors flex-shrink-0">
            <Check className="w-3.5 h-3.5" /> Tandai sudah dilihat
          </button>
        </div>
      )}

      {/* Pekerjaan tertinggal: sudah di-ACC client tapi belum didaftarkan */}
      {regAlert.count > 0 && (
        <div className="mb-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-[13px] text-ink flex-1 min-w-[220px]">
            <b className="font-semibold text-amber-300">{regAlert.count} campaign sudah di-ACC client tapi belum didaftarkan</b>
            {regAlert.urgent > 0 && <span className="text-amber-300"> · {regAlert.urgent} mendesak</span>}
          </p>
          <button onClick={() => setFilter(f => (f === 'needreg' ? 'all' : 'needreg'))}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors flex-shrink-0">
            {filter === 'needreg' ? 'Tampilkan semua' : 'Lihat daftarnya'}
          </button>
        </div>
      )}

      {/* Saringan daftar: kabar baru / masih menunggu / semua */}
      {campaigns.length > 0 && (() => {
        const inTab = found.filter(c => (c.platform === 'shopee' ? 'shopee' : 'tiktok') === tab)
        const chips = [
          { id: 'new', label: 'Baru', n: inTab.filter(c => newCountOf(c) > 0).length },
          { id: 'needreg', label: 'Perlu didaftarkan', n: inTab.filter(needRegOf).length },
          { id: 'pending', label: 'Menunggu', n: inTab.filter(c => pendingOf(c) > 0).length },
          { id: 'all', label: 'Semua', n: inTab.length },
        ]
        return (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {chips.map(ch => {
              const on = filter === ch.id
              const disabled = ch.n === 0 && ch.id !== 'all'
              return (
                <button key={ch.id} type="button" disabled={disabled}
                  onClick={() => setFilter(on && ch.id !== 'all' ? 'all' : ch.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    on ? (ch.id === 'new' ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                        : ch.id === 'needreg' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                          : 'bg-fill/10 text-ink border border-line/20')
                       : `border border-line/12 ${disabled ? 'text-ink-faint/50 cursor-default' : 'text-ink-faint hover:text-ink hover:border-line/25'}`
                  }`}>
                  {ch.label} · {ch.n}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* Tab platform — campaign TikTok & Shopee dipisah */}
      {campaigns.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 border-b border-line/8 pb-2 flex-wrap">
          {['tiktok', 'shopee'].map(id => {
            const on = tab === id
            return (
              <button key={id} type="button" onClick={() => setPlatformTab(id)}
                className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-colors ${
                  on ? (id === 'tiktok' ? 'bg-gray-700 text-white' : 'bg-orange-500/20 text-orange-300')
                     : 'text-ink-muted hover:text-ink hover:bg-fill/8'
                }`}>
                {PLATFORM_LABEL[id]} <span className={on ? 'opacity-70' : 'text-ink-faint'}>· {platformCount[id]}</span>
              </button>
            )
          })}
          <div className="relative ml-auto w-full max-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
              placeholder="Cari campaign, produk, atau SKU..." aria-label="Cari campaign"
              className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
            {searching && (
              <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-ink-faint hover:text-ink">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
        <div className="space-y-2.5">
          {rows.length === 0 && (
            <p className="text-xs text-ink-faint px-1 py-6 text-center">
              {searching ? (() => {
                const other = tab === 'tiktok' ? 'shopee' : 'tiktok'
                return <>Tidak ada campaign {PLATFORM_LABEL[tab]} yang cocok dengan "{query.trim()}"{filter !== 'all' ? ' pada saringan ini' : ''}.{' '}
                  {platformCount[other] > 0
                    ? <button onClick={() => { setPlatformTab(other); setFilter('all') }} className="text-blue-400 hover:underline">Lihat {platformCount[other]} hasil di {PLATFORM_LABEL[other]}</button>
                    : <button onClick={() => { setQuery(''); setFilter('all') }} className="text-blue-400 hover:underline">Hapus pencarian</button>}</>
              })()
                : filter !== 'all'
                ? <>Tidak ada campaign {PLATFORM_LABEL[tab]} pada saringan ini. <button onClick={() => setFilter('all')} className="text-blue-400 hover:underline">Tampilkan semua</button>.</>
                : <>Belum ada campaign {PLATFORM_LABEL[tab]}. Pindah tab atau buat campaign baru.</>}
            </p>
          )}
          {rows.map(row => {
            // Folder judul campaign (campaign induk) — klik untuk buka sub-campaign.
            if (row.type === 'folder') {
              const FChevron = row.open ? ChevronDown : ChevronRight
              return (
                <button key={`f:${row.key}`} onClick={() => toggleFolder(row.key, row.open)}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-surface border shadow-sm text-left transition-colors ${row.open ? 'border-line/20' : 'border-line/10 hover:border-line/25'}`}>
                  <FChevron className="w-4 h-4 text-ink-faint flex-shrink-0" />
                  <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <p className="text-[13px] font-semibold text-ink-strong truncate">{row.key}</p>
                  <span className="text-[11px] text-ink-faint flex-shrink-0">· {row.count} sub-campaign</span>
                  {row.needReg > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 flex-shrink-0">
                      {row.needReg} perlu didaftarkan
                    </span>
                  )}
                  {row.fresh > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-600/15 text-blue-300 flex-shrink-0">
                      {row.fresh} baru
                    </span>
                  )}
                  {row.running > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-500/12 text-green-300 flex-shrink-0 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{row.running} berjalan
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-ink-faint flex-shrink-0 hidden sm:inline">{row.range}</span>
                </button>
              )
            }
            const c = row.c
            const act = activity.get(c.id) || { count: 0, sentence: '', latest: null }
            const freshKeys = act.count > 0 ? newKeys(c, seenAt, selfEmail) : EMPTY_KEYS
            const needReg = needRegOf(c)
            const agg = campaignAgg(c.items || [], productMap)
            const mon = monitorCampaign(c, storeLines, productMap)
            const open = expanded === c.id
            const Chevron = open ? ChevronDown : ChevronRight
            return (
              <div key={c.id} className={`bg-surface rounded-2xl border shadow-sm overflow-hidden ${
                act.count > 0 ? 'border-blue-500/35' : needReg ? 'border-amber-500/35' : 'border-line/10'} ${row.nested ? 'ml-5' : ''}`}>
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
                        {(() => { const st = campaignStatus(c)
                          return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 inline-flex items-center gap-1 ${st.cls}`}>
                            {st.key === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}{st.label}
                          </span> })()}
                        {(() => {
                          // Urgensi keputusan — hanya bila masih ada SKU menunggu & campaign belum selesai.
                          const ap = approvalSummary(c)
                          if (!ap.total || ap.approved + ap.rejected >= ap.total) return null
                          const u = decisionUrgency(c)
                          if (u.key === 'ended' || u.key === 'nodate') return null
                          return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 inline-flex items-center gap-1 ${u.cls}`}>
                            <Clock className="w-3 h-3" />{u.label}
                          </span> })()}
                        {c.voucherConfig?.kind === 'cofunded' && voucherList(c.voucherConfig).length > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-blue-600/12 text-blue-300">
                            Co-funded · {voucherList(c.voucherConfig).length} voucher
                          </span>
                        )}
                        {(() => { const ap = approvalSummary(c)
                          if (!ap.total) return null
                          const cls = ap.approved === ap.total ? 'bg-green-500/12 text-green-300'
                            : ap.rejected > 0 ? 'bg-red-500/12 text-red-300' : 'bg-amber-500/12 text-amber-300'
                          const txt = ap.approved === ap.total ? 'Semua SKU disetujui'
                            : `${ap.approved}/${ap.total} SKU disetujui${ap.rejected ? ` · ${ap.rejected} ditolak` : ''}`
                          return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${cls}`}>{txt}</span> })()}
                        {act.count > 0 && (
                          <span title={`${act.count} keputusan client baru sejak terakhir dilihat`}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-blue-600/15 text-blue-300">Baru</span>
                        )}
                        {(() => { const rb = registrationBadge(c, { showNone: needReg })
                          if (!rb) return null
                          const cls = rb.key === 'none' ? 'bg-amber-500/12 text-amber-300' : rb.cls
                          return <span title={registrationDetail(c) || registrationReason(c)}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${cls}`}>{rb.label}</span> })()}
                      </div>
                      <p className="text-[11px] text-ink-faint truncate flex items-center gap-1">
                        <CalendarRange className="w-3 h-3" />{dateRange(c)} · {agg.products} produk · {agg.count} varian
                      </p>
                      {act.count > 0 && (
                        <p className="text-[11px] text-blue-300 truncate mt-0.5">
                          {act.sentence} · {fmtAgo(act.latest?.at)}
                        </p>
                      )}
                      {registrationStatus(c) !== 'none' ? (
                        <p className="text-[11px] text-ink-faint truncate mt-0.5">
                          {REGISTRATION[registrationStatus(c)].label} · {registrationDetail(c)}
                        </p>
                      ) : needReg ? (
                        <p className="text-[11px] text-amber-300 truncate mt-0.5">{registrationReason(c)}</p>
                      ) : null}
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
                    {hrefOf(c.link) && (
                      <a href={hrefOf(c.link)} target="_blank" rel="noopener noreferrer" title="Buka link campaign"
                        className="p-1.5 rounded-lg text-ink-faint hover:text-blue-400 hover:bg-fill/8 transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
                    )}
                    {(() => { const rs = registrationStatus(c)
                      const Icon = rs === 'none' ? (needReg ? ClipboardX : ClipboardList) : ClipboardCheck
                      const cls = rs === 'done' ? 'text-blue-400'
                        : rs === 'progress' ? 'text-amber-400'
                        : needReg ? 'text-amber-400' : 'text-ink-faint hover:text-blue-400'
                      return (
                        <button title={rs === 'none' ? (needReg ? registrationReason(c) : 'Belum didaftarkan ke marketplace — klik untuk ubah') : `${REGISTRATION[rs].label} · ${registrationDetail(c)}`}
                          onClick={() => setRegFor(c)}
                          className={`p-1.5 rounded-lg transition-colors hover:bg-fill/8 ${cls}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ) })()}
                    <button title={c.portalHidden ? 'Disembunyikan dari portal client — klik untuk tampilkan' : 'Tampil di portal client — klik untuk sembunyikan'}
                      onClick={() => handleTogglePortal(c)}
                      className={`p-1.5 rounded-lg transition-colors hover:bg-fill/8 ${c.portalHidden ? 'text-amber-400' : 'text-ink-faint hover:text-blue-400'}`}>
                      {c.portalHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button title="Bagikan untuk persetujuan" onClick={() => setSharing(c)} className="p-1.5 rounded-lg text-ink-faint hover:text-blue-400 hover:bg-fill/8 transition-colors"><Share2 className="w-3.5 h-3.5" /></button>
                    <button title="Edit" onClick={() => setEditing(c)} className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/8 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button title="Hapus" onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {open && (
                  <div className="border-t border-line/8 px-4 py-3 space-y-1.5">
                    {(c.items || []).length === 0 ? (
                      <p className="text-xs text-ink-faint py-1">Belum ada varian. Klik edit untuk menambah.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {byProductList(c.items).map(([pid, its]) => (
                          <ProductCard key={pid} c={c} productId={pid} its={its} productMap={productMap}
                            fresh={freshKeys} seenAt={seenAt}
                            onDecide={(it, st) => handleSkuDecision(c, it, st)} />
                        ))}
                      </div>
                    )}

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
                            {/* Rincian per periode — hanya bila campaign punya >1 periode efektif. */}
                            {mon.perPeriod.length > 0 && (
                              <div className="mb-2.5 rounded-xl border border-line/8 divide-y divide-line/8">
                                {mon.perPeriod.map((p, i) => (
                                  <div key={i} className="flex items-center gap-3 px-2.5 py-1.5">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[12px] text-ink truncate">
                                        {p.label}
                                        {p.status === 'running' && <span className="ml-1.5 text-[10px] font-semibold text-green-400">berjalan</span>}
                                        {p.status === 'scheduled' && <span className="ml-1.5 text-[10px] text-ink-faint">belum mulai</span>}
                                      </p>
                                      <p className="text-[10px] text-ink-faint truncate">{periodRangeShort(p)}</p>
                                    </div>
                                    <span className="text-[11px] text-ink-muted tabular-nums flex-shrink-0">{p.totalUnits} unit</span>
                                    <span className="text-[11px] text-ink-strong tabular-nums w-24 text-right flex-shrink-0">{fmt(p.totalGmv)}</span>
                                    <span className={`text-[11px] font-semibold tabular-nums w-24 text-right flex-shrink-0 ${p.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(p.totalProfit)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
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

      {sharing && <ShareApprovalModal campaign={sharing} onClose={() => setSharing(null)} onSaved={reload} />}
      {portalOpen && <PortalShareModal onClose={() => setPortalOpen(false)} />}
      {regFor && <RegistrationModal campaign={regFor} onClose={() => setRegFor(null)}
        onSave={form => handleRegistration(regFor, form)} />}
    </div>
  )
}

function CampaignEditor({ initial, products, productMap, parentSuggestions = {}, onSave, onClose }) {
  const [name, setName]           = useState(initial.name ?? '')
  const [parentCampaign, setParent] = useState(initial.parentCampaign ?? '')
  const [platform, setPlatform]   = useState(initial.platform ?? 'tiktok')
  // Saran induk hanya dari campaign di platform yang sama.
  const parentOptions = parentSuggestions[platform === 'shopee' ? 'shopee' : 'tiktok'] || []
  const [description, setDesc]    = useState(initial.description ?? '')
  const [detail, setDetail]       = useState(initial.detail ?? '')
  const [link, setLink]           = useState(initial.link ?? '')
  const [regDeadline, setRegDeadline] = useState(initial.registrationDeadline ?? '')
  // Periode efektif: campaign lama (start/end tunggal) terbaca sebagai 1 baris.
  const [periods, setPeriods]     = useState(() => {
    const list = campaignPeriods(initial)
    return list.length ? list.map(p => ({ ...p })) : [{ label: '', start: '', end: '' }]
  })
  const [items, setItems]         = useState(initial.items ?? [])
  const [approvals, setApprovals] = useState(initial.approvals ?? {})
  const [sharing, setSharing]     = useState(false)
  const [campaignType, setCampaignType] = useState(initial.voucherConfig?.kind ?? 'normal')
  const [targetMargin, setTargetMargin] = useState(initial.voucherConfig?.targetMargin != null ? String(initial.voucherConfig.targetMargin) : '')
  const [vouchers, setVouchers]   = useState(() => {
    const vs = initial.voucherConfig?.vouchers
    return Array.isArray(vs) && vs.length ? vs.map(v => ({ ...v })) : []
  })
  const [showPicker, setShowPicker] = useState(false)
  const [busy, setBusy]           = useState(false)

  function setPeriodField(i, field, val) {
    setPeriods(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }
  function addPeriod() { setPeriods(prev => [...prev, { label: '', start: '', end: '' }]) }
  function removePeriod(i) {
    setPeriods(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i))
  }
  // Periode yang benar-benar disimpan (baris kosong dibuang, urut per tanggal).
  const cleanPeriods = useMemo(
    () => sortPeriods(periods
      .map(p => ({ label: (p.label || '').trim(), start: p.start || '', end: p.end || '' }))
      .filter(p => p.start || p.end)),
    [periods],
  )
  // Rentang terbalik menahan tombol Simpan; periode terbuka hanya diingatkan.
  const periodInvalid = useMemo(() => periods.some(p => p.start && p.end && p.end < p.start), [periods])
  const periodWarn = useMemo(() => {
    if (periodInvalid) return 'Tanggal selesai lebih awal dari tanggal mulai — perbaiki dulu.'
    const half = periods.find(p => (p.start && !p.end) || (!p.start && p.end))
    if (half) return 'Ada periode yang belum lengkap tanggalnya (dianggap terbuka).'
    return ''
  }, [periods, periodInvalid])
  const periodSummaryText = useMemo(() => {
    if (!cleanPeriods.length) return 'Belum ada tanggal — campaign dianggap draft dan hasil aktual tidak dihitung.'
    const span = periodSpan(cleanPeriods)
    const days = activeDays(cleanPeriods)
    const rentang = periodRange({ start: span.start, end: span.end })
    if (cleanPeriods.length === 1) return `Rentang: ${rentang}${days ? ` · ${days} hari` : ''}`
    return `Rentang keseluruhan: ${rentang} · ${cleanPeriods.length} periode${days ? ` · ${days} hari aktif` : ''} (hari jeda tidak dihitung sebagai hasil campaign)`
  }, [cleanPeriods])

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
    const cfg = { kind: campaignType, vouchers: norm }
    if (targetMargin !== '' && +targetMargin > 0) cfg.targetMargin = +targetMargin
    return cfg
  }

  // Filter daftar produk per status persetujuan (chips di atas daftar).
  const [approvalTab, setApprovalTab] = useState('all')

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
  // Status level produk = berlaku untuk SEMUA SKU-nya, jadi keputusan per SKU
  // (kunci `productId:varIdx`, mis. dari client di /approve) ikut dibersihkan —
  // kalau tidak, SKU ber-override tak akan ikut berubah dan terlihat seperti
  // tombol yang tak berfungsi.
  function setApproval(productId, status) {
    setApprovals(prev => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) if (!k.startsWith(`${productId}:`)) next[k] = v
      next[productId] = { ...(prev[productId] || {}), status, at: new Date().toISOString() }
      return next
    })
  }
  function setApprovalNote(productId, note) {
    setApprovals(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), note } }))
  }
  function setPrice(productId, varIdx, price) {
    setItems(prev => prev.map(it => (it.productId === productId && it.varIdx === varIdx) ? { ...it, price } : it))
  }
  // Kecualikan / ikutkan lagi satu varian. Alasan disimpan supaya terlihat
  // kenapa varian dikeluarkan (belum ada harga PL / SKU ganda / manual).
  function toggleExclude(productId, varIdx, reason = 'manual') {
    setItems(prev => prev.map(it => {
      if (it.productId !== productId || it.varIdx !== varIdx) return it
      if (it.excluded) return { ...it, excluded: false, excludeReason: '' }
      return { ...it, excluded: true, excludeReason: reason }
    }))
  }
  // Kecualikan sekaligus semua varian yang terdeteksi bermasalah.
  function excludeAllSuggested() {
    setItems(prev => {
      const s = excludeSuggestions(prev)
      const tag = new Map()
      for (const it of s.noprice) tag.set(itemKey(it), 'noprice')
      for (const it of s.dupsku) tag.set(itemKey(it), 'dupsku')
      return prev.map(it => tag.has(itemKey(it))
        ? { ...it, excluded: true, excludeReason: tag.get(itemKey(it)) }
        : it)
    })
  }
  const suggestions = useMemo(() => excludeSuggestions(items), [items])
  const excludedCount = items.length - activeItems(items).length

  async function submit() {
    if (!name.trim() || busy || periodInvalid) return
    setBusy(true)
    const span = periodSpan(cleanPeriods)
    await onSave({ id: initial.id, name: name.trim(), parentCampaign: parentCampaign.trim(), platform, description, detail, link: link.trim(), registrationDeadline: regDeadline || '', startDate: span.start, endDate: span.end, periods: cleanPeriods, items, voucherConfig: buildVoucherConfig(), approvals })
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
          {initial.id && (
            <button type="button" onClick={() => setSharing(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-line/15 text-ink-muted hover:text-ink hover:border-line/30 transition-colors">
              <Share2 className="w-4 h-4" /> Bagikan
            </button>
          )}
          <button onClick={submit} disabled={!name.trim() || busy || periodInvalid}
            title={periodInvalid ? 'Perbaiki tanggal periode dulu' : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            <Save className="w-4 h-4" />{busy ? 'Menyimpan…' : (initial.id ? 'Perbarui' : 'Simpan')}
          </button>
        </div>
      </div>

      {sharing && <ShareApprovalModal campaign={initial} onClose={() => setSharing(false)} />}

      {/* Nama + platform + tanggal */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5 space-y-4">
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

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            <Folder className="w-3.5 h-3.5 inline mr-1" />Campaign Induk <span className="font-normal text-ink-faint">(opsional — campaign besar yang menaungi, mis. "Gajian Sale Juli &amp; 8.8")</span>
          </label>
          <input value={parentCampaign} onChange={e => setParent(e.target.value)} list="campaign-parents"
            placeholder="mis. Gajian Sale Juli & 8.8"
            className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          <datalist id="campaign-parents">
            {parentOptions.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Nama Campaign <span className="text-red-400">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="mis. Payday Sale Juli"
            className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
        </div>

        {/* Periode efektif — satu campaign bisa aktif di beberapa rentang tanggal */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs font-medium text-ink-muted">
              <CalendarRange className="w-3.5 h-3.5 inline mr-1" />Periode Efektif
              <span className="font-normal text-ink-faint"> (kapan voucher aktif — boleh lebih dari satu rentang)</span>
            </label>
            <button type="button" onClick={addPeriod}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-blue-400 hover:bg-blue-600/10 transition-colors">
              <Plus className="w-3 h-3" /> Tambah periode
            </button>
          </div>
          <div className="space-y-2">
            {periods.map((p, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_160px_32px] gap-2 items-center">
                <input value={p.label} onChange={e => setPeriodField(i, 'label', e.target.value)}
                  placeholder={`Nama periode — mis. ${i === 0 ? 'Gajian Sale Juli' : '8.8'}`}
                  className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
                <input type="date" value={p.start} onChange={e => setPeriodField(i, 'start', e.target.value)}
                  className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
                <input type="date" value={p.end} min={p.start || undefined} onChange={e => setPeriodField(i, 'end', e.target.value)}
                  className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
                <button type="button" onClick={() => removePeriod(i)} disabled={periods.length === 1}
                  title="Hapus periode"
                  className="p-2 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:text-ink-faint disabled:hover:bg-transparent transition-colors justify-self-start md:justify-self-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <p className={`text-[11px] mt-1.5 ${periodWarn ? 'text-amber-300' : 'text-ink-faint'}`}>
            {periodWarn || periodSummaryText}
          </p>
        </div>

        {/* Batas pendaftaran ke marketplace — sumber urgensi keputusan client */}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            <Clock className="w-3.5 h-3.5 inline mr-1" />Batas Pendaftaran
            <span className="font-normal text-ink-faint"> (opsional — tanggal terakhir daftar produk ke marketplace; menentukan urgensi di portal client)</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)] gap-2 items-center">
            <input type="date" value={regDeadline} onChange={e => setRegDeadline(e.target.value)}
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
            <p className="text-[11px] text-ink-faint">
              {regDeadline
                ? (() => { const u = decisionUrgency({ periods: cleanPeriods, registrationDeadline: regDeadline })
                    return u.key === 'deadline' || u.key === 'closed' ? u.label : 'Campaign sudah berjalan — batas pendaftaran tak lagi dipakai.' })()
                : 'Kosong = urgensi dihitung dari tanggal mulai campaign.'}
            </p>
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

        {/* Link campaign */}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            <Link2 className="w-3.5 h-3.5 inline mr-1" />Link Campaign <span className="font-normal text-ink-faint">(halaman campaign di marketplace)</span>
          </label>
          <div className="relative flex items-center">
            <input type="url" value={link} onChange={e => setLink(e.target.value)} inputMode="url"
              placeholder="https://seller-id.tokopedia.com/promotion/campaign/detail/..."
              className={`w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50 ${hrefOf(link) ? 'pr-10' : ''}`} />
            {hrefOf(link) && (
              <a href={hrefOf(link)} target="_blank" rel="noopener noreferrer" title="Buka link campaign"
                className="absolute right-2.5 text-ink-faint hover:text-blue-400 transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Detail campaign (dibaca client di halaman approval) */}
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            <FileText className="w-3.5 h-3.5 inline mr-1" />Detail Campaign <span className="font-normal text-ink-faint">(dibaca client di halaman approval — mis. syarat &amp; daftar voucher dari marketplace)</span>
          </label>
          <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={5}
            placeholder={'Tempel detail campaign dari marketplace, mis.:\n\nPersyaratan: harga kompetitif di semua platform…\nVoucher tersedia: Diskon 7% s/d Rp50.000 (min Rp30.000), dst.\n\n(Periode efektif tak perlu ditulis di sini — sudah diisi di kolom Periode Efektif.)'}
            className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50 resize-y" />
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
        <div className="pt-3 border-t border-line/8">
          <label className="block text-[11px] font-medium text-ink-faint mb-1.5">Target margin "worth it" <span className="text-ink-faint">(cek kelayakan tiap produk; default {DEFAULT_TARGET_MARGIN}%)</span></label>
          <div className="relative flex items-center w-24">
            <input type="number" min="0" value={targetMargin} onChange={e => setTargetMargin(e.target.value)} placeholder={String(DEFAULT_TARGET_MARGIN)}
              className="w-full bg-fill/5 border border-line/10 rounded-lg pl-2.5 pr-6 py-1.5 text-[13px] text-ink-strong tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
            <span className="absolute right-2.5 text-[11px] text-ink-faint">%</span>
          </div>
          <p className="text-[10px] text-ink-faint mt-1">Verdict tiap produk dari margin <b>terburuk</b> (termasuk voucher terdalam): ≥ target = <span className="text-green-300">Worth it</span>, di bawahnya Tipis / Kurang worth.</p>
        </div>
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
          <p className="text-sm font-semibold text-ink-strong">
            Produk &amp; Harga Campaign
            {excludedCount > 0 && <span className="ml-2 text-[11px] font-normal text-ink-faint">{excludedCount} varian dikecualikan</span>}
          </p>
          <button onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/15 text-ink-muted hover:text-ink hover:border-line/30 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Tambah Produk
          </button>
        </div>

        {/* Deteksi otomatis varian yang sebaiknya tak diikutkan */}
        {suggestions.total > 0 && (
          <div className="mx-5 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <p className="text-[11px] text-amber-200 flex-1 min-w-0">
              {suggestions.noprice.length > 0 && <><b className="font-semibold">{suggestions.noprice.length} varian</b> belum ada harga dasar dari PL</>}
              {suggestions.noprice.length > 0 && suggestions.dupsku.length > 0 && ' · '}
              {suggestions.dupsku.length > 0 && <><b className="font-semibold">{suggestions.dupsku.length} varian</b> ber-SKU ganda</>}
              {' '}— rawan salah produk/harga kalau tetap diajukan.
            </p>
            <button type="button" onClick={excludeAllSuggested}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-amber-500/30 text-amber-200 hover:bg-amber-500/15 transition-colors">
              Kecualikan semua
            </button>
          </div>
        )}

        {/* Filter per status persetujuan. Produk berstatus campuran ikut
            muncul di tiap chip yang relevan (dihitung per SKU aktif). */}
        {items.length > 0 && (() => {
          const hasStatus = (its, st) => activeItems(its).some(it => approvalStatusOfItem(approvals, it) === st)
          const chips = [
            ['all', 'Semua', byProduct.length],
            ['pending', 'Menunggu', byProduct.filter(([, its]) => hasStatus(its, 'pending')).length],
            ['approved', 'Disetujui', byProduct.filter(([, its]) => hasStatus(its, 'approved')).length],
            ['rejected', 'Ditolak', byProduct.filter(([, its]) => hasStatus(its, 'rejected')).length],
          ]
          const on = { all: 'bg-blue-600/15 border-blue-500/40 text-blue-300', pending: 'bg-amber-500/12 border-amber-500/40 text-amber-300', approved: 'bg-green-500/12 border-green-500/40 text-green-300', rejected: 'bg-red-500/12 border-red-500/40 text-red-300' }
          return (
            <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3">
              {chips.map(([id, label, n]) => (
                <button key={id} type="button" onClick={() => setApprovalTab(id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    approvalTab === id ? on[id] : 'border-line/12 text-ink-muted hover:text-ink hover:border-line/30'
                  }`}>
                  {label} <span className="font-normal opacity-70">({n})</span>
                </button>
              ))}
            </div>
          )
        })()}

        {items.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-8 h-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">Belum ada produk. Klik "Tambah Produk".</p>
          </div>
        ) : (() => {
          const visible = approvalTab === 'all'
            ? byProduct
            : byProduct.filter(([, its]) => activeItems(its).some(it => approvalStatusOfItem(approvals, it) === approvalTab))
          if (!visible.length) return (
            <p className="text-center py-8 text-sm text-ink-muted">Tidak ada produk berstatus ini.</p>
          )
          return (
          <div className="divide-y divide-line/8">
            {visible.map(([productId, its]) => {
              const p = productMap[productId]
              return (
                <div key={productId} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[13px] font-semibold text-ink-strong truncate">
                      {p ? p.name : '(produk dihapus)'}
                      <span className="text-ink-faint font-normal">
                        {' '}· {activeItems(its).length} varian
                        {its.length > activeItems(its).length && ` · ${its.length - activeItems(its).length} dikecualikan`}
                      </span>
                    </p>
                    <button onClick={() => removeProduct(productId)} title="Hapus produk dari campaign" className="text-ink-faint hover:text-red-400 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {activeItems(its).length === 0 && (
                    <p className="text-[11px] text-amber-300 mb-2">Semua varian dikecualikan — produk ini tidak diajukan ke client.</p>
                  )}
                  {/* Persetujuan — di sini berlaku untuk semua SKU produk ini;
                      keputusan per SKU dari client ditimpa (lihat setApproval). */}
                  <div className="flex flex-wrap items-center gap-2 mb-2.5">
                    <span className="text-[10px] font-medium text-ink-faint">Persetujuan (semua SKU):</span>
                    <div className="inline-flex rounded-lg border border-line/12 overflow-hidden">
                      {['approved', 'pending', 'rejected'].map(st => {
                        // Status EFEKTIF dari SKU aktif — keputusan client per
                        // SKU ikut terbaca; 'mixed' = tak ada tombol aktif.
                        const active = productApprovalStatus(approvals, its) === st
                        const on = { approved: 'bg-green-600 text-white', pending: 'bg-amber-500 text-black', rejected: 'bg-red-600 text-white' }[st]
                        return (
                          <button key={st} type="button" onClick={() => setApproval(productId, st)}
                            className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${active ? on : 'text-ink-muted hover:text-ink hover:bg-fill/8'}`}>
                            {APPROVAL[st].label}
                          </button>
                        )
                      })}
                    </div>
                    {productApprovalStatus(approvals, its) === 'mixed' && (() => {
                      const sm = skuApprovalSummary(its, approvals)
                      return (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-fill/8 text-ink-muted whitespace-nowrap" title="Status SKU berbeda-beda">
                          Campuran{sm.approved > 0 && <span className="text-green-300"> {sm.approved}✓</span>}{sm.rejected > 0 && <span className="text-red-300"> {sm.rejected}✗</span>}{sm.pending > 0 && <span className="text-amber-300"> {sm.pending}•</span>}
                        </span>
                      )
                    })()}
                    <input value={approvals[productId]?.note ?? ''} onChange={e => setApprovalNote(productId, e.target.value)}
                      placeholder="catatan (opsional, mis. alasan tolak / revisi)"
                      className="flex-1 min-w-[160px] bg-fill/5 border border-line/10 rounded-lg px-2.5 py-1 text-[11px] text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
                  </div>
                  {(() => {
                    const ov = activeItems(its).filter(it => hasOwnApproval(approvals, it))
                    if (!ov.length) return null
                    return (
                      <p className="text-[10px] text-amber-300 mb-2 -mt-1">
                        {ov.length} SKU punya keputusan sendiri dari client — memakai tombol di atas akan menimpanya.
                      </p>
                    )
                  })()}
                  <div className="space-y-1.5">
                    {its.map((it, vi) => {
                      const m = itemMargin(it, productMap)
                      const calc = itemCalc(it, productMap)
                      const v = p ? productVariations(p)[it.varIdx] : null
                      const normal = v ? (+v.jual || 0) : 0
                      const off = isExcluded(it)
                      return (
                        <div key={it.varIdx} className={off ? 'opacity-60' : ''}>
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className={`text-[13px] truncate ${off ? 'text-ink-muted line-through' : 'text-ink'}`}>
                                {v?.name?.trim() || it.name || `Varian ${it.varIdx + 1}`}
                              </p>
                              <p className="text-[11px] text-ink-faint truncate">
                                {off ? (
                                  <span className="text-amber-300">{reasonLabel(it)} · tidak diajukan ke client</span>
                                ) : (
                                  <>
                                    {it.sku || 'tanpa SKU'}{normal ? ` · normal ${fmt(normal)}` : ''}
                                    {(() => { const f = totalFee(calc); return f && +it.price > 0 ? <> · komisi &amp; biaya {f.pct.toFixed(1)}% ({fmt(f.amount)})</> : null })()}
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="relative flex items-center flex-shrink-0 w-32">
                              <span className="absolute left-2.5 text-[11px] text-ink-faint">Rp</span>
                              <input type="number" min="0" value={it.price} disabled={off}
                                onChange={e => setPrice(it.productId, it.varIdx, e.target.value)}
                                placeholder="harga campaign"
                                className="w-full bg-fill/5 border border-line/10 rounded-lg pl-8 pr-2 py-1.5 text-[13px] text-ink-strong tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-50" />
                            </div>
                            <span title={activeVouchers.length ? 'margin tanpa voucher' : undefined} className={`text-[12px] font-semibold tabular-nums w-14 text-right flex-shrink-0 ${off ? 'text-ink-faint' : marginCls(m)}`}>{off ? '—' : (m != null ? `${m.toFixed(1)}%` : '—')}</span>
                            <button type="button" onClick={() => toggleExclude(it.productId, it.varIdx)}
                              title={off ? 'Ikutkan lagi ke campaign' : 'Kecualikan varian ini dari campaign'}
                              className={`p-1 rounded-lg flex-shrink-0 transition-colors ${off ? 'text-blue-400 hover:bg-blue-600/10' : 'text-ink-faint hover:text-red-400 hover:bg-red-500/10'}`}>
                              {off ? <RefreshCw className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {!off && <VoucherLines item={it} productMap={productMap} vouchers={activeVouchers} kind={campaignType} showHeader={vi === its.findIndex(x => !isExcluded(x))} />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          )
        })()}
        <p className="text-[11px] text-ink-faint px-5 py-3 border-t border-line/8">
          Harga campaign default dari "Harga Campaign" tiap varian (price list), bisa diubah khusus campaign ini. Margin dihitung dari HPP &amp; biaya varian.
          {campaignType === 'cofunded' && activeVouchers.length > 0 && (
            <> Angka % besar di kanan tiap varian = margin <b>tanpa voucher</b>; kolom "Harga customer" &amp; margin per tier ada di bawahnya (asumsi customer beli varian itu sampai lolos min. pesanan).</>
          )}
        </p>
      </div>

      {showPicker && (
        <ProductPicker products={products} enrolledIds={enrolledIds} platform={platform}
          onAdd={addProduct} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}

// Kelompokkan item per produk, urut kemunculan pertama.
function byProductList(items) {
  const out = [], seen = new Map()
  for (const it of (items || [])) {
    if (!seen.has(it.productId)) { seen.set(it.productId, []); out.push([it.productId, seen.get(it.productId)]) }
    seen.get(it.productId).push(it)
  }
  return out
}

const VERDICT_CLS = {
  worth: 'bg-green-500/12 text-green-300',
  thin:  'bg-amber-500/12 text-amber-300',
  low:   'bg-red-500/12 text-red-300',
}

// Setujui / Tolak satu SKU langsung dari daftar campaign.
// Kedua tombol sengaja BEDA BENTUK (bulat vs kotak), bukan cuma beda warna:
// keduanya berdempetan dan bersebelahan puluhan kali di layar yang sama.
// Menekan tombol yang sedang aktif mengembalikan SKU ke Menunggu.
function SkuDecision({ it, status, own, onDecide }) {
  const [busy, setBusy] = useState(false)
  if (!onDecide) {
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 w-[62px] text-center ${APPROVAL[status].cls}`}>{APPROVAL[status].label}</span>
  }
  async function hit(st) {
    if (busy) return
    setBusy(true)
    try { await onDecide(it, status === st ? 'pending' : st) } finally { setBusy(false) }
  }
  const base = 'flex items-center justify-center transition-colors disabled:opacity-50 flex-shrink-0'
  return (
    <div className="flex items-center gap-1 flex-shrink-0" title={own ? 'diputuskan khusus SKU ini' : 'ikut keputusan produk'}>
      <button type="button" disabled={busy} onClick={() => hit('approved')}
        title={status === 'approved' ? 'Batalkan — kembalikan ke Menunggu' : 'Setujui SKU ini'}
        className={`${base} w-6 h-6 rounded-full border ${status === 'approved'
          ? 'bg-green-600 border-green-500 text-white'
          : 'border-line/20 text-ink-faint hover:text-green-300 hover:border-green-500/40'}`}>
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" disabled={busy} onClick={() => hit('rejected')}
        title={status === 'rejected' ? 'Batalkan — kembalikan ke Menunggu' : 'Tolak SKU ini'}
        className={`${base} w-6 h-6 rounded-md border ${status === 'rejected'
          ? 'bg-red-600 border-red-500 text-white'
          : 'border-line/20 text-ink-faint hover:text-red-300 hover:border-red-500/40'}`}>
        <X className="w-3.5 h-3.5" />
      </button>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-[62px] text-center ${APPROVAL[status].cls}`}>
        {APPROVAL[status].label}
      </span>
    </div>
  )
}

// Kartu satu produk di dalam detail campaign: status, verdict worth-it,
// riwayat approval, lalu tiap varian (harga campaign, margin, komisi & biaya
// yang bisa diklik untuk breakdown, tabel voucher).
function ProductCard({ c, productId, its, productMap, fresh = EMPTY_KEYS, seenAt = '', onDecide }) {
  const [openFee, setOpenFee] = useState(null)
  const p = productMap[productId]
  const cfg = c.voucherConfig
  const kind = cfg?.kind || 'normal'
  const cvs = voucherList(cfg)
  const target = +(cfg?.targetMargin) || DEFAULT_TARGET_MARGIN
  // Varian yang dikecualikan tak ikut hitungan; tetap ditampilkan (dicoret) di
  // aplikasi supaya tim tahu apa yang dikeluarkan — di /approve disembunyikan.
  const act = activeItems(its)
  const worst = worstProductMargin(act, productMap, cfg)
  const verdict = worthVerdict(worst, target)
  // Ringkasan per SKU (client bisa memutuskan SKU satu per satu di /approve).
  const sum = skuApprovalSummary(its, c.approvals)
  const stLabel = sum.total === 0 ? null
    : sum.approved === sum.total ? { label: 'Semua SKU disetujui', cls: APPROVAL.approved.cls }
    : sum.rejected === sum.total ? { label: 'Semua SKU ditolak', cls: APPROVAL.rejected.cls }
    : sum.approved === 0 && sum.rejected === 0 ? { label: 'Menunggu', cls: APPROVAL.pending.cls }
    : { label: `${sum.approved}/${sum.total} SKU disetujui${sum.rejected ? ` · ${sum.rejected} ditolak` : ''}`,
        cls: sum.rejected > 0 ? APPROVAL.rejected.cls : APPROVAL.pending.cls }
  // Entri riwayat dihitung baru bila lebih muda dari batas "terakhir dilihat".
  const seenMs = Date.parse(seenAt || '') || 0
  const isFresh = e => !!e.by && (Date.parse(e.at || '') || 0) > seenMs
  // Nama varian yang cuma mengulang nama produk tak usah dicetak lagi — di
  // produk satu varian, nama panjang itu sudah muncul sebagai judul kartu.
  const skuLabel = n => ((n || '').trim().toLowerCase() === (p?.name || '').trim().toLowerCase() ? '' : n)
  const plog = approvalLogOfProduct(c, productId, its)
  const a = c.approvals?.[productId]
  const logRows = plog.length > 0 ? plog.slice(0, 4)
    : (a?.at && a.status !== 'pending') ? [{ status: a.status, by: a.by, byName: a.byName, at: a.at, note: a.note, sku: null }] : []

  return (
    <div className="bg-surface rounded-2xl border border-line/12 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center flex-shrink-0"><Package className="w-4 h-4 text-blue-400" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p title={p?.name || ''} className="text-[13px] font-semibold text-ink-strong truncate max-w-[420px]">{p ? p.name : '(produk dihapus)'}</p>
            {stLabel && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${stLabel.cls}`}>{stLabel.label}</span>}
            {fresh.has(productId) && (
              <span title="ada keputusan client baru di produk ini"
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-600/15 text-blue-300">Baru</span>
            )}
            {verdict && <span title={`margin terburuk ${worst?.toFixed(1)}% vs target ${target}%`} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${VERDICT_CLS[verdict.key]}`}>{verdict.label}</span>}
          </div>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {act.length} varian
            {its.length > act.length && <span className="text-amber-300"> · {its.length - act.length} dikecualikan</span>}
            {' '}· target margin {target}%{worst != null ? ` · margin terburuk ${worst.toFixed(1)}%` : ''}
          </p>
        </div>
      </div>

      {logRows.length > 0 && (
        <div className="px-4 py-2 bg-fill/5 border-y border-line/8 space-y-0.5">
          {logRows.map((e, k) => (
            <p key={k} className="text-[10px] text-ink-faint flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'approved' ? 'bg-green-400' : e.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'}`} />
              <span className="text-ink-muted">{APPROVAL[e.status]?.label || e.status}</span>
              <span className="text-ink-faint flex-shrink-0 truncate max-w-[220px]">· {skuLabel(e.sku) || 'semua SKU'}</span>
              <span className="truncate">{(e.by || e.byName) ? `oleh ${e.byName ? `${e.byName} (${e.by})` : e.by}` : ''}{e.note ? ` · "${e.note}"` : ''}</span>
              {isFresh(e) && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-600/15 text-blue-300 flex-shrink-0">Baru</span>}
              <span className="ml-auto flex-shrink-0">{fmtWhen(e.at)}</span>
            </p>
          ))}
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        {its.map((it, vi) => {
          const m = itemMargin(it, productMap)
          const calc = itemCalc(it, productMap)
          const fee = totalFee(calc)
          const feeRows = openFee === it.varIdx ? feeBreakdown(calc) : null
          const off = isExcluded(it)
          if (off) return (
            <div key={it.varIdx} className="flex items-center gap-3 opacity-60">
              <p className="text-[13px] text-ink-muted line-through truncate min-w-0 flex-1">{variantLabel(it, p) || it.sku || `Varian ${it.varIdx + 1}`}</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/12 text-amber-300 flex-shrink-0">{reasonLabel(it)}</span>
            </div>
          )
          return (
            <div key={it.varIdx}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  {(() => { const vl = variantLabel(it, p)
                    return vl
                      ? <p title={vl} className="text-[13px] text-ink truncate">{vl}</p>
                      : <p className="text-[13px] text-ink tabular-nums truncate">{it.sku || `Varian ${it.varIdx + 1}`}</p> })()}
                  <p className="text-[11px] text-ink-faint truncate">
                    {/* Kode SKU sudah jadi judul baris saat nama varian cuma
                        mengulang nama produk — di situ baris ini isinya biaya saja. */}
                    {variantLabel(it, p) ? (it.sku || 'tanpa SKU') : null}
                    {fee && +it.price > 0 && (
                      <>{variantLabel(it, p) ? ' · ' : ''}<button onClick={() => setOpenFee(o => o === it.varIdx ? null : it.varIdx)}
                        className="text-ink-muted hover:text-blue-400 underline decoration-dotted underline-offset-2">
                        komisi &amp; biaya {fee.pct.toFixed(1)}% ({fmt(fee.amount)})
                      </button></>
                    )}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[9px] text-ink-faint leading-none mb-0.5">Harga campaign</p>
                  <span className="text-[13px] font-semibold text-ink-strong tabular-nums">{fmt(+it.price)}</span>
                </div>
                <span className={`text-[12px] font-semibold tabular-nums w-14 text-right flex-shrink-0 ${marginCls(m)}`}>{m != null ? `${m.toFixed(1)}%` : '—'}</span>
                {fresh.has(itemKey(it)) && (
                  <span title="keputusan client baru" className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-600/15 text-blue-300 flex-shrink-0">Baru</span>
                )}
                <SkuDecision it={it} status={approvalStatusOfItem(c.approvals, it)}
                  own={hasOwnApproval(c.approvals, it)} onDecide={onDecide} />
              </div>
              {feeRows && (
                <div className="mt-1.5 mb-1 rounded-lg bg-fill/5 border border-line/8 p-2.5 space-y-1">
                  {feeRows.map((r, k) => (
                    <div key={k} className="flex items-center justify-between text-[11px]">
                      <span className="text-ink-muted">{r.label}{r.pct != null ? ` (${r.pct.toFixed(r.pct % 1 ? 1 : 0)}%)` : ''}</span>
                      <span className="text-ink tabular-nums">−{fmt(r.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-line/8 font-semibold">
                    <span className="text-ink-strong">Total komisi &amp; biaya</span>
                    <span className="text-ink-strong tabular-nums">−{fmt(fee.amount)}</span>
                  </div>
                </div>
              )}
              {cvs.length > 0 && <VoucherLines item={it} productMap={productMap} vouchers={cvs} kind={kind} showHeader={vi === its.findIndex(x => !isExcluded(x))} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Modal Bagikan — dipakai dari daftar campaign & dari editor. Menyimpan mode +
// email undangan secara mandiri (tak perlu Perbarui) lalu buat/salin link.
function ShareApprovalModal({ campaign, onClose, onSaved }) {
  const [access, setAccess]       = useState(campaign.approvalAccess || 'private')
  const [emailsText, setEmailsText] = useState((campaign.approvalEmails || []).join('\n'))
  const [shareUrl, setShareUrl]   = useState(campaign.shareToken ? `${window.location.origin}/approve?t=${campaign.shareToken}` : '')
  const [busy, setBusy]           = useState(false)
  const [copied, setCopied]       = useState(false)
  const [err, setErr]             = useState(null)

  const emails = () => [...new Set(emailsText.split(/[\n,;]/).map(e => e.trim().toLowerCase()).filter(Boolean))]
  function errMsg(e) {
    const m = e?.message || 'Gagal menyimpan.'
    if (/share_token|approval_|column|does not exist|schema cache/i.test(m))
      return 'Kolom database belum ada. Jalankan migrasi 0039 di Supabase → SQL Editor dulu.'
    return m
  }
  async function saveAndLink() {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await updateApprovalSettings(campaign.id, { access, emails: emails() })
      const token = await ensureShareToken(campaign.id)
      const url = `${window.location.origin}/approve?t=${token}`
      setShareUrl(url)
      await navigator.clipboard?.writeText(url).catch(() => {})
      setCopied(true); setTimeout(() => setCopied(false), 1800)
      onSaved?.()
    } catch (e) { console.error(e); setErr(errMsg(e)) }
    finally { setBusy(false) }
  }
  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard?.writeText(shareUrl).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  async function regen() {
    if (busy || !confirm('Buat link baru? Link lama akan berhenti berfungsi.')) return
    setBusy(true); setErr(null)
    try { const t = await regenerateShareToken(campaign.id); setShareUrl(`${window.location.origin}/approve?t=${t}`) }
    catch (e) { console.error(e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title="Bagikan untuk Persetujuan" subtitle="Atasan/client approve via link (login email)" onClose={onClose} maxWidth="max-w-lg">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[11px] font-medium text-ink-faint mb-1.5">Mode akses</label>
          <div className="grid grid-cols-2 gap-2">
            {[['private', 'Private', 'Hanya email yang diundang'], ['public', 'Public', 'Siapa saja yang login via link']].map(([id, label, desc]) => (
              <button key={id} type="button" onClick={() => setAccess(id)}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${access === id ? 'bg-blue-600/10 border-blue-500/40' : 'border-line/10 hover:border-line/25'}`}>
                <p className={`text-[13px] font-semibold ${access === id ? 'text-blue-300' : 'text-ink-strong'}`}>{label}</p>
                <p className="text-[10px] text-ink-faint mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>
        {access === 'private' && (
          <div>
            <label className="block text-[11px] font-medium text-ink-faint mb-1.5">Email approver yang diundang <span className="text-ink-faint">(satu per baris / pisah koma)</span></label>
            <textarea value={emailsText} onChange={e => setEmailsText(e.target.value)} rows={3}
              placeholder="atasan@perusahaan.com&#10;client@brand.com"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/40 resize-none" />
          </div>
        )}
        {err && <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}
        {shareUrl && (
          <div className="flex items-center gap-2">
            <input readOnly value={shareUrl} onFocus={e => e.target.select()}
              className="flex-1 min-w-0 bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-[11px] text-ink-muted focus:outline-none" />
            <button type="button" onClick={copyLink} title="Salin" className="p-2 rounded-xl border border-line/15 text-ink-faint hover:text-ink hover:border-line/30 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={regen} disabled={busy} title="Buat link baru (cabut link lama)" className="p-2 rounded-xl border border-line/15 text-ink-faint hover:text-ink hover:border-line/30 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-ink-muted hover:text-ink">Tutup</button>
          <button type="button" onClick={saveAndLink} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            <ExternalLink className="w-4 h-4" />{busy ? 'Menyimpan…' : copied ? 'Tersalin!' : shareUrl ? 'Simpan & salin link' : 'Simpan & buat link'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Modal Portal Client — SATU link untuk seluruh campaign workspace ini. Client
// melihat mana yang belum di-ACC, sedang berjalan, dan sudah selesai; anggota
// portal otomatis boleh membuka halaman persetujuan tiap campaign (tak perlu
// diundang satu per satu). Campaign bisa disembunyikan lewat ikon mata.
// Status pendaftaran campaign ke marketplace. Diisi admin, dibaca client di
// portal — jadi catatannya ditulis untuk client, bukan catatan internal.
// Lembar kerja pendaftaran ke marketplace. Bukan cuma pemilih status: isinya
// justru yang dibutuhkan saat membuka Seller Centre — SKU mana yang boleh
// masuk (bisa disalin), mana yang jangan, dan mana yang client belum putuskan.
function RegistrationModal({ campaign, onClose, onSave }) {
  const cur = registrationStatus(campaign)
  const [note, setNote] = useState(campaign?.registration?.note || '')
  const [link, setLink] = useState(campaign?.registration?.link || '')
  const [showNote, setShowNote] = useState(!!(campaign?.registration?.note || campaign?.registration?.link))
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [all, setAll] = useState(false)

  const sheet = useMemo(() => registrationSheet(campaign), [campaign])
  const TABS = [
    { id: 'approved', label: 'Disetujui', list: sheet.approved, on: 'bg-green-500/15 text-green-300' },
    { id: 'rejected', label: 'Ditolak', list: sheet.rejected, on: 'bg-red-500/15 text-red-300' },
    // Tab ini hanya muncul kalau memang ada sisa — campaign yang sudah
    // diputuskan penuh cukup melihat dua tab.
    ...(sheet.pending.length ? [{ id: 'pending', label: 'Menunggu', list: sheet.pending, on: 'bg-amber-500/15 text-amber-300' }] : []),
  ]
  const [tab, setTab] = useState('approved')
  const active = TABS.find(t => t.id === tab) || TABS[0]
  const rows = all ? active.list : active.list.slice(0, 5)
  const platform = PLATFORM_LABEL[campaign?.platform] || campaign?.platform || 'marketplace'

  async function copySku() {
    await navigator.clipboard?.writeText(skuText(sheet.approved)).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }
  async function apply(status) {
    setBusy(true)
    try { await onSave({ status, note, link }) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Daftarkan ke ${platform}`} subtitle={campaign?.name} onClose={onClose} maxWidth="max-w-md">
      <div className="p-5">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); setAll(false) }}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                tab === t.id ? t.on : 'text-ink-faint hover:text-ink'}`}>
              {t.label} · {t.list.length}
            </button>
          ))}
          {/* Tombol salin SENGAJA cuma ada di tab Disetujui: kalau ikut muncul
              di tab lain, kode yang ditolak bisa ikut tersalin ke Seller Centre. */}
          {tab === 'approved' && sheet.approved.length > 0 && (
            <button type="button" onClick={copySku} disabled={busy}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium border border-line/15 text-ink-muted hover:text-ink hover:border-line/30 transition-colors">
              <Copy className="w-3.5 h-3.5" />{copied ? 'Tersalin' : 'Salin'}
            </button>
          )}
        </div>

        {active.list.length === 0 ? (
          <p className="text-[12px] text-ink-faint py-4 text-center">Tidak ada SKU di kelompok ini.</p>
        ) : (
          <div className="mb-1">
            {rows.map(it => (
              <div key={itemKey(it)} className="flex items-start justify-between gap-3 py-1.5 border-t border-line/8">
                <div className="min-w-0">
                  <p className={`text-[13px] tabular-nums ${tab === 'rejected' ? 'text-ink-faint line-through' : 'text-ink'}`}>
                    {it.sku || it.name || `Varian ${it.varIdx + 1}`}
                  </p>
                  {tab === 'rejected' && (
                    <p className="text-[11px] text-ink-faint">{it.note ? `"${it.note}"` : 'tanpa catatan'}</p>
                  )}
                </div>
                <span className="text-[13px] text-ink-muted tabular-nums flex-shrink-0">{fmt(+it.price)}</span>
              </div>
            ))}
            {active.list.length > rows.length && (
              <button type="button" onClick={() => setAll(true)}
                className="w-full text-left text-[12px] text-blue-400 hover:underline py-1.5 border-t border-line/8">
                {active.list.length - rows.length} lainnya
              </button>
            )}
          </div>
        )}

        {tab === 'pending' && (
          <p className="text-[11px] text-amber-300 mt-2">
            SKU ini belum diputuskan client. Kalau didaftarkan sekarang, harganya belum disetujui siapa pun.
          </p>
        )}

        {showNote ? (
          <div className="mt-4 space-y-2">
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={180}
              placeholder="Catatan untuk client, mis. 4 SKU yang ditolak tidak diikutkan"
              className="w-full px-3 py-2 rounded-xl bg-fill/8 border border-line/12 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-blue-500/40" />
            <input value={link} onChange={e => setLink(e.target.value)}
              placeholder="Link bukti di Seller Centre (opsional)"
              className="w-full px-3 py-2 rounded-xl bg-fill/8 border border-line/12 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-blue-500/40" />
          </div>
        ) : null}

        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => apply('progress')} disabled={busy}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-60 ${
              cur === 'progress' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'border-line/15 text-ink hover:bg-fill/8'}`}>
            Sedang diproses
          </button>
          <button onClick={() => apply('done')} disabled={busy}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ${
              cur === 'done' ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            Sudah didaftarkan
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 mt-2.5">
          {showNote
            ? <span className="text-[11px] text-ink-faint">Catatan tersimpan saat status dipilih.</span>
            : <button type="button" onClick={() => setShowNote(true)} className="text-[11px] text-blue-400 hover:underline">Tambah catatan untuk client</button>}
          {cur !== 'none' && (
            <button type="button" onClick={() => apply('none')} disabled={busy}
              title="Hapus status beserta catatan, link, dan stempel waktunya"
              className="text-[11px] text-ink-faint hover:text-red-400 transition-colors">Batalkan status</button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function PortalShareModal({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState('private')
  const [emailsText, setEmailsText] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState(null)

  const linkOf = t => `${window.location.origin}/portal?t=${t}`
  const emails = () => [...new Set(emailsText.split(/[\n,;]/).map(e => e.trim().toLowerCase()).filter(Boolean))]
  function errMsg(e) {
    const m = e?.message || 'Gagal menyimpan.'
    if (/portal_|column|does not exist|schema cache/i.test(m))
      return 'Kolom portal belum ada. Jalankan migrasi 0060_campaign_portal.sql di Supabase → SQL Editor dulu.'
    return m
  }

  useEffect(() => {
    let alive = true
    getPortalSettings()
      .then(s => {
        if (!alive || !s) return
        setAccess(s.access); setEmailsText((s.emails || []).join('\n'))
        if (s.token) setUrl(linkOf(s.token))
      })
      .catch(e => { console.error(e); if (alive) setErr(errMsg(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function saveAndLink() {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await updatePortalSettings({ access, emails: emails() })
      const token = await ensurePortalToken()
      const link = linkOf(token)
      setUrl(link)
      await navigator.clipboard?.writeText(link).catch(() => {})
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch (e) { console.error(e); setErr(errMsg(e)) }
    finally { setBusy(false) }
  }
  async function copyLink() {
    if (!url) return
    await navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  async function regen() {
    if (busy || !confirm('Buat link portal baru? Link lama akan berhenti berfungsi.')) return
    setBusy(true); setErr(null)
    try { setUrl(linkOf(await regeneratePortalToken())) }
    catch (e) { console.error(e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title="Portal Client" subtitle="Satu link untuk semua campaign — status jadwal & persetujuan" onClose={onClose} maxWidth="max-w-lg">
      <div className="p-5 space-y-4">
        {loading ? (
          <p className="text-[12px] text-ink-faint py-4 text-center">Memuat pengaturan portal…</p>
        ) : (<>
          <div>
            <label className="block text-[11px] font-medium text-ink-faint mb-1.5">Mode akses</label>
            <div className="grid grid-cols-2 gap-2">
              {[['private', 'Private', 'Hanya email yang diundang'], ['public', 'Public', 'Siapa saja yang login via link']].map(([id, label, desc]) => (
                <button key={id} type="button" onClick={() => setAccess(id)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${access === id ? 'bg-blue-600/10 border-blue-500/40' : 'border-line/10 hover:border-line/25'}`}>
                  <p className={`text-[13px] font-semibold ${access === id ? 'text-blue-300' : 'text-ink-strong'}`}>{label}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>
          {access === 'private' && (
            <div>
              <label className="block text-[11px] font-medium text-ink-faint mb-1.5">Email yang diundang ke portal <span className="text-ink-faint">(satu per baris / pisah koma)</span></label>
              <textarea value={emailsText} onChange={e => setEmailsText(e.target.value)} rows={3}
                placeholder="atasan@perusahaan.com&#10;client@brand.com"
                className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-[13px] text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/40 resize-none" />
            </div>
          )}
          <p className="text-[11px] text-ink-faint">
            Semua campaign workspace ini tampil di portal, kecuali yang Anda sembunyikan lewat ikon mata di daftar.
          </p>
          {err && <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}
          {url && (
            <div className="flex items-center gap-2">
              <input readOnly value={url} onFocus={e => e.target.select()}
                className="flex-1 min-w-0 bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-[11px] text-ink-muted focus:outline-none" />
              <button type="button" onClick={copyLink} title="Salin" className="p-2 rounded-xl border border-line/15 text-ink-faint hover:text-ink hover:border-line/30 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={regen} disabled={busy} title="Buat link baru (cabut link lama)" className="p-2 rounded-xl border border-line/15 text-ink-faint hover:text-ink hover:border-line/30 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-ink-muted hover:text-ink">Tutup</button>
            <button type="button" onClick={saveAndLink} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <Users className="w-4 h-4" />{busy ? 'Menyimpan…' : copied ? 'Tersalin!' : url ? 'Simpan & salin link' : 'Simpan & buat link'}
            </button>
          </div>
        </>)}
      </div>
    </Modal>
  )
}

function ProductPicker({ products, enrolledIds, platform, onAdd, onClose }) {
  const [q, setQ] = useState('')
  // Hanya tampilkan produk dari marketplace yang sama dengan platform campaign.
  const onPlatform = useMemo(
    () => products.filter(p => (p.platform || 'shopee') === platform),
    [products, platform],
  )
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? onPlatform.filter(p => p.name.toLowerCase().includes(s)) : onPlatform
  }, [onPlatform, q])
  return (
    <Modal title="Tambah Produk ke Campaign" subtitle={`Produk ${PLATFORM_LABEL[platform] || platform} · semua varian ikut (harga default dari price list)`}
      onClose={onClose} maxWidth="max-w-md">
      <div className="p-5">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Cari produk ${PLATFORM_LABEL[platform] || platform}...`} autoFocus
            className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        </div>
        <div className="border border-line/10 rounded-xl divide-y divide-line/8 max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-ink-faint text-center py-6 flex flex-col items-center gap-1"><Package className="w-4 h-4" />{onPlatform.length === 0 ? `Belum ada produk ${PLATFORM_LABEL[platform] || platform}` : 'Tidak ada produk cocok'}</p>
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

// Rincian per-varian untuk tiap tier voucher, tabel berlabel: berapa pcs untuk
// dapat voucher, harga yang diterima customer, dan (co-funded) margin setelah
// beban penjual. Header kolom hanya dirender sekali (showHeader) agar rapi.
function VoucherLines({ item, productMap, vouchers, kind, showHeader }) {
  if (!vouchers.length || !(+item.price > 0)) return null
  const cofunded = kind === 'cofunded'
  const cols = cofunded ? '44px 1fr 1fr 1fr 50px' : '44px 1fr 1fr'
  return (
    <div className="mt-1.5 mb-1">
      {showHeader && (
        <div className="grid gap-2 text-[10px] text-ink-faint pb-1" style={{ gridTemplateColumns: cols }}>
          <span>Voucher</span>
          <span>Minimal Qty</span>
          <span>Harga customer</span>
          {cofunded && <span>Beban penjual</span>}
          {cofunded && <span className="text-right">Margin</span>}
        </div>
      )}
      <div className="space-y-1">
        {vouchers.map((v, i) => {
          const eff = voucherEffect(v, item.price)
          if (!eff) return null
          const m = cofunded ? itemMargin(item, productMap, eff.sellerPerUnit) : null
          return (
            <div key={i} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: cols }}>
              <span className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-blue-600/12 text-blue-300 font-semibold tabular-nums">{fmtPct(v.discPct)}</span>
              <span className="text-ink-faint tabular-nums">{eff.pcs} pcs</span>
              <span className="text-ink-strong font-semibold tabular-nums">{fmt(eff.custPerUnit)}</span>
              {cofunded && <span title={`total ${fmt(eff.sellerCost)} untuk ${eff.pcs} pcs`} className="text-amber-300/90 tabular-nums">{fmt(eff.sellerPerUnit)}<span className="text-ink-faint">/pcs</span></span>}
              {cofunded && <span className={`text-right font-semibold tabular-nums ${marginCls(m)}`}>{m != null ? `${m.toFixed(1)}%` : '—'}</span>}
            </div>
          )
        })}
      </div>
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
