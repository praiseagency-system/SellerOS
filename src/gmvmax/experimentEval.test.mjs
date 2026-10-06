import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateExperiments } from './experimentEval.mjs'
import { checkpointsFormat, windowOf } from './skills/experimentWindows.mjs'

// Klien Supabase tiruan: cukup untuk rantai yang dipakai evaluator.
function fakeSb(tables, { failRead = null } = {}) {
  const writes = [], reads = {}
  const from = (table) => {
    const st = { filters: [], patch: null, range: null, single: false }
    const exec = () => {
      if (!st.patch) reads[table] = (reads[table] || 0) + 1
      if (!st.patch && failRead === table) return { data: null, error: { message: 'TypeError: fetch failed' } }
      let rows = (tables[table] || []).filter(r => st.filters.every(f => f(r)))
      if (st.patch) { writes.push({ table, ids: rows.map(r => r.id), patch: st.patch }); rows.forEach(r => Object.assign(r, st.patch)); return { data: null, error: null } }
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      return { data: st.single ? (rows[0] || null) : rows, error: null }
    }
    const api = {
      select: () => api, order: () => api,
      eq: (c, v) => { st.filters.push(r => r[c] === v); return api },
      in: (c, vs) => { st.filters.push(r => vs.includes(r[c])); return api },
      gte: (c, v) => { st.filters.push(r => r[c] >= v); return api },
      lte: (c, v) => { st.filters.push(r => r[c] <= v); return api },
      range: (a, b) => { st.range = [a, b]; return api },
      maybeSingle: () => { st.single = true; return api },
      update: (patch) => { st.patch = patch; return api },
      then: (res, rej) => Promise.resolve().then(exec).then(res, rej),
    }
    return api
  }
  return { from, writes, reads, tables }
}

const WS = 'ws1'
const NOW = Date.parse('2026-10-05T01:00:00Z')
const dayN = (n) => new Date(Date.parse('2026-09-19T00:00:00Z') + (n - 1) * 86400000).toISOString().slice(0, 10)
// Satu potret per hari (12 Sep–4 Okt); creatives: [hariKe, video, belanja, omzet, order]
function world({ exps, rows, settings = [{ workspace_id: WS, spend_floor: 50000, experiment_roi_floor: 4 }], skipDays = [], failRead = null }) {
  const imports = [], creatives = []
  for (let n = -6; n <= 16; n++) {
    if (skipDays.includes(n)) continue
    imports.push({ id: `imp${n}`, workspace_id: WS, is_current: true, snapshot_date: dayN(n) })
  }
  let k = 0
  for (const [n, video_id, cost, gross_revenue, sku_orders] of rows) {
    creatives.push({ id: `c${String(k++).padStart(4, '0')}`, import_id: `imp${n}`, video_id, product_id: 'p1', campaign_id: 'cmp1', cost, gross_revenue, sku_orders })
  }
  return fakeSb({ gmvmax_settings: settings, gmvmax_experiments: exps, gmvmax_imports: imports, gmvmax_creatives: creatives }, { failRead })
}
const exp = (o = {}) => ({ id: 'e1', workspace_id: WS, experiment_type: 'MANUAL_BOOST', creative_video_id: 'v1', product_id: null, campaign_id: null, start_at: '2026-09-19T07:05:00Z', baseline_start: '2026-09-12', baseline_end: '2026-09-18', status: 'RUNNING', contaminated: false, checkpoints: [{ label: 'H+1', date: '2026-09-20', roi: 10.6, spend: 33438 }], conclusion: 'WINNER_CANDIDATE', confidence: 'LOW', ...o })
const strong = (video = 'v1') => Array.from({ length: 7 }, (_, i) => [i + 1, video, 50000, 300000, 3])

test('RUNNING dihitung ulang jadi dua jendela (format v2) dan vonisnya ditulis', async () => {
  const sb = world({ exps: [exp()], rows: [...strong(), [3, 'lain', 99999, 0, 0]] })
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual([r.updated, r.failed.length, r.rule_version], [1, 0, 2])
  assert.equal(sb.writes.length, 1)
  const p = sb.writes[0].patch
  assert.equal(checkpointsFormat(p.checkpoints), 'v2')
  const w7 = windowOf(p.checkpoints, 'w7')
  assert.deepEqual([w7.from, w7.to, w7.spend, w7.revenue, w7.orders, w7.complete], ['2026-09-19', '2026-09-25', 350000, 2100000, 21, true]) // video lain tidak ikut
  assert.deepEqual([p.conclusion, p.confidence], ['SUSTAINABLE_WINNER', 'MEDIUM'])
  assert.deepEqual(r.changes[0].before, { format: 'legacy', conclusion: 'WINNER_CANDIDATE', confidence: 'LOW' })
})

