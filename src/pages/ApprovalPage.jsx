import { useState, useEffect, useCallback } from 'react'
import { Bolt, Lock, Mail, Check, X, RefreshCw, LogOut, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getCampaignByToken, submitApproval } from '../data/campaignApproval'
import {
  fmt, marginCls, fmtPct, itemMargin, voucherEffect, voucherList, APPROVAL, approvalStatusOf,
} from '../utils/campaignPricing'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('t') || ''
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
function fmtDT(iso) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function dateRange(c) {
  const f = d => { if (!d) return null; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) }
  const a = f(c.startDate), b = f(c.endDate)
  return a && b ? `${a} – ${b}` : a ? `mulai ${a}` : b ? `s/d ${b}` : 'tanpa tanggal'
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

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await getCampaignByToken(token)
      const products = Object.fromEntries(
        Object.entries(res.products || {}).map(([id, p]) => [id, { ...(p.data || {}), id: p.id, name: p.name }])
      )
      setState({ loading: false, error: null, campaign: res.campaign, products })
    } catch (e) {
      const msg = /not authorized/i.test(e.message) ? `Email ${email} tidak diundang untuk campaign ini.`
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
  // Kelompokkan item per produk (urut kemunculan).
  const groups = []
  const seen = new Map()
  for (const it of (c.items || [])) {
    if (!seen.has(it.productId)) { seen.set(it.productId, []); groups.push([it.productId, seen.get(it.productId)]) }
    seen.get(it.productId).push(it)
  }
  const vouchers = voucherList(c.voucherConfig)

  async function act(productId, status) {
    if (blocked) return
    const note = c.approvals?.[productId]?.note || ''
    try {
      const res = await submitApproval(token, productId, status, note, name.trim())
      setState(s => ({ ...s, campaign: { ...s.campaign, approvals: res.approvals, approvalLog: res.approvalLog } }))
    } catch { alert('Gagal menyimpan keputusan. Coba lagi.') }
  }
  async function saveNote(productId, note) {
    // Simpan catatan tanpa mengubah status (pakai status sekarang).
    const status = approvalStatusOf(c.approvals, productId)
    try {
      const res = await submitApproval(token, productId, status, note, name.trim())
      setState(s => ({ ...s, campaign: { ...s.campaign, approvals: res.approvals, approvalLog: res.approvalLog } }))
    } catch { /* noop */ }
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
      </div>

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
            onAct={act} onSaveNote={saveNote} />
        ))}
      </div>
      <p className="text-[11px] text-ink-faint text-center mt-5">
        Masuk sebagai {email}. Keputusan tersimpan otomatis &amp; langsung terlihat tim.
      </p>
    </div>
  )
}

function ProductApprovalCard({ c, productId, its, productMap, vouchers, disabled, onAct, onSaveNote }) {
  const st = approvalStatusOf(c.approvals, productId)
  const meta = APPROVAL[st]
  const p = productMap[productId]
  const [note, setNote] = useState(c.approvals?.[productId]?.note || '')
  const log = (c.approvalLog || []).filter(e => e.productId === productId).slice().reverse()
  const cofunded = c.voucherConfig?.kind === 'cofunded'
  const cols = cofunded ? '44px 1fr 1fr 1fr 50px' : '44px 1fr 1fr'

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line/8">
        <p className="text-[13px] font-semibold text-ink-strong truncate">
          {p ? p.name : '(produk dihapus)'} <span className="text-ink-faint font-normal">· {its.length} varian</span>
        </p>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {its.map(it => {
          const m = itemMargin(it, productMap)
          const vname = it.name || `Varian ${it.varIdx + 1}`
          return (
            <div key={it.varIdx}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink truncate">{vname}</p>
                  <p className="text-[11px] text-ink-faint truncate">{it.sku || 'tanpa SKU'}</p>
                </div>
                <span className="text-[13px] font-semibold text-ink-strong tabular-nums flex-shrink-0">{fmt(+it.price)}</span>
                <span className={`text-[12px] font-semibold tabular-nums w-14 text-right flex-shrink-0 ${marginCls(m)}`}>{m != null ? `${m.toFixed(1)}%` : '—'}</span>
              </div>
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
        <div className="flex items-center gap-2">
          <button onClick={() => onAct(productId, 'approved')} disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${st === 'approved' ? 'bg-green-600 text-white' : 'border border-line/15 text-green-400 hover:bg-green-500/10'}`}>
            <Check className="w-3.5 h-3.5" /> Setujui
          </button>
          <button onClick={() => onAct(productId, 'rejected')} disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${st === 'rejected' ? 'bg-red-600 text-white' : 'border border-line/15 text-red-400 hover:bg-red-500/10'}`}>
            <X className="w-3.5 h-3.5" /> Tolak
          </button>
          <input value={note} onChange={e => setNote(e.target.value)} onBlur={() => saveNoteIfChanged()}
            placeholder="catatan (opsional)"
            className="flex-1 min-w-[120px] bg-fill/5 border border-line/10 rounded-lg px-2.5 py-1.5 text-[11px] text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        </div>
        {log.length > 0 && (
          <div className="pt-1.5 border-t border-line/8">
            <p className="text-[10px] font-medium text-ink-faint mb-1">Riwayat</p>
            <div className="space-y-0.5">
              {log.slice(0, 6).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-ink-faint">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'approved' ? 'bg-green-400' : e.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <span className="text-ink-muted">{APPROVAL[e.status]?.label || e.status}</span>
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

  function saveNoteIfChanged() {
    const cur = c.approvals?.[productId]?.note || ''
    if (note !== cur) onSaveNote(productId, note)
  }
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
