import { describe, it, expect } from 'vitest'
import {
  itemKey, approvalStatusOfItem, hasOwnApproval, skuApprovalSummary,
  approvalSummary, approvalLogOfProduct, productApprovalStatus,
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

describe('status efektif produk (kontrol editor)', () => {
  const its = ITEMS.filter(i => i.productId === 'p1')

  it('tanpa keputusan apa pun = pending', () => {
    expect(productApprovalStatus({}, its)).toBe('pending')
  })

  it('keputusan client per SKU terbaca walau kunci produk kosong (kasus 1 varian)', () => {
    const one = [IT('p3', 0)]
    expect(productApprovalStatus({ 'p3:0': { status: 'approved' } }, one)).toBe('approved')
  })

  it('semua SKU seragam (warisan produk + override senada) = status itu', () => {
    const approvals = { p1: { status: 'approved' }, 'p1:1': { status: 'approved' } }
    expect(productApprovalStatus(approvals, its)).toBe('approved')
  })

  it('status SKU berbeda-beda = mixed', () => {
    const approvals = { p1: { status: 'approved' }, 'p1:2': { status: 'rejected' } }
    expect(productApprovalStatus(approvals, its)).toBe('mixed')
  })

  it('SKU dikecualikan tidak ikut menentukan status', () => {
    const items = [IT('p1', 0), IT('p1', 1, { excluded: true })]
    const approvals = { 'p1:0': { status: 'approved' }, 'p1:1': { status: 'rejected' } }
    expect(productApprovalStatus(approvals, items)).toBe('approved')
  })

  it('semua varian dikecualikan = pending', () => {
    expect(productApprovalStatus({ 'p1:0': { status: 'approved' } }, [IT('p1', 0, { excluded: true })])).toBe('pending')
  })
})

// ── Keputusan admin dari daftar campaign ──────────────────────────────────
import { applySkuDecision } from '../campaignPricing'

describe('applySkuDecision', () => {
  const it0 = { productId: 'p1', varIdx: 0 }
  const it1 = { productId: 'p1', varIdx: 1 }

  it('menulis kunci SKU, bukan kunci produk', () => {
    const out = applySkuDecision({}, it0, 'approved', { email: 'A@b.com', name: 'Ikhsan' })
    expect(Object.keys(out)).toEqual(['p1:0'])
    expect(out['p1:0'].status).toBe('approved')
    expect(out['p1:0'].by).toBe('a@b.com')
    expect(out['p1:0'].byName).toBe('Ikhsan')
    expect(Date.parse(out['p1:0'].at)).not.toBeNaN()
  })
  it('kembali ke pending TETAP menulis kunci SKU, tidak menghapusnya', () => {
    // Kunci yang dihapus akan jatuh ke keputusan level produk di bawahnya.
    const before = { p1: { status: 'approved' }, 'p1:0': { status: 'rejected' } }
    const out = applySkuDecision(before, it0, 'pending')
    expect(out['p1:0'].status).toBe('pending')
    expect(approvalStatusOfItem(out, it0)).toBe('pending')
  })
  it('SKU lain tak ikut berubah', () => {
    const before = { 'p1:1': { status: 'rejected', note: 'mahal' } }
    const out = applySkuDecision(before, it0, 'approved')
    expect(out['p1:1']).toEqual({ status: 'rejected', note: 'mahal' })
  })
  it('catatan client yang sudah ada dipertahankan', () => {
    const out = applySkuDecision({ 'p1:0': { status: 'rejected', note: 'margin tipis' } }, it0, 'approved')
    expect(out['p1:0'].note).toBe('margin tipis')
  })
  it('tanpa identitas pengisi tetap jalan', () => {
    expect(applySkuDecision({}, it1, 'rejected')['p1:1'].by).toBe('')
  })
})