test('dryRun: melaporkan sebelum → sesudah TANPA menulis', async () => {
  const sb = world({ exps: [exp()], rows: strong() })
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW, dryRun: true })
  assert.equal(sb.writes.length, 0)
  assert.equal(r.changes.length, 1)
  assert.equal(r.changes[0].after.conclusion, 'SUSTAINABLE_WINNER')
  assert.equal(r.changes[0].after.code, 'W7_WIN')
})

test('tercampur tidak lagi dipaksa "Data kurang": divonis tetapi dibatasi', async () => {
  const sb = world({ exps: [exp({ contaminated: true })], rows: strong() })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual([sb.writes[0].patch.conclusion, sb.writes[0].patch.confidence], ['WINNER_CANDIDATE', 'LOW'])
})

test('satu baris gagal tidak menghentikan baris lain', async () => {
  const sb = world({ exps: [exp({ id: 'rusak', start_at: 'bukan tanggal', baseline_start: null }), exp({ id: 'baik' })], rows: strong() })
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual([r.updated, r.failed.map(f => f.id)], [1, ['rusak']])
  assert.deepEqual(sb.writes.map(w => w.ids), [['baik']])
})

test('STOPPED tidak disentuh; status tidak pernah diubah', async () => {
  const sb = world({ exps: [exp({ id: 'tutup-lama', status: 'CONCLUDED' }), exp({ id: 'berhenti', status: 'STOPPED', conclusion: 'STOPPED' })], rows: strong() })
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual(sb.writes.map(w => w.ids[0]), ['tutup-lama'])
  assert.equal(r.updated, 1)
  assert.equal('status' in sb.writes[0].patch, false)
})

test('jendela beku: tanpa bacaan deret dan tanpa tulisan — kecuali ambang berubah', async () => {
  const sb = world({ exps: [exp(), exp({ id: 'tutup', status: 'CONCLUDED' })], rows: strong() })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.equal(sb.writes.length, 2)
  const before = { w: sb.writes.length, c: sb.reads.gmvmax_creatives, i: sb.reads.gmvmax_imports }
  const r2 = await evaluateExperiments({ sb, workspaceId: WS, now: NOW + 86400000 })
  assert.deepEqual([r2.updated, r2.unchanged, r2.changes.length], [0, 2, 0])
  assert.deepEqual([sb.writes.length, sb.reads.gmvmax_creatives, sb.reads.gmvmax_imports], [before.w, before.c, before.i])
  // Pemilik menaikkan ambang 4x → 8x: vonis tersimpan ikut berubah, tetap tanpa bacaan deret.
  sb.tables.gmvmax_settings[0].experiment_roi_floor = 8
  const r3 = await evaluateExperiments({ sb, workspaceId: WS, now: NOW + 2 * 86400000 })
  assert.equal(r3.updated, 2)
  assert.equal(sb.reads.gmvmax_creatives, before.c)
  const p = sb.writes[sb.writes.length - 1].patch
  assert.equal(p.conclusion, 'WEAK')
  assert.deepEqual(windowOf(p.checkpoints, 'w7').cfg, { roi_floor: 8, spend_floor: 50000 })
  assert.equal(windowOf(p.checkpoints, 'w7').spend, 350000) // isi jendela tidak berubah
})

test('hari bolong yang ditambal belakangan tetap terserap, juga pada baris yang sudah ditutup', async () => {
  const rows = strong()
  const sb = world({ exps: [exp({ status: 'CONCLUDED' })], rows: rows.filter(r => r[0] < 5), skipDays: [5, 6, 7] })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  let w7 = windowOf(sb.writes[0].patch.checkpoints, 'w7')
  assert.deepEqual([w7.counted, w7.missing, w7.complete], [4, 3, true])
  for (const n of [5, 6, 7]) {
    sb.tables.gmvmax_imports.push({ id: `imp${n}`, workspace_id: WS, is_current: true, snapshot_date: dayN(n) })
    sb.tables.gmvmax_creatives.push({ id: `t${n}`, import_id: `imp${n}`, video_id: 'v1', product_id: 'p1', campaign_id: 'cmp1', cost: 50000, gross_revenue: 300000, sku_orders: 3 })
  }
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW + 86400000 })
  w7 = windowOf(sb.writes[sb.writes.length - 1].patch.checkpoints, 'w7')
  assert.deepEqual([w7.counted, w7.missing, w7.spend], [7, 0, 350000])
})

