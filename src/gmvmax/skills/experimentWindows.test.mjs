import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RULE_VERSION, DEFAULT_SPEND_FLOOR, wibDateOf, dayOne, resolveRuleConfig, actionDirection,
  computeWindows, checkpointsFormat, windowOf, windowStats, classifyWindows, overlapDayOf, windowJudged,
} from './experimentWindows.mjs'

const CFG = { roiFloor: 4, spendFloor: 50000 }
// Mulai 19 Sep 14.05 WIB → hari ke-1 = 19 Sep.
const exp = (o = {}) => ({ id: 'e1', experiment_type: 'MANUAL_BOOST', creative_video_id: 'v1', start_at: '2026-09-19T07:05:00Z', baseline_start: '2026-09-12', baseline_end: '2026-09-18', status: 'RUNNING', ...o })
const day = (n) => new Date(Date.parse('2026-09-19T00:00:00Z') + (n - 1) * 86400000).toISOString().slice(0, 10)
// rows: [[hariKe, belanja, omzet, order], …] → series (satu entri per tanggal data)
const mk = (rows) => rows.map(([n, spend, revenue, orders = revenue > 0 ? Math.max(1, Math.round(revenue / 90000)) : 0]) => ({ date: day(n), spend, revenue, orders }))
const run = (rows, o = {}) => {
  const series = mk(rows)
  const last = o.last ?? series.reduce((m, r) => (r.date > m ? r.date : m), series[0]?.date || day(1))
  const { windows } = computeWindows({ experiment: exp(o.exp), series, lastDataDate: last, ruleConfig: o.cfg || CFG })
  return { windows, v: classifyWindows({ windows, ruleConfig: o.cfg || CFG, status: o.exp?.status || 'RUNNING', contaminated: !!o.contaminated, direction: o.direction || 'normal', overlapDay: o.overlapDay ?? null }) }
}
const steady = (roi, spend = 50000, days = 7) => Array.from({ length: days }, (_, i) => [i + 1, spend, spend * roi, 3])

test('hari ke-1 = tanggal WIB mulai, bukan potongan UTC', () => {
  assert.equal(wibDateOf('2026-09-19T18:30:00Z'), '2026-09-20')
  assert.equal(dayOne({ start_at: '2026-09-19T18:30:00Z' }), '2026-09-20') // 01.30 WIB tanggal 20
  assert.equal(dayOne({ start_at: '2026-09-19T07:05:00Z' }), '2026-09-19') // 14.05 WIB
  assert.equal(dayOne({ start_at: '2026-09-19T00:00:00.000Z' }), '2026-09-19') // formulir manual
  assert.equal(dayOne({}), null)
  assert.equal(dayOne({ start_at: 'bukan tanggal' }), null) // teks sampah tidak lolos jadi "tanggal"
  assert.equal(dayOne({ start_at: '2026-09-19' }), '2026-09-19')
})

test('setelan: satu sumber, lantai tak pernah kosong', () => {
  assert.deepEqual(resolveRuleConfig({ experiment_roi_floor: '4', spend_floor: '50000' }), { roiFloor: 4, spendFloor: 50000 })
  assert.deepEqual(resolveRuleConfig({ experimentRoiFloor: 4.5, spendFloor: 5000 }), { roiFloor: 4.5, spendFloor: 5000 })
  for (const bad of [undefined, null, {}, { spend_floor: 0 }, { spend_floor: null }, { spend_floor: 'x' }, { spend_floor: -1 }]) {
    assert.equal(resolveRuleConfig(bad).spendFloor, DEFAULT_SPEND_FLOOR)
  }
  assert.equal(resolveRuleConfig({ experiment_roi_floor: 0 }).roiFloor, null)
  assert.equal(resolveRuleConfig({ experiment_roi_floor: null }).roiFloor, null)
})

