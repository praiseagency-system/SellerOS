import { useState, useEffect, useCallback } from 'react'
import { Bolt, Lock, Mail, Check, X, RefreshCw, LogOut, User, ChevronDown, ChevronRight, FileText, CalendarRange, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getCampaignByToken, submitApproval } from '../data/campaignApproval'
import {
  fmt, marginCls, fmtPct, hrefOf, itemMargin, itemCalc, totalFee, feeBreakdown,
  voucherEffect, voucherList, APPROVAL, activeItems, itemKey,
  approvalStatusOfItem, hasOwnApproval, skuApprovalSummary, approvalLogOfProduct,
} from '../utils/campaignPricing'
import { campaignPeriods, periodsSummary, periodRange, periodLabel, periodStatus } from '../utils/campaignPeriods'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('t') || ''
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
function fmtDT(iso) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const dateRange = periodsSummary

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

  return (
    <div>
      <div className="mb-5">
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

      {(() => {
        const s = skuApprovalSummary(c.items, c.approvals)
        if (!s.total) return null
        return (
          <p className="text-[11px] text-ink-faint mb-2 px-1">
            {s.total} SKU · <span className="text-green-300">{s.approved} disetujui</span>
            {s.rejected > 0 && <> · <span className="text-red-300">{s.rejected} ditolak</span></>}
            {s.pending > 0 && <> · <span className="text-amber-300">{s.pending} menunggu</span></>}
          </p>
        )
      })()}

      <div className="space-y-3">
        {groups.map(([productId, its]) => (
          <ProductApprovalCard key={productId} c={c} productId={productId} its={its}
            productMap={productMap} vouchers={vouchers} disabled={blocked}
            onActItems={actItems} />
        ))}
      </div>
      <p className="text-[11px] text-ink-faint text-center mt-5">
        Masuk sebagai {email}. Keputusan tersimpan otomatis &amp; langsung terlihat tim.
      </p>
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

function ProductApprovalCard({ c, productId, its, productMap, vouchers, disabled, onActItems }) {
  const [openFee, setOpenFee] = useState(null)
  // Mode per SKU: default tertutup — keputusan cepat untuk semua SKU sekaligus.
  const [perSku, setPerSku] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const p = productMap[productId]
  const sum = skuApprovalSummary(its, c.approvals)
  const badge = summaryBadge(sum)
  const log = approvalLogOfProduct(c, productId, its)
  const cofunded = c.voucherConfig?.kind === 'cofunded'
  const cols = cofunded ? '44px 1fr 1fr 1fr 50px' : '44px 1fr 1fr'
  const single = its.length === 1
  const selected = its.filter(it => sel.has(itemKey(it)))
  const allSelected = selected.length === its.length && its.length > 0

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

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line/8">
        <p className="text-[13px] font-semibold text-ink-strong truncate">
          {p ? p.name : '(produk dihapus)'} <span className="text-ink-faint font-normal">· {its.length} SKU</span>
        </p>
        {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${badge.cls}`}>{badge.label}</span>}
      </div>

      {perSku && !single && (
        <div className="flex items-center gap-2 px-4 py-2 bg-fill/5 border-b border-line/8">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={disabled}
            className="w-3.5 h-3.5 accent-blue-600" aria-label="Pilih semua SKU" />
          <span className="text-[11px] text-ink-muted">Pilih semua SKU</span>
          <span className="ml-auto text-[11px] text-ink-faint">{selected.length ? `${selected.length} dipilih` : 'centang SKU yang mau diputuskan'}</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-1.5">
        {its.map(it => {
          const m = itemMargin(it, productMap)
          const vname = it.name || `Varian ${it.varIdx + 1}`
          const ist = approvalStatusOfItem(c.approvals, it)
          const own = hasOwnApproval(c.approvals, it)
          const checked = sel.has(itemKey(it))
          // Komisi & biaya = total semua fee platform/komisi/program + biaya
          // proses pada harga campaign (sama dengan Kalkulator), bisa diklik
          // untuk melihat rinciannya per komponen.
          const calc = itemCalc(it, productMap)
          const fee = totalFee(calc)
          const feeRows = openFee === it.varIdx ? feeBreakdown(calc) : null
          return (
            <div key={it.varIdx}>
              <div className="flex items-center gap-3">
                {perSku && !single && (
                  <input type="checkbox" checked={checked} onChange={() => toggleSel(it)} disabled={disabled}
                    className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" aria-label={`Pilih ${vname}`} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink truncate">{vname}</p>
                  <p className="text-[11px] text-ink-faint truncate">
                    {it.sku || 'tanpa SKU'}
                    {fee && +it.price > 0 && (
                      <> · <button onClick={() => setOpenFee(o => o === it.varIdx ? null : it.varIdx)}
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
                {perSku && !single ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => run([it], 'approved')} disabled={disabled || busy}
                      title={`Setujui ${vname}`}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${ist === 'approved' ? 'bg-green-600 text-white' : 'border border-line/15 text-green-400 hover:bg-green-500/10'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => run([it], 'rejected')} disabled={disabled || busy}
                      title={`Tolak ${vname}`}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${ist === 'rejected' ? 'bg-red-600 text-white' : 'border border-line/15 text-red-400 hover:bg-red-500/10'}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <span title={own ? 'diputuskan khusus SKU ini' : 'ikut keputusan produk'}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 w-[62px] text-center ${APPROVAL[ist].cls}`}>
                    {APPROVAL[ist].label}
                  </span>
                )}
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
              {vouchers.length > 0 && +it.price > 0 && (
                <div className="mt-1.5 mb-1">
                  <div className="grid gap-2 text-[10px] text-ink-faint pb-1" style={{ gridTemplateColumns: cols }}>
                    <span>Voucher</span><span>Minimal Qty</span><span>Harga customer</span>
                    {cofunded && <span>Beban penjual</span>}{cofunded && <span className="text-right">Margin</span>}
                  </div>
                  <div className="space-y-1">
                    {vouchers.map((v, i) => {
                      const eff = voucherEffect(v, it.price); if (!eff) return null
                      const vm = cofunded ? itemMargin(it, productMap, eff.sellerPerUnit) : null
                      return (
                        <div key={i} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: cols }}>
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
            </div>
          )
        })}
      </div>

      <div className="px-4 py-3 border-t border-line/8 space-y-2">
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
              className="ml-auto flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Atur per SKU {perSku ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
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
    </div>
  )
}

