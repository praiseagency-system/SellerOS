// STAGE 2A — Semantik tanggal bisnis Asia/Jakarta via Intl (BUKAN aritmetika +7 tetap).
// Intl.DateTimeFormat timeZone:'Asia/Jakarta' → kalender resmi zona (robust thd TZ
// mesin & DST; Jakarta tanpa DST tapi kontraknya eksplisit, bukan asumsi offset).
// Semua fungsi menerima `instant` (epoch ms) → deterministik, tak tergantung wall-clock.

const JKT = 'Asia/Jakarta'
// en-CA → "YYYY-MM-DD"
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: JKT, year: 'numeric', month: '2-digit', day: '2-digit' })
const fullFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: JKT, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

// Tanggal kalender Jakarta untuk sebuah instant → "YYYY-MM-DD".
export function jakartaDateString(instant = Date.now()) {
  return ymdFmt.format(new Date(instant))
}

// Representasi lokal Jakarta lengkap (untuk laporan bukti TZ).
export function jakartaLocalString(instant = Date.now()) {
  return fullFmt.format(new Date(instant)).replace(', ', ' ') + ' WIB'
}

// Kurangi n hari dari "YYYY-MM-DD" secara kalender (pakai tengah hari UTC → tak ada
// pembulatan batas). Jakarta tanpa DST → aman & eksplisit.
export function dateMinusDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

// Resolusi snapshot_date dgn semantik bisnis Jakarta.
//   undefined|'yesterday' → hari Jakarta KEMARIN
//   'today'               → hari Jakarta ini
//   'YYYY-MM-DD'          → eksplisit (divalidasi)
export function resolveSnapshotDate(spec, instant = Date.now()) {
  if (!spec || spec === 'yesterday') return dateMinusDays(jakartaDateString(instant), 1)
  if (spec === 'today') return jakartaDateString(instant)
  if (!YMD_RE.test(spec)) throw new Error(`snapshot_date invalid: ${spec} (harus YYYY-MM-DD | today | yesterday)`)
  return spec
}

// Bukti TZ untuk satu instant (dipakai laporan Stage 2A).
export function tzEvidence(instant, spec = 'yesterday') {
  return {
    injectedUtc: new Date(instant).toISOString(),
    jakartaLocal: jakartaLocalString(instant),
    jakartaDate: jakartaDateString(instant),
    utcDate: new Date(instant).toISOString().slice(0, 10),
    vpsTz: process.env.TZ || '(unset → mesin)',
    resolvedSnapshotDate: resolveSnapshotDate(spec, instant),
  }
}
