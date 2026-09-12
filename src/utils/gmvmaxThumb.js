// Thumbnail video TikTok via oEmbed publik — SUMBER YANG SAMA dengan pengisi
// nama akun (gmvmaxEnrich.js), cuma medannya yang berbeda: `thumbnail_url`.
//
// KENAPA TIDAK DISIMPAN DI DATABASE. URL-nya bertanda tangan dan berumur pendek:
// yang diambil 12 Sep 2026 membawa `x-expires` 14 Sep 09:00 WIB — ±48 jam. URL
// yang di-cache semalam akan mati besok lusa dan seluruh daftar berubah jadi
// kotak abu-abu. Jadi ia di-resolve saat dibutuhkan dan hanya disimpan di
// MEMORI selama tab hidup; muat ulang halaman = ambil yang segar.
//
// Antrean berkonkurensi terbatas menjaga daftar 300 baris tak menembakkan 300
// permintaan sekaligus (oEmbed akan melempar 429 dan SEMUA gambar gagal).

const TTL_MS = 6 * 3600 * 1000   // jauh di bawah umur tanda tangan URL (±48 jam)
const MAX_PARALEL = 4

const cache = new Map()     // videoId -> { url, author, status, at }
const inflight = new Map()  // videoId -> Promise
let aktif = 0
const antre = []

const segar = (e) => e && (Date.now() - e.at) < TTL_MS

// Hasil yang sudah ada di memori (untuk render pertama tanpa kedip).
export function thumbTersimpan(videoId) {
  const e = cache.get(videoId)
  return segar(e) ? e : null
}

function jalankanAntrean() {
  while (aktif < MAX_PARALEL && antre.length) {
    const tugas = antre.shift()
    aktif++
    tugas().finally(() => { aktif--; jalankanAntrean() })
  }
}

async function ambil(videoId) {
  const url = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@x/video/${videoId}`
  try {
    const res = await fetch(url)
    if (!res.ok) return { url: null, author: null, status: 'notfound', at: Date.now() }
    const d = await res.json()
    return {
      url: d.thumbnail_url || null,
      // Nama akun ikut terbawa cuma-cuma — pemanggil boleh memakainya untuk
      // baris yang kolom akunnya kosong. TIDAK ditulis ke DB dari sini: jalur
      // penulisan gmvmax_video_meta punya aturan anti-poison sendiri.
      author: d.author_name || null,
      status: d.thumbnail_url ? 'ok' : 'notfound',
      at: Date.now(),
    }
  } catch {
    // Gagal jaringan TIDAK di-cache sebagai 'ok' — biar baris itu bisa dicoba
    // lagi saat digulir ulang.
    return { url: null, author: null, status: 'error', at: Date.now() }
  }
}

// Ambil satu thumbnail (dedup + antre). Selalu resolve, tak pernah melempar.
export function muatThumb(videoId) {
  if (!videoId) return Promise.resolve({ url: null, status: 'notfound', at: Date.now() })
  const ada = cache.get(videoId)
  if (segar(ada)) return Promise.resolve(ada)
  if (inflight.has(videoId)) return inflight.get(videoId)

  const p = new Promise((resolve) => {
    antre.push(async () => {
      const hasil = await ambil(videoId)
      if (hasil.status === 'error') cache.delete(videoId)
      else cache.set(videoId, hasil)
      inflight.delete(videoId)
      resolve(hasil)
    })
    jalankanAntrean()
  })
  inflight.set(videoId, p)
  return p
}

// Untuk tes & pindah workspace.
export function bersihkanCacheThumb() { cache.clear(); inflight.clear() }
