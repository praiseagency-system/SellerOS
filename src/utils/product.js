// Helper model produk ber-VARIAN. Satu produk = config biaya bersama (`fees`)
// + banyak varian; tiap varian punya harga & HPP sendiri → margin sendiri.
// Backward-compatible: produk lama (single, pakai `state`) dibaca sebagai 1 varian.
import { computeCalc, productStatus } from './calc'

const PRICE_FIELDS = ['hpp', 'hargaCoret', 'jual', 'jualCampaign', 'jualFlash']

// Config biaya bersama (platform + kategori + program + iklan/voucher/ongkir).
export function productFees(p) {
  return p.fees || p.state || { platform: p.platform || 'shopee' }
}

// Daftar varian mentah (tanpa calc). Produk lama disintesis jadi 1 varian.
export function productVariationsRaw(p) {
  if (Array.isArray(p.variations) && p.variations.length) return p.variations
  const s = p.state || {}
  return [{
    name: '', sku: p.sku || '',
    hpp: s.hpp ?? '', hargaCoret: s.hargaCoret ?? '',
    jual: s.jual ?? '', jualCampaign: s.jualCampaign ?? '', jualFlash: s.jualFlash ?? '',
  }]
}

function pickPrice(v) {
  const o = {}
  for (const k of PRICE_FIELDS) o[k] = v[k] ?? ''
  return o
}

// Varian + calc terhitung (fees digabung dengan harga/HPP tiap varian).
export function productVariations(p) {
  const fees = productFees(p)
  return productVariationsRaw(p).map(v => ({
    ...v,
    calc: computeCalc({ ...fees, ...pickPrice(v) }),
  }))
}

export function isMultiVariation(p) {
  return Array.isArray(p.variations) && p.variations.length > 1
}

// Ringkasan produk lintas-varian (untuk kartu & dashboard).
export function productSummary(p) {
  const vars = productVariations(p)
  const withCalc = vars.filter(v => v.calc)
  const margins = withCalc.map(v => v.calc.marginNoAd)
  const roass = withCalc.map(v => v.calc.roasBep).filter(r => r != null)
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const min = a => (a.length ? Math.min(...a) : null)
  const max = a => (a.length ? Math.max(...a) : null)
  const repMargin = avg(margins)
  return {
    count: vars.length,
    priced: withCalc.length,         // varian yang harga jualnya sudah diisi
    needPrice: vars.length - withCalc.length,
    marginAvg: repMargin,
    marginMin: min(margins),
    marginMax: max(margins),
    roasAvg: avg(roass),
    losing: withCalc.filter(v => v.calc.marginNoAd < 0).length,
    status: productStatus(repMargin),
    rep: withCalc[0] || vars[0] || null, // varian representatif (untuk metrik tunggal)
  }
}
