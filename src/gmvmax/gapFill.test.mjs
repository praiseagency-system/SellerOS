// PENAMBAL HARI BOLONG — deteksi tanggal tanpa import is_current + orkestrasi
// tarik ulang di akhir run harian. Kasus acuan: Asterixsty bolong 3 Okt 2026.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gapFillDaysFromEnv, windowDates, findMissingDates, fillOrder, authUnusable, runGapFill,
  DEFAULT_GAP_FILL_DAYS, DEFAULT_GAP_FILL_BUDGET_MS,
} from './gapFill.mjs'

const ASTERIX = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const DASFELIX = 'c420074f-d4a6-4e6d-bf8e-2d0234b575d7'
const LATEST = '2026-10-04' // run 5 Okt 07:30 WIB
const range = (from, to) => { const out = []; for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out }

// gmvmax_imports tiruan: { [workspaceId]: [{ d:'YYYY-MM-DD', current:boolean }] }.
// Menjalankan filter yang SUNGGUH diminta kueri (is_current, rentang, urutan).
function fakeImports(byWs, { failWith = null } = {}) {
  const queries = []
  return {
    queries,
    from(table) {
      assert.equal(table, 'gmvmax_imports')
      const q = { eq: {}, gte: null, lte: null, single: false }
      const run = () => {
        queries.push(q)
        if (failWith) return { data: null, error: { message: failWith } }
        let rows = (byWs[q.eq.workspace_id] || []).filter(r => q.eq.is_current === undefined || r.current === q.eq.is_current)
        if (q.gte) rows = rows.filter(r => r.d >= q.gte)
        if (q.lte) rows = rows.filter(r => r.d <= q.lte)
        rows = rows.map(r => ({ snapshot_date: r.d })).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
        return q.single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
      }
      const api = {
        select: () => api,
        eq: (c, v) => { q.eq[c] = v; return api },
        gte: (_c, v) => { q.gte = v; return api },
        lte: (_c, v) => { q.lte = v; return api },
        order: () => api,
        limit: () => api,
        maybeSingle: () => { q.single = true; return api },
        then: (res, rej) => Promise.resolve().then(run).then(res, rej),
      }
      return api
    },
  }
}
const cur = (dates) => dates.map(d => ({ d, current: true }))
const without = (dates, ...drop) => dates.filter(d => !drop.includes(d))

// Rangka runGapFill: merekam tanggal yang ditarik; hasil per tanggal bisa diatur.
function harness({ results = {}, entries = () => [{ advertiserId: 'A1', storeId: 'S1' }] } = {}) {
  const processed = [], logs = [], slept = []
  return {
    processed, logs, slept,
    log: (o) => logs.push(o),
    sleepImpl: async (ms) => slept.push(ms),
    entriesFor: async (ws, date) => entries(ws, date),
    processDate: async ({ workspaceId, date }) => {
      processed.push(`${workspaceId.slice(0, 4)}:${date}`)
      return results[date] ?? { ok: true, status: 'SUCCESS', written: true, rowCount: 10 }
    },
  }
}
const base = (h, extra) => ({
  latestDate: LATEST, days: 7, startedAt: 0, clock: () => 0, pauseMs: 3000,
  entriesFor: h.entriesFor, processDate: h.processDate, log: h.log, sleepImpl: h.sleepImpl, ...extra,
})

test('gapFillDaysFromEnv: default 7, 0 = mati, tak sah → default, dibatasi 31', () => {
  assert.equal(DEFAULT_GAP_FILL_DAYS, 7)
  assert.equal(gapFillDaysFromEnv(undefined), 7)
  assert.equal(gapFillDaysFromEnv(''), 7)
  assert.equal(gapFillDaysFromEnv('0'), 0)
  assert.equal(gapFillDaysFromEnv('10'), 10)
  assert.equal(gapFillDaysFromEnv('999'), 31)
  for (const bad of ['-1', 'abc', '2.5']) assert.equal(gapFillDaysFromEnv(bad), 7, bad)
})

