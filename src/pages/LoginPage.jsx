import { useState } from 'react'
import { BarChart3, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

export default function LoginPage() {
  const { signInWithPassword, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState('login')      // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null); setInfo(null)
    if (!email.trim() || !password) { setError('Email dan kata sandi wajib diisi.'); return }
    if (mode === 'signup' && password.length < 6) {
      setError('Kata sandi minimal 6 karakter.'); return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await signInWithPassword(email.trim(), password)
        if (error) throw error
        // onAuthStateChange akan menggerakkan App ke halaman utama.
      } else {
        const { data, error } = await signUp(email.trim(), password)
        if (error) throw error
        if (data?.user && !data.session) {
          setInfo('Akun dibuat. Cek email kamu untuk konfirmasi sebelum login.')
        }
      }
    } catch (err) {
      setError(translateAuthError(err?.message))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null); setBusy(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
      // Redirect ditangani Supabase; halaman akan pindah.
    } catch (err) {
      setError(translateAuthError(err?.message))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-app">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/15 mb-3">
            <BarChart3 className="w-6 h-6 text-blue-500" />
          </div>
          <h1 className="text-xl font-bold text-ink-strong">SellerOS</h1>
          <p className="text-ink-muted mt-1 text-sm">
            {mode === 'login' ? 'Masuk untuk melanjutkan' : 'Buat akun baru'}
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-line/8 shadow-xl p-5 space-y-4">
          {!isSupabaseConfigured && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                Supabase belum dikonfigurasi. Set <code>VITE_SUPABASE_URL</code> dan{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> di <code>.env.local</code>.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Email</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-ink-faint" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" placeholder="kamu@contoh.com"
                  className="w-full bg-fill/5 border border-line/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Kata Sandi</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-ink-faint" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••"
                  className="w-full bg-fill/5 border border-line/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/25 rounded-xl p-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-green-300">{info}</p>
              </div>
            )}

            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Memproses...</>
                : (mode === 'login' ? 'Masuk' : 'Daftar')}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-line/10" />
            <span className="text-xs text-ink-faint">atau</span>
            <div className="flex-1 h-px bg-line/10" />
          </div>

          <button onClick={handleGoogle} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border border-line/15 text-ink hover:bg-fill/5 disabled:opacity-50 transition-colors">
            <GoogleIcon />Lanjut dengan Google
          </button>
        </div>

        <p className="text-center text-xs text-ink-muted mt-4">
          {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setInfo(null) }}
            className="text-blue-400 font-semibold hover:underline">
            {mode === 'login' ? 'Daftar' : 'Masuk'}
          </button>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

// Terjemahkan pesan error Supabase yang umum ke Bahasa Indonesia.
function translateAuthError(msg) {
  if (!msg) return 'Terjadi kesalahan. Coba lagi.'
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah.'
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk kamu.'
  if (m.includes('user already registered')) return 'Email sudah terdaftar. Silakan masuk.'
  if (m.includes('rate limit')) return 'Terlalu banyak percobaan. Coba lagi nanti.'
  return msg
}
