// Peringatan eligibility GMV Max di Pengaturan → Integrasi.
// Sinyal ini dulu hanya hidup di halaman Feature Registry — menu diagnostik yang
// tak pernah dibuka pengguna, sehingga sebab kegagalan tarikan data (akun iklan
// tak berizin) tak pernah sampai ke mata siapa pun. Di sini ia muncul TEPAT di
// samping tombol koneksi, dan HANYA ketika benar-benar terblokir.
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { loadTenantEligibility } from '../../data/gmvmaxFeatureRegistry'

const STATUS_LABEL = {
  AUTHORIZATION_MISMATCH: 'Otorisasi akun tidak cocok',
  PERMISSION_DENIED: 'Akses ditolak TikTok',
  NOT_AVAILABLE: 'GMV Max tidak tersedia',
  STORE_NOT_FOUND: 'Toko tidak ditemukan',
}
const STALE_DAYS = 7
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

export default function EligibilityAlert({ wsId }) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let alive = true
    if (!wsId) return undefined
    loadTenantEligibility({ wsId })
      .then(e => {
        if (!alive || !e?.blocked) return
        // Umur dihitung di sini, bukan saat render — Date.now() di badan render
        // adalah fungsi tak-murni (aturan lint React yang sudah pernah menggigit).
        const ageDays = e.checkedAt ? (Date.now() - Date.parse(e.checkedAt)) / 86400000 : null
        setInfo({ ...e, wsId, stale: ageDays != null && ageDays > STALE_DAYS })
      })
      // Registry kosong / tabel tak terbaca bukan alasan menakuti pengguna — diam.
      .catch(() => {})
    return () => { alive = false }
  }, [wsId])

  // Hasil dicap wsId-nya, jadi pindah workspace langsung menyembunyikan
  // peringatan lama tanpa perlu setState sinkron di dalam effect.
  if (!info || info.wsId !== wsId) return null
  const checked = fmt(info.checkedAt)

  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center flex-shrink-0">
          <ShieldAlert className="w-4 h-4" />
        </span>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-sm font-semibold text-ink-strong">
              {STATUS_LABEL[info.status] || 'GMV Max tidak bisa diakses'}
            </p>
            <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
              {info.reason || 'Akun iklan yang tersambung tidak berizin menarik data GMV Max untuk toko ini.'}
            </p>
          </div>

          <p className="text-[11px] text-ink-faint">
            Terdeteksi pada akun iklan <span className="font-mono">{info.advertiserId || '—'}</span>
            {checked && <> · terakhir diperiksa {checked}</>}
          </p>

          <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
            <li>Pastikan akun iklan yang benar terpilih di <span className="text-ink">Akun / Toko TikTok Ads</span> di bawah.</li>
            <li>Kalau akun iklannya dikelola pihak lain (agency), pemiliknya harus membagikan akun itu ke Business Center-mu — sesudah itu <span className="text-ink">Sambungkan ulang</span>.</li>
          </ul>

          {info.stale && (
            <p className="text-[11px] text-amber-400/90 leading-relaxed">
              Status ini terakhir diverifikasi {checked}. Sync harian hanya memperbarui status di akhir tarikan yang
              berhasil — selama tarikannya gagal, angka ini tidak ikut segar.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
