// Status tayang VIDEO di sekitar sebuah eksperimen — murni, tanpa React.
//
// Kenapa ada: pemilik perlu tahu video sedang di status apa dan apakah status
// itu BERUBAH ketika di-boost (dari data asli 5 Okt 2026: 8 dari 23 boost
// mengangkat video Antre/Learning/Tak tayang menjadi Tayang; 14 sudah Tayang).
//
// Sumber: kolom `status` gmvmax_creatives — satu baris per video × campaign ×
// hari. Satu video bisa ada di beberapa campaign dengan status BERBEDA pada
// hari yang sama ("Butuh izin" di satu campaign, "Tayang" di campaign lain).
// Yang dipakai: status di campaign eksperimennya; kalau barisnya tak ada di
// campaign itu, status "terbaik" (yang paling dekat ke Tayang).
import { wibDateOf } from '../gmvmax/skills/experimentWindows.mjs'
import { addDaysISO } from './gmvmaxExperimentDaily'

// Urutan = kedekatan ke "tayang" (dipakai memilih status terbaik).
export const STATUS_META = {
  DELIVERING: { label: 'Tayang', tone: 'tay', rank: 0 },
  LEARNING: { label: 'Learning', tone: 'lrn', rank: 1 },
  IN_QUEUE: { label: 'Antre', tone: 'ant', rank: 2 },
  NOT_DELIVERING: { label: 'Tak tayang', tone: 'tak', rank: 3 },
  AUTHORIZATION_NEEDED: { label: 'Butuh izin', tone: 'izn', rank: 4 },
  NOT_ACTIVE: { label: 'Nonaktif', tone: 'off', rank: 5 },
  EXCLUDED: { label: 'Dikeluarkan', tone: 'off', rank: 6 },
  REJECTED: { label: 'Ditolak', tone: 'tak', rank: 7 },
  UNAVAILABLE: { label: 'Tak tersedia', tone: 'off', rank: 8 },
}
// TikTok sendiri menulis "NOT_DELIVERYING" (salah eja) — disamakan di sini.
// Teks berbahasa Indonesia dari unggahan berkas sudah disamakan di pemuat data
// (normalizeStatus di data/gmvmaxImports.js) sebelum sampai ke sini.
export function normStatus(raw) {
  if (raw == null || raw === '') return null
  const k = String(raw).toUpperCase().trim().replace(/\s+/g, '_')
  return k === 'NOT_DELIVERYING' ? 'NOT_DELIVERING' : k
}
export const statusLabel = (s) => (s ? STATUS_META[s]?.label || s : '—')
export const statusTone = (s) => STATUS_META[s]?.tone || 'off'
const rankOf = (s) => STATUS_META[s]?.rank ?? 99

// entries: [{ campaignId, status }] satu hari → { status, others } | null.
// Data asli: satu video bisa punya BEBERAPA baris di campaign yang sama pada
// hari yang sama dengan status berbeda (mis. 1 baris Tayang + 3 baris "Butuh
// izin"), dan urutan barisnya acak. Jadi yang diambil selalu status TERBAIK
// (paling dekat ke Tayang) — di campaign eksperimennya bila ada barisnya, kalau
// tidak dari semua campaign — supaya hasilnya tak bergantung urutan baris.
// others = status video itu di campaign LAIN (bukan baris kembaran campaign ini).
const best = (list) => list.reduce((a, e) => (rankOf(e.s) < rankOf(a) ? e.s : a), list[0].s)
export function pickStatus(entries, campaignId = null) {
  const list = (entries || []).map(e => ({ c: e.campaignId != null ? String(e.campaignId) : null, s: normStatus(e.status) })).filter(e => e.s)
  if (!list.length) return null
  const own = campaignId != null ? list.filter(e => e.c === String(campaignId)) : []
  const status = best(own.length ? own : list)
  const elsewhere = own.length ? list.filter(e => e.c !== String(campaignId)) : []
  const others = [...new Set(elsewhere.map(e => e.s))].filter(x => x !== status).sort((x, y) => rankOf(x) - rankOf(y))
  return { status, others }
}

// days: kalender drawer ([{ date, day, statuses }], urut tanggal).
// → { before, segments, last, changed } | null (tak ada status sama sekali).
//   before   : { status, n } — rangkaian status TERAKHIR sebelum hari ke-1
//   segments : hari ke-1 dst., hari berstatus sama yang berurutan digabung;
//              hari tanpa status (data tidak masuk / video tak ada di laporan)
//              dilewati, tidak memutus dan tidak dihitung
//   last     : status pada hari berdata terakhir
export function statusJourney(days = [], campaignId = null) {
  const seq = []
  for (const d of days) {
    const p = pickStatus(d.statuses, campaignId)
    if (p) seq.push({ date: d.date, day: d.day, status: p.status, others: p.others })
  }
  if (!seq.length) return null
  const pre = seq.filter(x => x.day < 1), post = seq.filter(x => x.day >= 1)
  let before = null
  if (pre.length) {
    const s = pre[pre.length - 1].status
    let n = 0
    for (let i = pre.length - 1; i >= 0 && pre[i].status === s; i--) n++
    before = { status: s, n }
  }
  const segments = []
  for (const x of post) {
    const cur = segments[segments.length - 1]
    if (cur && cur.status === x.status) { cur.toDay = x.day; cur.to = x.date; cur.n += 1 } else segments.push({ status: x.status, fromDay: x.day, toDay: x.day, from: x.date, to: x.date, n: 1 })
  }
  const last = seq[seq.length - 1].status
  const changed = segments.length > 1 || (!!before && segments.length > 0 && segments[0].status !== before.status)
  return { before, segments, last, changed, byDate: new Map(seq.map(x => [x.date, x])) }
}