test('computeWindows: hari mulai ikut, semua hari dijumlah, deret harian tersimpan', () => {
  const { windows } = run([[1, 15000, 348200], [2, 33438, 353027], [3, 28310, 59900], [4, 6559, 270078], [5, 31450, 89000], [6, 36120, 429600], [7, 22480, 0]])
  const w3 = windowOf(windows, 'w3'), w7 = windowOf(windows, 'w7')
  assert.equal(checkpointsFormat(windows), 'v2')
  assert.deepEqual([w3.from, w3.to, w7.to], ['2026-09-19', '2026-09-21', '2026-09-25'])
  assert.equal(w3.spend, 15000 + 33438 + 28310)
  assert.equal(w7.revenue, 348200 + 353027 + 59900 + 270078 + 89000 + 429600)
  assert.equal(w7.daily.length, 7)
  assert.deepEqual(w7.daily[3], { d: '2026-09-22', s: 6559, r: 270078, o: 3 })
  assert.equal(w7.complete, true)
  assert.equal(w7.v, RULE_VERSION)
  assert.equal(w7.cfg.roi_floor, 4)
  assert.equal('date' in w7, false) // pembaca lama tak boleh mengiranya titik ukur satu hari
})

test('hari tanpa data vs hari yang belum tiba', () => {
  const { windows } = run([[1, 50000, 300000], [2, 50000, 300000], [4, 50000, 300000]], { last: day(5) })
  const w3 = windowOf(windows, 'w3'), w7 = windowOf(windows, 'w7')
  assert.deepEqual([w3.counted, w3.missing, w3.pending, w3.complete], [2, 1, 0, true])
  assert.deepEqual([w7.counted, w7.missing, w7.pending, w7.complete], [3, 2, 2, false])
})

test('pembanding sebelum mulai hanya dari hari SEBELUM hari ke-1', () => {
  const series = [{ date: '2026-09-17', spend: 10000, revenue: 90000, orders: 1 }, { date: '2026-09-18', spend: 10000, revenue: 30000, orders: 1 }, { date: '2026-09-19', spend: 50000, revenue: 0, orders: 0 }]
  const { baseline } = computeWindows({ experiment: exp({ baseline_end: '2026-09-19' }), series })
  assert.deepEqual([baseline.days, baseline.spend, baseline.roi], [2, 20000, 6])
})

test('format: kosong, lama, v2, tak dikenal', () => {
  assert.equal(checkpointsFormat([]), 'empty'); assert.equal(checkpointsFormat(null), 'empty')
  assert.equal(checkpointsFormat([{ label: 'H+1', roi: 5, date: '2026-09-20' }]), 'legacy')
  assert.equal(checkpointsFormat([{ v: 2, kind: 'window', key: 'w3' }, { v: 2, kind: 'window', key: 'w7' }]), 'v2')
  assert.equal(checkpointsFormat([{ v: 3, kind: 'window', key: 'w7' }]), 'unknown')
  assert.equal(checkpointsFormat([{ label: 'H+1' }, { v: 2, kind: 'window', key: 'w7' }]), 'unknown')
  assert.equal(checkpointsFormat([{ v: 2, kind: 'window', key: 'w3' }]), 'unknown') // tanpa jendela 7 hari
})

test('hari berbelanja: hari receh tidak ikut memilih', () => {
  const { windows } = run([[1, 50000, 300000], [2, 2384, 84000], [3, 6559, 270078], [4, 50000, 100000], [5, 1000, 0], [6, 50000, 250000], [7, 50000, 250000]])
  const st = windowStats(windowOf(windows, 'w7'), CFG)
  assert.deepEqual(st, { spendDays: 5, smallDays: 2, above: 4 }) // Rp6.559 ≥ 10% lantai → ikut; Rp2.384 & Rp1.000 tidak
})

test('pemenang berkelanjutan: total 7 hari di atas ambang dan lolos semua uji', () => {
  const { v } = run(steady(6))
  assert.deepEqual([v.conclusion, v.confidence, v.code], ['SUSTAINABLE_WINNER', 'MEDIUM', 'W7_WIN'])
  assert.deepEqual([v.params.above, v.params.spendDays], [7, 7])
  assert.equal(v.provisional, false)
})

