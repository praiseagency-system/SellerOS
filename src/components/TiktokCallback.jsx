// Halaman callback OAuth TikTok (/oauth/tiktok/callback). Dirender oleh App
// SEBELUM gate biasa saat path cocok. Menukar `code` → token (PKCE) lalu
// menyimpannya ke Supabase untuk workspace yang memulai koneksi, kemudian
// kembali ke aplikasi (tab Settings → Integrasi).
import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { exchangeCode, readOAuthSession, clearOAuthSession } from '../lib/tiktokOAuth'
import { saveConnection } from '../data/tiktokConnection'

export default function TiktokCallback() {
  const [status, setStatus] = useState('working') // working | ok | error
  const [msg, setMsg] = useState('Menautkan akun TikTok…')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    ;(async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const err = q.get('error')
        if (err) throw new Error(q.get('error_description') || err)
        const code = q.get('code')
        const state = q.get('state')
        if (!code) throw new Error('Tidak ada authorization code di URL.')

        const saved = readOAuthSession()
        if (!saved) throw new Error('Sesi koneksi tak ditemukan. Ulangi dari tombol Connect.')
        if (!state || state !== saved.state) throw new Error('State tidak cocok (kemungkinan CSRF). Ulangi koneksi.')

        const tok = await exchangeCode({ code, verifier: saved.verifier })
        await saveConnection(tok, saved.wsId)
        clearOAuthSession()

        setStatus('ok'); setMsg('Akun TikTok berhasil ditautkan.')
        setTimeout(() => { window.location.replace('/?connected=tiktok') }, 1200)
      } catch (e) {
        setStatus('error'); setMsg(e.message || 'Gagal menautkan akun TikTok.')
      }
    })()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-app p-6">
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mx-auto mb-4">
          {status === 'working' && <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />}
          {status === 'ok' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
          {status === 'error' && <AlertTriangle className="w-6 h-6 text-red-500" />}
        </div>
        <p className="text-sm font-medium text-ink-strong">
          {status === 'ok' ? 'Tersambung' : status === 'error' ? 'Gagal menyambung' : 'Menyambungkan…'}
        </p>
        <p className="text-xs text-ink-muted mt-1.5 leading-relaxed break-words">{msg}</p>
        {status === 'error' && (
          <button onClick={() => window.location.replace('/?page=integrasi')}
            className="mt-4 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
            Kembali ke Pengaturan
          </button>
        )}
      </div>
    </div>
  )
}
