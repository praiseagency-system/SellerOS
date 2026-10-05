import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateExperiments } from './experimentEval.mjs'
import { checkpointsFormat, windowOf } from './skills/experimentWindows.mjs'

// Klien Supabase tiruan: cukup untuk rantai yang dipakai evaluator.
function fakeSb(tables) {
  const writes = []
  const from = (table) => {
    const st = { filters: [], patch: null, range: null, single: false }
    const exec = () => {
      let rows = (tables[table] || []).filter(r => st.filters.every(f => f(r)))
      if (st.patch) { writes.push({ table, ids: rows.map(r => r.id), patch: st.patch }); rows.forEach(r => Object.assign(r, st.patch)); return { data: null, error: null } }
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      return { data: st.single ? (rows[0] || null) : rows, error: null }
    }
    const api = {
      select: () => api, order: () => api,
      eq: (c, v) => { st.filters.push(r => r[c] === v); return api },
      gte: (c, v) => { st.filters.push(r => r[c] >= v); return api },
      lte: (c, v) => { st.filters.push(r => r[c] <= v); return api },
      range: (a, b) => { st.range = [a, b]; return api },
      maybeSingle: () => { st.single = true; return api },
      update: (patch) => { st.patch = patch; return api },
      then: (res, rej) => Promise.resolve().then(exec).then(res, rej),
    }
    return api
  }
  return { from, writes }
}

const WS = 'ws1'
const NOW = Date.parse('2026-10-05T01:00:00Z')
const dayN = (n) => new Date(Date.parse('2026-09-19T00:00:00Z') + (n - 1) * 86400000).toISOString().slice(0, 10)
// Satu potret per hari (12 Sep–4 Okt); creatives: [hariKe, video, belanja, omzet, order]
function world({ exps, rows, settings = [{ workspace_id: WS, spend_floor: 50000, experiment_roi_floor: 4 }], skipDays = [] }) {
  const imports = [], creatives = []
  for (let n = -6; n <= 16; n++) {
    if (skipDays.includes(n)) continue
    imports.push({ id: `imp${n}`, workspace_id: WS, is_current: true, snapshot_date: dayN(n) })
  }
  let k = 0
  for (const [n, video_id, cost, gross_revenue, sku_orders] of rows) {
    creatives.push({ id: `c${String(k++).padStart(4, '0')}`, import_id: `imp${n}`, video_id, product_id: 'p1', campaign_id: 'cmp1', cost, gross_revenue, sku_orders })
  }
  return fakeSb({ gmvmax_settings: settings, gmvmax_experiments: exps, gmvmax_imports: imports, gmvmax_creatives: creatives })
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

test('CONCLUDED dihitung sampai jendelanya final; yang sudah final dan STOPPED tidak disentuh', async () => {
  const finalCps = [{ v: 2, kind: 'window', key: 'w3', complete: true }, { v: 2, kind: 'window', key: 'w7', complete: true }]
  const sb = world({
    exps: [exp({ id: 'tutup-lama', status: 'CONCLUDED' }), exp({ id: 'tutup-final', status: 'CONCLUDED', checkpoints: finalCps }), exp({ id: 'berhenti', status: 'STOPPED', conclusion: 'STOPPED' })],
    rows: strong(),
  })
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.deepEqual(sb.writes.map(w => w.ids[0]), ['tutup-lama'])
  assert.equal(r.updated, 1)
  assert.equal('status' in sb.writes[0].patch, false) // status tidak pernah diubah
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
  const sb = { from: () => { const a = { select: () => a, eq: () => a, maybeSingle: () => a, then: (res) => Promise.resolve({ data: null, error: { message: 'relation "gmvmax_experiments" does not exist' } }).then(res) }; return a } }
  const r = await evaluateExperiments({ sb, workspaceId: WS, now: NOW })
  assert.equal(r.absent, true)
})
