// Helper murni harga campaign + persetujuan — dipakai CampaignPanel (in-app) &
// ApprovalPage (halaman client publik) agar perhitungan margin/voucher identik.
import { computeCalc } from './calc'
import { productFees, productVariations } from './product'

export const fmt = n => (n == null || isNaN(n)) ? '—' : 'Rp' + Math.round(n).toLocaleString('id-ID')
export function marginCls(m) {
  if (m == null || isNaN(m)) return 'text-ink-faint'
  return m >= 30 ? 'text-green-400' : m >= 20 ? 'text-yellow-400' : 'text-red-400'
}
export function fmtPct(n) { return (n == null || isNaN(n)) ? '—' : `${(+n).toFixed(0)}%` }

// Margin sebuah item (varian pada harga campaign). sellerPerUnit = beban voucher
// co-funded per unit (Rp) yang dipotong dari harga jual. Default 0.
export function itemMargin(item, productMap, sellerPerUnit = 0) {
  const p = productMap[item.productId]
  if (!p) return null
  const fees = productFees(p)
  const v = productVariations(p)[item.varIdx]
  if (!v) return null
  const calc = computeCalc({ ...fees, hpp: v.hpp, jual: item.price, voucher: String(+sellerPerUnit || 0) })
  return calc ? calc.marginNoAd : null
}

// Efek satu voucher pada satu varian di harga campaign tertentu (asumsi cart 1
// varian sampai lolos min. pesanan).
export function voucherEffect(voucher, price) {
  const p = +price || 0
  if (p <= 0) return null
  const discPct   = +voucher.discPct  || 0
  const maxDisc   = +voucher.maxDisc   || 0
  const minOrder  = +voucher.minOrder  || 0
  const sellerPct = +voucher.sellerPct || 0
  const sellerCap = +voucher.sellerCap || 0
  const pcs = minOrder > 0 ? Math.max(1, Math.ceil(minOrder / p)) : 1
  const orderValue = pcs * p
  let discount = orderValue * discPct / 100
  if (maxDisc > 0) discount = Math.min(discount, maxDisc)
  let sellerCost = discount * sellerPct / 100
  if (sellerCap > 0) sellerCost = Math.min(sellerCost, sellerCap)
  const sellerPerUnit = pcs > 0 ? sellerCost / pcs : 0
  const custPerUnit = p - discount / pcs
  return { pcs, orderValue, discount, sellerCost, sellerPerUnit, custPerUnit }
}

export function voucherList(voucherConfig) {
  const vs = voucherConfig && Array.isArray(voucherConfig.vouchers) ? voucherConfig.vouchers : []
  return vs.filter(v => (+v.discPct || 0) > 0)
}

// Persetujuan per produk (sounding ke atasan/client). Default 'pending'.
export const APPROVAL = {
  pending:  { label: 'Menunggu',  cls: 'bg-amber-500/12 text-amber-300' },
  approved: { label: 'Disetujui', cls: 'bg-green-500/12 text-green-300' },
  rejected: { label: 'Ditolak',   cls: 'bg-red-500/12 text-red-300' },
}
export function approvalStatusOf(approvals, productId) {
  return approvals?.[productId]?.status || 'pending'
}
export function approvalSummary(c) {
  const ids = [...new Set((c.items || []).map(it => it.productId))]
  const appr = c.approvals || {}
  let approved = 0, rejected = 0
  for (const id of ids) {
    const s = appr[id]?.status
    if (s === 'approved') approved++
    else if (s === 'rejected') rejected++
  }
  return { total: ids.length, approved, rejected, pending: ids.length - approved - rejected }
}
