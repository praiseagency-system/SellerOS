import { useState } from 'react'
import { ShieldCheck, ShieldOff, LogOut, AlertCircle, CheckCircle2, Mail, UserCog } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
  const { user, profile, isAdmin, refreshProfile, signOut } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const shared = profile?.share_with_admin ?? false

  async function toggleShare(next) {
    setSaving(true); setError(null); setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ share_with_admin: next })
      .eq('id', user.id)
    if (error) {
      setError('Gagal menyimpan izin. Coba lagi.')
    } else {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      {/* Akun */}
      <section className="bg-surface border border-line/8 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-ink-strong mb-4">Akun</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-fill/5 border border-line/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <p className="text-xs text-ink-faint">Email</p>
              <p className="text-sm font-medium text-ink-strong">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-fill/5 border border-line/10 flex items-center justify-center">
              <UserCog className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <p className="text-xs text-ink-faint">Peran</p>
              <p className="text-sm font-medium text-ink-strong">
                {isAdmin ? 'Admin' : 'Pengguna'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privasi / consent */}
      <section className="bg-surface border border-line/8 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-ink-strong mb-1">Privasi Data</h2>
        <p className="text-xs text-ink-muted mb-4">
          Atur apakah tim Praise Agency boleh melihat data toko kamu untuk membantu analisis.
        </p>

        <div className={`rounded-xl border p-4 ${shared ? 'border-green-500/25 bg-green-500/5' : 'border-line/10 bg-fill/5'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${shared ? 'bg-green-500/15' : 'bg-fill/10'}`}>
                {shared
                  ? <ShieldCheck className="w-4 h-4 text-green-400" />
                  : <ShieldOff className="w-4 h-4 text-ink-muted" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-strong">
                  Izinkan tim Praise Agency melihat data saya
                </p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  {shared
                    ? 'AKTIF — admin Praise Agency bisa melihat seluruh workspace & data kuadran kamu (hanya baca). Kamu bisa mematikan ini kapan saja.'
                    : 'NONAKTIF — tidak ada admin yang bisa melihat data kamu. Hanya kamu yang punya akses.'}
                </p>
              </div>
            </div>

            {/* Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={shared}
              disabled={saving}
              onClick={() => toggleShare(!shared)}
              className={`relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${shared ? 'bg-green-500' : 'bg-fill/25'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${shared ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {(error || saved || saving) && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              {saving && <span className="text-ink-muted">Menyimpan…</span>}
              {error && <><AlertCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-300">{error}</span></>}
              {saved && !error && <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-green-300">Tersimpan.</span></>}
            </div>
          )}
        </div>

        <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">
          Izin ini berlaku per-akun (semua workspace kamu). Admin tidak pernah bisa mengubah atau menghapus datamu — hanya melihat saat izin aktif.
        </p>
      </section>

      {/* Keluar */}
      <section className="bg-surface border border-line/8 rounded-2xl p-5">
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </section>
    </div>
  )
}
