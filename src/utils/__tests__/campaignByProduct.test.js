import { describe, it, expect } from 'vitest'
import {
  phaseOf, productCampaignRows, productGapRows, variantGap, gapSummary, approvalLabel,
  buildSkipEntries, replaceProductSkips, removeProductSkips, skipEntryOf,
} from '../campaignByProduct'

const NOW = new Date('2026-11-18T10:00:00+07:00').getTime()

// Produk TikTok 3 varian: A lengkap & margin sehat, B tanpa Harga Campaign,
// C tanpa HPP.
const P = {
  id: 'p1', name: 'Serum', platform: 'tiktok',
  fees: { platform: 'tiktok' },
  variations: [
    { name: 'A', sku: 'S-A', hpp: '20000', jual: '150000', jualCampaign: '120000' },
    { name: 'B', sku: 'S-B', hpp: '20000', jual: '150000', jualCampaign: '' },
    { name: 'C', sku: 'S-C', hpp: '',      jual: '150000', jualCampaign: '120000' },
  ],
}
// Produk dengan HPP tinggi → margin di Harga Campaign jauh di bawah target.
const LOW = {
  id: 'p2', name: 'Lotion', platform: 'tiktok',
  fees: { platform: 'tiktok' },
  variations: [{ name: 'Lotion', sku: 'L-1', hpp: '45000', jual: '60000', jualCampaign: '50000' }],
}
const SHOPEE = { id: 'p3', name: 'Gel', platform: 'shopee', fees: { platform: 'shopee' }, variations: [{ name: '', sku: 'G', hpp: '1', jualCampaign: '' }] }
const MAP = { p1: P, p2: LOW, p3: SHOPEE }

const camp = (over = {}) => ({
  id: 'c1', name: '12.12', platform: 'tiktok', items: [], approvals: {}, skipped: [],
  periods: [{ label: '', start: '2026-12-01', end: '2026-12-14' }], voucherConfig: {}, registration: {},
  ...over,
})

describe('fase campaign', () => {
  it('jeda antar periode dihitung berjalan, tanpa tanggal dihitung akan datang', () => {
    expect(phaseOf('gap')).toBe('running')
    expect(phaseOf('draft')).toBe('upcoming')
    expect(phaseOf('scheduled')).toBe('upcoming')
    expect(phaseOf('ended')).toBe('ended')
  })
})

describe('rekap campaign per produk', () => {
  it('hanya campaign yang memuat varian aktif produk ini, berjalan dulu', () => {
    const running = camp({ id: 'run', periods: [{ start: '2026-11-15', end: '2026-11-20' }],
      items: [{ productId: 'p1', varIdx: 0, price: '115000' }] })
    const upcoming = camp({ id: 'up', items: [{ productId: 'p1', varIdx: 0, price: '110000' }, { productId: 'p1', varIdx: 1, price: '100000' }] })
    const excludedOnly = camp({ id: 'ex', items: [{ productId: 'p1', varIdx: 0, price: '1', excluded: true }] })
    const other = camp({ id: 'other', items: [{ productId: 'p2', varIdx: 0, price: '50000' }] })
    const rows = productCampaignRows(P, [upcoming, excludedOnly, other, running], MAP, NOW)
    expect(rows.map(r => r.campaign.id)).toEqual(['run', 'up'])
    expect(rows[1]).toMatchObject({ variantsIn: 2, variantsTotal: 3, price: { min: 100000, max: 110000 }, phase: 'upcoming' })
  })

  it('label approval meringkas status per SKU', () => {
    expect(approvalLabel({ total: 3, approved: 3, rejected: 0, pending: 0 }).key).toBe('approved')
    expect(approvalLabel({ total: 3, approved: 1, rejected: 1, pending: 1 }).label).toBe('Sebagian (1/3)')
  })
})

