import { describe, it, expect } from 'vitest'
import {
  itemKey, approvalStatusOfItem, hasOwnApproval, skuApprovalSummary,
  approvalSummary, approvalLogOfProduct,
} from '../campaignPricing'

// Varian campaign minimal (harga/HPP tak dipakai oleh helper persetujuan).
const IT = (productId, varIdx, extra = {}) => ({ productId, varIdx, name: `V${varIdx}`, ...extra })

const ITEMS = [IT('p1', 0), IT('p1', 1), IT('p1', 2), IT('p2', 0)]

describe('persetujuan per SKU — kunci & fallback', () => {
  it('kunci SKU = productId:varIdx', () => {
    expect(itemKey(IT('p1', 2))).toBe('p1:2')
  })

  it('SKU tanpa keputusan sendiri mewarisi keputusan level produk (data lama)', () => {
    const approvals = { p1: { status: 'approved' } }
    expect(approvalStatusOfItem(approvals, IT('p1', 0))).toBe('approved')
    expect(hasOwnApproval(approvals, IT('p1', 0))).toBe(false)
  })

  it('keputusan khusus SKU mengalahkan keputusan produk', () => {
    const approvals = { p1: { status: 'approved' }, 'p1:2': { status: 'rejected' } }
    expect(approvalStatusOfItem(approvals, IT('p1', 2))).toBe('rejected')
    expect(hasOwnApproval(approvals, IT('p1', 2))).toBe(true)
    expect(approvalStatusOfItem(approvals, IT('p1', 1))).toBe('approved')
  })

  it('tanpa keputusan apa pun = menunggu', () => {
    expect(approvalStatusOfItem({}, IT('p9', 0))).toBe('pending')
    expect(approvalStatusOfItem(undefined, IT('p9', 0))).toBe('pending')
  })
})

describe('ringkasan per SKU', () => {
  it('menghitung per SKU, bukan per produk', () => {
    const approvals = { p1: { status: 'approved' }, 'p1:2': { status: 'rejected' } }
    expect(skuApprovalSummary(ITEMS.filter(i => i.productId === 'p1'), approvals))
      .toEqual({ total: 3, approved: 2, rejected: 1, pending: 0 })
  })

  it('varian yang dikecualikan tidak dihitung', () => {
    const items = [IT('p1', 0), IT('p1', 1, { excluded: true, excludeReason: 'noprice' })]
    expect(skuApprovalSummary(items, { p1: { status: 'approved' } }))
      .toEqual({ total: 1, approved: 1, rejected: 0, pending: 0 })
  })

  it('approvalSummary campaign = gabungan semua SKU aktif', () => {
    const c = { items: ITEMS, approvals: { p1: { status: 'approved' }, 'p1:0': { status: 'rejected' } } }
    expect(approvalSummary(c)).toEqual({ total: 4, approved: 2, rejected: 1, pending: 1 })
  })
})

describe('riwayat per produk', () => {
  const c = {
    approvalLog: [
      { productId: 'p1', status: 'approved', at: '2026-08-12T06:00:00Z' },
      { productId: 'p1:2', status: 'rejected', at: '2026-08-12T07:00:00Z' },
      { productId: 'p2:0', status: 'approved', at: '2026-08-12T08:00:00Z' },
    ],
  }
  const its = ITEMS.filter(i => i.productId === 'p1')

  it('mengambil entri level produk + entri SKU-nya, terbaru dulu', () => {
    const log = approvalLogOfProduct(c, 'p1', its)
    expect(log.map(e => e.productId)).toEqual(['p1:2', 'p1'])
  })

  it('entri SKU diberi nama varian, entri produk tidak', () => {
    const log = approvalLogOfProduct(c, 'p1', its)
    expect(log[0].sku).toBe('V2')
    expect(log[1].sku).toBeNull()
  })

  it('tidak mencampur entri produk lain', () => {
    expect(approvalLogOfProduct(c, 'p1', its).some(e => e.productId === 'p2:0')).toBe(false)
  })
})