// ── Chrome / auth ───────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-app text-ink px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Bolt className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-ink-strong">SellerOS</span>
          <span className="ml-auto text-[11px] text-ink-faint inline-flex items-center gap-1 border border-line/15 rounded-full px-2 py-0.5">
            <Lock className="w-3 h-3" /> Persetujuan Harga Campaign
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

function LoginBox() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function send(e) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.href },
      })
      if (error) throw error
      setSent(true)
    } catch { setErr('Gagal mengirim link. Cek email & coba lagi.') }
    finally { setBusy(false) }
  }

  if (sent) return <Notice icon={Mail} title="Cek email Anda" body={`Link masuk telah dikirim ke ${email}. Buka link itu untuk melihat & menyetujui harga campaign.`} />

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-6 max-w-sm mx-auto">
      <div className="w-11 h-11 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3"><Mail className="w-5 h-5 text-blue-500" /></div>
      <p className="text-sm font-semibold text-ink-strong">Masuk untuk melanjutkan</p>
      <p className="text-xs text-ink-faint mt-1 mb-4">Masukkan email Anda. Kami kirim link masuk — tanpa password.</p>
      <form onSubmit={send} className="space-y-2">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@perusahaan.com" autoFocus
          className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
        {err && <p className="text-[11px] text-red-400">{err}</p>}
        <button type="submit" disabled={busy || !email.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
          {busy ? 'Mengirim…' : 'Kirim link masuk'}
        </button>
      </form>
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-16"><span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
}
function Notice({ icon: Icon, title, body }) {
  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-8 text-center max-w-sm mx-auto">
      <div className="w-11 h-11 rounded-2xl bg-blue-600/10 flex items-center justify-center mx-auto mb-3"><Icon className="w-5 h-5 text-blue-500" /></div>
      <p className="text-sm font-semibold text-ink-strong">{title}</p>
      <p className="text-xs text-ink-faint mt-1">{body}</p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"><RefreshCw className="w-3.5 h-3.5" /> Muat ulang</button>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"><LogOut className="w-3.5 h-3.5" /> Keluar</button>
      </div>
    </div>
  )
}
