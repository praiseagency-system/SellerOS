// Kalender harian eksperimen + agregat per rentang, untuk drawer detail.
//
// Kenapa ada: titik ukur H+1/H+3/H+7 hanya membaca SATU hari masing-masing
// (experimentTracker.mjs), jadi H+2, H+4, H+5, H+6 tak pernah terlihat — dan
// ROI 41x dari belanja Rp6 ribu tampil setara dengan hari berbelanja penuh.
// Berkas ini menyusun semua hari jadi satu kalender supaya rentang mana pun
// bisa dijumlah. TAMPILAN SAJA: aturan vonis tidak disentuh (itu tahap 2).
//
// Murni (tanpa React/Supabase). Tanggal = 'YYYY-MM-DD'.

const DAY_MS = 86400000
const MAX_DAYS = 730
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

// "19 Sep" atau "20 Sep, 01.30 WIB" dari start_at. Dihitung manual (UTC+7)
// supaya tak bergantung zona waktu peramban. Formulir manual menyimpan tanggal
// saja (tengah malam UTC) — untuk itu jam TIDAK ditulis, daripada mengarang.
export function fmtStartWib(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return '—'
  const w = new Date(ms + 7 * 3600000).toISOString()
  const day = fmtDayID(w.slice(0, 10))
  return ms % DAY_MS === 0 ? day : `${day}, ${w.slice(11, 13)}.${w.slice(14, 16)} WIB`
}

// Satu entri per HARI KALENDER, dari awal jendela sebelum boost sampai yang
// lebih akhir antara H+7 dan hari data terakhir.
//
// phase — letak hari terhadap tanggal mulai (potongan UTC start_at, sama dengan
//         dasar label H+N di titik ukur tersimpan):
//   'pre'  di dalam jendela sebelum boost yang TERSIMPAN (baseline_start..end)
//   'gap'  sebelum mulai tapi di luar jendela itu
//   'h0'   hari mulai (boost baru jalan sebagian hari)
//   'post' H+1 dan seterusnya
//   Boost dini hari WIB membuat tanggal mulai = hari terakhir jendela sebelum
//   boost (experimentOpener.mjs); hari itu milik 'pre' saja, tanpa H0 — kalau
//   tidak, ia terhitung dua kali.
//
// state — kenapa sebuah hari tak punya baris. loadExperimentDaily hanya
//         mengembalikan hari yang ADA barisnya; baris nol dibuang saat impor.
//   'data'    ada baris
//   'idle'    data hari itu masuk, sasaran tidak muncul → Rp0, DIHITUNG
//             (sama dengan cara server: satu entri per tanggal potret)
//   'missing' data hari itu tidak masuk → tidak dihitung
//   'pending' sesudah data terakhir → tidak dihitung
//   'unknown' daftar tanggal data tidak tersedia → tidak dihitung
export function buildCalendar({
  daily = [], startDate, baselineStart = null, baselineEnd = null,
  snapshotDates = null, lastDataDate = null,
} = {}) {
  if (!startDate) return []
  const byDate = new Map(daily.map(r => [r.date, r]))
  const hasPre = !!(baselineStart && baselineEnd && baselineStart <= baselineEnd)
  const startInPre = hasPre && startDate >= baselineStart && startDate <= baselineEnd
  let lastKnown = lastDataDate || null
  for (const r of daily) if (!lastKnown || r.date > lastKnown) lastKnown = r.date
  const first = hasPre && baselineStart < startDate ? baselineStart : startDate
  const h7 = addDaysISO(startDate, 7)
  const last = lastKnown && lastKnown > h7 ? lastKnown : h7
  const snaps = snapshotDates && snapshotDates.size ? snapshotDates : null

  const out = []
  for (let d = first, i = 0; d <= last && i < MAX_DAYS; d = addDaysISO(d, 1), i++) {
    const offset = diffDaysISO(startDate, d)
    const inPre = hasPre && d >= baselineStart && d <= baselineEnd
    const phase = offset >= 1 ? 'post' : offset === 0 ? (startInPre ? 'pre' : 'h0') : (inPre ? 'pre' : 'gap')
    const r = byDate.get(d)
    const state = r ? 'data' : (lastKnown && d > lastKnown) ? 'pending'
      : snaps ? (snaps.has(d) ? 'idle' : 'missing') : 'unknown'
    const counted = state === 'data' || state === 'idle'
    const cost = r ? num(r.cost) : 0
    const revenue = r ? num(r.revenue) : 0
    // Enam angka retensi nol = retensi tak tercatat, bukan "0% menonton".
    const vr = r && Array.isArray(r.vr) && r.vr.some(v => v > 0) ? r.vr : null
    out.push({
      date: d, offset, phase, state, counted, cost, revenue,
      orders: r ? num(r.orders) : 0, impressions: r ? num(r.impressions) : 0, clicks: r ? num(r.clicks) : 0,
      roi: cost > 0 ? revenue / cost : null, vr,
    })
  }
  return out
}

