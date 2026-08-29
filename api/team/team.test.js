// Jalur keanggotaan memegang service_role — kunci yang menembus SEMUA RLS.
// Yang memisahkan tenant di sini cuma pemeriksaan "apakah kamu owner", dan itu
// dilakukan LEBIH DULU dengan JWT pemanggil. Test ini menjaga urutan itu, dan
// menjaga agar tautan undangan tak bisa dipakai orang yang tak dituju.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import invite from './invite.js'
import accept from './accept.js'
import members from './members.js'

const WS = '44444444-4444-4444-4444-444444444444'
const WS_LAIN = '55555555-5555-5555-5555-555555555555'
const OWNER = 'a1000000-0000-0000-0000-000000000001'
const LAIN = 'a2000000-0000-0000-0000-000000000002'
const TOKEN = '77777777-7777-4777-8777-777777777777'
const SECRET = 'sb_secret_palsu'

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = (body, uid = OWNER) => ({ method: 'POST', headers: { authorization: 'Bearer sah' }, body, _uid: uid })

let calls, uid, invRow, myEmail, myRole
function stub() {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (u, init = {}) => {
    const url = String(u); const key = init.headers?.apikey || ''
    calls.push({ url, key, method: init.method || 'GET' })
    const ok = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) })

    if (url.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: uid }) }
    // Dipanggil dengan JWT pemanggil (anon key) → tiru RLS: hanya workspace
    // yang dia ikuti yang terlihat.
    if (url.includes('workspace_members') && key !== SECRET) {
      return ok(url.includes(WS) && myRole ? [{ role: myRole }] : [])
    }
    if (url.includes('profiles') && key !== SECRET) return ok([{ email: myEmail }])
    if (url.includes('profiles')) return ok([])
    if (url.includes('workspace_invites') && (init.method || 'GET') === 'GET') return ok(invRow ? [invRow] : [])
    if (url.includes('workspace_invites')) return ok([{ token: TOKEN }])
    if (url.includes('workspace_members')) return ok([])
    throw new Error('URL tak terduga: ' + url)
  }))
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'anon'
  process.env.SUPABASE_SECRET_KEY = SECRET
  uid = OWNER; myRole = 'owner'; myEmail = 'owner@contoh.com'
  invRow = {
    token: TOKEN, workspace_id: WS, email: 'diundang@contoh.com', role: 'editor',
    expires_at: new Date(Date.now() + 86400000).toISOString(), accepted_at: null, revoked_at: null,
  }
  stub()
})
afterEach(() => vi.unstubAllGlobals())

const run = (h, body) => { const r = mockRes(); return h(req(body), r).then(() => r) }

describe('invite', () => {
  it('menolak yang bukan owner SEBELUM service_role dipakai', async () => {
    myRole = 'editor'
    const r = await run(invite, { workspace_id: WS, email: 'x@y.com', role: 'editor' })
    expect(r.statusCode).toBe(403)
    expect(calls.every(c => c.key !== SECRET)).toBe(true)
  })
  it('menolak workspace yang bukan miliknya', async () => {
    const r = await run(invite, { workspace_id: WS_LAIN, email: 'x@y.com' })
    expect(r.statusCode).toBe(403)
  })
  it('menolak peran owner (kepemilikan tak lewat tautan chat)', async () => {
    const r = await run(invite, { workspace_id: WS, email: 'x@y.com', role: 'owner' })
    expect(r.statusCode).toBe(400)
  })
  it('menolak email tak valid', async () => {
    const r = await run(invite, { workspace_id: WS, email: 'bukan-email' })
    expect(r.statusCode).toBe(400)
  })
  it('owner mendapat tautan undangan', async () => {
    const r = await run(invite, { workspace_id: WS, email: 'x@y.com', role: 'viewer' })
    expect(r.statusCode).toBe(200)
    expect(r.body.url).toContain('/join-team?t=')
  })
})

describe('accept', () => {
  it('menolak bila email pemanggil bukan yang diundang', async () => {
    uid = LAIN; myEmail = 'orang.lain@contoh.com'
    const r = await run(accept, { token: TOKEN })
    expect(r.statusCode).toBe(403)
    expect(r.body.error).toBe('email_mismatch')
  })
  it('menolak undangan kedaluwarsa', async () => {
    myEmail = 'diundang@contoh.com'
    invRow.expires_at = new Date(Date.now() - 1000).toISOString()
    const r = await run(accept, { token: TOKEN })
    expect(r.statusCode).toBe(404)
  })
  it('menolak undangan yang sudah dipakai', async () => {
    myEmail = 'diundang@contoh.com'
    invRow.accepted_at = new Date().toISOString()
    expect((await run(accept, { token: TOKEN })).statusCode).toBe(404)
  })
  it('menolak undangan yang dicabut', async () => {
    myEmail = 'diundang@contoh.com'
    invRow.revoked_at = new Date().toISOString()
    expect((await run(accept, { token: TOKEN })).statusCode).toBe(404)
  })
  it('orang yang dituju berhasil bergabung', async () => {
    uid = LAIN; myEmail = 'diundang@contoh.com'
    const r = await run(accept, { token: TOKEN })
    expect(r.statusCode).toBe(200)
    expect(r.body.role).toBe('editor')
  })
})

describe('members', () => {
  it('owner tak bisa mengeluarkan dirinya sendiri', async () => {
    const r = await run(members, { workspace_id: WS, action: 'remove', user_id: OWNER })
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toBe('cannot_target_self')
  })
  it('bukan owner ditolak sebelum service_role dipakai', async () => {
    myRole = 'viewer'
    const r = await run(members, { workspace_id: WS, action: 'remove', user_id: LAIN })
    expect(r.statusCode).toBe(403)
    expect(calls.every(c => c.key !== SECRET)).toBe(true)
  })
})