describe('alasan varian tidak ikut', () => {
  it('varian aktif yang tidak ditolak → bukan celah', () => {
    const c = camp({ items: [{ productId: 'p1', varIdx: 0, price: '120000' }] })
    expect(variantGap(P, 0, c, MAP)).toBeNull()
  })

  it('ditolak client membawa catatan & nama', () => {
    const c = camp({ items: [{ productId: 'p1', varIdx: 0, price: '120000' }],
      approvals: { 'p1:0': { status: 'rejected', note: 'Terlalu murah', byName: 'Rina', at: '2026-11-14T03:00:00Z' } } })
    expect(variantGap(P, 0, c, MAP)).toMatchObject({ reason: 'rejected', note: 'Terlalu murah', who: 'Rina' })
  })

  it('dikecualikan memakai label excludeReason', () => {
    const c = camp({ items: [{ productId: 'p1', varIdx: 0, price: '120000', excluded: true, excludeReason: 'dupsku' }] })
    expect(variantGap(P, 0, c, MAP)).toMatchObject({ reason: 'excluded', note: 'SKU ganda' })
  })

  it('alasan manual menang atas deteksi otomatis', () => {
    const c = camp({ skipped: [{ productId: 'p1', varIdx: null, reason: 'stock', note: 'habis' }] })
    expect(variantGap(P, 1, c, MAP).reason).toBe('manual')
  })

  it('deteksi otomatis: HPP kosong, Harga Campaign kosong, margin di bawah target, lalu belum dicatat', () => {
    const c = camp()
    expect(variantGap(P, 2, c, MAP).reason).toBe('nohpp')
    expect(variantGap(P, 1, c, MAP).reason).toBe('noprice')
    const low = variantGap(LOW, 0, c, MAP)
    expect(low.reason).toBe('margin')
    expect(low.margin).toBeLessThan(25)
    expect(variantGap(P, 0, c, MAP).reason).toBe('none')
  })

  it('target margin campaign dipakai bila diisi', () => {
    const strict = camp({ voucherConfig: { targetMargin: 99 } })
    expect(variantGap(P, 0, strict, MAP)).toMatchObject({ reason: 'margin', target: 99 })
  })
})

describe('baris celah per produk', () => {
  it('melewati campaign selesai & beda marketplace, menggabung varian beralasan sama', () => {
    const ended = camp({ id: 'old', periods: [{ start: '2026-11-01', end: '2026-11-13' }] })
    const shopee = camp({ id: 'sh', platform: 'shopee' })
    const open = camp({ id: 'open' })
    const rows = productGapRows(P, [ended, shopee, open], MAP, NOW)
    expect(rows.every(r => r.campaign.id === 'open')).toBe(true)
    expect(rows.map(r => r.reason)).toEqual(['noprice', 'nohpp', 'none'])
    expect(rows.find(r => r.reason === 'noprice').variantText).toBe('B')
  })

  it('"Semua (n)" bila seluruh varian punya alasan sama', () => {
    const c = camp({ skipped: [{ productId: 'p1', varIdx: null, reason: 'client', note: '', byName: 'Andi', at: '2026-11-17T00:00:00Z' }] })
    const rows = productGapRows(P, [c], MAP, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ reason: 'manual', variantText: 'Semua (3)' })
    expect(rows[0].detail).toContain('Client / brand minta skip')
  })

  it('ringkasan: berapa campaign terlewat dan apakah ikut salah satunya', () => {
    const joined = camp({ id: 'a', items: [{ productId: 'p1', varIdx: 0, price: '120000' }] })
    const missed = camp({ id: 'b' })
    const rows = productGapRows(P, [joined, missed], MAP, NOW)
    expect(gapSummary(P, [joined, missed], rows, NOW)).toEqual({ open: 2, missed: 2, joinedAny: true })
  })
})

describe('entri skipped', () => {
  it('bangun entri semua varian atau per varian', () => {
    const all = buildSkipEntries({ productId: 'p1', productName: ' Serum ', variants: null, reason: 'stock', note: ' x ', showToClient: true }, { email: 'A@B.CO', name: 'Andi' })
    expect(all).toEqual([expect.objectContaining({ productId: 'p1', productName: 'Serum', varIdx: null, note: 'x', by: 'a@b.co', byName: 'Andi', showToClient: true })])
    const some = buildSkipEntries({ productId: 'p1', variants: [{ varIdx: 1, name: 'B' }], reason: 'nope' })
    expect(some[0]).toMatchObject({ varIdx: 1, variantName: 'B', reason: 'other' })
  })

  it('replace membuang entri lama produk itu & varian yang kini sudah aktif', () => {
    const old = [{ productId: 'p1', varIdx: 0 }, { productId: 'p2', varIdx: null }]
    const next = replaceProductSkips(old, 'p1', [{ productId: 'p1', varIdx: 1 }, { productId: 'p1', varIdx: 2 }],
      [{ productId: 'p1', varIdx: 2, price: '1' }])
    expect(next).toEqual([{ productId: 'p2', varIdx: null }, { productId: 'p1', varIdx: 1 }])
    expect(removeProductSkips(next, 'p1')).toEqual([{ productId: 'p2', varIdx: null }])
  })

  it('entri khusus varian menang atas entri semua varian', () => {
    const list = [{ productId: 'p1', varIdx: null, reason: 'stock' }, { productId: 'p1', varIdx: 1, reason: 'price' }]
    expect(skipEntryOf(list, 'p1', 1).reason).toBe('price')
    expect(skipEntryOf(list, 'p1', 0).reason).toBe('stock')
  })
})
