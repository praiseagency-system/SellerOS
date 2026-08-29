// Halaman penerimaan undangan tim: /join-team?t=<token>
//
// Undangan TERIKAT EMAIL (lihat api/team/accept.js), jadi orang yang membuka
// tautan harus masuk dengan akun yang diundang. Kalau ia belum punya sesi,
// token disimpan dulu di sessionStorage lalu layar masuk ditampilkan — sesudah
// masuk, halaman ini otomatis melanjutkan. Tanpa itu, token hilang saat
// pengalihan login dan orang harus meminta tautan baru.
import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { acceptInvite } from '../data/team'
import { setCurrentWorkspace } from '../utils/workspace'
import LoginPage from '../pages/LoginPage'

const SS_KEY = 'team_invite_token'

export default function JoinTeam() {
  const { user, loading } = useAuth()
  const [status, setStatus] = useState('idle')   // idle | working | ok | error
  const [msg, setMsg] = useState('')
  const ran = useRef(false)

  // Simpan token sebelum layar masuk muncul, supaya tak hilang saat login.
  const fromUrl = new URLSearchParams(window.location.search).get('t')
  if (fromUrl) sessionStorage.setItem(SS_KEY, fromUrl)
  const token = fromUrl || sessionStorage.getItem(SS_KEY)

  useEffect(() => {
    if (!user || ran.current || !token) return
    ran.current = true
    setStatus('working')
    acceptInvite(token)
      .then(r => {
        sessionStorage.removeItem(SS_KEY)
        // Langsung arahkan ke workspace yang baru diikuti.
        if (r?.workspace_id) setCurrentWorkspace(r.workspace_id)
        setStatus('ok')
        setMsg(`Kamu bergabung sebagai ${r?.role || 'anggota'}.`)
        setTimeout(() => { window.location.replace('/') }, 1400)
      })
      .catch(e => { setStatus('error'); setMsg(e.message || 'Undangan tidak bisa diterima.') })
  }, [user, token])

  if (loading) return <Layar><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></Layar>
  if (!token) return <Layar><Pesan buruk judul="Tautan tidak lengkap" isi="Token undangan tidak ditemukan di tautan." /></Layar>
  if (!user) return <LoginPage />

  return (
    <Layar>
      {status === 'ok'
        ? <Pesan judul="Berhasil bergabung" isi={msg} />
        : status === 'error'
          ? <Pesan buruk judul="Undangan tidak bisa diterima" isi={msg} />
          : <><Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <p className="text-sm text-ink-muted mt-3">Memproses undangan…</p></>}
    </Layar>
  )
}

function Layar({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app p-6">
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-8 max-w-sm w-full text-center flex flex-col items-center">
        {children}
      </div>
    </div>
  )
}

function Pesan({ judul, isi, buruk }) {
  const Ikon = buruk ? AlertTriangle : CheckCircle2
  return (
    <>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${buruk ? 'bg-red-500/15' : 'bg-green-500/15'}`}>
        <Ikon className={`w-6 h-6 ${buruk ? 'text-red-400' : 'text-green-400'}`} />
      </div>
      <h1 className="text-base font-semibold text-ink-strong flex items-center gap-2">
        {!buruk && <Users className="w-4 h-4 text-blue-500" />}{judul}
      </h1>
      <p className="text-sm text-ink-muted mt-1">{isi}</p>
      {buruk && (
        <button onClick={() => window.location.replace('/')}
          className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700">
          Kembali ke aplikasi
        </button>
      )}
    </>
  )
}
