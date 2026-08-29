// Modul ini memegang service_role — kunci yang menembus SEMUA RLS. Satu-satunya
// yang memisahkan tenant di jalur ini adalah pemeriksaan kepemilikan workspace
// yang dilakukan LEBIH DULU dengan JWT pemanggil. Test ini menjaga urutan itu:
// service_role tak boleh tersentuh sebelum kepemilikan terbukti.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveConnection, saveConnectionServerSide, isTokenError } from './tiktokToken.js'

const JWT = 'jwt-pemanggil'
const MINE = '11111111-1111-1111-1111-111111111111'
const NOT_MINE = '22222222-2222-2222-2222-222222222222'
const SECRET = 'sb_secret_palsu'

const hour = (h) => new Date(Date.now() + h * 3600_000).toISOString()

// Mencatat setiap permintaan supaya bisa dibuktikan siapa memakai kunci apa.
let calls
function stub({ conn, refresh } = {}) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = String(url)
    const key = init.headers?.apikey || ''
    calls.push({ url: u, key, method: init.method || 'GET' })

    if (u.includes('/rest/v1/workspaces')) {
      // Meniru RLS: hanya workspace milik pemanggil yang terlihat.
      const mine = u.includes(MINE)
      return { ok: true, status: 200, text: async () => JSON.stringify(mine ? [{ id: MINE }] : []) }
    }
    if (u.includes('/rest/v1/tiktok_connections')) {
      // PostgREST: return=minimal → badan KOSONG (204 utk PATCH, 201 utk POST).
      if ((init.method || 'GET') === 'PATCH') return { ok: true, status: 204, text: async () => '' }
      if ((init.method || 'GET') === 'POST') return { ok: true, status: 201, text: async () => '' }
      return { ok: true, status: 200, text: async () => JSON.stringify(conn ? [conn] : []) }
    }
    if (u.includes('oauth/token')) {
      return refresh
        ? { ok: true, status: 200, text: async () => JSON.stringify(refresh) }
        : { ok: false, status: 400, text: async () => JSON.stringify({ error: 'invalid_grant' }) }
    }
    throw new Error(`URL tak terduga: ${u}`)
  }))
}

const baseConn = {
  workspace_id: MINE, client_id: 'cid', access_token: 'token-lama',
  refresh_token: 'r1', expires_at: hour(5), advertiser_id: 'adv-1', advertiser_name: 'Toko A',
}

describe('resolveConnection', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SECRET_KEY = SECRET
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('menolak workspace milik akun lain SEBELUM service_role dipakai', async () => {
    stub({ conn: baseConn })
    await expect(resolveConnection(JWT, NOT_MINE)).rejects.toSatisfy(
      (e) => isTokenError(e) && e.http === 403 && e.error === 'forbidden_workspace')
    // Inti test: kunci rahasia tidak pernah menyentuh jaringan.
    expect(calls.every(c => c.key !== SECRET)).toBe(true)
    expect(calls.some(c => c.url.includes('tiktok_connections'))).toBe(false)
  })

  it('menolak workspace_id yang bukan UUID tanpa permintaan apa pun', async () => {
    stub({ conn: baseConn })
    await expect(resolveConnection(JWT, 'ngasal')).rejects.toSatisfy(
      (e) => isTokenError(e) && e.http === 400)
    expect(calls).toHaveLength(0)
  })

  it('mengembalikan token tanpa refresh bila masih lama kedaluwarsanya', async () => {
    stub({ conn: baseConn })
    const out = await resolveConnection(JWT, MINE)
    expect(out.access_token).toBe('token-lama')
    expect(out.refreshed).toBe(false)
    expect(calls.some(c => c.url.includes('oauth/token'))).toBe(false)
  })

  it('menyegarkan token yang hampir kedaluwarsa lalu menyimpannya', async () => {
    stub({
      conn: { ...baseConn, expires_at: hour(0.01) },
      refresh: { access_token: 'token-baru', refresh_token: 'r2', expires_in: 7200 },
    })
    const out = await resolveConnection(JWT, MINE)
    expect(out.access_token).toBe('token-baru')
    expect(out.refreshed).toBe(true)
    // Hasil segar wajib dipersist, kalau tidak setiap permintaan menyegarkan lagi.
    expect(calls.some(c => c.method === 'PATCH' && c.url.includes('tiktok_connections'))).toBe(true)
  })

  it('force: menyegarkan walau token masih berlaku (tombol Perbarui token)', async () => {
    stub({ conn: baseConn, refresh: { access_token: 'token-baru', expires_in: 7200 } })
    const out = await resolveConnection(JWT, MINE, { force: true })
    expect(out.access_token).toBe('token-baru')
  })

  it('mempertahankan refresh_token lama bila TikTok tak mengirim yang baru', async () => {
    stub({ conn: baseConn, refresh: { access_token: 'token-baru', expires_in: 7200 } })
    const out = await resolveConnection(JWT, MINE, { force: true })
    expect(out.refresh_token).toBe('r1')
  })

  it('menyuruh sambungkan ulang bila refresh ditolak TikTok', async () => {
    stub({ conn: { ...baseConn, expires_at: hour(-1) } }) // refresh gagal
    await expect(resolveConnection(JWT, MINE)).rejects.toSatisfy(
      (e) => isTokenError(e) && e.http === 401 && e.error === 'reconnect_required')
  })

  it('memberi tahu bila workspace belum tersambung', async () => {
    stub({ conn: null })
    await expect(resolveConnection(JWT, MINE)).rejects.toSatisfy(
      (e) => isTokenError(e) && e.http === 404 && e.error === 'not_connected')
  })

  it('GAGAL TERTUTUP bila SUPABASE_SECRET_KEY belum diset', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    stub({ conn: baseConn })
    await expect(resolveConnection(JWT, MINE)).rejects.toSatisfy(
      (e) => isTokenError(e) && e.http === 503 && e.error === 'server_unconfigured')
  })
})

