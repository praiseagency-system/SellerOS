// Periode efektif campaign — satu campaign bisa aktif di BEBERAPA rentang
// tanggal, mis. "Gajian Sale Juli" 24–31 Juli lalu "8.8" 1–8 Agustus. Voucher
// & Harga Campaign sama di semua periode; periode hanya menentukan KAPAN
// campaign aktif dan pesanan mana yang dihitung sebagai hasil aktual (hari
// jeda di antara periode tidak ikut).
//
// Bentuk data: campaign.periods = [{ label, start, end }] (tanggal 'YYYY-MM-DD').
// Campaign lama yang cuma punya startDate/endDate dibaca sebagai SATU periode
// tanpa nama, jadi tak ada yang perlu dimigrasi manual.

const DAY = 86400000

export function fmtDate(d) {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Daftar periode campaign, sudah dibersihkan & urut menurut tanggal mulai.
export function campaignPeriods(c) {
  const raw = Array.isArray(c?.periods) ? c.periods : []
  const list = raw
    .map(p => ({ label: (p?.label || '').trim(), start: p?.start || '', end: p?.end || '' }))
    .filter(p => p.start || p.end)
  if (list.length) return sortPeriods(list)
  if (c?.startDate || c?.endDate) return [{ label: '', start: c.startDate || '', end: c.endDate || '' }]
  return []
}

export function sortPeriods(list) {
  return [...list].sort((a, b) => (a.start || '').localeCompare(b.start || ''))
}

// Batas waktu satu periode (ms). Ujung yang kosong dianggap terbuka.
export function periodBounds(p) {
  return {
    from: p?.start ? new Date(p.start + 'T00:00:00').getTime() : -Infinity,
    to: p?.end ? new Date(p.end + 'T23:59:59').getTime() : Infinity,
  }
}

export function inPeriod(t, p) {
  const b = periodBounds(p)
  return t >= b.from && t <= b.to
}

export function inAnyPeriod(t, list) {
  return (list || []).some(p => inPeriod(t, p))
}

// Rentang keseluruhan (tanggal paling awal → paling akhir) — dipakai untuk
// mengisi kolom start_date/end_date supaya query & tampilan lama tetap jalan.
export function periodSpan(list) {
  const starts = (list || []).map(p => p.start).filter(Boolean).sort()
  const ends = (list || []).map(p => p.end).filter(Boolean).sort()
  return { start: starts[0] || '', end: ends[ends.length - 1] || '' }
}

// Jumlah hari campaign benar-benar aktif (periode tumpang-tindih digabung).
// null bila ada periode terbuka / tanpa tanggal lengkap.
export function activeDays(list) {
  const spans = (list || [])
    .filter(p => p.start && p.end)
    .map(p => [new Date(p.start + 'T00:00:00').getTime(), new Date(p.end + 'T00:00:00').getTime()])
    .sort((a, b) => a[0] - b[0])
  if (!spans.length) return null
  let total = 0
  let [cs, ce] = spans[0]
  for (let i = 1; i < spans.length; i++) {
    const [s, e] = spans[i]
    if (s <= ce + DAY) ce = Math.max(ce, e)
    else { total += Math.round((ce - cs) / DAY) + 1; cs = s; ce = e }
  }
  return total + Math.round((ce - cs) / DAY) + 1
}

export function periodRange(p) {
  const a = fmtDate(p?.start), b = fmtDate(p?.end)
  if (a && b) return `${a} – ${b}`
  if (a) return `mulai ${a}`
  if (b) return `s/d ${b}`
  return 'tanpa tanggal'
}

// Rentang pendek untuk baris rincian (tahun disembunyikan bila sama).
export function periodRangeShort(p) {
  const f = d => {
    if (!d) return null
    const dt = new Date(d)
    return isNaN(dt) ? d : dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  }
  const a = f(p?.start), b = f(p?.end)
  if (a && b) return `${a} – ${b}`
  return a ? `mulai ${a}` : b ? `s/d ${b}` : 'tanpa tanggal'
}

// Ringkasan tanggal untuk kartu daftar / header approval.
export function periodsSummary(c) {
  const list = campaignPeriods(c)
  if (!list.length) return 'tanpa tanggal'
  if (list.length === 1) return periodRange(list[0])
  const span = periodSpan(list)
  return `${periodRange({ start: span.start, end: span.end })} · ${list.length} periode`
}

export function periodLabel(p, i) {
  return p?.label || `Periode ${i + 1}`
}

// Status satu periode relatif ke sekarang.
export function periodStatus(p, now = Date.now()) {
  const b = periodBounds(p)
  if (now < b.from) return 'scheduled'
  if (now > b.to) return 'ended'
  return 'running'
}

const STATUS_CLS = {
  draft: 'bg-gray-600/20 text-gray-400',
  scheduled: 'bg-blue-600/12 text-blue-300',
  running: 'bg-green-500/12 text-green-300',
  gap: 'bg-amber-500/12 text-amber-300',
  ended: 'bg-gray-600/20 text-gray-400',
}

// Status campaign dari SEMUA periode: berjalan bila sekarang ada di salah satu
// periode; "Jeda" bila sudah ada periode yang lewat tapi masih ada yang akan
// datang (mis. 31 Juli selesai, 8.8 belum mulai).
export function campaignStatus(c, now = Date.now()) {
  const list = campaignPeriods(c)
  if (!list.length) return { key: 'draft', label: 'Tanpa tanggal', cls: STATUS_CLS.draft }

  const activeIdx = list.findIndex(p => inPeriod(now, p))
  if (activeIdx >= 0) {
    const p = list[activeIdx]
    return {
      key: 'running',
      label: list.length > 1 && p.label ? `Berjalan · ${p.label}` : 'Berjalan',
      cls: STATUS_CLS.running,
    }
  }
  const nextIdx = list.findIndex(p => periodBounds(p).from > now)
  if (nextIdx >= 0) {
    const started = list.some(p => periodBounds(p).from <= now)
    if (!started) return { key: 'scheduled', label: 'Terjadwal', cls: STATUS_CLS.scheduled }
    const nx = list[nextIdx]
    return {
      key: 'gap',
      label: nx.label ? `Jeda · lanjut ${nx.label}` : 'Jeda antar periode',
      cls: STATUS_CLS.gap,
    }
  }
  return { key: 'ended', label: 'Selesai', cls: STATUS_CLS.ended }
}