test('windowDates: N tanggal berakhir di kemarin (inklusif), melintasi batas bulan', () => {
  assert.deepEqual(windowDates(LATEST, 7), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  assert.deepEqual(windowDates(LATEST, 1), [LATEST])
  assert.deepEqual(windowDates(LATEST, 0), [])
})

test('findMissingDates: menemukan 3 Okt yang bolong (kasus Asterixsty)', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-10-03')) })
  const r = await findMissingDates(sb, { workspaceId: ASTERIX, latestDate: LATEST, days: 7 })
  assert.deepEqual(r.missing, ['2026-10-03'])
  assert.equal(sb.queries[0].eq.is_current, true)
  assert.equal(sb.queries[0].eq.workspace_id, ASTERIX)
  assert.deepEqual([sb.queries[0].gte, sb.queries[0].lte], ['2026-09-28', LATEST])
})

test('findMissingDates: deret utuh → kosong, dan cukup SATU kueri', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(range('2026-09-01', LATEST)) })
  const r = await findMissingDates(sb, { workspaceId: ASTERIX, latestDate: LATEST, days: 7 })
  assert.deepEqual(r.missing, [])
  assert.equal(sb.queries.length, 1)
})

test('findMissingDates: versi yang sudah di-supersede (is_current=false) TIDAK menutup lubang', async () => {
  const rows = [...cur(without(range('2026-09-01', LATEST), '2026-10-02')), { d: '2026-10-02', current: false }]
  const r = await findMissingDates(fakeImports({ [ASTERIX]: rows }), { workspaceId: ASTERIX, latestDate: LATEST, days: 7 })
  assert.deepEqual(r.missing, ['2026-10-02'])
})

test('findMissingDates: tanggal SEBELUM import pertama bukan lubang (tenant baru tak diisi mundur)', async () => {
  const fresh = fakeImports({ [ASTERIX]: cur(['2026-10-02', '2026-10-04']) })
  const r = await findMissingDates(fresh, { workspaceId: ASTERIX, latestDate: LATEST, days: 7 })
  assert.equal(r.firstHistoryDate, '2026-10-02')
  assert.deepEqual(r.missing, ['2026-10-03']) // 28 Sep–1 Okt: sebelum ada data → dibiarkan
  const empty = await findMissingDates(fakeImports({}), { workspaceId: ASTERIX, latestDate: LATEST, days: 7 })
  assert.deepEqual(empty.missing, [])
})

test('findMissingDates: galat kueri dilempar dengan pesan jelas', async () => {
  await assert.rejects(
    () => findMissingDates(fakeImports({}, { failWith: 'column is_current does not exist' }), { workspaceId: ASTERIX, latestDate: LATEST, days: 7 }),
    /baca gmvmax_imports gagal: column is_current does not exist/,
  )
})

test('fillOrder: kemarin dulu (masih boleh dipotret), sisanya dari yang TERTUA', () => {
  assert.deepEqual(fillOrder(['2026-10-03', '2026-09-29', LATEST, '2026-10-01'], LATEST), [LATEST, '2026-09-29', '2026-10-01', '2026-10-03'])
  assert.deepEqual(fillOrder(['2026-10-03', '2026-09-29'], LATEST), ['2026-09-29', '2026-10-03'])
  assert.deepEqual(fillOrder([], LATEST), [])
})

test('authUnusable: vonis auth definitif = jangan sentuh lagi; galat jaringan boleh dicoba', () => {
  assert.equal(authUnusable({ ok: false, status: 'TOKEN_FAILED', transient: false }), true) // invalid_grant
  assert.equal(authUnusable({ ok: false, status: 'TOKEN_FAILED' }), true)                   // tak dicap → anggap definitif
  assert.equal(authUnusable({ ok: false, status: 'AUTH_BLOCKING' }), true)
  assert.equal(authUnusable({ ok: false, status: 'TOKEN_FAILED', transient: true }), false)
  assert.equal(authUnusable({ ok: false, status: 'FAILED' }), false)
  assert.equal(authUnusable({ ok: true, status: 'SUCCESS' }), false)
  assert.equal(authUnusable(undefined), false)
})

