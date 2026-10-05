// Dampak perubahan setting campaign — sebelum vs sesudah. MURNI (tanpa DB/React).
//
// Aturan ukur (disepakati 5 Okt 2026, artifact 31S6y74yfTVhMFSYSbWiRo):
//   • sebelum = 7 hari kalender penuh SEBELUM hari perubahan
//   • hari perubahan DILEWATI (sebagian jamnya masih memakai setting lama)
//   • sesudah = hari penuh berikutnya, sampai 7 hari; tampil sejak hari pertama
//   • yang dibandingkan rata-rata PER HARI; rasio (ROAS, biaya/order, serapan
//     budget) dihitung dari Σ jendela, BUKAN rata-rata rasio harian
// Jendela dipakai (bukan titik H+1/3/7 milik eksperimen) karena angka harian
// satu campaign terlalu bergejolak: ROAS GMV Max Update 30 Sep–3 Okt 2026 =
// 5,7 · 12,7 · 9,5 · 14,1.

export const WINDOW_DAYS = 7
const WIB_MS = 7 * 3600000
// Di bawah ambang ini naik/turun dianggap "tetap" — menahan label dari
// mengumumkan gerak yang masih dalam goyangan harian biasa.
const MOVE = 0.10

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const wibShift = (ts) => {
  const ms = Date.parse(ts)
  return Number.isFinite(ms) ? new Date(ms + WIB_MS).toISOString() : null
}
// Tanggal & jam WIB dari cap waktu TikTok (ISO ber-zona).
export const wibDate = (ts) => wibShift(ts)?.slice(0, 10) ?? null
export const wibTime = (ts) => wibShift(ts)?.slice(11, 16).replace(':', '.') ?? null

// HARI perubahan. Tanggal di riwayat = label potret tempat perubahan PERTAMA
// terlihat; potret berlabel D diambil D+1 ±07.30 WIB, jadi perubahannya terjadi
// di antara dua potret. modify_time TikTok (cap perubahan terakhir campaign pada
// potret itu) memberi hari yang persis — dipakai bila jatuh di selang yang masuk
// akal, selebihnya kembali ke label potret.
export function changeDayOf(c) {
  const mt = c.modify_time ? wibDate(c.modify_time) : null
  if (!mt) return { day: c.date, timeKnown: false }
  const lower = c.prev_date ? addDays(c.prev_date, 1) : c.date
  const upper = addDays(c.date, 1)
  return mt >= lower && mt <= upper ? { day: mt, timeKnown: true } : { day: c.date, timeKnown: false }
}

// Beberapa bidang yang berubah bersamaan pada satu campaign = SATU kejadian:
// dampaknya tak bisa dipisah per bidang, jadi diukur sekali.
// Cakupan ukur: 'store' bila status campaign ikut berubah (campaign-nya sendiri
// berhenti/baru jalan, jadi yang bermakna adalah toko), 'none' untuk campaign
// baru (tak ada "sebelum"), selebihnya 'campaign'.
export const eventKey = (c) => `${c.campaign_id}|${changeDayOf(c).day}`
export function buildEvents(changes = []) {
  const map = new Map()
  for (const c of changes) {
    const { day, timeKnown } = changeDayOf(c)
    const key = `${c.campaign_id}|${day}`
    let e = map.get(key)
    if (!e) {
      e = { key, campaign_id: c.campaign_id, campaign_name: c.campaign_name, day,
        modify_time: timeKnown ? c.modify_time : null, changes: [] }
      map.set(key, e)
    }
    e.changes.push(c)
  }
  for (const e of map.values()) {
    const fields = e.changes.map(c => c.field)
    e.scope = fields.every(f => f === '_new') ? 'none'
      : fields.includes('operation_status') ? 'store' : 'campaign'
  }
  return map
}

