import { describe, it, expect } from 'vitest'
import {
  addDaysISO, diffDaysISO, fmtDayID, fmtSpanID, fmtStartWib, buildCalendar, startDateOf, hLabel, sideOf, daysIn,
  aggregateDays, presetRanges, matchPreset, rangeName, checkpointKind, pickBoostSession,
  boostWindow, spanDaysByDate, latestWorkerSnapshot, wibDateOf,
} from '../gmvmaxExperimentDaily'
import {
  fmtNumID, fmtDec1ID, fmtRpID, fmtRpShortID, fmtRpRbID, fmtRoiID, fmtPctID, fmtFloorID, fmtSignedX, reasonTextID,
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
  it('formulir manual (tanggal saja) → tanpa jam karangan', () => {
    expect(fmtStartWib('2026-09-19T00:00:00.000Z', { dateOnly: true })).toBe('19 Sep')
  })
  it('jadwal nyata tepat 07.00 WIB tetap ditulis jamnya', () => {
    expect(fmtStartWib('2026-09-19T00:00:00.000Z')).toBe('19 Sep, 07.00 WIB')
  })
  it('wibDateOf: hari WIB dari sebuah instant', () => {
    expect(wibDateOf('2026-09-19T18:30:00Z')).toBe('2026-09-20')
    expect(wibDateOf('2026-09-19T16:59:59Z')).toBe('2026-09-19')
    expect(wibDateOf(null)).toBeNull()
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
  it('nomor hari: hari mulai = Hari 1, sebelum mulai ≤ 0 dan tanpa label', () => {
    expect(day(cal, '2026-09-18')).toMatchObject({ phase: 'pre', day: 0 })
    expect(day(cal, '2026-09-19')).toMatchObject({ phase: 'post', day: 1 })
    expect(day(cal, '2026-09-22')).toMatchObject({ phase: 'post', day: 4 })
    expect(hLabel(day(cal, '2026-09-18'))).toBe('')
    expect(hLabel(day(cal, '2026-09-19'))).toBe('Hari 1')
    expect(hLabel(day(cal, '2026-09-22'))).toBe('Hari 4')
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
  it('eksperimen muda: kalender tetap sampai hari ke-7, sisanya menunggu data', () => {
    const c = buildCalendar({
      ...BASE, daily: DAILY.filter(r => r.date <= '2026-09-21'),
      snapshotDates: new Set(DAILY.filter(r => r.date <= '2026-09-21').map(r => r.date)), lastDataDate: '2026-09-21',
    })
    expect(c[c.length - 1]).toMatchObject({ date: '2026-09-25', day: 7 })
    expect(day(c, '2026-09-21').state).toBe('data')
    expect(day(c, '2026-09-22')).toMatchObject({ state: 'pending', counted: false })
  })
  it('hari ke-1 = tanggal WIB mulai: boost 01.30 WIB tanggal 20 mulai dari 20 Sep', () => {
    // start_at 19 Sep 18.30Z; pemanggil mengoper dayOne() = 20 Sep; jendela sesi 13–19 Sep.
    const c = buildCalendar({ ...BASE, startDate: wibDateOf('2026-09-19T18:30:00Z'), baselineStart: '2026-09-13', baselineEnd: '2026-09-19' })
    expect(day(c, '2026-09-19')).toMatchObject({ phase: 'pre', day: 0 })
    expect(day(c, '2026-09-20')).toMatchObject({ phase: 'post', day: 1 })
    expect(presetRanges(c).find(p => p.key === 'h3')).toMatchObject({ from: '2026-09-20', to: '2026-09-22' })
  })
  it('jendela tersimpan yang mencakup hari ke-1 tidak menarik hari itu ke sebelum-mulai', () => {
    const c = buildCalendar({ ...BASE, baselineEnd: '2026-09-19' })
    expect(day(c, '2026-09-19')).toMatchObject({ phase: 'post', day: 1 })
    expect(presetRanges(c).find(p => p.key === 'pre').to).toBe('2026-09-18')
  })
  it('unggahan berkas multi-hari ditandai di hari potretnya', () => {
    const c = buildCalendar({ ...BASE, spanByDate: new Map([['2026-09-26', 7], ['2026-09-27', 3]]) })
    expect(day(c, '2026-09-26').spanDays).toBe(7)
    expect(day(c, '2026-09-25').spanDays).toBe(1)
    expect(day(c, '2026-09-27').spanDays).toBe(1) // tak ada baris → tak ada yang digabung
  })
  it('tanpa jendela sebelum boost: mulai dari hari mulai', () => {
    const c = buildCalendar({ ...BASE, baselineStart: null, baselineEnd: null })
    expect(c[0]).toMatchObject({ date: '2026-09-19', phase: 'post', day: 1 })
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
  it('jendela sebelum mulai yang salah ketik tahun tidak menghabiskan kalender', () => {
    const c = buildCalendar({ ...BASE, baselineStart: '2024-09-12' })
    expect(c[0].date).toBe('2026-07-21') // 60 hari sebelum mulai
    expect(c[c.length - 1].date).toBe('2026-10-04')
  })
  it('tanpa tanggal mulai → kosong', () => expect(buildCalendar({ daily: DAILY })).toEqual([]))
})

describe('aggregateDays', () => {
  it('hari 1–7: total = jumlah baris, ROI gabungan dari jumlah', () => {
    const a = agg('2026-09-19', '2026-09-25')
    expect(a).toMatchObject({ counted: 7, cost: 173277, revenue: 1549805, orders: 19, impressions: 12278, clicks: 1201 })
    expect(a.roi).toBeCloseTo(1549805 / 173277, 6)
    expect(a).toMatchObject({ spendDays: 7, above: 4, below: 3, zeroRevenue: 1, spendAbove: 91037 })
  })
  it('hari 1–3: semua hari ikut terhitung, termasuk hari mulai', () => {
    const a = agg('2026-09-19', '2026-09-21')
    expect(a).toMatchObject({ counted: 3, cost: 76668, revenue: 761127, orders: 10, above: 2, below: 1 })
  })
  it('hari berbelanja kecil (< 10% lantai belanja) tidak dihitung di atas/di bawah ambang', () => {
    const c = buildCalendar({
      ...BASE, daily: [...DAILY.filter(r => r.date !== '2026-09-22'), row('2026-09-22', 2384, 84000, 1, 200, 20)],
    })
    const a = aggregateDays(daysIn(c, '2026-09-19', '2026-09-25'), 4, 50000)
    expect(a).toMatchObject({ counted: 7, spendDays: 6, small: 1, above: 3, below: 3, spendDayMin: 5000 })
    // lantai lain → batas hari berbelanja ikut
    expect(aggregateDays(daysIn(c, '2026-09-19', '2026-09-25'), 4, 10000)).toMatchObject({ spendDays: 7, small: 0, spendDayMin: 1000 })
    // lantai kosong → bawaan Rp50.000
    expect(aggregateDays(daysIn(c, '2026-09-19', '2026-09-25'), 4, null).spendDayMin).toBe(5000)
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
  it('tiap hari yang dihitung masuk tepat satu keranjang', () => {
    const c = buildCalendar({
      ...BASE, snapshotDates: new Set([...SNAPS, '2026-09-27']),
      daily: [...DAILY, row('2026-10-03', 0, 90000, 1, 40, 3)],
      spanByDate: new Map([['2026-10-04', 3]]),
    })
    const a = aggregateDays(daysIn(c, '2026-09-27', '2026-10-04'), 4)
    expect(a).toMatchObject({ counted: 8, idle: 1, noSpend: 1, merged: 1, small: 0, spendDays: 5, above: 3, below: 2 })
    expect(a.idle + a.noSpend + a.merged + a.small + a.spendDays).toBe(a.counted)
    // hari gabungan & hari tanpa belanja tetap ikut total
    expect(a.revenue).toBe(1417500 + 90000)
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
  it('boost masih terlihat: hari 1–3, hari 1–7, sebelum boost, sejak mulai', () => {
    const p = presetRanges(cal)
    expect(p.map(x => x.key)).toEqual(['h3', 'h7', 'pre', 'all'])
    expect(p[0]).toMatchObject({ label: 'Hari 1–3', from: '2026-09-19', to: '2026-09-21' })
    expect(p[1]).toMatchObject({ label: 'Hari 1–7', from: '2026-09-19', to: '2026-09-25' })
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
  it('eksperimen muda: rentang terbuka berhenti di hari data terakhir, bukan di hari ke-7', () => {
    const young = buildCalendar({
      ...BASE, daily: DAILY.filter(r => r.date <= '2026-09-21'),
      snapshotDates: new Set(DAILY.filter(r => r.date <= '2026-09-21').map(r => r.date)), lastDataDate: '2026-09-21',
    })
    const all = presetRanges(young).find(p => p.key === 'all')
    expect(all).toMatchObject({ from: '2026-09-19', to: '2026-09-21', plain: '3 hari' })
    expect(aggregateDays(daysIn(young, all.from, all.to)).pending).toBe(0)
    // rentang tetap (hari 1–7) tetap sampai hari ke-7 dan menandai sisanya menunggu data
    const h7 = presetRanges(young).find(p => p.key === 'h7')
    expect(aggregateDays(daysIn(young, h7.from, h7.to))).toMatchObject({ counted: 3, pending: 4 })
  })
  it('eksperimen yang bukan boost memakai kata bendanya sendiri', () => {
    const pre = presetRanges(cal, { noun: 'perubahan' }).find(x => x.key === 'pre')
    expect(pre).toMatchObject({ label: 'Sebelum perubahan', short: 'Sebelum perubahan' })
  })
  it('matchPreset mengenali rentang sendiri yang sama dengan bawaan', () => {
    const p = presetRanges(cal)
    expect(matchPreset(p, '2026-09-19', '2026-09-25')).toBe('h7')
    expect(matchPreset(p, '2026-09-20', '2026-09-25')).toBeNull()
  })
})

describe('rangeName', () => {
  it('sesudah mulai memakai nomor hari', () => {
    expect(rangeName(cal, '2026-09-22', '2026-09-24')).toBe('Hari 4–6')
    expect(rangeName(cal, '2026-09-19', '2026-09-22')).toBe('Hari 1–4')
    expect(rangeName(cal, '2026-09-23', '2026-09-23')).toBe('Hari 5')
  })
  it('sebelum mulai memakai tanggal', () => {
    expect(rangeName(cal, '2026-09-13', '2026-09-15')).toBe('13–15 Sep')
  })
})

describe('checkpointKind', () => {
  const o = { status: 'RUNNING', lastDataDate: '2026-09-24' }
  it('data harinya ada tapi server belum menghitung → belum dihitung, bukan data tidak masuk', () => {
    expect(checkpointKind({ roi: null, date: '2026-09-22' }, { ...o, dayState: 'data' })).toBe('uncomputed')
    expect(checkpointKind({ roi: null, date: '2026-09-22' }, { ...o, dayState: 'missing' })).toBe('missing')
    expect(checkpointKind({ roi: null, date: '2026-09-22' }, { ...o, status: 'STOPPED', dayState: 'data' })).toBe('closed')
  })
  it('keadaan lain dibedakan', () => {
    expect(checkpointKind({ roi: 0 }, o)).toBe('measured')
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
  it('ditautkan tapi sesinya tak termuat → null, bukan sesi lain', () => {
    expect(pickBoostSession(sessions, { source_session_id: 'hilang' }, '2026-09-19')).toBeNull()
  })
  it('tanpa tautan: sesi yang mulai terlihat paling dekat dengan tanggal mulai', () => {
    expect(pickBoostSession(sessions, {}, '2026-09-19').session_id).toBe('b')
  })
  it('lebih dari sehari → tidak menebak', () => {
    expect(pickBoostSession(sessions, {}, '2026-09-21')).toBeNull()
    expect(pickBoostSession(sessions, {}, '2026-09-10')).toBeNull()
    expect(pickBoostSession([], { source_session_id: 'x' }, '2026-09-19')).toBeNull()
  })
  it('jalur persetujuan: sesi yang jam mulainya dalam 6 jam, bukan sesi lain di hari berdekatan', () => {
    const ss = [
      { session_id: 'lama', first_seen: '2026-09-18', last_seen: '2026-09-18', schedule_start_time: '2026-09-18T02:00:00Z' },
      { session_id: 'benar', first_seen: '2026-09-19', last_seen: '2026-09-21', schedule_start_time: '2026-09-19T18:40:00Z' },
    ]
    const exp = { source_approval_id: 'ap1', start_at: '2026-09-19T18:30:00Z' }
    expect(pickBoostSession(ss, exp, '2026-09-19').session_id).toBe('benar')
    expect(pickBoostSession([ss[0]], exp, '2026-09-19')).toBeNull()
  })
})

describe('boostWindow', () => {
  it('stempel potret = tanggal data kemarin → digeser ke pagi potretnya', () => {
    const w = boostWindow({ first_seen: '2026-09-18', last_seen: '2026-09-25' }, '2026-10-03')
    expect(w).toEqual({ firstSeen: '2026-09-19', lastSeen: '2026-09-26', ended: true })
  })
  it('jam mulai sesi menang atas stempel pertama (run susulan menstempel mundur)', () => {
    const w = boostWindow({ first_seen: '2026-08-09', last_seen: '2026-09-25', schedule_start_time: '2026-09-18T18:30:00Z' }, '2026-10-03')
    expect(w.firstSeen).toBe('2026-09-19')
  })
  it('belum ada potret yang lebih baru → belum dianggap dicabut', () => {
    expect(boostWindow({ first_seen: '2026-09-18', last_seen: '2026-10-03' }, '2026-10-03').ended).toBe(false)
    expect(boostWindow({ first_seen: '2026-09-18', last_seen: '2026-10-03' }, null).ended).toBe(false)
  })
  it('jadwal selesai tepat sesudah penampakan terakhir dipakai sebagai hari terakhir', () => {
    const base = { first_seen: '2026-09-18', last_seen: '2026-09-25' }
    expect(boostWindow({ ...base, schedule_end_time: '2026-09-26T19:00:00Z' }, '2026-10-03').lastSeen).toBe('2026-09-27')
    // jadwal jauh di depan tapi sesinya sudah hilang = dicabut lebih awal
    expect(boostWindow({ ...base, schedule_end_time: '2026-10-20T00:00:00Z' }, '2026-10-03').lastSeen).toBe('2026-09-26')
  })
  it('sesi tanpa stempel → null', () => expect(boostWindow({ session_id: 'x' })).toBeNull())
  it('rentang setelah boost mulai sehari sesudah hari terakhir terlihat', () => {
    const w = boostWindow({ first_seen: '2026-09-18', last_seen: '2026-09-25' }, '2026-10-03')
    const after = presetRanges(cal, { boostLastSeen: w.lastSeen, boostEnded: w.ended }).find(p => p.key === 'after')
    expect(after.from).toBe('2026-09-27')
  })
})

describe('potret', () => {
  it('unggahan multi-hari: tanggal potret → jumlah hari; harian diabaikan', () => {
    const m = spanDaysByDate([
      { snapshot_date: '2026-09-26', start_date: '2026-09-20', end_date: '2026-09-26' },
      { snapshot_date: '2026-09-26', start_date: '2026-09-26', end_date: '2026-09-26' },
      { snapshot_date: '2026-09-27', start_date: null, end_date: null },
    ])
    expect([...m]).toEqual([['2026-09-26', 7]])
  })
  it('potret worker terbaru dikenali dari namanya', () => {
    expect(latestWorkerSnapshot([
      { snapshot_date: '2026-10-03', name: '3 Okt 2026 (API)' },
      { snapshot_date: '2026-10-04', name: '4 Okt 2026 (API)' },
      { snapshot_date: '2026-10-09', name: 'Product-video 2026-10-03 ~ 2026-10-09' },
    ])).toBe('2026-10-04')
    expect(latestWorkerSnapshot([])).toBeNull()
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
  it('tepi pembulatan tidak menghasilkan "Rp1000 rb" atau "100,0x"', () => {
    expect(fmtRpRbID(999960)).toBe('Rp1,00 jt')
    expect(fmtRpShortID(999999.6)).toBe('Rp1,00 jt')
    expect(fmtRpShortID(1500000000)).toBe('Rp1,50 M')
    expect(fmtRoiID(99.96)).toBe('100x')
    expect(fmtRoiID(99.94)).toBe('99,9x')
  })
  it('ambang & selisih ROI satu gaya', () => {
    expect(fmtFloorID(4)).toBe('4x'); expect(fmtFloorID(4.5)).toBe('4,5x'); expect(fmtFloorID(null)).toBe('—')
    expect(fmtSignedX(2.44)).toBe('+2,4x'); expect(fmtSignedX(-7.5)).toBe('−7,5x'); expect(fmtSignedX(undefined)).toBe('—')
  })
  it('alasan vonis diterjemahkan dari teks mesin', () => {
    expect(reasonTextID('ROI ≥ 4 bertahan pada 3 checkpoint')).toBe('ROI di H+3 dan H+7 bertahan di atas ambang 4x (3 titik ukur di atas ambang).')
    expect(reasonTextID('ROI ≥ 4.5 pada 1 checkpoint, persistensi belum cukup')).toBe('ROI di atas ambang 4,5x pada 1 titik ukur, tetapi belum bertahan di H+3 dan H+7.')
    expect(reasonTextID('semua checkpoint ROI < 4')).toBe('ROI di semua titik ukur di bawah ambang 4x.')
    expect(reasonTextID('ROI kuat H+1 lalu turun ≥ 50%')).toBe('ROI kuat di H+1, lalu turun 50% atau lebih di titik ukur berikutnya.')
    expect(reasonTextID('baseline tak dinyatakan / tak ada data baseline', 'perubahan')).toContain('sebelum perubahan')
    expect(reasonTextID('delta terukur, tetapi ambang winner/weak (roiFloor/persistence/spike) = TBD_BUSINESS_DECISION')).not.toMatch(/TBD|roiFloor|winner/)
    expect(reasonTextID('tak ada checkpoint ROI terukur')).toBe('Belum ada titik ukur yang terisi.')
    expect(reasonTextID('eksperimen dihentikan')).toBe('Eksperimen dihentikan sebelum ada vonis.')
  })
  it('alasan yang tak dikenal tampil apa adanya', () => {
    expect(reasonTextID('alasan baru dari server')).toBe('alasan baru dari server')
    expect(reasonTextID(null)).toBe('')
  })
  it('kosong → tanda pisah, bukan NaN', () => {
    for (const f of [fmtRpID, fmtRpShortID, fmtRpRbID, fmtRoiID, fmtPctID, fmtNumID, fmtDec1ID]) {
      expect(f(null)).toBe('—'); expect(f(undefined)).toBe('—'); expect(f(NaN)).toBe('—')
    }
  })
})
