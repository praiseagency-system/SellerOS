import { describe, it, expect } from 'vitest'
import {
  originalPrice, discountPct, hasHpp, priceStats, worstKnownMargin, itemVariation,
} from '../campaignPricing'

// Produk ber-varian minimal: fees platform + harga/HPP per varian.
const PRODUCT = {
  fees: { platform: 'tiktok' },
  variations: [
    { name: 'A', sku: 'A-1', hpp: '50000', jual: '149000', hargaCoret: '199000' },
    { name: 'B', sku: 'B-1', hpp: '60000', jual: '',       hargaCoret: '299000' },  // fallback ke harga coret
    { name: 'C', sku: 'C-1', hpp: '',      jual: '200000', hargaCoret: '' },        // HPP kosong
    { name: 'D', sku: 'D-1', hpp: '10000', jual: '',       hargaCoret: '' },        // tanpa harga normal
  ],
}
const MAP = { p1: PRODUCT }
const IT = (varIdx, price) => ({ productId: 'p1', varIdx, price: String(price) })

describe('harga asli varian', () => {
  it('memakai Harga Jual dari price list', () => {
    expect(originalPrice(IT(0, 127001), MAP)).toBe(149000)
  })

  it('jatuh ke Harga Coret bila Harga Jual kosong', () => {
    expect(originalPrice(IT(1, 259000), MAP)).toBe(299000)
  })

  it('null bila dua-duanya kosong — jangan mengarang diskon dari angka nol', () => {
    expect(originalPrice(IT(3, 50000), MAP)).toBeNull()
  })

  it('null bila produk atau varian tak ada', () => {
    expect(originalPrice(IT(0, 1000), {})).toBeNull()
    expect(originalPrice(IT(99, 1000), MAP)).toBeNull()
    expect(itemVariation(IT(99, 1000), MAP)).toBeNull()
  })
})

describe('potongan harga campaign', () => {
  it('menghitung persen potongan terhadap harga normal', () => {
    expect(discountPct(IT(0, 127001), MAP)).toBeCloseTo(14.76, 1)
  })

  it('negatif bila harga campaign lebih mahal dari harga normal', () => {
    expect(discountPct(IT(0, 160000), MAP)).toBeLessThan(0)
  })

  it('null bila harga normal atau harga campaign tak ada', () => {
    expect(discountPct(IT(3, 50000), MAP)).toBeNull()
    expect(discountPct(IT(0, 0), MAP)).toBeNull()
  })
})

describe('HPP sebagai syarat margin', () => {
  it('varian ber-HPP dianggap bisa dihitung', () => {
    expect(hasHpp(IT(0, 127001), MAP)).toBe(true)
  })

  it('varian tanpa HPP tidak — margin 99% itu palsu', () => {
    expect(hasHpp(IT(2, 200000), MAP)).toBe(false)
  })

  it('margin terburuk mengabaikan varian tanpa HPP', () => {
    const withHpp = worstKnownMargin([IT(0, 127001), IT(2, 200000)], MAP, {})
    const onlyHpp = worstKnownMargin([IT(0, 127001)], MAP, {})
    expect(withHpp).toBe(onlyHpp)
  })

  it('null bila tak satu pun varian punya HPP', () => {
    expect(worstKnownMargin([IT(2, 200000)], MAP, {})).toBeNull()
  })
})

describe('rentang harga untuk ringkasan kartu', () => {
  const items = [IT(0, 127001), IT(1, 259000), IT(3, 50000)]

  it('mengumpulkan rentang harga asli, harga campaign, dan diskon', () => {
    const s = priceStats(items, MAP)
    expect(s.count).toBe(3)
    expect(s.original).toEqual({ min: 149000, max: 299000 })
    expect(s.campaign).toEqual({ min: 50000, max: 259000 })
    expect(Math.round(s.discount.min)).toBe(13)
    expect(Math.round(s.discount.max)).toBe(15)
  })

  it('mencatat berapa varian yang harga normalnya belum diisi', () => {
    expect(priceStats(items, MAP).missingOriginal).toBe(1)
  })

  it('varian yang dikecualikan tidak ikut dihitung', () => {
    const s = priceStats([...items, { ...IT(0, 9000), excluded: true }], MAP)
    expect(s.count).toBe(3)
    expect(s.campaign.min).toBe(50000)
  })

  it('rentang null bila tak ada data sama sekali', () => {
    const s = priceStats([], MAP)
    expect(s.original).toBeNull()
    expect(s.campaign).toBeNull()
    expect(s.discount).toBeNull()
  })
})
