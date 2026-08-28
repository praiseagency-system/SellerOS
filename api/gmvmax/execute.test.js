// `api/gmvmax/execute` adalah satu-satunya pintu yang MEMBELANJAKAN uang iklan.
// Seluruh pagar bisnis (batas kenaikan budget, cooldown, kill switch) ada di
// jalur pembuatan & persetujuan approval — BUKAN di sini. Jadi kalau endpoint
// ini mau menerima approval_id apa adanya, semua pagar itu bisa dilewati hanya
// dengan memanggilnya langsung. Test ini menjaga gerbangnya tetap tertutup.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import handler from './execute.js'

const APPROVED = '11111111-1111-1111-1111-111111111111'
const PENDING = '22222222-2222-2222-2222-222222222222'
const OTHER_ACTION = '33333333-3333-3333-3333-333333333333'
const NOT_MINE = '99999999-9999-9999-9999-999999999999'

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

// RLS palsu: baris milik tenant lain dikembalikan sebagai daftar KOSONG —
// persis seperti PostgREST saat policy menyaringnya.
const ROWS = {
  [APPROVED]: [{ id: 'a', action_type: 'SPARK_BIND', status: 'APPROVED' }],
  [PENDING]: [{ id: 'b', action_type: 'SPARK_BIND', status: 'PENDING' }],
  [OTHER_ACTION]: [{ id: 'c', action_type: 'BUDGET_UPDATE', status: 'APPROVED' }],
}

// Dipakai untuk membuktikan panggilan TikTok TIDAK pernah terjadi saat ditolak.
const TIKTOK_REACHED = 'TIKTOK_REACHED'

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (u) => {
    const url = String(u)
    if (url.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-1' }) }
    if (url.includes('gmvmax_approvals')) {
      const id = Object.keys(ROWS).find(k => url.includes(k))
      return { ok: true, json: async () => (id ? ROWS[id] : []) }
    }
    throw new Error(TIKTOK_REACHED)
  }))
}

const call = (body) => {
  const res = mockRes()
  return handler({ method: 'POST', headers: { authorization: 'Bearer sah' }, body }, res).then(() => res)
}
const spark = (approval_id, extra = {}) => ({
  access_token: 't', action_type: 'SPARK_BIND', approval_id,
  params: { advertiser_id: '123', auth_code: 'abc' }, ...extra,
})

describe('execute — gerbang approval', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'k'
    stubFetch()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('menolak approval milik akun lain (RLS balikin kosong)', async () => {
    const res = await call(spark(NOT_MINE))
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('approval_not_found')
  })

  it('menolak approval yang belum disetujui', async () => {
    const res = await call(spark(PENDING))
    expect(res.statusCode).toBe(409)
    expect(res.body.error).toBe('approval_not_approved')
  })

  it('menolak approval untuk jenis aksi yang berbeda', async () => {
    const res = await call(spark(OTHER_ACTION))
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('approval_action_mismatch')
  })

  it('menolak approval_id yang bukan UUID', async () => {
    const res = await call(spark('ngasal'))
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('invalid_request')
  })

  it('penolakan terjadi SEBELUM TikTok tersentuh', async () => {
    for (const id of [NOT_MINE, PENDING, OTHER_ACTION]) {
      const res = await call(spark(id))
      expect(res.body.error_description || '').not.toContain(TIKTOK_REACHED)
    }
  })

  it('approval sah diteruskan ke TikTok', async () => {
    const res = await call(spark(APPROVED))
    // Mock melempar saat MCP dipanggil → bukti permintaan lolos gerbang.
    expect(res.body.error_description).toContain(TIKTOK_REACHED)
  })

  it('tanpa sesi login, approval tak pernah ditanyakan', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, body: spark(APPROVED) }, res)
    expect(res.statusCode).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
})
