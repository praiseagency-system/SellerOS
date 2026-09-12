import { useState, useEffect, useCallback } from 'react'
import { Lock, Check, X, User, ChevronDown, ChevronRight, ChevronLeft, FileText, CalendarRange, ExternalLink } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ApproverShell, LoginBox, Spinner, Notice } from '../components/ApproverChrome'
import { getCampaignByToken, submitApproval } from '../data/campaignApproval'
import {
  fmt, marginCls, fmtPct, hrefOf, itemMargin, itemCalc, totalFee, feeBreakdown,
  voucherEffect, voucherList, APPROVAL, activeItems, itemKey,
  approvalStatusOfItem, hasOwnApproval, skuApprovalSummary, approvalLogOfProduct,
  originalPrice, discountPct, hasHpp, priceStats, worstKnownMargin,
} from '../utils/campaignPricing'
import { campaignPeriods, periodsSummary, periodRange, periodLabel, periodStatus } from '../utils/campaignPeriods'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('t') || ''
// Token portal asal (dikirim halaman /portal) — untuk tautan "semua campaign".
const portalFromUrl = () => new URLSearchParams(window.location.search).get('p') || ''
const Shell = ({ children }) => <ApproverShell label="Persetujuan Harga Campaign">{children}</ApproverShell>
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
function fmtDT(iso) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const dateRange = periodsSummary

// Angka ringkas untuk subjudul kartu (rentang harga). Nilai persisnya tetap
// ada di tabel begitu kartu dibuka.
function fmtCompact(n) {
  if (n == null || isNaN(n)) return '—'
  const v = Math.round(n)
  if (v >= 1000000) return `Rp${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1).replace('.', ',')}jt`
  if (v >= 1000) return `Rp${Math.round(v / 1000)}rb`
  return fmt(v)
}
function rangeText(r, f = fmtCompact) {
  if (!r) return null
  if (r.min === r.max) return f(r.min)
  return `${f(r.min)}–${f(r.max).replace(/^Rp/, '')}`
}
function pctRangeText(r) {
  if (!r) return null
  const a = Math.round(r.min), b = Math.round(r.max)
  return a === b ? `${a}%` : `${a}–${b}%`
}

export default function ApprovalPage() {
  const { loading: authLoading, user } = useAuth()
  const token = tokenFromUrl()

  if (!token) return <Shell><Notice icon={Lock} title="Link tidak valid" body="Tautan approval tidak lengkap. Minta link baru dari tim." /></Shell>
  if (authLoading) return <Shell><Spinner /></Shell>
  if (!user) return <Shell><LoginBox /></Shell>
  return <Shell><ApprovalBody token={token} email={user.email} /></Shell>
}

