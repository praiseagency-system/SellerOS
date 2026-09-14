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

// URL link halaman campaign marketplace — auto-prefix https:// bila user hanya
// menulis domain. null bila kosong (dipakai CampaignPanel + ApprovalPage).
export function hrefOf(url) {
  const s = (url || '').trim()
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

// Kalkulasi penuh sebuah item (varian pada harga campaign). Mengembalikan objek
// computeCalc (punya adminRate, adminCut, marginNoAd, dst) atau null.
export function itemCalc(item, productMap, sellerPerUnit = 0) {
  const p = productMap[item.productId]
  if (!p) return null
  const fees = productFees(p)
  const v = productVariations(p)[item.varIdx]
  if (!v) return null
  return computeCalc({ ...fees, hpp: v.hpp, jual: item.price, voucher: String(+sellerPerUnit || 0) })
}

// Margin sebuah item. sellerPerUnit = beban voucher co-funded per unit (Rp).
export function itemMargin(item, productMap, sellerPerUnit = 0) {
  const calc = itemCalc(item, productMap, sellerPerUnit)
  return calc ? calc.marginNoAd : null
}

// Total komisi & biaya (semua fee platform/komisi/program + biaya proses),
// SAMA dengan "Total Komisi & Biaya" di Kalkulator — bukan cuma platform.
// Tidak termasuk voucher, ongkir, HPP, iklan. Mengembalikan { amount, pct }.
export function totalFee(calc) {
  if (!calc) return null
  const amount = (calc.adminCut || 0) + (calc.dinamisCut || 0) + (calc.commCut || 0) + (calc.goxCut || 0)
    + (calc.pembayaranCut || 0) + (calc.promoXtraCut || 0) + (calc.liveXtraCut || 0)
    + (calc.gxpCut || 0) + (calc.preOrderCut || 0) + (calc.biayaProsesCut || 0)
  const pct = calc.h > 0 ? (amount / calc.h) * 100 : 0
  return { amount, pct }
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

// Rincian komponen komisi & biaya (untuk breakdown yang bisa diklik).
// Hanya komponen bernilai > 0. pct = null untuk biaya flat.
export function feeBreakdown(calc) {
  if (!calc) return []
  const rows = [
    ['Biaya Platform',    calc.adminRate,   calc.adminCut],
    ['Komisi Dinamis',    calc.dinamisRate, calc.dinamisCut],
    ['Komisi Affiliasi',  calc.commRate,    calc.commCut],
    ['Biaya Admin (Gox)', calc.goxRate,     calc.goxCut],
    ['Biaya Layanan GXP', calc.gxpRate,     calc.gxpCut],
    ['Promo Xtra',        calc.promoRate,   calc.promoXtraCut],
    ['Live Xtra',         calc.liveRate,    calc.liveXtraCut],
    ['Biaya Pembayaran',  null,             calc.pembayaranCut],
    ['Biaya Pre-Order',   null,             calc.preOrderCut],
    ['Biaya Proses',      null,             calc.biayaProsesCut],
  ]
  return rows.filter(([, , amt]) => (+amt || 0) > 0).map(([label, pct, amount]) => ({ label, pct, amount }))
}

// Target margin default untuk verdict "worth it" bila campaign tak set sendiri.
export const DEFAULT_TARGET_MARGIN = 25

// Verdict worth-it dari margin terburuk (worst) vs target. 3 tingkat.
export function worthVerdict(worst, target = DEFAULT_TARGET_MARGIN) {
  if (worst == null || isNaN(worst)) return null
  if (worst >= target) return { key: 'worth', label: 'Worth it' }
  if (worst >= target * 0.7) return { key: 'thin', label: 'Tipis' }
  return { key: 'low', label: 'Kurang worth' }
}

// Margin terburuk sebuah produk lintas varian × voucher (co-funded) — untuk verdict.
export function worstProductMargin(its, productMap, voucherCfg) {
  const cvs = voucherList(voucherCfg)
  const cofunded = voucherCfg?.kind === 'cofunded'
  const margins = []
  for (const it of its) {
    const base = itemMargin(it, productMap)
    if (base != null) margins.push(base)
    if (cofunded) for (const v of cvs) {
      const eff = voucherEffect(v, it.price)
      if (eff) { const mm = itemMargin(it, productMap, eff.sellerPerUnit); if (mm != null) margins.push(mm) }
    }
  }
  return margins.length ? Math.min(...margins) : null
}

// ---------------------------------------------------------------------------
// Harga asli (di luar campaign) — dipakai halaman client supaya approver tahu
// campaign ini memotong berapa dari harga normal.
// ---------------------------------------------------------------------------

// Varian mentah sebuah item campaign (tanpa calc). null bila produk/varian hilang.
export function itemVariation(item, productMap) {
  const p = productMap[item.productId]
  if (!p) return null
  return productVariations(p)[item.varIdx] || null
}

// Harga jual normal varian: "Harga Jual" di price list, cadangan "Harga Coret".
// null bila keduanya kosong — jangan tampilkan diskon palsu dari angka 0.
export function originalPrice(item, productMap) {
  const v = itemVariation(item, productMap)
  if (!v) return null
  return (+v.jual || 0) || (+v.hargaCoret || 0) || null
}

// Margin hanya bermakna kalau HPP varian sudah diisi; tanpa HPP angkanya jadi
// "harga dikurangi fee" (mendekati 100%) dan menyesatkan approver.
export function hasHpp(item, productMap) {
  const v = itemVariation(item, productMap)
  return !!v && (+v.hpp || 0) > 0
}

// Potongan harga campaign terhadap harga normal (persen). Negatif = harga
// campaign lebih mahal dari harga normal. null bila salah satu harga tak ada.
export function discountPct(item, productMap) {
  const normal = originalPrice(item, productMap)
  const price = +item.price || 0
  if (!normal || !price) return null
  return ((normal - price) / normal) * 100
}

const range = arr => (arr.length ? { min: Math.min(...arr), max: Math.max(...arr) } : null)

// Rentang harga & diskon sekumpulan varian — untuk ringkasan kartu produk dan
// header campaign, supaya approver tak perlu membuka semua SKU dulu.
export function priceStats(items, productMap) {
  const act = activeItems(items)
  const originals = [], camps = [], discs = []
  let missingOriginal = 0, above = 0
  for (const it of act) {
    const price = +it.price || 0
    if (price > 0) camps.push(price)
    const normal = originalPrice(it, productMap)
    if (normal) originals.push(normal); else missingOriginal++
    const d = discountPct(it, productMap)
    // Rentang diskon hanya dari varian yang MEMANG turun harga; varian yang
    // harga campaign-nya di atas harga normal dihitung terpisah supaya
    // ringkasannya tak jadi "diskon −101–42%" yang tak terbaca.
    if (d != null) { if (d >= 0.5) discs.push(d); else if (d <= -0.5) above++ }
  }
  return {
    count: act.length,
    original: range(originals),
    campaign: range(camps),
    discount: range(discs),
    above,
    missingOriginal,
  }
}

// Margin terburuk yang BENAR-BENAR terhitung (varian tanpa HPP dilewati).
// null bila tak ada satu pun varian ber-HPP.
export function worstKnownMargin(items, productMap, voucherCfg) {
  const known = activeItems(items).filter(it => hasHpp(it, productMap))
  if (!known.length) return null
  return worstProductMargin(known, productMap, voucherCfg)
}

export function voucherList(voucherConfig) {
  const vs = voucherConfig && Array.isArray(voucherConfig.vouchers) ? voucherConfig.vouchers : []
  return vs.filter(v => (+v.discPct || 0) > 0)
}

// ---------------------------------------------------------------------------
// Varian yang DIKECUALIKAN dari campaign (item.excluded + item.excludeReason).
// Dipakai saat harga dasar belum ada di price list, atau satu produk punya
// beberapa SKU dan hanya sebagian yang diajukan — supaya tak salah produk/harga.
// Varian dikecualikan tak dihitung ke margin/monitoring dan TIDAK tampil di
// halaman approval client.
// ---------------------------------------------------------------------------
export const EXCLUDE_REASON = {
  manual:  'dikecualikan',
  noprice: 'belum ada harga PL',
  dupsku:  'SKU ganda',
}
export function isExcluded(it) { return !!it?.excluded }
export function activeItems(items) { return (items || []).filter(it => !it?.excluded) }
export function excludedItems(items) { return (items || []).filter(it => it?.excluded) }

// Saran otomatis: varian tanpa harga campaign, dan SKU yang muncul >1 kali di
// campaign yang sama. Hanya varian yang BELUM dikecualikan yang disarankan.
export function excludeSuggestions(items) {
  const list = items || []
  // SKU ganda dihitung dari varian yang masih diikutkan saja — kalau
  // kembarannya sudah dikecualikan, tak ada lagi yang ambigu.
  const skuCount = new Map()
  for (const it of list) {
    if (it.excluded) continue
    const k = (it.sku || '').toLowerCase().trim()
    if (k) skuCount.set(k, (skuCount.get(k) || 0) + 1)
  }
  const noprice = [], dupsku = []
  for (const it of list) {
    if (it.excluded) continue
    if (!(+it.price > 0)) { noprice.push(it); continue }
    const k = (it.sku || '').toLowerCase().trim()
    if (k && skuCount.get(k) > 1) dupsku.push(it)
  }
  return { noprice, dupsku, total: noprice.length + dupsku.length }
}

// Alasan yang ditampilkan pada baris varian (tersimpan, atau dari deteksi).
export function reasonLabel(it) {
  return EXCLUDE_REASON[it?.excludeReason] || EXCLUDE_REASON.manual
}

// Kunci unik varian dalam satu campaign (varIdx hanya unik per produk).
export function itemKey(it) { return `${it.productId}:${it.varIdx}` }

// Persetujuan per produk (sounding ke atasan/client). Default 'pending'.
export const APPROVAL = {
  pending:  { label: 'Menunggu',  cls: 'bg-amber-500/12 text-amber-300' },
  approved: { label: 'Disetujui', cls: 'bg-green-500/12 text-green-300' },
  rejected: { label: 'Ditolak',   cls: 'bg-red-500/12 text-red-300' },
}
export function approvalStatusOf(approvals, productId) {
  return approvals?.[productId]?.status || 'pending'
}

// --- Persetujuan per SKU ---------------------------------------------------
// `approvals` di-key bebas: `<productId>` (keputusan lama, level produk) atau
// `<productId>:<varIdx>` = itemKey (keputusan khusus satu SKU). Satu SKU dibaca
// dari kunci SKU-nya dulu, kalau belum ada JATUH ke keputusan produk — jadi
// campaign lama yang sudah disetujui per produk tetap terbaca disetujui, tanpa
// backfill. Kunci komposit tak butuh migrasi: RPC set_product_approval menulis
// apa pun kunci yang dikirim.
export function approvalEntryOfItem(approvals, it) {
  return approvals?.[itemKey(it)] || approvals?.[it.productId] || null
}
export function approvalStatusOfItem(approvals, it) {
  return approvalEntryOfItem(approvals, it)?.status || 'pending'
}
// true bila SKU ini punya keputusan sendiri (bukan warisan level produk).
export function hasOwnApproval(approvals, it) { return !!approvals?.[itemKey(it)] }

// Status EFEKTIF satu produk dari SKU aktifnya: semua sama -> status itu;
// beda-beda -> 'mixed'; tanpa SKU aktif -> 'pending'. Dipakai editor supaya
// keputusan client per SKU ikut terbaca di kontrol level produk.
export function productApprovalStatus(approvals, items) {
  const act = activeItems(items)
  if (!act.length) return 'pending'
  const first = approvalStatusOfItem(approvals, act[0])
  for (const it of act.slice(1)) {
    if (approvalStatusOfItem(approvals, it) !== first) return 'mixed'
  }
  return first
}

// Hitungan status untuk sekumpulan varian (yang dikecualikan tak dihitung).
export function skuApprovalSummary(items, approvals) {
  const act = activeItems(items)
  let approved = 0, rejected = 0
  for (const it of act) {
    const s = approvalStatusOfItem(approvals, it)
    if (s === 'approved') approved++
    else if (s === 'rejected') rejected++
  }
  return { total: act.length, approved, rejected, pending: act.length - approved - rejected }
}

// Ringkasan satu campaign — dihitung per SKU (bukan per produk) supaya badge
// kartu ikut turun begitu ada satu SKU yang ditolak.
export function approvalSummary(c) {
  return skuApprovalSummary(c.items, c.approvals)
}

// Entri riwayat yang menyangkut satu produk: level produk maupun per SKU-nya.
// Mengembalikan entri + `sku` (nama varian) bila kuncinya kunci SKU.
export function approvalLogOfProduct(c, productId, its) {
  const nameOf = new Map((its || []).map(it => [itemKey(it), it.name || `Varian ${it.varIdx + 1}`]))
  return (c.approvalLog || [])
    .filter(e => e.productId === productId || nameOf.has(e.productId))
    .map(e => ({ ...e, sku: nameOf.get(e.productId) || null }))
    .slice().reverse()
}

// Label varian untuk daftar di dalam campaign. Produk satu varian biasanya
// memberi varian itu NAMA YANG SAMA dengan produknya, sehingga nama panjang
// tercetak dua kali di layar. Kembalikan '' bila cuma mengulang — pemanggil
// menampilkan kode SKU sebagai gantinya.
export function variantLabel(it, product) {
  const n = (it?.name || '').trim()
  if (!n) return `Varian ${(it?.varIdx ?? 0) + 1}`
  const pn = (product?.name || '').trim()
  return (pn && n.toLowerCase() === pn.toLowerCase()) ? '' : n
}

// Keputusan admin atas SATU SKU, ditulis dari daftar campaign.
// Selalu menulis kunci SKU (`productId:varIdx`) — TIDAK menghapusnya saat
// kembali ke 'pending', karena kunci yang hilang akan jatuh ke keputusan
// level produk dan malah terbaca "disetujui" lagi. Stempel `by`/`byName`
// diisi supaya terlihat ini keputusan tim, bukan client; riwayat
// (`approval_log`) sengaja TAK disentuh, itu milik keputusan lewat /approve.
export function applySkuDecision(approvals, it, status, actor = {}) {
  const next = { ...(approvals || {}) }
  const key = itemKey(it)
  next[key] = {
    ...(next[key] || {}),
    status,
    at: new Date().toISOString(),
    by: (actor.email || '').trim().toLowerCase(),
    byName: (actor.name || '').trim(),
  }
  return next
}
