// Peringatan pada eksperimen yang MASIH berstatus RUNNING padahal kemungkinan
// besar sudah selesai.
//
// Kenapa peringatan, bukan penutupan otomatis: evaluator harian sengaja tak
// pernah menyentuh status (`experimentEval.mjs` — "owner yang menutup"), dan
// keputusan itu dipertahankan. Yang salah bukan siapa yang menutup, melainkan
// bahwa layar tak pernah memberi tahu kalau sesuatu sudah usai — sehingga
// eksperimen tanggal 25 Agustus masih memakai label RUNNING dua minggu kemudian,
// dan boost yang sudah ditarik dari Seller Centre tetap terlihat berjalan.
//
// Dua sinyal, dua tingkat kepastian yang BERBEDA — jangan disamakan di UI:
//   BOOST_ENDED   : sesinya tak muncul lagi di potret pagi terakhir. Kita hanya
//                   tahu "tak terlihat pagi ini", BUKAN jam persis berhentinya —
//                   konvensi "terlihat" yang sama dengan panel di luar aplikasi.
//                   Bila kelak change log TikTok terbaca, sinyal ini bisa naik
//                   kelas jadi waktu yang tepat.
//   WINDOW_PASSED : umur eksperimen melewati jendela 7 hari. Ini kepastian
//                   aritmetika, bukan dugaan.

export const WINDOW_DAYS = 7
const DAY = 86400000

// exp          : baris gmvmax_experiments
// session      : sesi boost hasil foldSessions yang cocok (boleh null)
// latestSeen   : snapshot_date terakhir yang dipotret (max last_seen semua sesi)
// → [{ kind, ... }] urut dari yang paling menentukan
export function experimentAlerts({ exp, session = null, latestSeen = null, now = Date.now() } = {}) {
  if (!exp || exp.status !== 'RUNNING') return []
  const out = []

  // Butuh KEDUANYA: tanpa latestSeen kita tak tahu apakah potret hari ini sudah
  // masuk, dan "tak terlihat" jadi klaim kosong. Sesi yang tak ketemu (mis. di
  // luar 60 hari, atau eksperimen yang lahir dari antrean persetujuan) sengaja
  // TIDAK menghasilkan peringatan — diam lebih baik daripada menebak.
  if (session?.last_seen && latestSeen && String(session.last_seen) < String(latestSeen)) {
    out.push({ kind: 'BOOST_ENDED', lastSeen: String(session.last_seen), latestSeen: String(latestSeen) })
  }

  const startMs = Date.parse(exp.start_at)
  if (Number.isFinite(startMs)) {
    const days = Math.floor((now - startMs) / DAY)
    if (days >= WINDOW_DAYS) out.push({ kind: 'WINDOW_PASSED', days })
  }

  return out
}

// Peta session_id → sesi, untuk menyambungkan eksperimen ke potret sesinya.
export function indexSessions(sessions = []) {
  const by = new Map()
  for (const s of sessions) if (s?.session_id) by.set(String(s.session_id), s)
  return by
}

// Potret terakhir yang kita punya. null bila belum ada sesi sama sekali — dan
// null itu penting: ia mematikan peringatan BOOST_ENDED alih-alih membuat semua
// eksperimen terlihat sudah berakhir.
export function latestSeenOf(sessions = []) {
  let max = null
  for (const s of sessions) {
    const d = s?.last_seen ? String(s.last_seen) : null
    if (d && (!max || d > max)) max = d
  }
  return max
}
