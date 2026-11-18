// Campaign dilihat dari sisi PRODUK — dipakai tab Produk → "Campaign per Produk".
//
// Dua tampilan:
//  1. Rekap: tiap produk ikut campaign apa saja (harga, margin, approval,
//     pendaftaran) — dari `campaigns.items` yang sudah ada, dikelompokkan per
//     productId.
//  2. Tidak ikut: tiap produk × campaign yang sedang berjalan / akan datang
//     di marketplace yang sama, yang TIDAK diikuti, beserta alasannya.
//
// Asal alasan:
//  - tercatat   : varian dikecualikan (item.excluded + excludeReason), ditolak
//                 client (approvals), dicatat manual admin (campaigns.skipped).
//  - terdeteksi : HPP kosong, Harga Campaign di price list kosong, proyeksi
//                 margin di bawah target campaign.
//  - none       : tidak ada apa pun — "belum dicatat".
import {
  activeItems, isExcluded, reasonLabel, itemKey, itemMargin, voucherList, voucherEffect,
  approvalStatusOfItem, approvalEntryOfItem, skuApprovalSummary, variantLabel,
  DEFAULT_TARGET_MARGIN,
} from './campaignPricing'
import { campaignStatus } from './campaignPeriods'
import { registrationStatus } from './campaignRegistration'
import { productVariations } from './product'

// ── Status campaign → kelompok filter ───────────────────────────────────────
// running + gap (jeda antar periode) = Berjalan; scheduled + draft (belum
// bertanggal) = Akan datang; ended = Selesai.
export const PHASE = {
  running:  { label: 'Berjalan' },
  upcoming: { label: 'Akan datang' },
  ended:    { label: 'Selesai' },
}
export function phaseOf(statusKey) {
  if (statusKey === 'running' || statusKey === 'gap') return 'running'
  if (statusKey === 'ended') return 'ended'
  return 'upcoming'
}
// Campaign yang masih bisa diikuti / sedang berjalan.
export function isOpenCampaign(c, now = Date.now()) {
  return phaseOf(campaignStatus(c, now).key) !== 'ended'
}

const PHASE_ORDER = { running: 0, upcoming: 1, ended: 2 }

// ── Alasan manual (campaigns.skipped) ───────────────────────────────────────
export const SKIP_REASON = {
  stock:       { label: 'Stok terbatas / habis',         hint: 'Tidak cukup untuk volume campaign' },
  client:      { label: 'Client / brand minta skip',      hint: 'Keputusan di luar approval harga' },
  price:       { label: 'Harga tidak lolos syarat',       hint: 'Diskon minimal campaign tak terpenuhi' },
  eligibility: { label: 'Tidak memenuhi syarat platform', hint: 'Rating, kategori, atau umur produk' },
  otherpromo:  { label: 'Sedang ikut promo lain',         hint: 'Bentrok dengan flash sale / bundling' },
  other:       { label: 'Lainnya',                        hint: 'Jelaskan di catatan' },
}
export const SKIP_REASON_ORDER = ['stock', 'client', 'price', 'eligibility', 'otherpromo', 'other']
export function skipReasonLabel(key) { return SKIP_REASON[key]?.label || SKIP_REASON.other.label }

// Entri skipped yang berlaku untuk satu varian: entri khusus varian menang
// atas entri "semua varian" (varIdx null).
export function skipEntryOf(skipped, productId, varIdx) {
  const list = (skipped || []).filter(e => e && e.productId === productId)
  return list.find(e => e.varIdx === varIdx) || list.find(e => e.varIdx == null) || null
}

// Bangun entri baru dari isian dialog. variants = null (semua varian) atau
// daftar { varIdx, name }.
export function buildSkipEntries({ productId, productName, variants, reason, note, showToClient }, actor = {}) {
  const base = {
    productId,
    productName: (productName || '').trim(),
    reason: SKIP_REASON[reason] ? reason : 'other',
    note: (note || '').trim(),
    showToClient: !!showToClient,
    at: new Date().toISOString(),
    by: (actor.email || '').trim().toLowerCase(),
    byName: (actor.name || '').trim(),
  }
  if (!variants) return [{ ...base, varIdx: null, variantName: '' }]
  return variants.map(v => ({ ...base, varIdx: v.varIdx, variantName: (v.name || '').trim() }))
}

