import { describe, it, expect } from 'vitest'
import {
  addDaysISO, diffDaysISO, fmtDayID, fmtSpanID, fmtStartWib, buildCalendar, startDateOf, hLabel, sideOf, daysIn,
  aggregateDays, presetRanges, matchPreset, rangeName, checkpointKind, pickBoostSession,
} from '../gmvmaxExperimentDaily'
import {
  fmtNumID, fmtDec1ID, fmtRpID, fmtRpShortID, fmtRpRbID, fmtRoiID, fmtPctID,
} from '../gmvmaxExperimentFormat'

// Eksperimen contoh: mulai 19 Sep (siang), sebelum boost 12–18 Sep, data sampai
// 4 Okt, tanpa baris pada 27 Sep dan 3 Okt. Tiga titik ukur (20, 22, 26 Sep)
// memakai angka dari layar pemilik.
const row = (date, cost, revenue, orders, impressions, clicks, vr = null) =>
  ({ date, cost, revenue, orders, impressions, clicks, roi: cost > 0 ? revenue / cost : null, vr })
const DAILY = [
  row('2026-09-12', 4210, 0, 0, 142, 8), row('2026-09-13', 6830, 149800, 2, 231, 14),
  row('2026-09-14', 3120, 0, 0, 104, 5), row('2026-09-15', 7455, 89900, 1, 252, 15),
  row('2026-09-16', 5980, 172200, 2, 201, 12), row('2026-09-17', 2640, 0, 0, 88, 4),
  row('2026-09-18', 8663, 89900, 1, 291, 17),
  row('2026-09-19', 14920, 348200, 4, 1057, 108), row('2026-09-20', 33438, 353027, 5, 2369, 237),
  row('2026-09-21', 28310, 59900, 1, 2006, 183), row('2026-09-22', 6559, 270078, 3, 465, 53),
  row('2026-09-23', 31450, 89000, 1, 2229, 212), row('2026-09-24', 36120, 429600, 5, 2559, 266),
  row('2026-09-25', 22480, 0, 0, 1593, 142), row('2026-09-26', 27683, 149328, 2, 1962, 192),
  row('2026-09-28', 24760, 119800, 2, 1754, 177), row('2026-09-29', 19340, 59900, 1, 1370, 132),
  row('2026-09-30', 17890, 0, 0, 1268, 114), row('2026-10-01', 21650, 409300, 4, 1534, 163),
  row('2026-10-02', 18920, 329500, 3, 1341, 138), row('2026-10-04', 22676, 499000, 5, 1607, 165),
]
const SNAPS = new Set(DAILY.map(r => r.date))
const BASE = {
  daily: DAILY, startDate: '2026-09-19', baselineStart: '2026-09-12', baselineEnd: '2026-09-18',
  snapshotDates: SNAPS, lastDataDate: '2026-10-04',
}
const cal = buildCalendar(BASE)
const day = (c, date) => c.find(d => d.date === date)
const agg = (from, to, floor = 4) => aggregateDays(daysIn(cal, from, to), floor)

describe('tanggal', () => {
  it('tambah & selisih hari melintasi bulan', () => {
    expect(addDaysISO('2026-09-29', 3)).toBe('2026-10-02')
    expect(diffDaysISO('2026-09-19', '2026-10-04')).toBe(15)
    expect(diffDaysISO('2026-09-19', '2026-09-12')).toBe(-7)
  })
  it('label tanggal & rentang', () => {
    expect(fmtDayID('2026-09-04')).toBe('4 Sep')
    expect(fmtSpanID('2026-09-20', '2026-09-26')).toBe('20–26 Sep')
    expect(fmtSpanID('2026-08-29', '2026-09-04')).toBe('29 Agu–4 Sep')
    expect(fmtSpanID('2026-09-20', '2026-09-20')).toBe('20 Sep')
  })
})

describe('fmtStartWib', () => {
  it('waktu nyata ditulis dalam WIB, termasuk yang melewati tengah malam', () => {
    expect(fmtStartWib('2026-09-19T18:30:00.000Z')).toBe('20 Sep, 01.30 WIB')
    expect(fmtStartWib('2026-09-19T07:05:00Z')).toBe('19 Sep, 14.05 WIB')
  })
  it('tanggal saja dari formulir manual → tanpa jam karangan', () => {
    expect(fmtStartWib('2026-09-19T00:00:00.000Z')).toBe('19 Sep')
  })
  it('kosong/rusak → tanda pisah', () => {
    expect(fmtStartWib(null)).toBe('—'); expect(fmtStartWib('bukan tanggal')).toBe('—')
  })
})

