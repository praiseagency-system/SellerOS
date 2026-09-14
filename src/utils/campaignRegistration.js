// Status PENDAFTARAN campaign ke marketplace — "sudah masuk apa belum".
//
// Beda dengan persetujuan: `approvals` adalah keputusan CLIENT atas harga,
// sedangkan ini catatan ADMIN soal tindak lanjutnya di TikTok/Shopee Seller
// Centre. Client hanya membaca. Disimpan di kolom `campaigns.registration`
// (migrasi 0062) sebagai satu objek; `{}` = belum didaftarkan.
import { skuApprovalSummary } from './campaignPricing'
import { campaignStatus } from './campaignPeriods'
import { decisionUrgency } from './campaignUrgency'

export const REGISTRATION = {
  none:     { label: 'Belum didaftarkan', short: 'Belum',           cls: 'bg-fill/10 text-ink-faint' },
  progress: { label: 'Sedang diproses',   short: 'Sedang diproses', cls: 'bg-amber-500/12 text-amber-300' },
  done:     { label: 'Sudah didaftarkan', short: 'Sudah',           cls: 'bg-blue-600/15 text-blue-300' },
}
export const REGISTRATION_ORDER = ['none', 'progress', 'done']

// Status satu campaign; nilai asing atau kolom belum ada → 'none'.
export function registrationStatus(c) {
  const s = c?.registration?.status
  return REGISTRATION_ORDER.includes(s) ? s : 'none'
}
export function isRegistered(c) { return registrationStatus(c) === 'done' }

// Badge untuk kartu: 'none' tak usah ditampilkan ke client (tak ada kabar
// bukan kabar buruk), tapi admin tetap perlu melihatnya.
export function registrationBadge(c, { showNone = false } = {}) {
  const key = registrationStatus(c)
  if (key === 'none' && !showNone) return null
  return { key, ...REGISTRATION[key] }
}

// Baris keterangan di bawah badge: kapan, oleh siapa, catatan apa.
export function registrationDetail(c) {
  const r = c?.registration || {}
  const key = registrationStatus(c)
  if (key === 'none') return ''
  const who = (r.byName || '').trim() || r.by || ''
  const when = r.at ? new Date(r.at) : null
  const parts = []
  if (when && !isNaN(when)) parts.push(when.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
  if (who) parts.push(`oleh ${who}`)
  if ((r.note || '').trim()) parts.push(`"${r.note.trim()}"`)
  return parts.join(' · ')
}

// Objek yang ditulis ke DB. Status 'none' MENGOSONGKAN catatan & stempel
// supaya tak ada sisa "didaftarkan oleh X" pada campaign yang dibatalkan.
export function buildRegistration({ status, note, link }, actor = {}) {
  const key = REGISTRATION_ORDER.includes(status) ? status : 'none'
  if (key === 'none') return {}
  return {
    status: key,
    note: (note || '').trim(),
    link: (link || '').trim(),
    at: new Date().toISOString(),
    by: (actor.email || '').trim().toLowerCase(),
    byName: (actor.name || '').trim(),
  }
}

// Ringkasan se-workspace untuk kepala halaman portal/daftar admin.
export function registrationTotals(campaigns) {
  const n = { none: 0, progress: 0, done: 0 }
  for (const c of campaigns || []) n[registrationStatus(c)]++
  return { ...n, total: (campaigns || []).length }
}

// ── "Perlu didaftarkan": pekerjaan yang tertinggal ─────────────────────────
// Client sudah menyetujui setidaknya satu SKU, tapi belum ada catatan
// pendaftaran sama sekali. Campaign yang sudah SELESAI tak dihitung: mendaftar
// ke event yang sudah lewat tak ada gunanya, dan menagihnya cuma bising.
export function needsRegistration(c, now = Date.now()) {
  if (registrationStatus(c) !== 'none') return false
  if (campaignStatus(c, now).key === 'ended') return false
  return skuApprovalSummary(c?.items, c?.approvals).approved > 0
}

// Mendesak bila batas pendaftarannya dekat/lewat, atau campaign-nya sudah
// jalan. Dua kunci pertama datang dari kolom batas pendaftaran (0063).
export function registrationUrgent(c, now = Date.now()) {
  if (!needsRegistration(c, now)) return false
  const u = decisionUrgency(c, now)
  if (u.key === 'closed' || u.key === 'started') return true
  return u.key === 'deadline' && (u.days ?? 99) <= 7
}

// Ringkasan untuk strip peringatan di atas daftar.
export function registrationAlert(campaigns, now = Date.now()) {
  const list = (campaigns || []).filter(c => needsRegistration(c, now))
  return {
    count: list.length,
    urgent: list.filter(c => registrationUrgent(c, now)).length,
    ids: new Set(list.map(c => c.id)),
  }
}

// Kalimat penjelas di kartu: kenapa campaign ini muncul sebagai tertinggal.
// Label decisionUrgency SENGAJA tak dipakai apa adanya untuk campaign yang
// sudah jalan — bunyinya "belum diputuskan", padahal di sini client justru
// SUDAH memutuskan. Yang tertinggal pendaftarannya, bukan keputusannya.
export function registrationReason(c, now = Date.now()) {
  const sum = skuApprovalSummary(c?.items, c?.approvals)
  const u = decisionUrgency(c, now)
  let tail = ''
  if (u.key === 'closed' || u.key === 'deadline') tail = ` · ${u.label}`
  else if (u.key === 'started') tail = u.days > 0 ? ` · campaign sudah berjalan ${u.days} hari` : ' · campaign mulai hari ini'
  return `Client sudah menyetujui ${sum.approved} SKU, belum ada catatan pendaftaran${tail}`
}