// Ganti SEMUA entri satu produk di satu campaign dengan entri baru (dialog
// menyimpan keputusan utuh per produk). Entri varian yang kini aktif di
// `items` ikut dibuang — varian itu sudah ikut campaign, alasannya basi.
export function replaceProductSkips(skipped, productId, entries, items = []) {
  const active = new Set(activeItems(items).map(itemKey))
  const keep = (skipped || []).filter(e => e && e.productId !== productId)
  const fresh = (entries || []).filter(e => e.varIdx == null || !active.has(`${e.productId}:${e.varIdx}`))
  return [...keep, ...fresh]
}

export function removeProductSkips(skipped, productId) {
  return (skipped || []).filter(e => e && e.productId !== productId)
}

// ── Helper produk ───────────────────────────────────────────────────────────
const num = v => +v || 0
const minMax = arr => (arr.length ? { min: Math.min(...arr), max: Math.max(...arr) } : null)

// Margin terburuk satu item lintas voucher co-funded campaign (sama dengan
// cara CampaignPanel menilai kelayakan).
function worstItemMargin(item, productMap, voucherCfg) {
  const base = itemMargin(item, productMap)
  const out = base != null ? [base] : []
  if (voucherCfg?.kind === 'cofunded') {
    for (const v of voucherList(voucherCfg)) {
      const eff = voucherEffect(v, item.price)
      if (eff) { const m = itemMargin(item, productMap, eff.sellerPerUnit); if (m != null) out.push(m) }
    }
  }
  return out.length ? Math.min(...out) : null
}

// Harga yang dibayar customer untuk satu item: harga campaign dikurangi
// voucher terbesar campaign itu (asumsi cart 1 varian sampai lolos min.
// pesanan, sama seperti voucherEffect). Tanpa voucher = harga campaign.
export function customerPrice(item, voucherCfg) {
  const p = num(item?.price)
  if (!(p > 0)) return null
  let best = p
  for (const v of voucherList(voucherCfg)) {
    const eff = voucherEffect(v, item.price)
    if (eff && eff.custPerUnit < best) best = eff.custPerUnit
  }
  return best
}

export function targetMarginOf(c) {
  return num(c?.voucherConfig?.targetMargin) || DEFAULT_TARGET_MARGIN
}

function variantName(v, idx, product) {
  const n = variantLabel({ name: v?.name, varIdx: idx }, product)
  return n || v?.sku || `Varian ${idx + 1}`
}

// ── 1. Rekap: campaign yang diikuti satu produk ─────────────────────────────
// Satu baris per campaign yang memuat minimal satu varian AKTIF produk ini.
export function productCampaignRows(product, campaigns, productMap, now = Date.now()) {
  const total = productVariations(product).length
  const rows = []
  for (const c of campaigns || []) {
    const mine = (c.items || []).filter(it => it.productId === product.id)
    const act = activeItems(mine)
    if (!act.length) continue
    const status = campaignStatus(c, now)
    const prices = act.map(it => num(it.price)).filter(p => p > 0)
    const custPrices = act.map(it => customerPrice(it, c.voucherConfig)).filter(p => p != null)
    const margins = act
      .filter(it => num(productVariations(product)[it.varIdx]?.hpp) > 0)
      .map(it => worstItemMargin(it, productMap, c.voucherConfig))
      .filter(m => m != null)
    rows.push({
      campaign: c,
      status,
      phase: phaseOf(status.key),
      items: act,
      variantsIn: act.length,
      variantsTotal: total,
      price: minMax(prices),
      customer: minMax(custPrices),
      hasVoucher: voucherList(c.voucherConfig).length > 0,
      margin: minMax(margins),
      target: targetMarginOf(c),
      approval: skuApprovalSummary(act, c.approvals),
      registration: registrationStatus(c),
    })
  }
  // Berjalan dulu, lalu akan datang, lalu selesai; dalam kelompok: yang mulai
  // paling baru di atas.
  return rows.sort((a, b) =>
    (PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase])
    || String(b.campaign.startDate || '').localeCompare(String(a.campaign.startDate || '')))
}