describe('buildCalendar', () => {
  it('satu entri per hari kalender, dari awal sebelum boost sampai data terakhir', () => {
    expect(cal).toHaveLength(23)
    expect(cal[0].date).toBe('2026-09-12')
    expect(cal[cal.length - 1].date).toBe('2026-10-04')
    expect(startDateOf(cal)).toBe('2026-09-19')
  })
  it('fase & label H: sebelum boost, H0, H+N', () => {
    expect(day(cal, '2026-09-18')).toMatchObject({ phase: 'pre', offset: -1 })
    expect(day(cal, '2026-09-19')).toMatchObject({ phase: 'h0', offset: 0 })
    expect(day(cal, '2026-09-22')).toMatchObject({ phase: 'post', offset: 3 })
    expect(hLabel(day(cal, '2026-09-18'))).toBe('')
    expect(hLabel(day(cal, '2026-09-19'))).toBe('H0')
    expect(hLabel(day(cal, '2026-09-22'))).toBe('H+3')
    expect(sideOf(day(cal, '2026-09-18'))).toBe('pre')
    expect(sideOf(day(cal, '2026-09-19'))).toBe('post')
  })
  it('hari tanpa baris yang datanya tidak masuk = missing, tidak dihitung', () => {
    expect(day(cal, '2026-09-27')).toMatchObject({ state: 'missing', counted: false })
    expect(day(cal, '2026-10-03')).toMatchObject({ state: 'missing', counted: false })
  })
  it('hari tanpa baris yang datanya masuk = tak tayang, dihitung Rp0', () => {
    const c = buildCalendar({ ...BASE, snapshotDates: new Set([...SNAPS, '2026-09-27']) })
    expect(day(c, '2026-09-27')).toMatchObject({ state: 'idle', counted: true, cost: 0, revenue: 0, roi: null })
  })
  it('tanpa daftar tanggal data → unknown, tidak dihitung', () => {
    const c = buildCalendar({ ...BASE, snapshotDates: null })
    expect(day(c, '2026-09-27')).toMatchObject({ state: 'unknown', counted: false })
  })
  it('eksperimen muda: kalender tetap sampai H+7, sisanya menunggu data', () => {
    const c = buildCalendar({
      ...BASE, daily: DAILY.filter(r => r.date <= '2026-09-21'),
      snapshotDates: new Set(DAILY.filter(r => r.date <= '2026-09-21').map(r => r.date)), lastDataDate: '2026-09-21',
    })
    expect(c[c.length - 1].date).toBe('2026-09-26')
    expect(day(c, '2026-09-21').state).toBe('data')
    expect(day(c, '2026-09-22')).toMatchObject({ state: 'pending', counted: false })
  })
  it('boost dini hari WIB: tanggal mulai = hari terakhir sebelum boost → tanpa H0, tak dihitung dua kali', () => {
    const c = buildCalendar({ ...BASE, baselineStart: '2026-09-13', baselineEnd: '2026-09-19' })
    expect(c[0].date).toBe('2026-09-13')
    expect(day(c, '2026-09-19')).toMatchObject({ phase: 'pre', offset: 0 })
    expect(c.some(d => d.phase === 'h0')).toBe(false)
    const all = presetRanges(c).find(p => p.key === 'all')
    expect(all.from).toBe('2026-09-20')
  })
  it('tanpa jendela sebelum boost: mulai dari hari mulai', () => {
    const c = buildCalendar({ ...BASE, baselineStart: null, baselineEnd: null })
    expect(c[0]).toMatchObject({ date: '2026-09-19', phase: 'h0' })
    expect(presetRanges(c).some(p => p.key === 'pre')).toBe(false)
  })
  it('hari di antara jendela sebelum boost dan mulai = gap, bukan sebelum boost', () => {
    const c = buildCalendar({ ...BASE, baselineEnd: '2026-09-16' })
    expect(day(c, '2026-09-17').phase).toBe('gap')
    expect(presetRanges(c).find(p => p.key === 'pre').to).toBe('2026-09-16')
  })
  it('enam retensi nol dianggap tanpa data retensi', () => {
    const c = buildCalendar({ ...BASE, daily: [row('2026-09-20', 100, 0, 0, 50, 5, [0, 0, 0, 0, 0, 0])] })
    expect(day(c, '2026-09-20').vr).toBeNull()
  })
  it('tanpa tanggal mulai → kosong', () => expect(buildCalendar({ daily: DAILY })).toEqual([]))
})