const hari = (a, b) => (a === b ? `hari ${a}` : `hari ${a}–${b}`)
// Chip untuk kartu vonis: [{ status, text }] — paling banyak `max` chip sesudah
// mulai; sisanya diringkas supaya baris tidak memanjang.
export function journeyChips(j, { max = 4 } = {}) {
  if (!j) return []
  const out = []
  if (j.before) out.push({ status: j.before.status, text: `${statusLabel(j.before.status)} · sebelum` })
  const segs = j.segments
  const shown = segs.length > max ? [...segs.slice(0, max - 1), segs[segs.length - 1]] : segs
  shown.forEach((s, i) => {
    if (segs.length > max && i === max - 1) out.push({ status: null, text: `+${segs.length - max} perubahan` })
    out.push({ status: s.status, text: `${statusLabel(s.status)} · ${hari(s.fromDay, s.toDay)}` })
  })
  return out
}

// Satu kalimat untuk pemilik toko. noun: 'boost' | 'perubahan'.
// Patokan = status sebelum mulai; bila tak terekam, status hari pertama.
export function journeySentence(j, { noun = 'boost' } = {}) {
  if (!j) return ''
  const segs = j.segments
  const prev = j.before?.status ?? null
  const pre = prev ? `Sebelum ${noun}: ${statusLabel(prev)}${j.before.n > 1 ? ` (${j.before.n} hari berdata)` : ''}.` : `Status sebelum ${noun} tidak terekam.`
  if (!segs.length) return `${pre} Belum ada data status sesudah mulai.`
  if (!j.changed) return `${pre} Tidak berubah sesudah ${noun} dimulai.`
  const TAY = 'DELIVERING'
  const base = prev ?? segs[0].status
  const firstTay = segs.find(s => s.status === TAY)
  let lastTay = -1
  segs.forEach((s, i) => { if (s.status === TAY) lastTay = i })
  const end = segs[segs.length - 1]
  const parts = []
  if (base !== TAY && firstTay) parts.push(`mulai Tayang di hari ke-${firstTay.fromDay}`)
  if (end.status !== TAY) {
    // Hari video BERHENTI tayang = ruas pertama sesudah Tayang terakhir —
    // bukan awal ruas terakhir, yang bisa jauh sesudahnya.
    const stop = lastTay >= 0 ? segs[lastTay + 1] : base === TAY ? segs[0] : null
    if (stop) parts.push(`${statusLabel(stop.status)} sejak hari ke-${stop.fromDay}${end.status !== stop.status ? `, kini ${statusLabel(end.status)}` : ''}`)
    else if (end.status !== base) parts.push(`${statusLabel(end.status)} sejak hari ke-${end.fromDay}`)
  } else if (firstTay && end !== firstTay) {
    parts.push(`kembali Tayang di hari ke-${end.fromDay}`)
  } else if (base === TAY && segs[0].status !== TAY) {
    parts.push(`${statusLabel(segs[0].status)} di ${hari(segs[0].fromDay, segs[0].toDay)}, lalu Tayang lagi di hari ke-${end.fromDay}`)
  }
  if (!parts.length) parts.push(`${statusLabel(segs[0].status)} di ${hari(segs[0].fromDay, segs[0].toDay)}`)
  const txt = parts.join('; ')
  return `${pre} ${txt[0].toUpperCase()}${txt.slice(1)}.`
}

// ── Label ringkas untuk baris DAFTAR ("Antre → Tayang") ─────────────────────
// byDate: Map<tanggal, [{ campaignId, status }]> satu video.
// Dibandingkan: status terakhir dalam 3 hari sebelum mulai → status yang paling
// sering selama hari ke-1..7 (→ status hari berdata terakhir bila berbeda).
// null bila tak ada perubahan atau datanya tak cukup.
export function statusShift(exp, byDate) {
  const day1 = wibDateOf(exp?.start_at)
  if (!day1 || !byDate || !byDate.size) return null
  const at = (d) => pickStatus(byDate.get(d), exp.campaign_id)?.status || null
  let before = null
  for (let i = 1; i <= 3 && !before; i++) before = at(addDaysISO(day1, -i))
  const during = []
  for (let i = 0; i < 7; i++) { const s = at(addDaysISO(day1, i)); if (s) during.push(s) }
  if (!before || !during.length) return null
  const count = new Map()
  for (const s of during) count.set(s, (count.get(s) || 0) + 1)
  const main = [...count.entries()].sort((a, b) => b[1] - a[1] || rankOf(a[0]) - rankOf(b[0]))[0][0]
  const last = during[during.length - 1]
  const path = [before]
  if (main !== before) path.push(main)
  if (last !== path[path.length - 1]) path.push(last)
  return path.length > 1 ? { path, text: path.map(statusLabel).join(' → ') } : null
}