test('contoh keluhan: 41x dari Rp6 ribu tak lagi menentukan — total 7 hari yang menentukan', () => {
  // Tiga titik lama (hari 2, 4, 8) semuanya ≥ 4x; total 7 hari justru di bawah ambang.
  const { v } = run([[1, 50000, 100000], [2, 33438, 353027], [3, 50000, 0], [4, 6559, 270078], [5, 50000, 0], [6, 50000, 50000], [7, 50000, 0]])
  assert.equal(v.conclusion, 'WEAK')
  assert.ok(v.params.roi7 < 4)
})

test('kandidat: di atas ambang tetapi bertumpu satu hari', () => {
  const { v } = run([[1, 50000, 0], [2, 50000, 0], [3, 50000, 0], [4, 50000, 1700000, 5], [5, 50000, 0], [6, 50000, 0], [7, 50000, 0]])
  assert.equal(v.conclusion, 'WINNER_CANDIDATE')
  assert.ok(v.params.caps.includes('ONE_DAY')); assert.ok(v.params.caps.includes('INCONSISTENT'))
  assert.equal(v.confidence, 'LOW')
})

test('kandidat: selisih tipis — satu order lebih sedikit sudah di bawah ambang', () => {
  // 350 rb belanja, 1,45 jt omzet dari 14 order → 4,14x; tanpa satu order 3,85x.
  const { v } = run(Array.from({ length: 7 }, (_, i) => [i + 1, 50000, 207143, 2]))
  assert.equal(v.conclusion, 'WINNER_CANDIDATE'); assert.deepEqual(v.params.caps, ['THIN'])
})

test('kandidat: belanja hanya terjadi pada sedikit hari / data hanya 4 dari 7 hari', () => {
  const few = run([[1, 60000, 400000, 4], [2, 60000, 400000, 4], [3, 60000, 400000, 4], [4, 0, 0], [5, 0, 0], [6, 0, 0], [7, 0, 0]]).v
  assert.equal(few.conclusion, 'WINNER_CANDIDATE'); assert.ok(few.params.caps.includes('FEW_SPEND_DAYS'))
  const gaps = run([[1, 60000, 400000, 4], [2, 60000, 400000, 4], [6, 60000, 400000, 4], [7, 60000, 400000, 4]], { last: day(7) }).v
  assert.equal(gaps.conclusion, 'WINNER_CANDIDATE'); assert.ok(gaps.params.caps.includes('FEW_DAYS'))
  assert.equal(gaps.params.missing7, 3)
})

test('tercampur & boost ulang: tetap divonis, paling tinggi kandidat, keyakinan rendah', () => {
  const a = run(steady(6), { contaminated: true }).v
  assert.deepEqual([a.conclusion, a.confidence, a.params.caps], ['WINNER_CANDIDATE', 'LOW', ['CONTAMINATED']])
  const b = run(steady(6), { overlapDay: 5 }).v
  assert.deepEqual([b.conclusion, b.params.caps, b.params.overlapDay], ['WINNER_CANDIDATE', ['REBOOST'], 5])
  const c = run(steady(2), { contaminated: true }).v
  assert.deepEqual([c.conclusion, c.confidence], ['WEAK', 'LOW'])
})

test('lemah: total 7 hari di bawah ambang; tipis → keyakinan rendah', () => {
  assert.deepEqual((({ conclusion, confidence }) => [conclusion, confidence])(run(steady(2)).v), ['WEAK', 'MEDIUM'])
  // 3,6x dari 8 order: satu order lagi sudah ≥ 4x.
  const thin = run(Array.from({ length: 7 }, (_, i) => [i + 1, 50000, 180000, i === 0 ? 2 : 1])).v
  assert.deepEqual([thin.conclusion, thin.confidence, thin.params.thin], ['WEAK', 'LOW', true])
})