describe('aggregateDays', () => {
  it('H+1–7: total = jumlah baris, ROI gabungan dari jumlah', () => {
    const a = agg('2026-09-20', '2026-09-26')
    expect(a).toMatchObject({ counted: 7, cost: 186040, revenue: 1350933, orders: 17, impressions: 13183, clicks: 1285 })
    expect(a.roi).toBeCloseTo(1350933 / 186040, 6)
    expect(a).toMatchObject({ above: 4, below: 3, zeroRevenue: 1, spendAbove: 103800 })
  })
  it('H+1–3: hari di antara titik ukur ikut terhitung', () => {
    const a = agg('2026-09-20', '2026-09-22')
    expect(a).toMatchObject({ counted: 3, cost: 68307, revenue: 683005, orders: 9, above: 2, below: 1 })
  })
  it('sejak mulai cocok dengan angka layar pemilik (pembagi = 14 hari berdata)', () => {
    const a = agg('2026-09-19', '2026-10-04')
    expect(a).toMatchObject({ calendarDays: 16, counted: 14, missing: 2, cost: 326196, orders: 36 })
    expect(a.impressions / a.counted).toBe(1651)
    expect(a.clicks / a.counted).toBe(163)
    expect(a.ctr).toBeCloseTo(0.0987, 4)
    expect(a.cvr).toBeCloseTo(0.0158, 4)
    expect(Math.round(a.cpo)).toBe(9061)
  })
  it('sebelum boost cocok dengan angka layar pemilik', () => {
    const a = agg('2026-09-12', '2026-09-18')
    expect(a).toMatchObject({ counted: 7, cost: 38898, revenue: 501800, orders: 6 })
    expect(Math.round(a.impressions / a.counted)).toBe(187)
    expect(a.ctr).toBeCloseTo(0.0573, 4)
    expect(a.cvr).toBeCloseTo(0.08, 6)
    expect(Math.round(a.cpo)).toBe(6483)
    expect(a.roi).toBeCloseTo(12.9, 1)
  })
  it('hari tak tayang masuk pembagi; hari data tidak masuk tidak', () => {
    const c = buildCalendar({ ...BASE, snapshotDates: new Set([...SNAPS, '2026-09-27']) })
    const a = aggregateDays(daysIn(c, '2026-09-27', '2026-10-04'), 4)
    expect(a).toMatchObject({ calendarDays: 8, counted: 7, idle: 1, missing: 1, cost: 125236 })
  })
  it('tanpa ambang: tidak menghitung di atas/di bawah, tapi tetap menghitung hari beromzet', () => {
    const a = agg('2026-09-20', '2026-09-26', null)
    expect(a).toMatchObject({ above: 0, below: 0, withRevenue: 6, zeroRevenue: 1 })
  })
  it('rentang tanpa data: semua rasio null, tak ada NaN', () => {
    const a = agg('2026-09-27', '2026-09-27')
    expect(a).toMatchObject({ counted: 0, missing: 1, roi: null, ctr: null, cvr: null, cpo: null, vr: null })
  })
  it('retensi ditimbang impresi, hanya dari hari yang punya retensi', () => {
    const c = buildCalendar({
      startDate: '2026-09-19', lastDataDate: '2026-09-21',
      daily: [
        row('2026-09-20', 10, 0, 0, 100, 1, [0.5, 0, 0, 0, 0, 0.1]),
        row('2026-09-21', 10, 0, 0, 300, 1, [0.1, 0, 0, 0, 0, 0.5]),
        row('2026-09-19', 10, 0, 0, 999, 1, null),
      ],
    })
    const a = aggregateDays(c)
    expect(a.vrImpressions).toBe(400)
    expect(a.vr[0]).toBeCloseTo(0.2, 6)
    expect(a.vr[5]).toBeCloseTo(0.4, 6)
  })
})

describe('presetRanges', () => {
  it('boost masih terlihat: H+1–3, H+1–7, sebelum boost, sejak mulai', () => {
    const p = presetRanges(cal)
    expect(p.map(x => x.key)).toEqual(['h3', 'h7', 'pre', 'all'])
    expect(p[0]).toMatchObject({ from: '2026-09-20', to: '2026-09-22' })
    expect(p[1]).toMatchObject({ from: '2026-09-20', to: '2026-09-26' })
    expect(p[2]).toMatchObject({ from: '2026-09-12', to: '2026-09-18', plain: '7 hari' })
    expect(p[3]).toMatchObject({ from: '2026-09-19', to: '2026-10-04', plain: '16 hari' })
  })
  it('boost sudah dicabut: ada rentang setelah boost, bertanda perkiraan', () => {
    const p = presetRanges(cal, { boostLastSeen: '2026-09-26', boostEnded: true })
    expect(p.map(x => x.key)).toEqual(['h3', 'h7', 'pre', 'after', 'all'])
    expect(p[3]).toMatchObject({ from: '2026-09-27', to: '2026-10-04', plain: '8 hari', approx: true })
  })
  it('boost dicabut di hari terakhir data → tak ada rentang setelah boost', () => {
    const p = presetRanges(cal, { boostLastSeen: '2026-10-04', boostEnded: true })
    expect(p.some(x => x.key === 'after')).toBe(false)
  })
  it('sesi terakhir terlihat sebelum mulai → rentang setelah boost tak mundur melewati H+1', () => {
    const p = presetRanges(cal, { boostLastSeen: '2026-09-10', boostEnded: true })
    expect(p.find(x => x.key === 'after').from).toBe('2026-09-20')
  })
  it('matchPreset mengenali rentang sendiri yang sama dengan bawaan', () => {
    const p = presetRanges(cal)
    expect(matchPreset(p, '2026-09-20', '2026-09-26')).toBe('h7')
    expect(matchPreset(p, '2026-09-21', '2026-09-26')).toBeNull()
  })
})

