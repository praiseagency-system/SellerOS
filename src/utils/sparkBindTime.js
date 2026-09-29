// Waktu izin & waktu ikat untuk daftar "Video ter-otorisasi" (30 Sep 2026). Murni.

const HARI = 86_400_000
// "2026-10-27 10:00:00" dari TikTok tak membawa zona → dibaca UTC.
export const tglTikTok = (v) => (v ? new Date(`${String(v).trim().replace(' ', 'T')}Z`) : null)
const fmt = (d, jam = false) => d.toLocaleDateString('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
  ...(jam ? { hour: '2-digit', minute: '2-digit' } : {}),
})

/** Izin kreator: mulai → habis, durasi & sisa hari. */
export function izinInfo(auth, nowMs) {
  const mulai = tglTikTok(auth?.auth_start_time)
  const habis = tglTikTok(auth?.auth_end_time)
  return {
    mulai: mulai ? fmt(mulai) : null,
    habis: habis ? fmt(habis) : null,
    durasiHari: mulai && habis ? Math.round((habis - mulai) / HARI) : null,
    sisaHari: habis ? Math.ceil((habis - nowMs) / HARI) : null,
    habisMs: habis ? habis.getTime() : null,
  }
}

/** Kapan diikat ke ad account — persis bila lewat SellerOS, selebihnya perkiraan dari potret. */
export function waktuIkat(videoId, t) {
  const id = String(videoId)
  const exec = t?.executed?.get(id)
  if (exec) { const d = new Date(exec); return { label: `diikat via SellerOS ${fmt(d, true)}`, ms: d.getTime(), persis: true } }
  const seen = t?.firstSeen?.get(id)
  if (seen) {
    const d = new Date(`${seen}T00:00:00+07:00`)
    if (seen === t.firstSnapshot) return { label: `terikat sebelum ${fmt(d)}`, ms: d.getTime(), persis: false }
    return { label: `terlihat terikat sejak ${fmt(d)}`, ms: d.getTime(), persis: false }
  }
  return { label: 'baru terikat (belum ada di potret)', ms: Date.now(), persis: false }
}