function ApprovalBody({ token, email }) {
  const [state, setState] = useState({ loading: true, error: null, campaign: null, products: {} })
  const [name, setName] = useState(() => { try { return localStorage.getItem('approve_name') || '' } catch { return '' } })
  function persistName(v) { setName(v); try { localStorage.setItem('approve_name', v) } catch { /* ignore */ } }
  const [showDetail, setShowDetail] = useState(false)
  const [busyAll, setBusyAll] = useState(false)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await getCampaignByToken(token)
      const products = Object.fromEntries(
        Object.entries(res.products || {}).map(([id, p]) => [id, { ...(p.data || {}), id: p.id, name: p.name }])
      )
      setState({ loading: false, error: null, campaign: res.campaign, products })
    } catch (e) {
      const msg = /not authorized/i.test(e.message) ? `Email ${email} tidak diundang untuk campaign ini. Klik "Keluar" lalu masuk dengan email yang diundang, atau minta admin menambahkan email ini.`
        : /invalid token/i.test(e.message) ? 'Link tidak valid atau sudah dicabut.'
        : 'Gagal memuat campaign.'
      setState({ loading: false, error: msg, campaign: null, products: {} })
    }
  }, [token, email])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (state.loading) return <Spinner />
  if (state.error) return <Notice icon={Lock} title="Tidak bisa diakses" body={state.error} />

  const c = state.campaign
  const productMap = state.products
  const nameRequired = c.approvalAccess === 'public'
  const blocked = nameRequired && !name.trim()
  // Kelompokkan item per produk (urut kemunculan). Varian yang dikecualikan
  // tim TIDAK ditampilkan sama sekali di sini — produk yang seluruh variannya
  // dikecualikan otomatis hilang dari daftar persetujuan.
  const groups = []
  const seen = new Map()
  for (const it of activeItems(c.items)) {
    if (!seen.has(it.productId)) { seen.set(it.productId, []); groups.push([it.productId, seen.get(it.productId)]) }
    seen.get(it.productId).push(it)
  }
  const vouchers = voucherList(c.voucherConfig)

  // Keputusan disimpan PER SKU: kuncinya itemKey (`productId:varIdx`), satu
  // panggilan RPC per SKU (RPC-nya set satu kunci). Dikirim berurutan supaya
  // tulisan terakhir tak menimpa yang lain, lalu state dipakai dari respons
  // terakhir (RPC selalu mengembalikan approvals utuh).
  async function actItems(items, status, note) {
    if (blocked || !items.length) return
    try {
      let last = null
      for (const it of items) {
        const k = itemKey(it)
        const n = note != null ? note : (c.approvals?.[k]?.note || '')
        last = await submitApproval(token, k, status, n, name.trim())
      }
      if (last) setState(s => ({ ...s, campaign: { ...s.campaign, approvals: last.approvals, approvalLog: last.approvalLog } }))
    } catch { alert('Gagal menyimpan keputusan. Coba lagi.') }
  }

  // Keputusan borongan untuk SKU yang belum diputuskan di SELURUH campaign.
  const pendingAll = activeItems(c.items).filter(it => approvalStatusOfItem(c.approvals, it) === 'pending')
  async function approveRest() {
    if (!pendingAll.length) return
    if (!window.confirm(`Setujui ${pendingAll.length} SKU yang belum diputuskan?`)) return
    setBusyAll(true)
    await actItems(pendingAll, 'approved', '')
    setBusyAll(false)
  }

  const portalToken = portalFromUrl() || c.portalToken || ''
  const portalLink = portalToken ? `/portal?t=${encodeURIComponent(portalToken)}` : null
  const stats = priceStats(c.items, productMap)
  const worst = worstKnownMargin(c.items, productMap, c.voucherConfig)
  const sum = skuApprovalSummary(c.items, c.approvals)

  return (
    <div>
      <div className="mb-4">
        {/* Pintu ke daftar campaign lain: dari portal (?p=) atau — untuk yang
            dikirimi link satu campaign — dari token portal yang ikut dikirim
            RPC bila email ini memang anggota portal. */}
        {portalLink && (
          <a href={portalLink}
            className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-blue-400 mb-2 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Semua campaign
          </a>
        )}
        <p className="text-lg font-semibold text-ink-strong">{c.name}</p>
        <p className="text-xs text-ink-faint mt-0.5">
          {c.parentCampaign ? `${c.parentCampaign} · ` : ''}{dateRange(c)} · {PLATFORM_LABEL[c.platform] || c.platform}
          {c.approvalAccess === 'public' ? ' · akses publik' : ' · privat'}
        </p>
        {c.description && <p className="text-xs text-ink-muted mt-1">{c.description}</p>}
        {hrefOf(c.link) && (
          <a href={hrefOf(c.link)} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400 hover:text-blue-300 border border-line/15 hover:border-blue-500/40 rounded-lg px-2.5 py-1.5 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Buka halaman campaign
          </a>
        )}
      </div>

      <SummaryCard stats={stats} worst={worst} sum={sum} pending={pendingAll.length}
        disabled={blocked || busyAll} onApproveRest={approveRest} />

      {/* Periode efektif — ditampilkan rinci bila campaign aktif di beberapa rentang */}
      {campaignPeriods(c).length > 1 && (
        <div className="mb-4 bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
          <p className="text-[13px] font-semibold text-ink-strong flex items-center gap-2 mb-2">
            <CalendarRange className="w-4 h-4 text-blue-400" /> Periode efektif voucher
          </p>
          <div className="space-y-1.5">
            {campaignPeriods(c).map((p, i) => {
              const st = periodStatus(p)
              return (
                <div key={i} className="flex items-center gap-2 text-[13px]">
                  <span className="text-ink truncate">{periodLabel(p, i)}</span>
                  {st === 'running' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-500/12 text-green-300 flex-shrink-0">berjalan</span>}
                  {st === 'ended' && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-600/20 text-gray-400 flex-shrink-0">selesai</span>}
                  <span className="ml-auto text-[12px] text-ink-muted tabular-nums flex-shrink-0">{periodRange(p)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {c.detail && c.detail.trim() && (
        <div className="mb-4 bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
          <button onClick={() => setShowDetail(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-fill/5 transition-colors">
            {showDetail ? <ChevronDown className="w-4 h-4 text-ink-faint" /> : <ChevronRight className="w-4 h-4 text-ink-faint" />}
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="text-[13px] font-semibold text-ink-strong">Detail campaign</span>
            <span className="ml-auto text-[11px] text-ink-faint">{showDetail ? 'Sembunyikan' : 'Baca selengkapnya'}</span>
          </button>
          {showDetail && (
            <div className="px-4 pb-4 pt-1 border-t border-line/8">
              <p className="text-[13px] text-ink-muted whitespace-pre-wrap leading-relaxed">{c.detail}</p>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 bg-surface rounded-2xl border border-line/10 shadow-sm p-3 flex items-center gap-2">
        <User className="w-4 h-4 text-ink-faint flex-shrink-0" />
        <input value={name} onChange={e => persistName(e.target.value)}
          placeholder={`Nama Anda${nameRequired ? ' (wajib)' : ' (opsional)'}`}
          className="flex-1 min-w-0 bg-transparent text-sm text-ink-strong focus:outline-none" />
      </div>
      {blocked && <p className="text-[11px] text-amber-300 mb-3 -mt-2">Isi nama Anda dulu untuk bisa menyetujui atau menolak.</p>}

      <div className="space-y-3">
        {groups.map(([productId, its]) => (
          <ProductApprovalCard key={productId} c={c} productId={productId} its={its}
            productMap={productMap} vouchers={vouchers} disabled={blocked}
            defaultOpen={groups.length === 1} onActItems={actItems} />
        ))}
      </div>
      <p className="text-[11px] text-ink-faint text-center mt-5">
        Masuk sebagai {email}. Keputusan tersimpan otomatis &amp; langsung terlihat tim.
        {portalLink && <> · <a href={portalLink} className="text-blue-400 hover:text-blue-300">Lihat semua campaign</a></>}
      </p>
    </div>
  )
}

// Ringkasan di kepala halaman: seberapa dalam campaign memotong harga normal,
// margin terburuk yang benar-benar terhitung, dan sisa keputusan.
function SummaryCard({ stats, worst, sum, pending, disabled, onApproveRest }) {
  const decided = sum.approved + sum.rejected
  const pctOf = n => (sum.total ? (n / sum.total) * 100 : 0)
  const disc = pctRangeText(stats.discount)
  return (
    <div className="mb-4 bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Diskon dari harga asli" value={disc || '—'}
          hint={stats.above > 0 ? `${stats.above} SKU di atas harga normal`
            : !disc ? 'harga normal belum diisi'
            : stats.missingOriginal > 0 ? `${stats.missingOriginal} SKU tanpa harga normal` : null}
          hintCls={stats.above > 0 ? 'text-amber-300' : 'text-ink-faint'} />
        <Tile label="Margin terendah" value={worst != null ? `${worst.toFixed(1)}%` : '—'}
          cls={worst != null ? marginCls(worst) : 'text-ink-faint'}
          hint={worst == null ? 'HPP belum diisi' : null} />
        <Tile label="Sudah diputuskan" value={`${decided} / ${sum.total}`} />
      </div>

      {sum.total > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-fill/8 overflow-hidden flex">
          <span className="bg-green-400/80" style={{ width: `${pctOf(sum.approved)}%` }} />
          <span className="bg-red-400/80" style={{ width: `${pctOf(sum.rejected)}%` }} />
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        {pending > 0 && (
          <button onClick={onApproveRest} disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Setujui {pending} SKU sisanya
          </button>
        )}
        <p className="text-[11px] text-ink-faint">
          <span className="text-green-300">{sum.approved} disetujui</span>
          {sum.rejected > 0 && <> · <span className="text-red-300">{sum.rejected} ditolak</span></>}
          {sum.pending > 0 && <> · <span className="text-amber-300">{sum.pending} menunggu</span></>}
        </p>
      </div>
    </div>
  )
}

function Tile({ label, value, cls = 'text-ink-strong', hint, hintCls = 'text-ink-faint' }) {
  return (
    <div className="bg-fill/5 rounded-xl px-3 py-2.5">
      <p className="text-[11px] text-ink-faint leading-tight">{label}</p>
      <p className={`text-[17px] font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</p>
      {hint && <p className={`text-[10px] mt-0.5 ${hintCls}`}>{hint}</p>}
    </div>
  )
}

// Ringkasan status SKU untuk badge kartu.
function summaryBadge(s) {
  if (!s.total) return null
  if (s.approved === s.total) return { label: 'Semua SKU disetujui', cls: APPROVAL.approved.cls }
  if (s.rejected === s.total) return { label: 'Semua SKU ditolak', cls: APPROVAL.rejected.cls }
  if (s.approved === 0 && s.rejected === 0) return { label: 'Menunggu', cls: APPROVAL.pending.cls }
  return {
    label: `${s.approved}/${s.total} disetujui${s.rejected ? ` · ${s.rejected} ditolak` : ''}`,
    cls: s.rejected > 0 ? APPROVAL.rejected.cls : APPROVAL.pending.cls,
  }
}

function ProductApprovalCard({ c, productId, its, productMap, vouchers, disabled, defaultOpen, onActItems }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [openRow, setOpenRow] = useState(null)   // `${varIdx}:fee` | `${varIdx}:voucher`
  // Tombol setujui/tolak per SKU SELALU tampil untuk produk multi-varian.
  // `perSku` hanya menambah kolom centang untuk memutuskan beberapa SKU
  // sekaligus (mis. menolak 10 dari 44) — default tertutup supaya tabel bersih.
  const [perSku, setPerSku] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const p = productMap[productId]
  const sum = skuApprovalSummary(its, c.approvals)
  const badge = summaryBadge(sum)
  const log = approvalLogOfProduct(c, productId, its)
  const cofunded = c.voucherConfig?.kind === 'cofunded'
  const stats = priceStats(its, productMap)
  const single = its.length === 1
  const selected = its.filter(it => sel.has(itemKey(it)))
  const allSelected = selected.length === its.length && its.length > 0
  const noHpp = its.filter(it => !hasHpp(it, productMap)).length
  const showCust = vouchers.length > 0

  function toggleSel(it) {
    const k = itemKey(it)
    setSel(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  function toggleAll() { setSel(allSelected ? new Set() : new Set(its.map(itemKey))) }
  // Simpan lalu bersihkan pilihan & catatan supaya tak terpakai ulang tanpa sengaja.
  async function run(items, status) {
    setBusy(true)
    await onActItems(items, status, note.trim())
    setBusy(false)
    setSel(new Set()); setNote('')
  }

  const sub = [
    stats.original ? `asli ${rangeText(stats.original)}` : 'harga asli belum diisi',
    stats.campaign ? `campaign ${rangeText(stats.campaign)}` : null,
  ].filter(Boolean).join(' → ')
  const discTxt = pctRangeText(stats.discount)

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-fill/5 transition-colors">
        {open ? <ChevronDown className="w-4 h-4 text-ink-faint flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink-faint flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-strong truncate">
            {p ? p.name : '(produk dihapus)'} <span className="text-ink-faint font-normal">· {its.length} SKU</span>
          </p>
          <p className="text-[11px] text-ink-faint truncate">
            {sub}{discTxt ? ` · diskon ${discTxt}` : ''}
            {stats.above > 0 && <span className="text-amber-300"> · {stats.above} SKU di atas harga normal</span>}
          </p>
        </div>
        {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${badge.cls}`}>{badge.label}</span>}
      </button>

      {open && (<>
        {perSku && !single && (
          <div className="flex items-center gap-2 px-4 py-2 bg-fill/5 border-y border-line/8">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={disabled}
              className="w-3.5 h-3.5 accent-blue-600" aria-label="Pilih semua SKU" />
            <span className="text-[11px] text-ink-muted">Pilih semua SKU</span>
            <span className="ml-auto text-[11px] text-ink-faint">{selected.length ? `${selected.length} dipilih` : 'centang SKU yang mau diputuskan'}</span>
          </div>
        )}

        <div className="overflow-x-auto border-t border-line/8">
          <table className="w-full min-w-[520px] text-[12px]">
            <thead>
              <tr className="bg-fill/4 text-ink-faint">
                {perSku && !single && <th className="w-8 px-2 py-1.5" aria-label="Pilih" />}
                <th className="text-left font-normal px-4 py-1.5 text-[11px]">Varian</th>
                <th className="text-right font-normal px-2 py-1.5 text-[11px]">Harga asli</th>
                <th className="text-right font-normal px-2 py-1.5 text-[11px]">Harga campaign</th>
                {showCust && <th className="text-right font-normal px-2 py-1.5 text-[11px]">Harga customer</th>}
                <th className="text-right font-normal px-2 py-1.5 text-[11px]">Margin</th>
                <th className="text-right font-normal px-4 py-1.5 text-[11px]">{single ? 'Status' : 'Putusan'}</th>
              </tr>
            </thead>
            <tbody>
              {its.map(it => {
                const vname = it.name || `Varian ${it.varIdx + 1}`
                const ist = approvalStatusOfItem(c.approvals, it)
                const own = hasOwnApproval(c.approvals, it)
                const checked = sel.has(itemKey(it))
                const normal = originalPrice(it, productMap)
                const disc = discountPct(it, productMap)
                const known = hasHpp(it, productMap)
                const m = known ? itemMargin(it, productMap) : null
                // Komisi & biaya = total semua fee platform/komisi/program + biaya
                // proses pada harga campaign (sama dengan Kalkulator).
                const calc = itemCalc(it, productMap)
                const fee = totalFee(calc)
                const effs = vouchers.map(v => voucherEffect(v, it.price)).filter(Boolean)
                const custs = effs.map(e => e.custPerUnit)
                const feeOpen = openRow === `${it.varIdx}:fee`
                const vOpen = openRow === `${it.varIdx}:voucher`
                return (
                  <tr key={it.varIdx} className="border-t border-line/6 align-top">
                    {perSku && !single && (
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={checked} onChange={() => toggleSel(it)} disabled={disabled}
                          className="w-3.5 h-3.5 accent-blue-600" aria-label={`Pilih ${vname}`} />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <p className="text-[13px] text-ink">{vname}</p>
                      <p className="text-[11px] text-ink-faint">
                        {it.sku || 'tanpa SKU'}
                        {fee && +it.price > 0 && (
                          <> · <button onClick={() => setOpenRow(o => o === `${it.varIdx}:fee` ? null : `${it.varIdx}:fee`)}
                            className="text-ink-muted hover:text-blue-400 underline decoration-dotted underline-offset-2">
                            komisi &amp; biaya {fee.pct.toFixed(1)}% ({fmt(fee.amount)})
                          </button></>
                        )}
                      </p>
                      {feeOpen && (
                        <div className="mt-1.5 rounded-lg bg-fill/5 border border-line/8 p-2.5 space-y-1 max-w-[280px]">
                          {feeBreakdown(calc).map((r, k) => (
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
                      {vOpen && effs.length > 0 && (
                        <div className="mt-1.5 rounded-lg bg-fill/5 border border-line/8 p-2.5">
                          <div className="grid gap-2 text-[10px] text-ink-faint pb-1"
                            style={{ gridTemplateColumns: cofunded ? '44px 1fr 1fr 1fr 50px' : '44px 1fr 1fr' }}>
                            <span>Voucher</span><span>Minimal Qty</span><span>Harga customer</span>
                            {cofunded && <span>Beban penjual</span>}{cofunded && <span className="text-right">Margin</span>}
                          </div>
                          <div className="space-y-1">
                            {vouchers.map((v, i) => {
                              const eff = voucherEffect(v, it.price); if (!eff) return null
                              const vm = cofunded && known ? itemMargin(it, productMap, eff.sellerPerUnit) : null
                              return (
                                <div key={i} className="grid gap-2 items-center text-[11px]"
                                  style={{ gridTemplateColumns: cofunded ? '44px 1fr 1fr 1fr 50px' : '44px 1fr 1fr' }}>
                                  <span className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-blue-600/12 text-blue-300 font-semibold tabular-nums">{fmtPct(v.discPct)}</span>
                                  <span className="text-ink-faint tabular-nums">{eff.pcs} pcs</span>
                                  <span className="text-ink-strong font-semibold tabular-nums">{fmt(eff.custPerUnit)}</span>
                                  {cofunded && <span className="text-amber-300/90 tabular-nums">{fmt(eff.sellerPerUnit)}<span className="text-ink-faint">/pcs</span></span>}
                                  {cofunded && <span className={`text-right font-semibold tabular-nums ${marginCls(vm)}`}>{vm != null ? `${vm.toFixed(1)}%` : '—'}</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {normal ? <span className="text-ink-faint line-through">{fmt(normal)}</span>
                        : <span className="text-ink-faint" title="Harga jual normal belum diisi di price list">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className="text-[13px] font-semibold text-ink-strong">{fmt(+it.price)}</span>
                      {disc != null && disc >= 0.5 && (
                        <span className="block text-[10px] text-blue-300">−{Math.round(disc)}%</span>
                      )}
                      {disc != null && disc < -0.5 && (
                        <span className="block text-[10px] text-amber-300">di atas harga normal</span>
                      )}
                    </td>
                    {showCust && (
                      <td className="px-2 py-2 text-right tabular-nums">
                        {custs.length === 0 ? <span className="text-ink-faint">—</span> : (
                          <button onClick={() => setOpenRow(o => o === `${it.varIdx}:voucher` ? null : `${it.varIdx}:voucher`)}
                            className="text-ink hover:text-blue-400 underline decoration-dotted underline-offset-2">
                            {custs.length === 1 ? fmt(custs[0]) : `${fmt(Math.min(...custs))}–${fmt(Math.max(...custs))}`}
                          </button>
                        )}
                      </td>
                    )}
                    <td className={`px-2 py-2 text-right tabular-nums font-semibold ${marginCls(m)}`}>
                      {m != null ? `${m.toFixed(1)}%` : <span className="text-ink-faint font-normal" title="HPP varian belum diisi — margin tak bisa dihitung">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!single ? (
                        <span className="inline-flex items-center gap-1" title={own ? `${APPROVAL[ist].label} — khusus SKU ini` : APPROVAL[ist].label}>
                          <button onClick={() => run([it], 'approved')} disabled={disabled || busy} title={`Setujui ${vname}`}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${ist === 'approved' ? 'bg-green-600 text-white' : 'border border-line/15 text-green-400 hover:bg-green-500/10'}`}>
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => run([it], 'rejected')} disabled={disabled || busy} title={`Tolak ${vname}`}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${ist === 'rejected' ? 'bg-red-600 text-white' : 'border border-line/15 text-red-400 hover:bg-red-500/10'}`}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ) : (
                        <span title={own ? 'diputuskan khusus SKU ini' : 'ikut keputusan produk'}
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${APPROVAL[ist].cls}`}>
                          {APPROVAL[ist].label}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-line/8 space-y-2">
          {noHpp > 0 && (
            <p className="text-[10px] text-ink-faint">
              {noHpp === its.length ? 'Margin belum bisa dihitung' : `Margin ${noHpp} SKU belum bisa dihitung`} — HPP varian belum diisi di price list.
            </p>
          )}
          {/* Keputusan cepat: satu klik untuk seluruh SKU produk ini. */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => run(its, 'approved')} disabled={disabled || busy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${sum.approved === sum.total ? 'bg-green-600 text-white' : 'border border-line/15 text-green-400 hover:bg-green-500/10'}`}>
              <Check className="w-3.5 h-3.5" /> {single ? 'Setujui' : 'Setujui semua SKU'}
            </button>
            <button onClick={() => run(its, 'rejected')} disabled={disabled || busy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${sum.rejected === sum.total ? 'bg-red-600 text-white' : 'border border-line/15 text-red-400 hover:bg-red-500/10'}`}>
              <X className="w-3.5 h-3.5" /> {single ? 'Tolak' : 'Tolak semua'}
            </button>
            {!single && (
              <button onClick={() => { setPerSku(v => !v); setSel(new Set()) }}
                title="Centang beberapa SKU lalu putuskan sekaligus"
                className="ml-auto flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Pilih beberapa SKU {perSku ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Bar aksi massal — muncul setelah ada SKU dicentang. */}
          {perSku && !single && selected.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap rounded-lg bg-blue-600/8 border border-blue-500/20 px-2.5 py-2">
              <span className="text-[11px] font-medium text-blue-200">{selected.length} SKU dipilih</span>
              <button onClick={() => run(selected, 'approved')} disabled={disabled || busy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-green-500/30 text-green-300 hover:bg-green-500/10 transition-colors disabled:opacity-40">
                <Check className="w-3 h-3" /> Setujui
              </button>
              <button onClick={() => run(selected, 'rejected')} disabled={disabled || busy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                <X className="w-3 h-3" /> Tolak
              </button>
            </div>
          )}

          {/* Catatan dipakai oleh tombol keputusan mana pun di kartu ini. */}
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="catatan (opsional) — ikut tersimpan pada keputusan berikutnya"
            className="w-full bg-fill/5 border border-line/10 rounded-lg px-2.5 py-1.5 text-[11px] text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />

          {log.length > 0 && (
            <div className="pt-1.5 border-t border-line/8">
              <p className="text-[10px] font-medium text-ink-faint mb-1">Riwayat</p>
              <div className="space-y-0.5">
                {log.slice(0, 8).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-ink-faint">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'approved' ? 'bg-green-400' : e.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <span className="text-ink-muted">{APPROVAL[e.status]?.label || e.status}</span>
                    <span className="text-ink-faint flex-shrink-0">· {e.sku || 'semua SKU'}</span>
                    <span className="truncate">· {e.byName ? `${e.byName} (${e.by})` : (e.by || '—')}{e.note ? ` · "${e.note}"` : ''}</span>
                    <span className="ml-auto flex-shrink-0">{fmtDT(e.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </>)}
    </div>
  )
}
