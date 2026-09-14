// Keputusan persetujuan yang MASUK DARI CLIENT — dipakai daftar Campaign
// Pricing untuk menandai "mana yang baru di-acc" sejak terakhir dilihat.
//
// Sumber tunggalnya `campaign.approvalLog` (kolom approval_log, append-only)
// yang HANYA ditulis RPC set_product_approval — yaitu keputusan lewat link
// approval `/approve` atau portal client. Keputusan yang dibuat admin sendiri
// dari editor in-app tidak pernah masuk ke sana (ditulis langsung ke kolom
// `approvals` saat simpan), jadi tak perlu disaring khusus; yang disaring
// hanya entri yang dibuat admin lewat /approve (email = email kita sendiri).
import { itemKey } from './campaignPricing'

// Batas "baru" per workspace. Disimpan per-device (localStorage) — pindah
// perangkat berarti mulai dari nol lagi; itu konsekuensi yang disepakati.
const SEEN_KEY = ws => `campaign_approvals_seen_v1::${ws || 'none'}`

export function getSeenAt(workspaceId) {
  try { return localStorage.getItem(SEEN_KEY(workspaceId)) || '' } catch { return '' }
}
export function setSeenAt(workspaceId, iso) {
  try { localStorage.setItem(SEEN_KEY(workspaceId), iso || new Date().toISOString()) } catch { /* storage penuh/diblokir */ }
}

const ms = v => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t }
const norm = s => (s || '').trim().toLowerCase()

// Entri log yang dihitung sebagai keputusan client: punya email pengirim, dan
// email itu bukan kita sendiri (admin yang membuka link approval-nya sendiri).
export function isClientEntry(e, selfEmail) {
  if (!e || !e.by) return false
  if (e.status !== 'approved' && e.status !== 'rejected') return false
  return norm(e.by) !== norm(selfEmail)
}

// Nama tampilan approver: nama yang ia isi, kalau kosong pakai email.
export function actorOf(e) { return (e?.byName || '').trim() || e?.by || 'Client' }

// Semua keputusan client di satu campaign, terbaru dulu. `sku` diisi nama
// varian bila kunci entri berupa itemKey (`productId:varIdx`).
export function clientDecisions(c, selfEmail) {
  const nameOf = new Map((c?.items || []).map(it => [itemKey(it), it.name || `Varian ${it.varIdx + 1}`]))
  return (c?.approvalLog || [])
    .filter(e => isClientEntry(e, selfEmail))
    .map(e => ({ ...e, campaignId: c.id, campaignName: c.name, sku: nameOf.get(e.productId) || null }))
    .sort((a, b) => ms(b.at) - ms(a.at))
}

// Keputusan client yang lebih baru dari batas `since` (ISO; kosong = semua baru).
export function newDecisions(c, since, selfEmail) {
  const cut = ms(since)
  return clientDecisions(c, selfEmail).filter(e => ms(e.at) > cut)
}

// Ringkasan satu campaign: berapa keputusan baru + kalimat "siapa melakukan apa".
// `sentence` dibuat dari approver terbaru saja supaya baris kartu tetap pendek.
export function campaignActivity(c, since, selfEmail) {
  const fresh = newDecisions(c, since, selfEmail)
  if (!fresh.length) return { count: 0, latest: null, sentence: '', actors: [] }
  const latest = fresh[0]
  const who = norm(actorOf(latest))
  const mine = fresh.filter(e => norm(actorOf(e)) === who)
  const ok = mine.filter(e => e.status === 'approved').length
  const no = mine.filter(e => e.status === 'rejected').length
  const parts = []
  if (ok) parts.push(`menyetujui ${ok} SKU`)
  if (no) parts.push(`menolak ${no}`)
  const others = fresh.length - mine.length
  const tail = others > 0 ? ` · ${others} keputusan lain` : ''
  return {
    count: fresh.length,
    latest,
    actors: [...new Set(fresh.map(actorOf))],
    sentence: `${actorOf(latest)} ${parts.join(', ')}${tail}`,
  }
}

// Total keputusan baru se-workspace (untuk strip ringkasan di atas daftar).
export function activityTotals(campaigns, since, selfEmail) {
  let count = 0
  const ids = new Set()
  for (const c of campaigns || []) {
    const n = newDecisions(c, since, selfEmail).length
    if (n) { count += n; ids.add(c.id) }
  }
  return { count, campaigns: ids.size, ids }
}

// Kunci produk/SKU yang punya keputusan baru — dipakai menandai baris saat
// campaign di-expand. Kunci SKU ikut menandai produk induknya.
export function newKeys(c, since, selfEmail) {
  const out = new Set()
  for (const e of newDecisions(c, since, selfEmail)) {
    out.add(e.productId)
    const cut = String(e.productId).indexOf(':')
    if (cut > 0) out.add(String(e.productId).slice(0, cut))
  }
  return out
}

// "12 menit lalu" / "3 jam lalu" / "12 Sep". Dipakai di strip & kartu.
export function fmtAgo(iso, now = Date.now()) {
  const t = ms(iso)
  if (!t) return ''
  const mins = Math.floor((now - t) / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} jam lalu`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'kemarin'
  if (days < 7) return `${days} hari lalu`
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
