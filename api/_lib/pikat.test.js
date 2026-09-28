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

import { statusForPikat, isMissingColumn } from './pikat.js'

describe('statusForPikat', () => {
  const row = (status, preview = null) => ({ video_id: '7550000000000000001', spark_code: '#k', status, preview })
  const NOW = Date.parse('2026-09-28T00:00:00Z')
  it('terikat (dari kotak atau potret otorisasi) → BOUND dengan tanggal habis', () => {
    expect(statusForPikat(row('BOUND'), { ad_auth_status: 'AUTHORIZED', auth_end_time: '2026-10-27 00:00:00' }, NOW))
      .toMatchObject({ status: 'BOUND', authEndTime: '2026-10-27 00:00:00' })
    expect(statusForPikat(row('READY'), { ad_auth_status: 'AUTHORIZED', auth_end_time: '2026-10-27 00:00:00' }, NOW).status).toBe('BOUND')
  })
  it('izin lewat / EXPIRED → EXPIRED', () => {
    expect(statusForPikat(row('BOUND'), { ad_auth_status: 'AUTHORIZED', auth_end_time: '2026-09-01 00:00:00' }, NOW).status).toBe('EXPIRED')
    expect(statusForPikat(row('ALREADY'), { ad_auth_status: 'EXPIRED' }, NOW).status).toBe('EXPIRED')
  })
  it('vonis kotak diteruskan; NEW/READY = PENDING', () => {
    expect(statusForPikat(row('INVALID', { error: 'x' }), null, NOW)).toMatchObject({ status: 'INVALID', detail: 'x' })
    expect(statusForPikat(row('MISMATCH', { item_id: '9' }), null, NOW).detail).toBe('kode untuk video 9')
    expect(statusForPikat(row('NEW'), null, NOW).status).toBe('PENDING')
    expect(statusForPikat(row('DISMISSED'), null, NOW).status).toBe('DISMISSED')
  })
})

describe('planInbox — metrik', () => {
  it('membawa likes/comments/shares/gmv_organic', () => {
    const p = planInbox(WS, [item({ likes: 5, comments: '2', shares: null, gmvOrganik: 125000 })], [], 'T')
    expect(p.full[0]).toMatchObject({ likes: 5, comments: 2, shares: null, gmv_organic: 125000 })
  })
  it('kenali galat kolom belum ada (0065 belum dijalankan)', () => {
    expect(isMissingColumn({ description: "PostgREST 400: {\"code\":\"PGRST204\",\"message\":\"Could not find the 'likes' column\"}" })).toBe(true)
    expect(isMissingColumn({ description: 'PostgREST 500: boom' })).toBe(false)
  })
})

import { planRequests } from './pikat.js'

describe('planRequests (F4)', () => {
  it('video afiliasi berbelanja tanpa kode aktif → satu permintaan per video, dijumlah 7 hari', () => {
    const r = planRequests([
      { video_id: '7550000000000000001', cost: 100000, gross_revenue: 900000 },
      { video_id: '7550000000000000001', cost: 50000, gross_revenue: 100000 },
      { video_id: '7550000000000000002', cost: 0, gross_revenue: 0 },
      { video_id: '7550000000000000003', cost: 9000, gross_revenue: 1 },
    ], new Set(['7550000000000000003']))
    expect(r).toEqual([{ videoId: '7550000000000000001', detail: 'Iklan 7 hr lewat izin afiliasi: biaya Rp 150 rb · omzet Rp 1,0 jt' }])
  })
})

import { sanitizeAuthCode } from '../gmvmax/tt-video.js'

describe('sanitizeAuthCode', () => {
  it("'+' dikirim apa adanya (bukan %2B) — terbukti ke TikTok 28 Sep", () => {
    expect(sanitizeAuthCode(' #+v08a+b/c= ')).toBe('#+v08a+b/c=')
  })
  it('karakter tak terlihat dibuang', () => {
    expect(sanitizeAuthCode('⁠#abc​')).toBe('#abc')
  })
})
