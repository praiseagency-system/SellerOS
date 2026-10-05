// Kalender harian eksperimen + agregat per rentang, untuk drawer detail.
//
// Kenapa ada: vonis lama hanya membaca tiga hari tunggal, jadi hari di antaranya
// tak pernah terlihat. Berkas ini menyusun SEMUA hari jadi satu kalender supaya
// rentang mana pun bisa dijumlah.
//
// Hari dihitung dari TANGGAL WIB perlakuan dimulai: hari itu = "Hari 1" (aturan
// vonis v2, experimentWindows.mjs — keputusan pemilik 5 Okt 2026). Tidak ada
// lagi "H0": dulu jendela mulai dari tanggal-UTC + 1, sehingga boost siang
// kehilangan hari pertamanya sedangkan boost dini hari tidak.
//
// Murni (tanpa React/Supabase). Tanggal = 'YYYY-MM-DD'.
import { DEFAULT_SPEND_FLOOR, wibDateOf } from '../gmvmax/skills/experimentWindows.mjs'

export { wibDateOf }

const DAY_MS = 86400000
const MAX_DAYS = 730
// Jendela sebelum-mulai yang ditampilkan paling panjang 60 hari. Formulir manual
// tak memvalidasi tanggal: salah ketik tahun akan menghabiskan seluruh jatah
// kalender sebelum sampai ke tanggal mulai, dan yang terbuang hari TERBARU.
const PRE_MAX = 60
const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export const addDaysISO = (iso, n) => new Date(toMs(iso) + n * DAY_MS).toISOString().slice(0, 10)
export const diffDaysISO = (from, to) => Math.round((toMs(to) - toMs(from)) / DAY_MS)

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const fmtDayID = (iso) => (iso ? `${+iso.slice(8, 10)} ${BULAN[+iso.slice(5, 7) - 1]}` : '—')
// "20–26 Sep" · "29 Agu–4 Sep" · "20 Sep"
export function fmtSpanID(from, to) {
  if (!from || !to) return '—'
  if (from === to) return fmtDayID(from)
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${+from.slice(8, 10)}–${fmtDayID(to)}` : `${fmtDayID(from)}–${fmtDayID(to)}`
}

// "19 Sep" atau "20 Sep, 01.30 WIB" dari start_at. dateOnly = eksperimen dari
// formulir manual: yang tersimpan hanya tanggal (tengah malam UTC), jadi jam
// TIDAK ditulis daripada mengarang "07.00".
export function fmtStartWib(iso, { dateOnly = false } = {}) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return '—'
  const w = new Date(ms + 7 * 3600000).toISOString()
  const day = fmtDayID(w.slice(0, 10))
  return dateOnly ? day : `${day}, ${w.slice(11, 13)}.${w.slice(14, 16)} WIB`
}

// Satu entri per HARI KALENDER, dari awal jendela sebelum-mulai sampai yang
// lebih akhir antara hari ke-7 dan hari data terakhir.
//
// startDate = HARI KE-1 (tanggal WIB mulai; pemanggil memakai dayOne()).
// day   — nomor hari: 1 = hari mulai, 2, 3, …; ≤ 0 untuk hari sebelum mulai.
// phase — 'post' (hari ke-1 dst.) · 'pre' (di dalam jendela sebelum-mulai yang
//         TERSIMPAN, baseline_start..end) · 'gap' (sebelum mulai tapi di luar
//         jendela itu — tampil, tak masuk total "sebelum …").
//
// state — kenapa sebuah hari tak punya baris. loadExperimentDaily hanya
//         mengembalikan hari yang ADA barisnya; baris nol dibuang saat impor.
//   'data'    ada baris
//   'idle'    data hari itu masuk, sasaran tidak muncul → Rp0, DIHITUNG
//             (sama dengan cara server: satu entri per tanggal potret)
//   'missing' data hari itu tidak masuk → tidak dihitung
//   'pending' sesudah data terakhir → tidak dihitung
//   'unknown' daftar tanggal data tidak tersedia → tidak dihitung
//
// spanDays — unggahan berkas yang mencakup beberapa hari tersimpan sebagai SATU
//         potret bertanggal akhir rentang (parseGmvMax). Hari itu memuat jumlah
//         N hari; ia ditandai supaya tidak dibaca sebagai ROI satu hari.
export function buildCalendar({
  daily = [], startDate, baselineStart = null, baselineEnd = null,
  snapshotDates = null, lastDataDate = null, spanByDate = null,
} = {}) {
  if (!startDate) return []
  const byDate = new Map(daily.map(r => [r.date, r]))
  const hasPre = !!(baselineStart && baselineEnd && baselineStart <= baselineEnd)
  let lastKnown = lastDataDate || null
  for (const r of daily) if (!lastKnown || r.date > lastKnown) lastKnown = r.date
  const earliest = addDaysISO(startDate, -PRE_MAX)
  const wanted = hasPre && baselineStart < startDate ? baselineStart : startDate
  const first = wanted < earliest ? earliest : wanted
  const h7 = addDaysISO(startDate, 6)
  const last = lastKnown && lastKnown > h7 ? lastKnown : h7
  const snaps = snapshotDates && snapshotDates.size ? snapshotDates : null

  const out = []
  for (let d = first, i = 0; d <= last && i < MAX_DAYS; d = addDaysISO(d, 1), i++) {
    const day = diffDaysISO(startDate, d) + 1
    const inPre = hasPre && d >= baselineStart && d <= baselineEnd
    const phase = day >= 1 ? 'post' : inPre ? 'pre' : 'gap'
    const r = byDate.get(d)
    const state = r ? 'data' : (lastKnown && d > lastKnown) ? 'pending'
      : snaps ? (snaps.has(d) ? 'idle' : 'missing') : 'unknown'
    const counted = state === 'data' || state === 'idle'
    const cost = r ? num(r.cost) : 0
    const revenue = r ? num(r.revenue) : 0
    // Enam angka retensi nol = retensi tak tercatat, bukan "0% menonton".
    const vr = r && Array.isArray(r.vr) && r.vr.some(v => v > 0) ? r.vr : null
    out.push({
      date: d, day, phase, state, counted, cost, revenue,
      orders: r ? num(r.orders) : 0, impressions: r ? num(r.impressions) : 0, clicks: r ? num(r.clicks) : 0,
      roi: cost > 0 ? revenue / cost : null, vr,
      spanDays: (r && spanByDate?.get(d)) || 1,
    })
  }
  return out
}

export const startDateOf = (calendar) => (calendar.length ? addDaysISO(calendar[0].date, 1 - calendar[0].day) : null)
export const hLabel = (d) => (d.phase === 'post' ? `Hari ${d.day}` : '')
// Rentang sendiri tak boleh melintasi tanggal mulai: hari sebelum dan sesudah
// boost bukan satu populasi.
export const sideOf = (d) => (d.phase === 'post' ? 'post' : 'pre')
export const daysIn = (calendar, from, to) => calendar.filter(d => d.date >= from && d.date <= to)

// Agregat satu rentang. Rasio SELALU dari jumlah (Σomzet/Σbelanja), bukan
// rata-rata rasio harian. `counted` (hari yang datanya masuk, termasuk hari tak
// tayang) = pembagi rata-rata per hari DAN penyebut "N dari M hari" — satu
// definisi untuk kartu, kaki tabel, dan pembanding.
export function aggregateDays(days = [], roiFloor = null, spendFloor = null) {
  // "Hari berbelanja" = belanja ≥ 10% lantai belanja — definisi yang SAMA dengan
  // aturan vonis (windowStats). Hari receh tidak ikut dihitung "di atas/di bawah
  // ambang": Rp2 ribu yang kebetulan beromzet bukan bukti apa pun.
  const sf = typeof spendFloor === 'number' && spendFloor > 0 ? spendFloor : DEFAULT_SPEND_FLOOR
  const a = {
    calendarDays: days.length, counted: 0, idle: 0, missing: 0, pending: 0, unknown: 0,
    cost: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0,
    spendDays: 0, above: 0, below: 0, zeroRevenue: 0, withRevenue: 0, spendAbove: 0,
    small: 0, noSpend: 0, merged: 0, spendDayMin: sf * 0.1,
    vr: null, vrImpressions: 0,
  }
  const hasFloor = typeof roiFloor === 'number' && Number.isFinite(roiFloor)
  const vrW = [0, 0, 0, 0, 0, 0]
  for (const d of days) {
    if (!d.counted) { a[d.state] += 1; continue }
    a.counted += 1
    if (d.state === 'idle') a.idle += 1
    a.cost += d.cost; a.revenue += d.revenue; a.orders += d.orders
    a.impressions += d.impressions; a.clicks += d.clicks
    if (d.revenue > 0) a.withRevenue += 1
    // Lima keranjang yang SELALU berjumlah `counted`: gabungan (unggahan
    // multi-hari, bukan ROI satu hari) · tak tayang · berdata tanpa belanja ·
    // berbelanja kecil · hari berbelanja (di atas/di bawah ambang bila ada).
    if (d.spanDays > 1) a.merged += 1
    else if (d.state === 'idle') { /* sudah dihitung di a.idle */ }
    else if (d.cost === 0) a.noSpend += 1
    else if (d.cost < a.spendDayMin) a.small += 1
    else {
      a.spendDays += 1
      if (d.revenue === 0) a.zeroRevenue += 1
      if (hasFloor) {
        if (d.revenue / d.cost >= roiFloor) { a.above += 1; a.spendAbove += d.cost } else a.below += 1
      }
    }
    if (d.vr && d.impressions > 0) {
      d.vr.forEach((v, i) => { vrW[i] += v * d.impressions })
      a.vrImpressions += d.impressions
    }
  }
  a.roi = a.cost > 0 ? a.revenue / a.cost : null
  a.ctr = a.impressions > 0 ? a.clicks / a.impressions : null
  a.cvr = a.clicks > 0 ? a.orders / a.clicks : null
  a.cpo = a.orders > 0 ? a.cost / a.orders : null
  a.vr = a.vrImpressions > 0 ? vrW.map(w => w / a.vrImpressions) : null
  return a
}

// Rentang bawaan. `after` hanya ada bila sesi boost-nya ketemu DAN sudah tak
// terlihat lagi. boostLastSeen = hari terakhir boost dianggap berjalan
// (boostWindow) — perkiraan, karena sumbernya potret pagi, bukan jam berhenti.
// noun: eksperimen yang bukan boost (kecualikan kreatif, ubah budget, …) tetap
// punya "sebelum" — tetapi bukan "sebelum boost".
export function presetRanges(calendar, { boostLastSeen = null, boostEnded = false, noun = 'boost' } = {}) {
  if (!calendar.length) return []
  const start = startDateOf(calendar)
  const calEnd = calendar[calendar.length - 1].date
  // Rentang terbuka ("sejak mulai", "setelah boost dicabut") berakhir di hari
  // data TERAKHIR, bukan di ujung kalender: kalender selalu diperpanjang sampai
  // hari ke-7, dan tanggal yang belum terjadi bukan bagian dari "sejak mulai".
  let dataEnd = null
  for (const d of calendar) if (d.state !== 'pending') dataEnd = d.date
  const endFor = (from) => (dataEnd && dataEnd >= from ? dataEnd : calEnd)
  const out = [
    { key: 'h3', label: 'Hari 1–3', short: 'Hari 1–3', plain: '3 hari pertama', from: start, to: addDaysISO(start, 2) },
    { key: 'h7', label: 'Hari 1–7', short: 'Hari 1–7', plain: '7 hari pertama', from: start, to: addDaysISO(start, 6) },
  ]
  const pre = calendar.filter(d => d.phase === 'pre')
  if (pre.length) {
    out.push({ key: 'pre', label: `Sebelum ${noun}`, short: `Sebelum ${noun}`, plain: `${pre.length} hari`, from: pre[0].date, to: pre[pre.length - 1].date })
  }
  if (boostEnded && boostLastSeen) {
    const afterSeen = addDaysISO(String(boostLastSeen).slice(0, 10), 1)
    const from = afterSeen > addDaysISO(start, 1) ? afterSeen : addDaysISO(start, 1)
    if (dataEnd && from <= dataEnd) {
      out.push({ key: 'after', label: 'Setelah boost dicabut', short: 'Setelah boost dicabut', plain: `${diffDaysISO(from, dataEnd) + 1} hari`, from, to: dataEnd, approx: true })
    }
  }
  const firstRun = calendar.find(d => sideOf(d) === 'post')
  if (firstRun) {
    const to = endFor(firstRun.date)
    out.push({ key: 'all', label: 'Sejak mulai', short: 'Sejak mulai', plain: `${diffDaysISO(firstRun.date, to) + 1} hari`, from: firstRun.date, to })
  }
  return out
}

export const matchPreset = (presets, from, to) => presets.find(p => p.from === from && p.to === to)?.key || null

// Nama rentang sendiri: "Hari 4–6" · "Hari 4"; di masa sebelum mulai cukup
// tanggalnya.
export function rangeName(calendar, from, to) {
  const a = calendar.find(d => d.date === from), b = calendar.find(d => d.date === to)
  if (!a || !b || sideOf(a) === 'pre') return fmtSpanID(from, to)
  return a.date === b.date ? `Hari ${a.day}` : `Hari ${a.day}–${b.day}`
}

// Keadaan satu titik ukur tersimpan. roi null punya LIMA arti yang berbeda —
// drawer lama menulis "menunggu" untuk semuanya.
//   measured   : ada ROI
//   nospend    : terukur (omzet tercatat) tapi belanja Rp0 → ROI tak terdefinisi
//   closed     : eksperimen ditutup sebelum titik ini (evaluator hanya RUNNING)
//   uncomputed : data harinya ADA di kalender, tapi server belum menghitungnya
//                (eksperimen dicatat mundur, atau data masuk lewat unggahan
//                berkas — evaluator baru jalan besok pagi)
//   missing    : tanggalnya sudah lewat, datanya tidak ada
//   pending    : belum tiba
// dayState = keadaan hari itu di kalender (saksi bahwa datanya ada).
export function checkpointKind(c, { status = 'RUNNING', lastDataDate = null, dayState = null } = {}) {
  if (c.roi != null) return 'measured'
  if (c.measurement_label === 'MEASURED') return 'nospend'
  if (status !== 'RUNNING') return 'closed'
  if (dayState === 'data' || dayState === 'idle') return 'uncomputed'
  if (c.date && lastDataDate && c.date <= lastDataDate) return 'missing'
  return 'pending'
}

const NEAR_MS = 6 * 3600000

// Sesi boost milik eksperimen ini, berurutan dari yang paling pasti:
//   1. yang ditautkan (source_session_id);
//   2. eksperimen ber-jam nyata (jalur persetujuan): sesi yang jam mulainya
//      dalam 6 jam dari start_at — batas yang sama dengan alreadyCovered di
//      experimentOpener.mjs;
//   3. eksperimen dari formulir (tanggal saja): sesi yang hari mulainya paling
//      dekat dengan tanggal mulai, maks ±1 hari.
// Tak ketemu = null; diam lebih baik daripada menebak sesi boost LAIN dari
// video yang sama.
export function pickBoostSession(sessions = [], exp, startDate) {
  // Ditautkan tetapi sesinya tak termuat (di luar 60 hari) → null, bukan tebakan.
  if (exp?.source_session_id) {
    return sessions.find(x => String(x.session_id) === String(exp.source_session_id)) || null
  }
  const t0 = Date.parse(exp?.start_at)
  if (Number.isFinite(t0) && exp?.source_approval_id) {
    let best = null, bestGap = Infinity
    for (const s of sessions) {
      const gap = Math.abs(Date.parse(s.schedule_start_time) - t0)
      if (gap <= NEAR_MS && gap < bestGap) { best = s; bestGap = gap }
    }
    return best
  }
  if (!startDate) return null
  let best = null, bestGap = Infinity
  for (const s of sessions) {
    const day = boostWindow(s)?.firstSeen
    if (!day) continue
    const gap = Math.abs(diffDaysISO(startDate, day))
    if (gap <= 1 && gap < bestGap) { best = s; bestGap = gap }
  }
  return best
}

// Jendela sebuah sesi boost dalam HARI KALENDER WIB.
//
// Potret sesi diambil pagi (±07.30 WIB) tetapi DISTEMPEL tanggal datanya =
// kemarin (resolveSnapshotDate bawaan 'yesterday'; vpsCommit menulis potret
// harian dan potret sesi dengan `date` yang sama). Jadi stempel L berarti
// "masih berjalan pada pagi L+1" — memakai stempelnya mentah-mentah menggeser
// semuanya sehari terlalu awal.
//   firstSeen : hari jam mulai sesi (schedule_start_time) bila ada; kalau tidak,
//               pagi pertama ia terpotret. Stempel pertama TIDAK dipakai bila
//               jam mulainya ada: run susulan (backfill) menstempel sesi yang
//               sedang hidup ke tanggal-tanggal lampau.
//   lastSeen  : hari terakhir boost dianggap berjalan — pagi terakhir ia
//               terpotret, atau hari jadwal selesainya bila jatuh tepat sesudah itu.
//   ended     : ada potret yang LEBIH BARU daripada penampakan terakhirnya.
//               witness = stempel potret terbaru yang kita punya (sesi mana pun
//               atau potret harian dari worker).
// Semuanya perkiraan: yang diketahui hanya "terlihat pagi ini atau tidak".
export function boostWindow(session, witness = null) {
  if (!session?.first_seen || !session?.last_seen) return null
  const stampLast = String(session.last_seen).slice(0, 10)
  const seenLast = addDaysISO(stampLast, 1)
  const firstSeen = wibDateOf(session.schedule_start_time) || addDaysISO(String(session.first_seen).slice(0, 10), 1)
  const ended = !!witness && stampLast < String(witness).slice(0, 10)
  const schedEnd = wibDateOf(session.schedule_end_time)
  const lastSeen = ended && schedEnd && schedEnd >= seenLast && schedEnd <= addDaysISO(seenLast, 1) ? schedEnd : seenLast
  return { firstSeen: firstSeen <= lastSeen ? firstSeen : lastSeen, lastSeen, ended }
}

// Unggahan berkas multi-hari: tanggal potret → jumlah hari yang dicakupnya.
export function spanDaysByDate(imports = []) {
  const m = new Map()
  for (const i of imports) {
    if (!i?.snapshot_date || !i.start_date || !i.end_date || i.start_date >= i.end_date) continue
    const n = diffDaysISO(i.start_date, i.end_date) + 1
    if (n > (m.get(i.snapshot_date) || 1)) m.set(i.snapshot_date, n)
  }
  return m
}

// Tanggal potret terbaru yang ditulis worker harian (namanya berakhiran "(API)",
// vpsCommit.labelFor). Worker menulis potret harian dan potret sesi dalam run
// yang sama, jadi ini saksi kedua "ada potret yang lebih baru" — tanpa ini,
// toko yang boost-nya satu per satu tak pernah terdeteksi "sudah dicabut"
// (hari tanpa sesi hidup tidak menulis baris sesi apa pun).
export function latestWorkerSnapshot(imports = []) {
  let max = null
  for (const i of imports) {
    if (i?.snapshot_date && /\(API\)$/.test(i.name || '') && (!max || i.snapshot_date > max)) max = i.snapshot_date
  }
  return max
}
