// Helper Voucher — MURNI (tanpa I/O). Persistensi di src/data/vouchers.js.
// Keputusan model (founder, 2026-06): Minimum Pembelian = SYARAT eligibility
// saja. Bila harga jual < min belanja, produk tidak memenuhi syarat (cost 0).
// Bila memenuhi, biaya = diskon atas 1 unit (percent dgn cap, atau nominal).

// Biaya voucher (ditanggung seller) untuk satu produk pada harga jual tertentu.
// Mengembalikan { eligible, cost, reason }.
export function voucherCost(voucher, hargaJual) {
  const price = +hargaJual || 0
  if (!price) return { eligible: false, cost: 0, reason: 'no-price' }

  if (voucher.minPurchase && price < voucher.minPurchase) {
    return { eligible: false, cost: 0, reason: 'below-min' }
  }

  if (voucher.discountType === 'nominal') {
    return { eligible: true, cost: Math.round(+voucher.discountValue || 0), reason: 'ok' }
  }

  // percent
  let cost = price * (+voucher.discountValue || 0) / 100
  if (voucher.maxDiscount != null && voucher.maxDiscount !== '' && +voucher.maxDiscount > 0) {
    cost = Math.min(cost, +voucher.maxDiscount)
  }
  return { eligible: true, cost: Math.round(cost), reason: 'ok' }
}

// Nilai nominal tetap voucher untuk pencocokan dengan data pesanan (field `vs`).
// Nominal → nilainya; Persen dengan cap → nilai cap (pesanan besar mentok di cap);
// Persen tanpa cap → null (tidak bisa dicocokkan lewat satu angka nominal).
export function voucherNominalValue(v) {
  if (v.discountType === 'nominal') return Math.round(+v.discountValue || 0) || null
  if (v.maxDiscount != null && v.maxDiscount !== '' && +v.maxDiscount > 0) return Math.round(+v.maxDiscount)
  return null
}

// Cocokkan daftar voucher ke sebuah nominal pesanan (toleransi ±tol utk pembulatan).
export function matchVouchersToAmount(vouchers, amount, tol = 1) {
  const a = Math.round(amount)
  return vouchers.filter(v => {
    const nv = voucherNominalValue(v)
    return nv != null && Math.abs(nv - a) <= tol
  })
}

// Ringkasan voucher untuk ditampilkan (mis. "10% maks Rp25.000, min Rp100.000").
export function voucherSummary(v) {
  const parts = []
  if (v.discountType === 'nominal') {
    parts.push(`Rp${(+v.discountValue || 0).toLocaleString('id-ID')}`)
  } else {
    let s = `${+v.discountValue || 0}%`
    if (v.maxDiscount) s += ` maks Rp${(+v.maxDiscount).toLocaleString('id-ID')}`
    parts.push(s)
  }
  if (v.minPurchase) parts.push(`min Rp${(+v.minPurchase).toLocaleString('id-ID')}`)
  return parts.join(' · ')
}
