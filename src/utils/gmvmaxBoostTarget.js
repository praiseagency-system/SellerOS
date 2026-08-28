// Menentukan SASARAN boost/exclude sebuah video: pasangan campaign × produk mana.
// PURE — tak menyentuh jaringan.
//
// Kenapa ada: satu video bisa ikut di beberapa campaign dengan produk berbeda.
// Melempar daftar campaign ke pengguna berarti menyuruhnya menebak, padahal
// datanya sering sudah cukup untuk memutuskan. Diukur pada jendela 1–27 Agu:
// dari 2.278 video yang layak boost, hanya 196 (8,6%) yang punya >1 pasangan.
//
// TANGGA BUKTI, dari yang terkuat. Berhenti di anak tangga pertama yang menjawab:
//   1. ANCHOR   — produk yang benar-benar tertaut di video (keranjang kuning,
//                 dari tt_video_list_get). Sinyal terkuat, tapi hanya dimiliki
//                 video ber-kode spark (31 dari 601 pada snapshot 27 Agu).
//   2. OMZET    — satu pasangan menguasai >= 80% omzet video itu (57 dari 196).
//   3. TAYANG   — hanya satu pasangan yang benar-benar tayang/learning.
//   4. TUNGGAL  — memang cuma ada satu pasangan (91,4% kasus).
// Kalau semuanya gagal, kembalikan confident:false dan BIARKAN pengguna memilih.
// Berpura-pura tahu di sini berarti membakar uang di campaign yang salah.

const DOMINAN = 0.8
const AKTIF = ['DELIVERING', 'LEARNING']

// eligible(placement) → boolean. Pemanggil menyaring pasangan yang campaignnya
// tak bisa dieksekusi (nonaktif / store_id tak diketahui) sebelum sampai sini.
export function pickBoostTarget({ video, anchorSpu = null, eligible = () => true } = {}) {
  const all = (video?.placements || []).filter(p => p.productId).filter(eligible)
  if (!all.length) return { placement: null, reason: null, confident: false, options: [] }
  if (all.length === 1) {
    return { placement: all[0], reason: 'satu-satunya campaign yang memuat video ini', confident: true, options: all }
  }

  // 1) Produk yang tertaut di video.
  if (anchorSpu) {
    const cocok = all.filter(p => String(p.productId) === String(anchorSpu))
    if (cocok.length === 1) {
      return { placement: cocok[0], reason: 'produk yang tertaut di video ini', confident: true, options: all }
    }
    // Anchor cocok >1 pasangan (produk sama di beberapa campaign) → lanjut ke
    // tangga berikut, tapi hanya di antara yang cocok anchornya.
    if (cocok.length > 1) {
      const t = byRevenue(cocok) || byActive(cocok)
      if (t) return { ...t, reason: `produk yang tertaut di video ini · ${t.reason}`, options: all }
    }
  }

  // 2) Omzet terkonsentrasi.
  const rev = byRevenue(all)
  if (rev) return { ...rev, options: all }

  // 3) Hanya satu yang tayang.
  const akt = byActive(all)
  if (akt) return { ...akt, options: all }

  return { placement: null, reason: null, confident: false, options: all }
}

function byRevenue(list) {
  const total = list.reduce((s, p) => s + (p.revenue || 0), 0)
  if (total <= 0) return null
  const top = list.reduce((a, b) => ((b.revenue || 0) > (a.revenue || 0) ? b : a))
  const share = (top.revenue || 0) / total
  if (share < DOMINAN) return null
  return { placement: top, reason: `${Math.round(share * 100)}% omzet video ini lahir di sana`, confident: true }
}

function byActive(list) {
  const aktif = list.filter(p => AKTIF.includes(String(p.delivery || '').toUpperCase()))
  if (aktif.length !== 1) return null
  return { placement: aktif[0], reason: 'satu-satunya pasangan yang sedang tayang', confident: true }
}

// Kalimat pendek "kenapa sasaran belum pasti" — supaya barisnya menjelaskan
// dirinya, bukan sekadar menyodorkan menu tanpa konteks.
export function undecidedReason(options = []) {
  const berpendapatan = options.filter(p => (p.revenue || 0) > 0)
  if (berpendapatan.length > 1) return `omzetnya terbagi di ${berpendapatan.length} campaign`
  if (!berpendapatan.length) return `belum ada omzet di ${options.length} campaign yang memuatnya`
  return `${options.length} campaign memuat video ini`
}
