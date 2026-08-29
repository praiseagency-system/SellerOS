// Gerbang api/* menjaga endpoint yang MEMBELANJAKAN UANG (api/gmvmax/execute).
// Perilakunya diuji di sini supaya pelonggaran tak sengaja ketahuan lebih awal.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { guard, originAllowed, rateLimited } from './guard.js'

// Respons palsu bergaya Vercel: merekam status & body, bukan mengirim apa pun.
function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = (over = {}) => ({ method: 'POST', headers: {}, body: {}, ...over })

const okUser = () => Promise.resolve({ ok: true, json: async () => ({ id: 'user-1' }) })

describe('originAllowed', () => {
  it('mengizinkan domain produksi & localhost', () => {
    expect(originAllowed(req({ headers: { origin: 'https://selleros.praiseagency.id' } }))).toBe(true)
    expect(originAllowed(req({ headers: { origin: 'http://localhost:5173' } }))).toBe(true)
  })
  it('mengizinkan preview vercel proyek ini', () => {
    expect(originAllowed(req({ headers: { origin: 'https://seller-os-git-abc.vercel.app' } }))).toBe(true)
  })
  it('menolak origin asing', () => {
    expect(originAllowed(req({ headers: { origin: 'https://penyerang.example' } }))).toBe(false)
    // Domain yang hanya BERAWALAN sama tak boleh lolos regex preview.
    expect(originAllowed(req({ headers: { origin: 'https://seller-os.penyerang.example' } }))).toBe(false)
  })
  it('membiarkan permintaan tanpa Origin (dijaga gerbang sesi)', () => {
    expect(originAllowed(req())).toBe(true)
  })
})

describe('rateLimited', () => {
  it('melepas sampai batas lalu menahan', () => {
    const key = `k-${Math.random()}`
    const opts = { limit: 3, windowMs: 60_000 }
    expect(rateLimited(key, opts)).toBe(false)
    expect(rateLimited(key, opts)).toBe(false)
    expect(rateLimited(key, opts)).toBe(false)
    expect(rateLimited(key, opts)).toBe(true)
  })
  it('kunci berbeda dihitung terpisah', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    expect(rateLimited(`a-${Math.random()}`, opts)).toBe(false)
    expect(rateLimited(`b-${Math.random()}`, opts)).toBe(false)
  })
})

describe('guard', () => {
  // Env dipasang DI SINI, tidak diwarisi. Sebelumnya berkas ini lulus hanya
  // karena vitest memuat .env.local milik pengembang ke process.env — di CI
  // berkas itu tak ada, dan seluruh test di bawah balas 503 (server_unconfigured)
  // alih-alih 401/200. Gerbang yang menjaga endpoint pembelanja uang tak boleh
  // diuji dengan env pinjaman dari mesin siapa pun.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(okUser))
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY
  })

  const OPTS = { limit: 100, windowMs: 60_000 }

  it('menolak metode selain POST', async () => {
    const res = mockRes()
    expect(await guard(req({ method: 'GET' }), res, OPTS)).toBeNull()
    expect(res.statusCode).toBe(405)
  })

  it('menolak tanpa header Authorization', async () => {
    const res = mockRes()
    expect(await guard(req(), res, OPTS)).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('menolak origin asing sebelum menyentuh Supabase', async () => {
    const res = mockRes()
    const r = req({ headers: { origin: 'https://penyerang.example', authorization: 'Bearer x' } })
    expect(await guard(r, res, OPTS)).toBeNull()
    expect(res.statusCode).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('menolak saat Supabase bilang JWT tidak sah', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })))
    const res = mockRes()
    expect(await guard(req({ headers: { authorization: 'Bearer palsu' } }), res, OPTS)).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('GAGAL TERTUTUP saat env auth belum tersedia', async () => {
    // Varian VITE_ ikut dihapus: guard.js menerimanya sebagai cadangan, dan
    // vitest bisa mengisinya dari .env.local di mesin pengembang. afterEach
    // yang membersihkan sisanya.
    delete process.env.SUPABASE_URL; delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY; delete process.env.VITE_SUPABASE_ANON_KEY
    const res = mockRes()
    const out = await guard(req({ headers: { authorization: 'Bearer sah' } }), res, OPTS)
    expect(out).toBeNull()          // menolak, BUKAN meloloskan
    expect(res.statusCode).toBe(503)
  })

  it('meloloskan sesi sah; balikkan userId + token', async () => {
    const res = mockRes()
    const out = await guard(req({ headers: { authorization: 'Bearer sah' } }), res, OPTS)
    // token ikut dikembalikan supaya endpoint bisa bertanya ke PostgREST ATAS
    // NAMA pemanggil (RLS yang menjaga), tanpa perlu service_role.
    expect(out).toEqual({ userId: 'user-1', token: 'sah' })
    expect(res.statusCode).toBeNull()
  })

  it('menahan saat batas laju terlampaui', async () => {
    const r = req({ headers: { authorization: 'Bearer sah', 'x-forwarded-for': '9.9.9.9' } })
    const opts = { limit: 1, windowMs: 60_000 }
    expect(await guard(r, mockRes(), opts)).not.toBeNull()
    const res2 = mockRes()
    expect(await guard(r, res2, opts)).toBeNull()
    expect(res2.statusCode).toBe(429)
  })
})
