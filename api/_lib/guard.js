// Penjaga bersama untuk fungsi serverless api/tiktok/*.
// Nama folder diawali "_" → Vercel TIDAK merutekannya sebagai endpoint.
//
// Sebelum ini kedua proxy menerima POST dari SIAPA SAJA di internet: tanpa cek
// sesi, tanpa batas laju, tanpa batas origin. Siapa pun bisa memakai infrastruktur
// kita untuk merelai permintaan ke TikTok (dan /advertisers memakai access_token
// yang dikirim pemanggil). Modul ini menutup ketiganya.
//
// Verifikasi sesi memakai endpoint /auth/v1/user Supabase: JWT yang dikirim
// browser divalidasi oleh Supabase sendiri (tanda tangan + kedaluwarsa + user
// masih ada), jadi kita tak perlu menyimpan rahasia JWT di sini. Hanya perlu
// URL proyek + anon key, keduanya memang nilai publik.

// Dibaca SAAT DIPANGGIL, bukan saat modul dimuat: di serverless env baru
// tersedia pada waktu jalan, dan pembacaan lazy membuat perilaku fungsi ini
// tidak bergantung pada urutan import saat diuji.
const supabaseEnv = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
})

// Origin yang boleh memanggil. Bisa ditimpa lewat env ALLOWED_ORIGINS
// (dipisah koma) tanpa mengubah kode saat domain berubah.
const DEFAULT_ORIGINS = [
  'https://selleros.praiseagency.id',
  'https://seller-os-pink.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)
const originList = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS

export function parseBody(req) {
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}') } catch { body = {} } }
  return body && typeof body === 'object' ? body : {}
}

// Origin dicek hanya BILA dikirim. Browser selalu mengirimnya untuk POST, jadi
// penyalahgunaan lintas-situs tertutup; permintaan tanpa Origin (mis. alat CLI)
// tetap harus lolos gerbang sesi di bawah — itu penjaga utamanya.
export function originAllowed(req) {
  const origin = req.headers?.origin
  if (!origin) return true
  if (originList.includes(origin)) return true
  // Preview deployment Vercel proyek ini (nama acak) — tetap milik kita.
  return /^https:\/\/seller-os[a-z0-9-]*\.vercel\.app$/.test(origin)
}

// Batas laju sederhana per instance (jendela geser di memori). Instance Vercel
// berumur pendek & bisa banyak, jadi ini BUKAN kuota global yang ketat —
// tujuannya menaikkan biaya penyalahgunaan, bukan menghitung persis.
const hits = new Map()
const MAX_KEYS = 5000
export function rateLimited(key, { limit, windowMs }) {
  const now = Date.now()
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs)
  if (arr.length >= limit) { hits.set(key, arr); return true }
  arr.push(now)
  hits.set(key, arr)
  // Jaga memori: buang entri terlama saat peta membengkak.
  if (hits.size > MAX_KEYS) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k)
  return false
}

export function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  return (Array.isArray(xff) ? xff[0] : xff || '').split(',')[0].trim() || 'unknown'
}

// Verifikasi JWT Supabase yang dikirim browser. Balik { userId } bila sah.
export async function requireUser(req, res) {
  // Tanpa kredensial = tak berwenang, terlepas dari konfigurasi kita.
  const raw = req.headers?.authorization || ''
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : ''
  if (!token) {
    res.status(401).json({ error: 'unauthorized', error_description: 'Butuh sesi login.' })
    return null
  }
  const { url, anonKey } = supabaseEnv()
  // GAGAL TERTUTUP: env belum diset → tolak (503), bukan lolos.
  if (!url || !anonKey) {
    res.status(503).json({
      error: 'auth_unconfigured',
      error_description: 'SUPABASE_URL / SUPABASE_ANON_KEY belum tersedia di runtime fungsi.',
    })
    return null
  }
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Sesi tidak sah atau kedaluwarsa.' })
      return null
    }
    const user = await r.json()
    if (!user?.id) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Sesi tidak sah.' })
      return null
    }
    // Token ikut dikembalikan: endpoint bisa bertanya ke PostgREST ATAS NAMA
    // pemanggil, sehingga RLS yang menentukan baris mana yang boleh dilihat —
    // tanpa perlu service_role sama sekali.
    return { userId: user.id, token }
  } catch (e) {
    res.status(502).json({ error: 'auth_check_failed', error_description: String(e?.message || e) })
    return null
  }
}

// Baca tabel lewat PostgREST MEMAKAI JWT pemanggil. Kuncinya: RLS dievaluasi
// dengan `auth.uid()` = pemanggil, jadi baris milik tenant lain tak akan pernah
// terbaca. Ini yang membuat verifikasi approval bisa dilakukan tanpa
// service_role — kita tak perlu hak istimewa, cukup bertanya sebagai user itu.
export async function selectAsUser(token, path) {
  const { url, anonKey } = supabaseEnv()
  if (!url || !anonKey) throw new Error('SUPABASE_URL/ANON_KEY tak tersedia')
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 120)}`)
  return r.json()
}

// Gerbang lengkap: metode → origin → sesi → batas laju.
// Balik { userId, token } bila lolos, atau null bila respons sudah dikirim.
export async function guard(req, res, { limit, windowMs }) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return null
  }
  if (!originAllowed(req)) {
    res.status(403).json({ error: 'forbidden_origin' })
    return null
  }
  const auth = await requireUser(req, res)
  if (!auth) return null
  if (rateLimited(`${auth.userId}:${clientIp(req)}`, { limit, windowMs })) {
    res.status(429).json({ error: 'rate_limited', error_description: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' })
    return null
  }
  return auth
}