// Susunan baris daftar: `maxRows` perubahan terbaru + kejadiannya + penanda baris
// PERTAMA tiap kejadian (strip dampak hanya di sana; bidang lain yang berubah di
// hari yang sama menumpang). `from` = awal rentang data harian yang dibutuhkan.
// Kejadian dibangun dari SELURUH riwayat: perubahan di luar baris yang tampil
// tetap bisa jatuh di jendela ukur baris terbawah (→ tercampur).
export function planRows(changes = [], maxRows = 30) {
  const events = buildEvents(changes)
  const seen = new Set()
  const rows = []
  let min = null
  for (const c of changes.slice(0, maxRows)) {
    const e = events.get(eventKey(c))
    rows.push({ c, e, first: !seen.has(e.key) })
    seen.add(e.key)
    if (e.scope !== 'none' && (min == null || e.day < min)) min = e.day
  }
  return { events, rows, from: min ? addDays(min, -WINDOW_DAYS) : null }
}

// Perubahan LAIN pada campaign yang sama di dalam jendela ukur → tercampur:
// angkanya tetap dihitung, kesimpulannya ditahan.
export function mixedWith(event, events) {
  const out = []
  for (const o of events.values()) {
    if (o.key === event.key || o.campaign_id !== event.campaign_id || o.scope === 'none') continue
    if (o.day >= addDays(event.day, -WINDOW_DAYS) && o.day <= addDays(event.day, WINDOW_DAYS)) {
      out.push({ day: o.day, side: o.day < event.day ? 'before' : 'after', labels: o.changes.map(c => c.label) })
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1))
}

const ZERO = { cost: 0, revenue: 0, orders: 0, videoCost: 0, videoRevenue: 0 }

// Agregat satu jendela. Hari tanpa snapshot (bolong) DILEWATI dan dihitung di
// `missing` — bukan dianggap nol, supaya hari bolong tak menyeret rata-rata.
// Hari ber-snapshot tapi campaign-nya tak punya baris = nol sungguhan.
function windowAgg(dates, { series, snapshotDates, budgetOf }) {
  const t = { cost: 0, revenue: 0, orders: 0, videoCost: 0, videoRevenue: 0 }
  let days = 0, missing = 0, budgetSum = 0, budgetCost = 0, budgetDays = 0
  for (const d of dates) {
    if (!snapshotDates.has(d)) { missing++; continue }
    const r = series.get(d) || ZERO
    t.cost += r.cost; t.revenue += r.revenue; t.orders += r.orders
    t.videoCost += r.videoCost; t.videoRevenue += r.videoRevenue
    days++
    const b = budgetOf ? Number(budgetOf(d)) : NaN
    if (b > 0) { budgetSum += b; budgetCost += r.cost; budgetDays++ }
  }
  if (days === 0) return { days: 0, missing }
  return {
    days, missing,
    cost: t.cost / days, revenue: t.revenue / days, orders: t.orders / days,
    roas: t.cost > 0 ? t.revenue / t.cost : null,
    cpo: t.orders > 0 ? t.cost / t.orders : null,
    budgetUse: budgetSum > 0 ? budgetCost / budgetSum : null,
    budget: budgetDays > 0 ? budgetSum / budgetDays : null,
    videoCost: t.videoCost / days, videoRevenue: t.videoRevenue / days,
    cardCost: (t.cost - t.videoCost) / days, cardRevenue: (t.revenue - t.videoRevenue) / days,
  }
}

const range = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i))
export const pctChange = (a, b) => (a != null && b != null && a > 0 ? (b - a) / a : null)