test('lonjakan sementara: 3 hari pertama kuat, hari ke-4–7 jatuh di bawah ambang', () => {
  const { v } = run([[1, 50000, 500000, 5], [2, 50000, 500000, 5], [3, 50000, 500000, 5], [4, 50000, 100000, 1], [5, 50000, 100000, 1], [6, 50000, 100000, 1], [7, 50000, 100000, 1]])
  assert.deepEqual([v.conclusion, v.code], ['TEMPORARY_SPIKE', 'W7_SPIKE'])
  assert.equal(v.params.tailRoi, 2)
  // Ekor turun tapi masih di atas ambang → bukan lonjakan.
  assert.equal(run([[1, 50000, 500000, 5], [2, 50000, 500000, 5], [3, 50000, 500000, 5], [4, 50000, 250000, 3], [5, 50000, 250000, 3], [6, 50000, 250000, 3], [7, 50000, 250000, 3]]).v.conclusion, 'SUSTAINABLE_WINNER')
})

test('jendela 7 hari lengkap tapi tak layak → Data kurang (final), dengan sebabnya', () => {
  assert.equal(run([[1, 20000, 0], [2, 20000, 0], [3, 7470, 0], [4, 0, 0], [5, 0, 0], [6, 0, 0], [7, 0, 0]]).v.code, 'W7_LOW_SPEND')
  assert.equal(run(Array.from({ length: 7 }, (_, i) => [i + 1, 0, 0])).v.code, 'W7_NO_SPEND')
  const few = run([[1, 60000, 400000], [2, 60000, 400000], [3, 60000, 400000]], { last: day(8) }).v
  assert.deepEqual([few.conclusion, few.code], ['DATA_INSUFFICIENT', 'W7_FEW_DAYS'])
})

test('belum 7 hari: sementara dari 3 hari pertama', () => {
  const win = run(steady(6, 50000, 3)).v
  assert.deepEqual([win.conclusion, win.confidence, win.code, win.provisional], ['WINNER_CANDIDATE', 'LOW', 'W3_WIN_WAIT', true])
  assert.equal(win.params.finalOn, '2026-09-26')
  // Sedikit di bawah ambang → belum konklusif, BUKAN lemah (di data asli 4 dari 7 berbalik).
  assert.deepEqual((({ conclusion, code }) => [conclusion, code])(run(steady(3.6, 50000, 3)).v), ['INCONCLUSIVE', 'W3_BELOW_WAIT'])
  // Jauh di bawah ambang dengan belanja ≥ 2× lantai → lemah dini.
  assert.deepEqual((({ conclusion, code }) => [conclusion, code])(run(steady(0, 50000, 3)).v), ['WEAK', 'W3_WEAK_WAIT'])
  assert.equal(run(steady(1, 20000, 3)).v.code, 'W3_BELOW_WAIT') // jauh di bawah tapi belanja belum 2× lantai
  assert.equal(run(steady(6, 10000, 3)).v.code, 'W3_LOW_SPEND_WAIT')
  assert.equal(run(steady(6, 50000, 2)).v.code, 'W3_WAIT')
})

test('belum ada data / belum dihitung → belum konklusif, bukan Data kurang', () => {
  const { windows } = computeWindows({ experiment: exp(), series: [], lastDataDate: '2026-09-18', ruleConfig: CFG })
  assert.equal(classifyWindows({ windows, ruleConfig: CFG }).code, 'NO_DATA_YET')
  assert.equal(classifyWindows({ windows: [], ruleConfig: CFG }).code, 'NOT_EVALUATED')
})