// Ringkasan approval → satu label untuk tabel rekap.
export function approvalLabel(sum) {
  if (!sum?.total) return { key: 'pending', label: 'Menunggu' }
  if (sum.approved === sum.total) return { key: 'approved', label: 'Disetujui' }
  if (sum.rejected === sum.total) return { key: 'rejected', label: 'Ditolak' }
  if (sum.pending === sum.total) return { key: 'pending', label: 'Menunggu' }
  return { key: 'mixed', label: `Sebagian (${sum.approved}/${sum.total})` }
}

// ── 2. Tidak ikut campaign ──────────────────────────────────────────────────
export const GAP_REASON = {
  rejected: { label: 'Ditolak client',         source: 'Approval client' },
  margin:   { label: 'Margin di bawah target', source: 'Deteksi otomatis' },
  noprice:  { label: 'Harga campaign kosong',  source: 'Deteksi otomatis' },
  nohpp:    { label: 'HPP belum diisi',        source: 'Deteksi otomatis' },
  excluded: { label: 'Dikecualikan',           source: 'Tercatat di campaign' },
  manual:   { label: 'Dicatat manual',         source: 'Dicatat manual' },
  none:     { label: 'Belum dicatat',          source: '—' },
}
export const GAP_REASON_ORDER = ['rejected', 'margin', 'noprice', 'nohpp', 'excluded', 'manual', 'none']

// Alasan satu varian tidak ikut satu campaign, atau null bila varian itu
// memang ikut (aktif & tidak ditolak).
export function variantGap(product, varIdx, c, productMap) {
  const v = productVariations(product)[varIdx]
  const item = (c.items || []).find(it => it.productId === product.id && it.varIdx === varIdx)
  if (item && !isExcluded(item)) {
    if (approvalStatusOfItem(c.approvals, item) !== 'rejected') return null
    const e = approvalEntryOfItem(c.approvals, item) || {}
    return { reason: 'rejected', note: (e.note || '').trim(), who: (e.byName || '').trim() || (e.by || '').trim(), at: e.at || '' }
  }
  if (item) return { reason: 'excluded', note: reasonLabel(item) }
  const skip = skipEntryOf(c.skipped, product.id, varIdx)
  if (skip) return { reason: 'manual', entry: skip }
  if (!(num(v?.hpp) > 0)) return { reason: 'nohpp' }
  if (!(num(v?.jualCampaign) > 0)) return { reason: 'noprice' }
  const m = worstItemMargin({ productId: product.id, varIdx, price: String(v.jualCampaign) }, productMap, c.voucherConfig)
  const target = targetMarginOf(c)
  if (m != null && m < target) return { reason: 'margin', margin: m, price: num(v.jualCampaign), target }
  return { reason: 'none' }
}

const fmtRp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID')
const fmtPctR = n => `${Math.round(n)}%`
export function fmtShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

