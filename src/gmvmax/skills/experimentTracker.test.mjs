import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { computeCheckpoints, classifyOutcome, experimentSignature, OutcomeClass } from './experimentTracker.mjs'
import { MeasurementLabel as ML } from './contract.mjs'

const exp = (o = {}) => ({ workspace_id: 'ws', store_id: 'st', experiment_type: 'MANUAL_BOOST', creative_video_id: 'v1', start_at: '2026-07-12', baseline_start: '2026-07-10', baseline_end: '2026-07-11', ...o })
const series = () => [
  { date: '2026-07-10', roi: 4, revenue: 400, spend: 100 },
  { date: '2026-07-11', roi: 4, revenue: 400, spend: 100 },
  { date: '2026-07-13', roi: 8, revenue: 800, spend: 100 }, // H+1
  { date: '2026-07-15', roi: 7, revenue: 700, spend: 100 }, // H+3
  { date: '2026-07-19', roi: 7, revenue: 700, spend: 100 }, // H+7
]

test('computeCheckpoints: baseline + H+1/H+3/H+7 + delta', () => {
  const c = computeCheckpoints({ experiment: exp(), series: series() })
  assert.equal(c.baseline_disclosed, true)
  assert.equal(c.baseline.roi, 4)
  const h1 = c.checkpoints.find(x => x.label === 'H+1')
  assert.equal(h1.date, '2026-07-13'); assert.equal(h1.roi, 8); assert.equal(h1.roi_delta_vs_baseline, 4)
  assert.equal(c.checkpoints.find(x => x.label === 'H+7').date, '2026-07-19')
})

test('missing checkpoint tetap null/UNKNOWN (bukan 0)', () => {
  const c = computeCheckpoints({ experiment: exp(), series: series().filter(r => r.date !== '2026-07-15') })
  const h3 = c.checkpoints.find(x => x.label === 'H+3')
  assert.equal(h3.roi, null); assert.equal(h3.measurement_label, ML.UNKNOWN)
})

test('baseline hilang → disclosed false', () => {
  const c = computeCheckpoints({ experiment: exp({ baseline_start: null, baseline_end: null }), series: series() })
  assert.equal(c.baseline_disclosed, false); assert.equal(c.baseline, null)
})

test('classify tanpa config → INCONCLUSIVE (ambang TBD)', () => {
  const c = computeCheckpoints({ experiment: exp(), series: series() })
  const r = classifyOutcome({ computed: c })
  assert.equal(r.conclusion, OutcomeClass.INCONCLUSIVE)
  assert.ok(r.cited_checkpoints.length >= 1)
  assert.match(r.reasons[0], /TBD_BUSINESS_DECISION/)
})

test('classify baseline hilang → DATA_INSUFFICIENT', () => {
  const c = computeCheckpoints({ experiment: exp({ baseline_start: null }), series: series() })
  assert.equal(classifyOutcome({ computed: c }).conclusion, OutcomeClass.DATA_INSUFFICIENT)
})

test('SUSTAINABLE_WINNER dengan roiFloor (config test-only)', () => {
  const c = computeCheckpoints({ experiment: exp(), series: series() })
  const r = classifyOutcome({ computed: c, ruleConfig: { roiFloor: 6, winnerPersistence: 2 } })
  assert.equal(r.conclusion, OutcomeClass.SUSTAINABLE_WINNER)
})

test('WEAK bila semua di bawah floor', () => {
  const c = computeCheckpoints({ experiment: exp(), series: series() })
  assert.equal(classifyOutcome({ computed: c, ruleConfig: { roiFloor: 10 } }).conclusion, OutcomeClass.WEAK)
})

test('TEMPORARY_SPIKE: kuat H+1 lalu jatuh', () => {
  const spikeSeries = [
    { date: '2026-07-10', roi: 4, revenue: 400 }, { date: '2026-07-11', roi: 4, revenue: 400 },
    { date: '2026-07-13', roi: 10, revenue: 1000 }, // H+1 kuat
    { date: '2026-07-15', roi: 3, revenue: 300 }, { date: '2026-07-19', roi: 3, revenue: 300 },
  ]
  const c = computeCheckpoints({ experiment: exp(), series: spikeSeries })
  const r = classifyOutcome({ computed: c, ruleConfig: { roiFloor: 6, spikeDropPct: 0.5 } })
  assert.equal(r.conclusion, OutcomeClass.TEMPORARY_SPIKE)
})

test('tak ada winner dari views saja (tanpa ROI → DATA_INSUFFICIENT)', () => {
  const viewsOnly = [{ date: '2026-07-10', roi: 4, revenue: 400 }, { date: '2026-07-13', impressions: 9999 }]
  const c = computeCheckpoints({ experiment: exp(), series: viewsOnly })
  assert.equal(classifyOutcome({ computed: c, ruleConfig: { roiFloor: 6 } }).conclusion, OutcomeClass.DATA_INSUFFICIENT)
})

test('STOPPED dihormati', () => {
  const c = computeCheckpoints({ experiment: exp(), series: series() })
  assert.equal(classifyOutcome({ computed: c, status: 'STOPPED' }).conclusion, OutcomeClass.STOPPED)
})

test('signature deterministik + berubah pada identitas', () => {
  assert.equal(experimentSignature(exp()), experimentSignature(exp()))
  assert.notEqual(experimentSignature(exp()), experimentSignature(exp({ creative_video_id: 'v2' })))
})

// ── migrasi 0031 (PREPARED) ───────────────────────────────────────────────────
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/0031_gmvmax_experiments.sql'), 'utf8')
test('0031 additive, RLS owner-scoped, CHECK enum, no secret, NOT APPLIED', () => {
  assert.match(sql, /create table if not exists public\.gmvmax_experiments/i)
  assert.doesNotMatch(sql, /drop table/i)
  assert.match(sql, /experiment_type[\s\S]*check[\s\S]*NEW_CREATIVE_TEST/i)
  assert.match(sql, /conclusion[\s\S]*SUSTAINABLE_WINNER/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /owner_all[\s\S]*w\.user_id = auth\.uid\(\)/i)
  assert.match(sql, /grant all on public\.gmvmax_experiments to service_role/i)
  assert.doesNotMatch(sql, /to anon/i)
  assert.doesNotMatch(sql, /\b(access_token|refresh_token|client_secret|service_role_key)\b/i)
  assert.match(sql, /NOT APPLIED/i)
})