test('tanpa ambang ROI → belum konklusif; lantai kosong/0 tidak melempar dan tidak memvonis jendela receh', () => {
  assert.equal(run(steady(6), { cfg: { roiFloor: null, spendFloor: 50000 } }).v.code, 'NO_ROI_FLOOR')
  for (const sf of [null, undefined, 0, NaN]) {
    const zero = run(Array.from({ length: 7 }, (_, i) => [i + 1, 0, 0]), { cfg: { roiFloor: 4, spendFloor: sf } }).v
    assert.equal(zero.conclusion, 'DATA_INSUFFICIENT')
    const tiny = run(Array.from({ length: 7 }, (_, i) => [i + 1, 150, 90000, 1]), { cfg: { roiFloor: 4, spendFloor: sf } }).v
    assert.deepEqual([tiny.conclusion, tiny.code], ['DATA_INSUFFICIENT', 'W7_LOW_SPEND'])
  }
})

test('video dikeluarkan: belanja berhenti = berhasil, ROI tidak dinilai', () => {
  assert.equal(actionDirection({ experiment_type: 'CREATIVE_EXCLUSION', treatment: 'Video dikeluarkan dari rotasi' }), 'remove')
  assert.equal(actionDirection({ experiment_type: 'CREATIVE_EXCLUSION', treatment: 'Video dipulihkan ke rotasi' }), 'normal')
  assert.equal(actionDirection({ experiment_type: 'OTHER_APPROVED', treatment: 'Ikatan kode spark dilepas' }), 'remove')
  assert.equal(actionDirection({ experiment_type: 'MANUAL_BOOST', treatment: 'Creative Boost Rp50.000/hari' }), 'normal')
  const done = run(Array.from({ length: 7 }, (_, i) => [i + 1, 80, 0]), { direction: 'remove' }).v
  assert.deepEqual([done.conclusion, done.code], ['DATA_INSUFFICIENT', 'REMOVED_DONE'])
  assert.equal(run(steady(6), { direction: 'remove' }).v.code, 'REMOVED_STILL_SPENDING')
  assert.equal(run(steady(0, 100, 3), { direction: 'remove' }).v.code, 'REMOVED_WAIT')
})

test('status: dihentikan dihormati; ditutup sebelum 7 hari = dinilai seperti yang berjalan (sementara)', () => {
  assert.equal(run(steady(6), { exp: { status: 'STOPPED' } }).v.conclusion, 'STOPPED')
  // Evaluator tetap menghitung baris yang ditutup sampai jendelanya lengkap,
  // jadi vonis sebelum itu sementara dan memakai syarat yang sama.
  for (const rows of [steady(6, 50000, 3), steady(3.9, 50000, 3), steady(1, 100000, 3), steady(6, 50000, 2)]) {
    const a = run(rows, { exp: { status: 'RUNNING' } }).v, b = run(rows, { exp: { status: 'CONCLUDED' } }).v
    assert.deepEqual([b.conclusion, b.confidence, b.code, b.provisional], [a.conclusion, a.confidence, a.code, a.provisional])
    assert.equal(b.provisional, true)
  }
  assert.equal(run(steady(3.9, 50000, 3), { exp: { status: 'CONCLUDED' } }).v.conclusion, 'INCONCLUSIVE') // bukan "Lemah" dini
  assert.equal(run(steady(6), { exp: { status: 'CONCLUDED' } }).v.conclusion, 'SUSTAINABLE_WINNER') // jendela sudah lengkap → vonis biasa
})

test('lemah tanpa order: bukan "selisih tipis"; ditandai noOrders', () => {
  const v = run(Array.from({ length: 7 }, (_, i) => [i + 1, 12000, 0, 0])).v
  assert.deepEqual([v.conclusion, v.confidence, v.code, v.params.thin, v.params.noOrders], ['WEAK', 'LOW', 'W7_WEAK', false, true])
  const big = run(Array.from({ length: 7 }, (_, i) => [i + 1, 30000, 0, 0])).v
  assert.deepEqual([big.confidence, big.params.thin, big.params.noOrders], ['MEDIUM', false, true])
})

