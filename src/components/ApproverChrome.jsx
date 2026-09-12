// Kerangka halaman untuk approver (client/atasan) — dipakai halaman
// persetujuan satu campaign (/approve) maupun portal seluruh campaign
// (/portal). Approver masuk lewat magic link, tanpa password.
import { useState } from 'react'
import { Bolt, Lock, Mail, RefreshCw, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function ApproverShell({ label, wide, children }) {
  return (
    <div className="min-h-screen bg-app text-ink px-4 py-8">
      <div className={`${wide ? 'max-w-3xl' : 'max-w-2xl'} mx-auto`}>
        <div className="flex items-center gap-2 mb-6">
          <Bolt className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-ink-strong">SellerOS</span>
          <span className="ml-auto text-[11px] text-ink-faint inline-flex items-center gap-1 border border-line/15 rounded-full px-2 py-0.5">
            <Lock className="w-3 h-3" /> {label}
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

export function LoginBox({ body }) {
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

  if (sent) return <Notice icon={Mail} title="Cek email Anda" body={`Link masuk telah dikirim ke ${email}. Buka link itu untuk melanjutkan.`} />

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-6 max-w-sm mx-auto">
      <div className="w-11 h-11 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3"><Mail className="w-5 h-5 text-blue-500" /></div>
      <p className="text-sm font-semibold text-ink-strong">Masuk untuk melanjutkan</p>
      <p className="text-xs text-ink-faint mt-1 mb-4">{body || 'Masukkan email Anda. Kami kirim link masuk — tanpa password.'}</p>
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

export function Spinner() {
  return <div className="flex justify-center py-16"><span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
}

export function Notice({ icon: Icon, title, body }) {
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
