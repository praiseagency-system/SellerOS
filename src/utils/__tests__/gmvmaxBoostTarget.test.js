import { describe, it, expect } from 'vitest'
import { pickBoostTarget, pickExcludeTarget, undecidedReason } from '../gmvmaxBoostTarget'

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

// Sasaran EXCLUDE mengikuti jejak BELANJA. Kasus nyata yang melahirkan tangga
// ini: video 7681339687058885906 (11 Sep 2026) — 100% omzetnya lahir di Glance
// & Custom (cost 0), tapi Rp96.810 terbakar di Exotic Blue. Tangga boost memilih
// Glance, TikTok menerima perintahnya, dan pemborosannya jalan terus.
describe('pickExcludeTarget', () => {
  it('memilih campaign tempat UANG TERBAKAR, bukan tempat omzet lahir', () => {
    const video = vid([
      pl({ c: 'glance', p: 'A', rev: 133000, cost: 0 }),
      pl({ c: 'exotic', p: 'B', rev: 0, cost: 96810 }),
    ])
    expect(pickBoostTarget({ video }).placement.campaignId).toBe('glance')   // benar untuk boost
    const r = pickExcludeTarget({ video })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('exotic')
    expect(r.reason).toMatch(/belanja/)
  })

  it('satu pasangan saja → langsung, tanpa bertanya', () => {
    const r = pickExcludeTarget({ video: vid([pl({ c: '1', p: 'A', cost: 50000 })]) })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('1')
  })

  it('belanja terbagi rata → menyerah dengan jujur, user yang memilih', () => {
    const r = pickExcludeTarget({ video: vid([
      pl({ c: '1', p: 'A', cost: 50000 }), pl({ c: '2', p: 'B', cost: 50000 }),
    ]) })
    expect(r.confident).toBe(false)
    expect(r.options).toHaveLength(2)
  })

  it('belum ada belanja di mana pun → jatuh ke satu-satunya yang tayang', () => {
    const r = pickExcludeTarget({ video: vid([
      pl({ c: '1', p: 'A', st: 'DELIVERING' }), pl({ c: '2', p: 'B', st: 'EXCLUDED' }),
    ]) })
    expect(r.confident).toBe(true)
    expect(r.placement.campaignId).toBe('1')
  })

  it('menghormati saringan eligible — campaign nonaktif tak pernah jadi sasaran', () => {
    const r = pickExcludeTarget({
      video: vid([pl({ c: 'mati', p: 'A', cost: 900000 }), pl({ c: 'hidup', p: 'B', cost: 100000 })]),
      eligible: (p) => p.campaignId !== 'mati',
    })
    expect(r.placement.campaignId).toBe('hidup')
  })

  it('alasan "belum pasti" menyebut belanja, bukan omzet', () => {
    expect(undecidedReason([pl({ c: '1', p: 'A', cost: 5 }), pl({ c: '2', p: 'B', cost: 5 })], 'EXCLUDE'))
      .toBe('belanjanya terbagi di 2 campaign')
    expect(undecidedReason([pl({ c: '1', p: 'A' }), pl({ c: '2', p: 'B' })], 'EXCLUDE'))
      .toMatch(/belum ada belanja di 2 campaign/)
  })
})
