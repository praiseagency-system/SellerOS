// Helper murni Boost Center berjangka: status (berlangsung/selesai), rentang,
// dan performa "sejak di-boost" vs periode sebelum (panjang sama). Tanggal ISO
// 'YYYY-MM-DD' (perbandingan string aman). "Hari ini" = tanggal lokal.

export function todayISO() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD lokal
}
const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000)

// 'live' (mulai di-set & belum berakhir), 'ended' (berakhir < hari ini),
// null (belum ada tanggal mulai → belum dianggap "di-boost" berjangka).
export function boostStatus(b) {
  if (!b?.boost_start) return null
  const today = todayISO()
  if (b.boost_end && b.boost_end < today) return 'ended'
  return 'live'
}

// Rentang { start, end, ongoing, lengthDays } dari dua tanggal (end null = kini).
export function windowFromDates(start, end) {
  if (!start) return null
  const e = end || todayISO()
  return { start, end: e, ongoing: !end, lengthDays: Math.max(1, daysBetween(start, e) + 1) }
}

export function boostWindow(b) {
  if (!b?.boost_start) return null
  return windowFromDates(b.boost_start, b.boost_end)
}

// Jumlah metrik harian dalam [start, end] inklusif → hasil selama masa boost.
export function sumDaily(daily, start, end) {
  const a = { cost: 0, revenue: 0, orders: 0, days: 0, roas: null }
  if (!start || !end) return a
  for (const d of daily || []) {
    if (d.date >= start && d.date <= end) { a.cost += d.cost; a.revenue += d.revenue; a.orders += d.orders; a.days++ }
  }
  a.roas = a.cost > 0 ? a.revenue / a.cost : null
  return a
}

const zero = () => ({ cost: 0, revenue: 0, orders: 0, days: 0, roas: null })
function sumRange(daily, from, to) {
  const a = zero()
  for (const d of daily || []) {
    if (d.date >= from && d.date <= to) {
      a.cost += d.cost; a.revenue += d.revenue; a.orders += d.orders; a.days++
    }
  }
  a.roas = a.cost > 0 ? a.revenue / a.cost : null
  return a
}

// { window, since, before } — before = window sepanjang sama tepat sebelum mulai.
export function computeBoostPerf(daily, b) {
  const w = boostWindow(b)
  if (!w) return null
  const since = sumRange(daily, w.start, w.end)
  const before = sumRange(daily, addDaysISO(w.start, -w.lengthDays), addDaysISO(w.start, -1))
  return { window: w, since, before }
}