export const startDateOf = (calendar) => (calendar.length ? addDaysISO(calendar[0].date, -calendar[0].offset) : null)
export const hLabel = (day) => (day.phase === 'post' ? `H+${day.offset}` : day.phase === 'h0' ? 'H0' : '')
// Rentang sendiri tak boleh melintasi tanggal mulai: hari sebelum dan sesudah
// boost bukan satu populasi.
export const sideOf = (day) => (day.phase === 'post' || day.phase === 'h0' ? 'post' : 'pre')
export const daysIn = (calendar, from, to) => calendar.filter(d => d.date >= from && d.date <= to)

// Agregat satu rentang. Rasio SELALU dari jumlah (Σomzet/Σbelanja), bukan
// rata-rata rasio harian. `counted` (hari yang datanya masuk, termasuk hari tak
// tayang) = pembagi rata-rata per hari DAN penyebut "N dari M hari" — satu
// definisi untuk kartu, kaki tabel, dan pembanding.
export function aggregateDays(days = [], roiFloor = null) {
  const a = {
    calendarDays: days.length, counted: 0, idle: 0, missing: 0, pending: 0, unknown: 0,
    cost: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0,
    above: 0, below: 0, zeroRevenue: 0, withRevenue: 0, spendAbove: 0,
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
    if (d.cost > 0) {
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
// terlihat lagi; batasnya dari potret harian sesi, jadi bisa meleset sehari.
export function presetRanges(calendar, { boostLastSeen = null, boostEnded = false } = {}) {
  if (!calendar.length) return []
  const start = startDateOf(calendar)
  const end = calendar[calendar.length - 1].date
  const out = [
    { key: 'h3', label: 'H+1–3', short: 'H+1–3', plain: '3 hari pertama', from: addDaysISO(start, 1), to: addDaysISO(start, 3) },
    { key: 'h7', label: 'H+1–7', short: 'H+1–7', plain: '7 hari pertama', from: addDaysISO(start, 1), to: addDaysISO(start, 7) },
  ]
  const pre = calendar.filter(d => d.phase === 'pre')
  if (pre.length) {
    out.push({ key: 'pre', label: 'Sebelum boost', short: 'Sebelum boost', plain: `${pre.length} hari`, from: pre[0].date, to: pre[pre.length - 1].date })
  }
  if (boostEnded && boostLastSeen) {
    const afterSeen = addDaysISO(String(boostLastSeen).slice(0, 10), 1)
    const from = afterSeen > addDaysISO(start, 1) ? afterSeen : addDaysISO(start, 1)
    if (from <= end) {
      out.push({ key: 'after', label: 'Setelah boost dicabut', short: 'Setelah boost', plain: `${diffDaysISO(from, end) + 1} hari`, from, to: end, approx: true })
    }
  }
  const firstRun = calendar.find(d => sideOf(d) === 'post')
  if (firstRun) {
    out.push({ key: 'all', label: 'Sejak mulai', short: 'Sejak mulai', plain: `${diffDaysISO(firstRun.date, end) + 1} hari`, from: firstRun.date, to: end })
  }
  return out
}

export const matchPreset = (presets, from, to) => presets.find(p => p.from === from && p.to === to)?.key || null

// Nama rentang sendiri: "H+4–6" · "H0–H+3" · "H+4"; di masa sebelum boost
// cukup tanggalnya.
export function rangeName(calendar, from, to) {
  const a = calendar.find(d => d.date === from), b = calendar.find(d => d.date === to)
  if (!a || !b || sideOf(a) === 'pre') return fmtSpanID(from, to)
  if (a.date === b.date) return hLabel(a)
  return a.phase === 'h0' ? `H0–H+${b.offset}` : `H+${a.offset}–${b.offset}`
}

// Keadaan satu titik ukur tersimpan. roi null punya empat arti yang berbeda —
// drawer lama menulis "menunggu" untuk semuanya.
//   measured : ada ROI
//   nospend  : terukur (omzet tercatat) tapi belanja Rp0 → ROI tak terdefinisi
//   closed   : eksperimen ditutup sebelum titik ini (evaluator hanya RUNNING)
//   missing  : tanggalnya sudah lewat, datanya tidak ada
//   pending  : belum tiba
export function checkpointKind(c, { status = 'RUNNING', lastDataDate = null } = {}) {
  if (c.roi != null) return 'measured'
  if (c.measurement_label === 'MEASURED') return 'nospend'
  if (status !== 'RUNNING') return 'closed'
  if (c.date && lastDataDate && c.date <= lastDataDate) return 'missing'
  return 'pending'
}

// Sesi boost milik eksperimen ini: yang ditautkan (source_session_id), atau —
// untuk eksperimen dari jalur persetujuan / formulir — sesi video yang mulai
// terlihat paling dekat dengan tanggal mulai (maks ±2 hari). Tak ketemu = null;
// diam lebih baik daripada menebak sesi boost lain dari video yang sama.
export function pickBoostSession(sessions = [], exp, startDate) {
  if (exp?.source_session_id) {
    const s = sessions.find(x => String(x.session_id) === String(exp.source_session_id))
    if (s) return s
  }
  if (!startDate) return null
  let best = null, bestGap = Infinity
  for (const s of sessions) {
    if (!s.first_seen) continue
    const gap = Math.abs(diffDaysISO(startDate, String(s.first_seen).slice(0, 10)))
    if (gap <= 2 && gap < bestGap) { best = s; bestGap = gap }
  }
  return best
}