test('runGapFill: hanya menarik tanggal yang bolong, workspace utuh tak disentuh', async () => {
  const sb = fakeImports({
    [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-10-03')),
    [DASFELIX]: cur(range('2026-07-01', LATEST)),
  })
  const h = harness()
  const out = await runGapFill(base(h, {
    sb, workspaces: [{ workspaceId: DASFELIX }, { workspaceId: ASTERIX }],
    mainResults: new Map([[DASFELIX, { ok: true, status: 'SUCCESS' }], [ASTERIX, { ok: true, status: 'SUCCESS' }]]),
  }))
  assert.deepEqual(h.processed, ['1028:2026-10-03'])
  assert.deepEqual(out.filled, [{ workspaceId: ASTERIX, date: '2026-10-03' }])
  assert.deepEqual([out.scanned, out.failed.length, out.deferred.length, out.skipped.length, out.scanFailed.length], [2, 0, 0, 0, 0])
  assert.equal(out.recovered.size, 0)
  assert.deepEqual(h.slept, [3000]) // jeda rate-limit sebelum tiap tarikan
  assert.deepEqual(h.logs.map(l => l.event), ['GAP_SCAN', 'GAP_SCAN', 'GAP_FILL_START', 'GAP_FILL_RESULT'])
  assert.deepEqual(h.logs[0].missing, [])
  assert.deepEqual(h.logs[1].missing, ['2026-10-03'])
})

test('runGapFill: beberapa lubang → urut dari yang tertua', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-10-03', '2026-09-29', '2026-10-01')) })
  const h = harness()
  const out = await runGapFill(base(h, { sb, workspaces: [{ workspaceId: ASTERIX }], mainResults: new Map([[ASTERIX, { ok: true }]]) }))
  assert.deepEqual(h.processed, ['1028:2026-09-29', '1028:2026-10-01', '1028:2026-10-03'])
  assert.equal(out.filled.length, 3)
})

test('runGapFill: run utama gagal karena JARINGAN → kemarin dicoba lagi dulu; berhasil = workspace pulih', async () => {
  // Persis 4 Okt 2026: Asterixsty TOKEN_FAILED `fetch failed`, jadi 3 Okt (kemarin saat itu) tak tertulis.
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), LATEST, '2026-09-30')) })
  const h = harness()
  const out = await runGapFill(base(h, {
    sb, workspaces: [{ workspaceId: ASTERIX }],
    mainResults: new Map([[ASTERIX, { ok: false, status: 'TOKEN_FAILED', transient: true }]]),
  }))
  assert.deepEqual(h.processed, [`1028:${LATEST}`, '1028:2026-09-30'])
  assert.deepEqual([...out.recovered], [ASTERIX])
  assert.equal(out.failed.length, 0)
})

test('runGapFill: refresh token DITOLAK server (definitif) → workspace dilewati, nol tarikan', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), LATEST, '2026-10-03')) })
  for (const main of [
    { ok: false, status: 'TOKEN_FAILED', transient: false },
    { ok: false, status: 'AUTH_BLOCKING' },
    { ok: false, status: 'LOCKED' },
  ]) {
    const h = harness()
    const out = await runGapFill(base(h, { sb, workspaces: [{ workspaceId: ASTERIX }], mainResults: new Map([[ASTERIX, main]]) }))
    assert.deepEqual(h.processed, [], main.status)
    assert.equal(out.skipped.length, 1)
    assert.equal(out.skipped[0].reason, main.status === 'LOCKED' ? 'LOCKED' : 'AUTH_NOT_USABLE')
    assert.equal(out.scanned, 0) // bahkan tak dipindai — tak ada yang bisa dikerjakan
    assert.equal(out.recovered.size, 0)
  }
})

test('runGapFill: pemutus arus — satu tanggal gagal → sisa tanggal workspace itu ditunda', async () => {
  const sb = fakeImports({
    [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-09-29', '2026-10-01', '2026-10-03')),
    [DASFELIX]: cur(without(range('2026-07-01', LATEST), '2026-10-02')),
  })
  const h = harness({ results: { '2026-09-29': { ok: false, status: 'FAILED', error: 'MCP_ERROR: 40001 No permission' } } })
  const out = await runGapFill(base(h, {
    sb, workspaces: [{ workspaceId: ASTERIX }, { workspaceId: DASFELIX }],
    mainResults: new Map([[ASTERIX, { ok: true }], [DASFELIX, { ok: true }]]),
  }))
  assert.deepEqual(h.processed, ['1028:2026-09-29', 'c420:2026-10-02']) // workspace lain tetap dikerjakan (isolasi)
  assert.deepEqual(out.failed, [{ workspaceId: ASTERIX, date: '2026-09-29', error: 'MCP_ERROR: 40001 No permission' }])
  assert.deepEqual(out.deferred.map(d => `${d.date}:${d.reason}`), ['2026-10-01:CIRCUIT_OPEN', '2026-10-03:CIRCUIT_OPEN'])
  assert.deepEqual(out.filled, [{ workspaceId: DASFELIX, date: '2026-10-02' }])
})

test('runGapFill: batas waktu habis → berhenti memulai tarikan baru, sisanya ditunda (bukan gagal)', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-09-29', '2026-10-01', '2026-10-03')) })
  const h = harness()
  let t = 0
  const clock = () => t
  const processDate = async (a) => { t += 8 * 60 * 1000; return h.processDate(a) } // tiap tanggal 8 menit
  const out = await runGapFill(base(h, { sb, workspaces: [{ workspaceId: ASTERIX }], mainResults: new Map([[ASTERIX, { ok: true }]]), clock, processDate, budgetMs: DEFAULT_GAP_FILL_BUDGET_MS }))
  assert.deepEqual(h.processed, ['1028:2026-09-29', '1028:2026-10-01']) // mulai di menit 0 & 8; menit 16 ≥ 15 → stop
  assert.deepEqual(out.deferred, [{ workspaceId: ASTERIX, date: '2026-10-03', reason: 'TIME_BUDGET' }])
  assert.equal(out.failed.length, 0)
})