describe('pesan saat kunci server tak terbaca', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    stub({ conn: baseConn })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('menyebut apa yang harus dicek saat kunci tak ada sama sekali', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    await expect(resolveConnection(JWT, MINE)).rejects.toSatisfy(
      (e) => e.http === 503 && /Production/.test(e.description) && /Redeploy/.test(e.description))
  })

  it('meneriakkan bahaya bila kunci diberi awalan VITE_', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    process.env.VITE_SUPABASE_SECRET_KEY = 'salah-taruh'
    await expect(resolveConnection(JWT, MINE)).rejects.toSatisfy(
      (e) => e.http === 503 && /BAHAYA/.test(e.description) && /browser/.test(e.description))
    delete process.env.VITE_SUPABASE_SECRET_KEY
  })

  it('membedakan "ada tapi kosong"', async () => {
    process.env.SUPABASE_SECRET_KEY = '   '
    await expect(resolveConnection(JWT, MINE)).rejects.toSatisfy(
      (e) => e.http === 503 && /kosong/.test(e.description))
  })

  it('menerima nama alternatif SUPABASE_SERVICE_ROLE_KEY', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_alt'
    const out = await resolveConnection(JWT, MINE)
    expect(out.access_token).toBe('token-lama')
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })
})

describe('saveConnectionServerSide', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SECRET_KEY = SECRET
    stub({ conn: baseConn })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const tok = { access_token: 'a', refresh_token: 'r', expires_in: 7200, scope: 's', token_type: 'Bearer' }

  it('menolak menyimpan ke workspace orang lain SEBELUM service_role dipakai', async () => {
    await expect(saveConnectionServerSide(JWT, NOT_MINE, tok, 'cid')).rejects.toSatisfy(
      (e) => isTokenError(e) && e.http === 403)
    // Kunci rahasia tak boleh menyentuh jaringan saat kepemilikan belum terbukti.
    expect(calls.every(c => c.key !== SECRET)).toBe(true)
  })

  // REGRESI: PostgREST membalas 201 + badan KOSONG untuk `return=minimal`.
  // Sebelum diperbaiki, r.json() melempar "Unexpected end of JSON input"
  // SETELAH baris tersimpan — connect tampak gagal padahal berhasil.
  it('tidak tersedak balasan 201 berbadan kosong dari PostgREST', async () => {
    await expect(saveConnectionServerSide(JWT, MINE, tok, 'cid')).resolves.toHaveProperty('expires_at')
  })

  it('menyimpan lewat service_role dan mengembalikan expires_at saja', async () => {
    const out = await saveConnectionServerSide(JWT, MINE, tok, 'cid')
    expect(out).toHaveProperty('expires_at')
    // Token TIDAK ikut dikembalikan ke pemanggil.
    expect(out.access_token).toBeUndefined()
    expect(out.refresh_token).toBeUndefined()
    const write = calls.find(c => c.url.includes('tiktok_connections') && c.method === 'POST')
    expect(write).toBeTruthy()
    expect(write.key).toBe(SECRET)
  })
})
