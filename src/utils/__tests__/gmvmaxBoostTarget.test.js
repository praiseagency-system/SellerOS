import { describe, it, expect } from 'vitest'
import { pickBoostTarget, undecidedReason } from '../gmvmaxBoostTarget'

const pl = (o) => ({
  campaignId: o.c, campaignName: o.cn || `campaign ${o.c}`, productId: o.p,
  delivery: o.st || 'DELIVERING', cost: o.cost ?? 0, revenue: o.rev ?? 0, orders: o.ord ?? 0,
})
const vid = (places) => ({ videoId: 'v1', placements: places })

describe('pickBoostTarget — tangga bukti', () => {
  it('satu pasangan: langsung yakin, tanpa perlu bukti lain', () => {
    const r = pickBoostTarget({ video: vid([pl({ c: '1', p: 'A' })]) })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('1')
    expect(r.reason).toMatch(/satu-satunya campaign/)
  })

  it('anchor produk mengalahkan omzet — video menjual produk itu, titik', () => {
    // B punya omzet jauh lebih besar, tapi keranjang di video menunjuk A.
    const r = pickBoostTarget({
      video: vid([pl({ c: '1', p: 'A', rev: 10000 }), pl({ c: '2', p: 'B', rev: 900000 })]),
      anchorSpu: 'A',
    })
    expect(r.confident).toBe(true)
    expect(r.placement.productId).toBe('A')
    expect(r.reason).toBe('produk yang tertaut di video ini')
  })

  it('anchor cocok di beberapa campaign → dipilih yang omzetnya dominan, alasannya digabung', () => {
    const r = pickBoostTarget({
      video: vid([pl({ c: '1', p: 'A', rev: 950000 }), pl({ c: '2', p: 'A', rev: 50000 }), pl({ c: '3', p: 'B', rev: 400000 })]),
      anchorSpu: 'A',
    })
    expect(r.placement.campaignId).toBe('1')
    expect(r.reason).toMatch(/produk yang tertaut/)
    expect(r.reason).toMatch(/omzet/)
  })

  it('tanpa anchor: satu pasangan menguasai >=80% omzet', () => {
    const r = pickBoostTarget({ video: vid([pl({ c: '1', p: 'A', rev: 900000 }), pl({ c: '2', p: 'B', rev: 100000 })]) })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('1')
    expect(r.reason).toBe('90% omzet video ini lahir di sana')
  })

  it('omzet 70/30 belum cukup dominan → jangan menebak', () => {
    const r = pickBoostTarget({ video: vid([pl({ c: '1', p: 'A', rev: 700000, st: 'DELIVERING' }), pl({ c: '2', p: 'B', rev: 300000, st: 'DELIVERING' })]) })
    expect(r.confident).toBe(false)
    expect(r.placement).toBe(null)
    expect(r.options).toHaveLength(2)
  })

  it('omzet nol semua → jatuh ke "satu-satunya yang tayang"', () => {
    const r = pickBoostTarget({ video: vid([pl({ c: '1', p: 'A', st: 'DELIVERING' }), pl({ c: '2', p: 'B', st: 'IN_QUEUE' })]) })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('1')
    expect(r.reason).toMatch(/sedang tayang/)
  })

  it('dua-duanya tayang & tanpa omzet → menyerah dengan jujur', () => {
    const r = pickBoostTarget({ video: vid([pl({ c: '1', p: 'A', st: 'DELIVERING' }), pl({ c: '2', p: 'B', st: 'LEARNING' })]) })
    expect(r.confident).toBe(false)
    expect(r.options).toHaveLength(2)
  })

  it('pasangan tanpa produk tak pernah jadi sasaran — aksi butuh spu_id', () => {
    const r = pickBoostTarget({ video: vid([pl({ c: '1', p: null, rev: 999999 }), pl({ c: '2', p: 'B', rev: 1 })]) })
    expect(r.placement.productId).toBe('B')
  })

  it('menghormati saringan eligible dari pemanggil (campaign nonaktif dibuang)', () => {
    const r = pickBoostTarget({
      video: vid([pl({ c: 'mati', p: 'A', rev: 900000 }), pl({ c: 'hidup', p: 'B', rev: 100000 })]),
      eligible: (p) => p.campaignId !== 'mati',
    })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('hidup')
  })

  it('tak ada pasangan sah sama sekali', () => {
    const r = pickBoostTarget({ video: vid([]), })
    expect(r.confident).toBe(false)
    expect(r.options).toEqual([])
  })
})

describe('undecidedReason', () => {
  it('menyebut berapa campaign yang berbagi omzet', () => {
    expect(undecidedReason([pl({ c: '1', p: 'A', rev: 5 }), pl({ c: '2', p: 'B', rev: 5 })]))
      .toBe('omzetnya terbagi di 2 campaign')
  })
  it('membedakan kasus belum ada omzet sama sekali', () => {
    expect(undecidedReason([pl({ c: '1', p: 'A' }), pl({ c: '2', p: 'B' })]))
      .toMatch(/belum ada omzet di 2 campaign/)
  })
})