test('video dikeluarkan: belanja hari aksi tidak dihitung sebagai "masih dibelanjai"', () => {
  // Rp60 ribu di hari aksi (sebelum jam aksi), lalu nol.
  const v = run([[1, 60000, 240000, 3], ...Array.from({ length: 6 }, (_, i) => [i + 2, 0, 0, 0])], { direction: 'remove' }).v
  assert.deepEqual([v.code, v.params.day1Spend, v.params.afterSpend, v.params.afterDays, v.params.scope], ['REMOVED_DONE', 60000, 0, 6, 'video'])
  const still = run([[1, 0, 0, 0], ...Array.from({ length: 6 }, (_, i) => [i + 2, 10000, 0, 0])], { direction: 'remove' }).v
  assert.deepEqual([still.code, still.params.afterSpend], ['REMOVED_STILL_SPENDING', 60000])
})

test('campaign dijeda: ROI tidak dinilai (belanja hari ke-1 terjadi sebelum jeda)', () => {
  assert.equal(actionDirection({ experiment_type: 'OTHER_APPROVED', treatment: 'Status campaign → DISABLE' }), 'pause')
  assert.equal(actionDirection({ experiment_type: 'OTHER_APPROVED', treatment: 'Status campaign → ENABLE' }), 'normal')
  const v = run([[1, 500000, 1000000, 12], ...Array.from({ length: 6 }, (_, i) => [i + 2, 0, 0, 0])], { direction: 'pause' }).v
  assert.deepEqual([v.conclusion, v.code, v.params.scope], ['DATA_INSUFFICIENT', 'REMOVED_DONE', 'campaign'])
})

test('lonjakan butuh ekor yang kokoh: satu hari / satu order di ekor tidak memutuskan', () => {
  const head = [[1, 50000, 500000, 5], [2, 50000, 500000, 5], [3, 50000, 500000, 5]]
  // Ekor satu hari, satu order (3x) → bukan lonjakan; total 7 hari 8,25x → kandidat dgn pembatas.
  const oneDay = run([...head, [4, 50000, 150000, 1], [5, 0, 0, 0], [6, 0, 0, 0], [7, 0, 0, 0]]).v
  assert.equal(oneDay.conclusion, 'WINNER_CANDIDATE')
  assert.ok(oneDay.params.caps.includes('TAIL_DROP'))
  // Ekor dua hari tetapi satu order rata-rata lagi sudah mengangkatnya ke ambang.
  const flip = run([...head, [4, 30000, 110000, 1], [5, 30000, 110000, 1], [6, 0, 0, 0], [7, 0, 0, 0]]).v
  assert.notEqual(flip.conclusion, 'TEMPORARY_SPIKE')
  // Ekor kokoh → lonjakan; data hanya 4–5 hari → keyakinan rendah.
  const firm = run([...head, [4, 50000, 100000, 1], [5, 50000, 100000, 1], [6, 50000, 100000, 1], [7, 50000, 100000, 1]]).v
  assert.deepEqual([firm.conclusion, firm.confidence], ['TEMPORARY_SPIKE', 'MEDIUM'])
})

test('windowJudged: warna kotak hanya bila aturan memang menilai jendela itu', () => {
  const full = run(steady(6)).windows, few = run(steady(6, 60000, 3), { last: day(8) }).windows
  assert.equal(windowJudged(windowOf(full, 'w7'), CFG), true)
  assert.equal(windowJudged(windowOf(few, 'w7'), CFG), false) // 3 dari 7 hari berdata
  assert.equal(windowJudged(windowOf(full, 'w7'), CFG, 'remove'), false)
  assert.equal(windowJudged(windowOf(full, 'w7'), { roiFloor: null, spendFloor: 50000 }), false)
  assert.equal(windowJudged(windowOf(run(steady(6, 100)).windows, 'w7'), CFG), false) // di bawah lantai
  assert.equal(windowJudged(null, CFG), false)
})