describe('rangeName', () => {
  it('sesudah mulai memakai label H', () => {
    expect(rangeName(cal, '2026-09-23', '2026-09-25')).toBe('H+4–6')
    expect(rangeName(cal, '2026-09-19', '2026-09-22')).toBe('H0–H+3')
    expect(rangeName(cal, '2026-09-23', '2026-09-23')).toBe('H+4')
    expect(rangeName(cal, '2026-09-19', '2026-09-19')).toBe('H0')
  })
  it('sebelum boost memakai tanggal', () => {
    expect(rangeName(cal, '2026-09-13', '2026-09-15')).toBe('13–15 Sep')
  })
})

describe('checkpointKind', () => {
  const o = { status: 'RUNNING', lastDataDate: '2026-09-24' }
  it('lima keadaan dibedakan', () => {
    expect(checkpointKind({ roi: 10.6 }, o)).toBe('measured')
    expect(checkpointKind({ roi: null, measurement_label: 'MEASURED', revenue: 5000 }, o)).toBe('nospend')
    expect(checkpointKind({ roi: null, date: '2026-09-22' }, { ...o, status: 'CONCLUDED' })).toBe('closed')
    expect(checkpointKind({ roi: null, date: '2026-09-22' }, o)).toBe('missing')
    expect(checkpointKind({ roi: null, date: '2026-09-26' }, o)).toBe('pending')
  })
})

describe('pickBoostSession', () => {
  const sessions = [
    { session_id: 'a', first_seen: '2026-08-01', last_seen: '2026-08-05' },
    { session_id: 'b', first_seen: '2026-09-18', last_seen: '2026-09-26' },
  ]
  it('sesi yang ditautkan menang', () => {
    expect(pickBoostSession(sessions, { source_session_id: 'a' }, '2026-09-19').session_id).toBe('a')
  })
  it('tanpa tautan: sesi yang mulai terlihat paling dekat dengan tanggal mulai', () => {
    expect(pickBoostSession(sessions, {}, '2026-09-19').session_id).toBe('b')
  })
  it('lebih dari dua hari → tidak menebak', () => {
    expect(pickBoostSession(sessions, {}, '2026-09-10')).toBeNull()
    expect(pickBoostSession([], { source_session_id: 'x' }, '2026-09-19')).toBeNull()
  })
})

describe('pemformat', () => {
  it('gaya Indonesia tanpa spasi setelah Rp', () => {
    expect(fmtRpID(33438)).toBe('Rp33.438')
    expect(fmtRpID(1350933)).toBe('Rp1.350.933')
    expect(fmtNumID(23114)).toBe('23.114')
    expect(fmtDec1ID(2.57)).toBe('2,6')
  })
  it('ringkas untuk kartu dan kalimat', () => {
    expect(fmtRpShortID(1350933)).toBe('Rp1,35 jt')
    expect(fmtRpShortID(683005)).toBe('Rp683.005')
    expect(fmtRpRbID(50000)).toBe('Rp50 rb')
    expect(fmtRpRbID(38898)).toBe('Rp38,9 rb')
    expect(fmtRpRbID(900)).toBe('Rp900')
  })
  it('ROI & persen berkoma desimal', () => {
    expect(fmtRoiID(10.56)).toBe('10,6x')
    expect(fmtRoiID(41.18)).toBe('41,2x')
    expect(fmtRoiID(0)).toBe('0,0x')
    expect(fmtRoiID(1234.5)).toBe('1.235x')
    expect(fmtPctID(0.0987)).toBe('9,9%')
    expect(fmtPctID(0.1)).toBe('10,0%')
  })
  it('kosong → tanda pisah, bukan NaN', () => {
    for (const f of [fmtRpID, fmtRpShortID, fmtRpRbID, fmtRoiID, fmtPctID, fmtNumID, fmtDec1ID]) {
      expect(f(null)).toBe('—'); expect(f(undefined)).toBe('—'); expect(f(NaN)).toBe('—')
    }
  })
})