// Kalimat detail untuk satu kelompok (campaign × alasan).
function gapDetail(reason, list, total) {
  const n = list.length
  const scope = n === total ? (n > 1 ? `${n} varian` : 'varian ini') : `${n} varian`
  switch (reason) {
    case 'margin': {
      const ms = list.map(g => g.margin), ps = list.map(g => g.price)
      const lo = Math.min(...ms), hi = Math.max(...ms)
      const mTxt = lo === hi ? fmtPctR(lo) : `${fmtPctR(lo)} – ${fmtPctR(hi)}`
      const pMin = Math.min(...ps), pMax = Math.max(...ps)
      const pTxt = pMin === pMax ? fmtRp(pMin) : `${fmtRp(pMin)} – ${fmtRp(pMax)}`
      return `${lo < 0 ? 'Rugi: proyeksi' : 'Proyeksi'} margin ${mTxt} di Harga Campaign ${pTxt}. Target campaign ${list[0].target}%.`
    }
    case 'noprice': return `Harga Campaign di price list masih kosong untuk ${scope}.`
    case 'nohpp': return `HPP kosong untuk ${scope}, jadi margin tidak bisa dihitung.`
    case 'excluded': return `Dikecualikan dari campaign: ${[...new Set(list.map(g => g.note))].join(', ')}.`
    case 'rejected': {
      const parts = [...new Map(list.map(g => [`${g.note}|${g.who}|${g.at}`, g])).values()].map(g => {
        const meta = [g.who, fmtShortDate(g.at)].filter(Boolean).join(', ')
        return `${g.note ? `“${g.note}”` : 'Tanpa catatan'}${meta ? ` · ${meta}` : ''}`
      })
      return parts.join(' / ')
    }
    case 'manual': {
      const parts = [...new Map(list.map(g => [`${g.entry.reason}|${g.entry.note}|${g.entry.at}`, g.entry])).values()].map(e => {
        const meta = [e.byName, fmtShortDate(e.at), e.showToClient ? 'tampil ke client' : ''].filter(Boolean).join(' · ')
        return `${skipReasonLabel(e.reason)}${e.note ? `: “${e.note}”` : ''}${meta ? ` · ${meta}` : ''}`
      })
      return parts.join(' / ')
    }
    default: return 'Produk bisa ikut, tapi belum ditambahkan ke campaign dan belum ada catatan alasan.'
  }
}

// Semua celah satu produk terhadap campaign yang masih terbuka di
// marketplace yang sama. Varian dengan alasan sama di campaign yang sama
// digabung jadi satu baris.
export function productGapRows(product, campaigns, productMap, now = Date.now()) {
  const vars = productVariations(product)
  const total = vars.length
  const rows = []
  for (const c of campaigns || []) {
    if ((c.platform || 'tiktok') !== (product.platform || 'tiktok')) continue
    const status = campaignStatus(c, now)
    const phase = phaseOf(status.key)
    if (phase === 'ended') continue
    const byReason = new Map()
    vars.forEach((v, idx) => {
      const g = variantGap(product, idx, c, productMap)
      if (!g) return
      const list = byReason.get(g.reason) || []
      list.push({ ...g, varIdx: idx, name: variantName(v, idx, product) })
      byReason.set(g.reason, list)
    })
    for (const [reason, list] of byReason) {
      rows.push({
        key: `${c.id}:${reason}`,
        campaign: c,
        status,
        phase,
        reason,
        variants: list.map(g => ({ varIdx: g.varIdx, name: g.name })),
        variantText: list.length === total && total > 1 ? `Semua (${total})` : list.map(g => g.name).join(', '),
        detail: gapDetail(reason, list, total),
        source: GAP_REASON[reason].source,
      })
    }
  }
  return rows.sort((a, b) =>
    (PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase])
    || (GAP_REASON_ORDER.indexOf(a.reason) - GAP_REASON_ORDER.indexOf(b.reason)))
}

// Ringkasan satu produk untuk kepala kartu di tampilan "Tidak ikut".
export function gapSummary(product, campaigns, gapRows, now = Date.now()) {
  const open = (campaigns || []).filter(c =>
    (c.platform || 'tiktok') === (product.platform || 'tiktok') && isOpenCampaign(c, now))
  const missed = new Set(gapRows.map(r => r.campaign.id)).size
  const joinedAny = open.some(c => activeItems(c.items).some(it =>
    it.productId === product.id && approvalStatusOfItem(c.approvals, it) !== 'rejected'))
  return { open: open.length, missed, joinedAny }
}