test('paritas server–peramban: vonis dari objek tersimpan (lewat JSON) sama dengan dari deret', () => {
  const cases = [steady(6), steady(2), steady(6, 50000, 3), [[1, 50000, 500000, 5], [2, 50000, 500000, 5], [3, 50000, 500000, 5], [4, 50000, 100000, 1], [5, 50000, 100000, 1], [6, 50000, 100000, 1], [7, 50000, 100000, 1]]]
  for (const rows of cases) for (const roiFloor of [null, 3, 4, 6]) for (const spendFloor of [null, 5000, 50000, 200000]) for (const contaminated of [false, true]) {
    const cfg = { roiFloor, spendFloor }
    const { windows, v } = run(rows, { cfg, contaminated })
    const stored = JSON.parse(JSON.stringify(windows))
    const live = classifyWindows({ windows: stored, ruleConfig: cfg, contaminated })
    assert.deepEqual([live.conclusion, live.confidence, live.code], [v.conclusion, v.confidence, v.code])
  }
})

test('boost lain pada video yang sama di dalam jendela 7 hari', () => {
  const e = exp()
  const o = (id, start, extra = {}) => ({ id, experiment_type: 'MANUAL_BOOST', creative_video_id: 'v1', start_at: start, ...extra })
  assert.equal(overlapDayOf(e, [e, o('e2', '2026-09-23T03:00:00Z')]), 5)
  assert.equal(overlapDayOf(e, [o('e2', '2026-09-19T09:00:00Z')]), null) // hari yang sama = sesi kembar, bukan boost ulang
  assert.equal(overlapDayOf(e, [o('e2', '2026-09-26T03:00:00Z')]), null) // hari ke-8
  assert.equal(overlapDayOf(e, [o('e2', '2026-09-23T03:00:00Z', { creative_video_id: 'v2' })]), null)
  assert.equal(overlapDayOf(e, [o('e2', '2026-09-23T03:00:00Z', { experiment_type: 'NEW_CREATIVE_TEST' })]), null)
  assert.equal(overlapDayOf(e, [o('e3', '2026-09-24T03:00:00Z'), o('e2', '2026-09-21T03:00:00Z')]), 3)
})

test('boost level-produk (Max Delivery, tanpa video) menumpang boost video pada produk yang sama', () => {
  const video = exp({ product_id: 'p1' })
  const md = { id: 'md', experiment_type: 'ACCELERATE_TESTING', creative_video_id: null, product_id: 'p1', start_at: '2026-09-21T03:00:00Z' }
  assert.equal(overlapDayOf(video, [video, md]), 3)
  assert.equal(overlapDayOf({ ...md, start_at: '2026-09-19T03:00:00Z' }, [{ ...video, start_at: '2026-09-22T03:00:00Z' }]), 4)
  // Video LAIN pada produk yang sama bukan tumpang-tindih.
  assert.equal(overlapDayOf(video, [{ ...video, id: 'x', creative_video_id: 'v2', start_at: '2026-09-21T03:00:00Z' }]), null)
  assert.equal(overlapDayOf(video, [{ ...md, product_id: 'p2' }]), null)
})

test('aksi berhenti: tanpa data sesudah aksi tidak boleh disebut "berhenti dibelanjai"', () => {
  // Hari ke-1 ada, hari ke-2..7 tidak masuk, potret terbaru sudah lewat hari ke-7.
  const v = run([[1, 80000, 240000, 3]], { direction: 'remove', last: day(9) }).v
  assert.deepEqual([v.conclusion, v.code, v.params.afterDays], ['DATA_INSUFFICIENT', 'W7_FEW_DAYS', 0])
  const ok = run([[1, 80000, 240000, 3], [2, 0, 0, 0], [3, 0, 0, 0], [4, 0, 0, 0], [5, 0, 0, 0]], { direction: 'remove', last: day(9) }).v
  assert.deepEqual([ok.code, ok.params.afterDays, ok.params.beforeDays], ['REMOVED_DONE', 4, null])
})