test('hari bolong yang lewat masa tenggang: jendela dibekukan apa adanya', async () => {
  const sb = world({ exps: [exp()], rows: strong().filter(r => r[0] < 5), skipDays: [5, 6, 7] })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  const c = sb.reads.gmvmax_creatives
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: Date.parse('2026-10-20T01:00:00Z') })
  assert.deepEqual([r.updated, r.unchanged, sb.reads.gmvmax_creatives], [0, 1, c])
  // force: hitung ulang penuh walau beku.
  const rf = await evaluateExperiments({ sb, workspaceId: WS, now: Date.parse('2026-10-20T01:00:00Z'), force: true })
  assert.equal(rf.updated, 1)
  assert.ok(sb.reads.gmvmax_creatives > c)
})

test('galat membaca setelan: evaluasi gagal, TIDAK ADA vonis yang ditulis dengan ambang kosong', async () => {
  const sb = world({ exps: [exp()], rows: strong(), failRead: 'gmvmax_settings' })
  await assert.rejects(() => evaluateExperiments({ sb, workspaceId: WS, now: NOW }), (e) => /fetch failed/.test(e.message))
  assert.equal(sb.writes.length, 0)
})

test('lebih dari 1000 eksperimen: semuanya terbaca (berhalaman) dan potret dibaca sekali', async () => {
  const exps = Array.from({ length: 1200 }, (_, i) => exp({ id: `e${String(i).padStart(4, '0')}`, experiment_type: 'OTHER_APPROVED' }))
  const sb = world({ exps, rows: strong() })
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual([r.updated, r.failed.length], [1200, 0])
  assert.ok(sb.reads.gmvmax_creatives <= 23, `potret dibaca ${sb.reads.gmvmax_creatives}×`) // 23 potret di dunia tiruan
})

test('tulisan selalu dibatasi workspace', async () => {
  const sb = world({ exps: [exp(), exp({ id: 'asing', workspace_id: 'ws-lain' })], rows: strong() })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual(sb.writes.map(w => w.ids), [['e1']])
})

test('tanpa baris setelan: lantai belanja bawaan Rp50.000 tetap berlaku, ambang kosong → belum konklusif', async () => {
  const sb = world({ exps: [exp()], rows: strong(), settings: [] })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.equal(sb.writes[0].patch.conclusion, 'INCONCLUSIVE')
  assert.deepEqual(windowOf(sb.writes[0].patch.checkpoints, 'w7').cfg, { roi_floor: null, spend_floor: 50000 })
})

test('hari yang datanya tidak masuk tercatat hilang, bukan nol', async () => {
  const sb = world({ exps: [exp()], rows: strong().filter(r => ![3, 4].includes(r[0])), skipDays: [3, 4] })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  const w7 = windowOf(sb.writes[0].patch.checkpoints, 'w7')
  assert.deepEqual([w7.counted, w7.missing, w7.pending], [5, 2, 0])
})

test('boost lain pada video yang sama di dalam jendela ikut disimpan dan membatasi vonis', async () => {
  const sb = world({ exps: [exp(), exp({ id: 'e2', start_at: '2026-09-23T03:00:00Z' })], rows: strong() })
  await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  const first = sb.writes.find(w => w.ids[0] === 'e1').patch
  assert.equal(windowOf(first.checkpoints, 'w7').overlap_day, 5)
  assert.equal(first.conclusion, 'WINNER_CANDIDATE')
})

test('tabel belum ada → absent, tanpa galat', async () => {
  const sb = { from: () => { const a = { select: () => a, eq: () => a, order: () => a, range: () => a, maybeSingle: () => a, then: (res) => Promise.resolve({ data: null, error: { message: 'relation "gmvmax_experiments" does not exist' } }).then(res) }; return a } }
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.equal(r.absent, true)
})
