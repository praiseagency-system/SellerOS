import { describe, it, expect } from 'vitest'
import { izinInfo, waktuIkat } from './sparkBindTime'

describe('izinInfo', () => {
  it('durasi & sisa hari dari waktu TikTok (UTC)', () => {
    const i = izinInfo({ auth_start_time: '2025-06-16 14:36:52', auth_end_time: '2026-08-15 14:36:52' }, Date.parse('2026-08-10T14:36:52Z'))
    expect(i.durasiHari).toBe(425)
    expect(i.sisaHari).toBe(5)
    expect(i.mulai).toBe('16 Jun 2025')
  })
  it('tanpa data → null', () => {
    expect(izinInfo({}, 0)).toMatchObject({ mulai: null, habis: null, sisaHari: null })
  })
})

describe('waktuIkat', () => {
  const t = { executed: new Map([['1', '2026-09-29T16:02:37Z']]), firstSeen: new Map([['2', '2026-08-27'], ['3', '2026-09-10']]), firstSnapshot: '2026-08-27' }
  it('lewat SellerOS → waktu persis', () => {
    expect(waktuIkat('1', t)).toMatchObject({ persis: true, label: expect.stringContaining('diikat via SellerOS 29 Sep 2026') })
  })
  it('terlihat di potret pertama → "sebelum"; sesudahnya → "sejak"', () => {
    expect(waktuIkat('2', t).label).toBe('terikat sebelum 27 Agu 2026')
    expect(waktuIkat('3', t).label).toBe('terlihat terikat sejak 10 Sep 2026')
  })
  it('belum ada di potret', () => {
    expect(waktuIkat('9', t).label).toMatch(/baru terikat/)
  })
})
