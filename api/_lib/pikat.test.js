import { describe, it, expect, vi } from 'vitest'
import { planInbox, fetchPikatCodes, connectLink } from './pikat.js'

const WS = '22220000-0000-0000-0000-00000000000a'
const item = (o = {}) => ({
  videoId: '7550000000000000001', sparkCode: '#kodeAsli123456789012345', tiktokUsername: 'kreator',
  source: 'sample', label: 'Serum', views: 100, uploadedAt: null, recordedAt: '2026-09-20T00:00:00.000Z', ...o,
})

describe('planInbox', () => {
  it('video baru → baris penuh berstatus NEW', () => {
    const p = planInbox(WS, [item()], [], 'T')
    expect(p.baru).toBe(1)
    expect(p.full[0]).toMatchObject({ workspace_id: WS, video_id: '7550000000000000001', status: 'NEW', spark_code: '#kodeAsli123456789012345' })
    expect(p.meta).toEqual([])
  })

  it('kode sama → hanya metadata; status & keputusan tim Ads tak disentuh', () => {
    const p = planInbox(WS, [item({ views: 999 })], [{ video_id: '7550000000000000001', spark_code: '#kodeAsli123456789012345', status: 'DISMISSED' }], 'T')
    expect(p.full).toEqual([])
    expect(p.meta[0].views).toBe(999)
    expect(p.meta[0]).not.toHaveProperty('status')
    expect(p.meta[0]).not.toHaveProperty('spark_code')
  })

  it('kode berganti → kembali NEW, keputusan lama dihapus', () => {
    const p = planInbox(WS, [item({ sparkCode: '#kodeBaru999999999999999' })], [{ video_id: '7550000000000000001', spark_code: '#kodeAsli123456789012345', status: 'INVALID' }], 'T')
    expect(p.berubah).toBe(1)
    expect(p.full[0]).toMatchObject({ status: 'NEW', preview: null, approval_id: null, decided_by: null })
  })

  it('video ID tak sah / kode kosong dibuang', () => {
    const p = planInbox(WS, [item({ videoId: 'abc' }), item({ sparkCode: '  ' })], [], 'T')
    expect(p.full).toEqual([])
    expect(p.meta).toEqual([])
  })
})

const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) })

describe('fetchPikatCodes', () => {
  it('meneruskan token sebagai Bearer', async () => {
    const f = vi.fn().mockResolvedValue(resp(200, { workspace: { id: 7, name: 'A' }, items: [] }))
    await fetchPikatCodes('psl_x', { days: 1, limit: 1 }, f)
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/selleros\/spark-codes\?days=1&limit=1$/)
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer psl_x')
  })

  it('401 dari Pikat → galat token ditolak (bukan "Pikat mati")', async () => {
    const f = vi.fn().mockResolvedValue(resp(401, { error: 'x' }))
    await expect(fetchPikatCodes('psl_x', {}, f)).rejects.toMatchObject({ error: 'pikat_token_rejected' })
  })

  it('jaringan putus → pikat_unreachable', async () => {
    const f = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    await expect(fetchPikatCodes('psl_x', {}, f)).rejects.toMatchObject({ error: 'pikat_unreachable' })
  })
})

describe('connectLink', () => {
  it('menolak token yang bukan psl_ tanpa memanggil Pikat', async () => {
    const f = vi.fn()
    await expect(connectLink(WS, 'u', 'pxa_salah', f)).rejects.toMatchObject({ error: 'invalid_token' })
    expect(f).not.toHaveBeenCalled()
  })

  it('token yang ditolak Pikat tak disimpan', async () => {
    const f = vi.fn().mockResolvedValue(resp(401, {}))
    await expect(connectLink(WS, 'u', 'psl_' + 'a'.repeat(43), f)).rejects.toMatchObject({ error: 'pikat_token_rejected' })
  })
})