test('runGapFill: dry-run hanya melaporkan rencana — nol tarikan, dan kemarin tak dihitung lubang', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), LATEST, '2026-10-03')) })
  const h = harness()
  const out = await runGapFill(base(h, { sb, dryRun: true, workspaces: [{ workspaceId: ASTERIX }], mainResults: new Map([[ASTERIX, { ok: true }]]) }))
  assert.deepEqual(h.processed, [])
  assert.deepEqual(out.planned, [{ workspaceId: ASTERIX, date: '2026-10-03' }])
  assert.equal(out.filled.length, 0)
  assert.deepEqual(h.logs.map(l => l.event), ['GAP_SCAN'])
  assert.equal(h.logs[0].dry_run, true)
})

test('runGapFill: pindaian gagal → dicatat, tak melempar, workspace lain lanjut', async () => {
  const good = fakeImports({ [DASFELIX]: cur(without(range('2026-07-01', LATEST), '2026-10-02')) })
  const sb = { from: (t) => {
    const api = good.from(t)
    const eq = api.eq
    api.eq = (c, v) => { if (c === 'workspace_id' && v === ASTERIX) api.then = (res) => Promise.resolve({ data: null, error: { message: 'TypeError: fetch failed' } }).then(res); return eq(c, v) }
    return api
  } }
  const h = harness()
  const out = await runGapFill(base(h, { sb, workspaces: [{ workspaceId: ASTERIX }, { workspaceId: DASFELIX }], mainResults: new Map() }))
  assert.deepEqual(out.scanFailed, [{ workspaceId: ASTERIX, error: 'baca gmvmax_imports gagal: TypeError: fetch failed' }])
  assert.deepEqual(h.processed, ['c420:2026-10-02'])
  assert.equal(h.logs[0].event, 'GAP_SCAN_FAILED')
})

test('runGapFill: tak ada advertiser aktif pada tanggal itu → tanggal dilewati, berikutnya lanjut', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-09-29', '2026-10-03')) })
  const h = harness({ entries: (_ws, date) => (date === '2026-09-29' ? null : [{ advertiserId: 'A1', storeId: 'S1' }]) })
  const out = await runGapFill(base(h, { sb, workspaces: [{ workspaceId: ASTERIX }], mainResults: new Map([[ASTERIX, { ok: true }]]) }))
  assert.deepEqual(h.processed, ['1028:2026-10-03'])
  assert.deepEqual(out.skipped, [{ workspaceId: ASTERIX, date: '2026-09-29', reason: 'NO_ACTIVE_ADVERTISER' }])
})

test('runGapFill: pemroses melempar (tak seharusnya) → dicatat gagal, tak menjatuhkan run', async () => {
  const sb = fakeImports({ [ASTERIX]: cur(without(range('2026-07-01', LATEST), '2026-10-03')) })
  const h = harness()
  const out = await runGapFill(base(h, { sb, workspaces: [{ workspaceId: ASTERIX }], mainResults: new Map([[ASTERIX, { ok: true }]]), processDate: async () => { throw new Error('meledak') } }))
  assert.deepEqual(out.failed, [{ workspaceId: ASTERIX, date: '2026-10-03', error: 'meledak' }])
})