// series: Map<tanggal, { cost, revenue, orders, videoCost, videoRevenue }>
// snapshotDates: Set tanggal yang punya snapshot · lastDataDate: snapshot terbaru
// budgetOf(tanggal) → budget harian (opsional; hanya untuk cakupan campaign)
// state: WAITING (belum ada hari sesudah) · PARTIAL (1–6 hari) · FINAL (7 hari lewat)
export function computeImpact({ day, series, snapshotDates, lastDataDate, budgetOf = null }) {
  const ctx = { series: series || new Map(), snapshotDates, budgetOf }
  const before = windowAgg(range(addDays(day, -WINDOW_DAYS), WINDOW_DAYS), ctx)
  const afterDates = range(addDays(day, 1), WINDOW_DAYS).filter(d => lastDataDate && d <= lastDataDate)
  const after = windowAgg(afterDates, ctx)
  const state = after.days === 0 ? 'WAITING'
    : (lastDataDate >= addDays(day, WINDOW_DAYS) ? 'FINAL' : 'PARTIAL')
  const has = before.days > 0 && after.days > 0
  return {
    day, state, before, after,
    firstFullDay: addDays(day, 1),
    // Angka satu hari masuk pukul 07.30 hari berikutnya.
    firstArrives: addDays(day, 2),
    delta: has ? {
      cost: pctChange(before.cost, after.cost),
      revenue: pctChange(before.revenue, after.revenue),
      orders: pctChange(before.orders, after.orders),
      roas: before.roas != null && after.roas != null ? after.roas - before.roas : null,
      roasPct: pctChange(before.roas, after.roas),
      cpo: pctChange(before.cpo, after.cpo),
      budgetUse: before.budgetUse != null && after.budgetUse != null ? after.budgetUse - before.budgetUse : null,
    } : null,
  }
}

const dir = (p) => (p == null ? null : p >= MOVE ? 'naik' : p <= -MOVE ? 'turun' : 'tetap')

// Label keadaan untuk baris daftar. DESKRIPTIF, bukan vonis sebab-akibat:
// menyebut apa yang bergerak, tidak mengklaim perubahan itulah penyebabnya.
export function impactVerdict(impact, mixed = []) {
  if (!impact || impact.state === 'WAITING') return { text: 'Menunggu data', tone: 'mute' }
  const { before, delta } = impact
  if (!delta || (!before.cost && !before.revenue)) return { text: 'Belum ada pembanding', tone: 'mute' }
  if (mixed.length) return { text: 'Tercampur', tone: 'warn' }
  const sp = dir(delta.cost), rv = dir(delta.revenue), ro = dir(delta.roasPct)
  if ((sp ?? 'tetap') === 'tetap' && (rv ?? 'tetap') === 'tetap') return { text: 'Hampir tak berubah', tone: 'mute' }
  const parts = []
  if (sp) parts.push(`Belanja ${sp}`)
  else if (rv) parts.push(`Omzet ${rv}`)
  if (ro) parts.push(`ROAS ${ro === 'tetap' ? 'bertahan' : ro}`)
  const tone = rv === 'turun' || ro === 'turun' ? 'warn' : rv === 'naik' || ro === 'naik' ? 'good' : 'mute'
  return { text: parts.join(', '), tone }
}

const pctText = (p) => {
  const v = Math.abs(p) * 100
  return `${(v >= 10 ? v.toFixed(0) : v.toFixed(1)).replace('.', ',')}%`
}
const moved = (name, p) => (p == null ? null
  : Math.abs(p) < 0.005 ? `${name} tetap`
    : `${name} ${p > 0 ? 'naik' : 'turun'} ${pctText(p)}`)
const roasText = (r) => (r == null ? '—' : r.toFixed(1).replace('.', ','))

// Satu-dua kalimat untuk lembar rinci. Urutan waktu, bukan klaim sebab.
export function impactSentence(impact, { scope = 'campaign' } = {}) {
  if (!impact?.delta) return null
  const { before, after, delta } = impact
  const who = scope === 'store' ? 'toko' : 'campaign ini'
  const a = [moved('belanja', delta.cost), moved('omzet', delta.revenue)].filter(Boolean)
  if (!a.length) return null
  const first = `Sesudah perubahan, ${a.join(' dan ')} di ${who}.`
  if (before.roas == null || after.roas == null) return first
  const r = dir(delta.roasPct)
  const tail = r === 'tetap'
    ? `ROAS bertahan: ${roasText(before.roas)} menjadi ${roasText(after.roas)}.`
    : `ROAS ${r}: dari ${roasText(before.roas)} menjadi ${roasText(after.roas)}.`
  return `${first} ${tail}`
}
