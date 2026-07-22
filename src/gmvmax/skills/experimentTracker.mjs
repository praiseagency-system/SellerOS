// GMV Max — CREATIVE EXPERIMENT TRACKER (Phase 4 / blueprint §16), PURE logic.
// Fondasi Skill 7 + outcome learning. Deterministik, null-aware, no DB/TikTok/LLM.
// Menghitung checkpoint H+1/H+3/H+7 vs baseline yang DINYATAKAN, lalu klasifikasi
// hasil SECARA KONSERVATIF: tanpa ambang bisnis yang disetujui (TBD) TAK boleh
// menyimpulkan winner/weak/spike — default INCONCLUSIVE / DATA_INSUFFICIENT.
// Aturan keselamatan (§16.5): baseline wajib dinyatakan (bila hilang → di-disclose),
// tak ada winner dari views saja (klasifikasi hanya pakai ROI/revenue terukur),
// setiap kesimpulan mengutip checkpoint.
import { createHash } from 'node:crypto'
import { MeasurementLabel as ML } from './contract.mjs'

export const ExperimentType = Object.freeze({
  NEW_CREATIVE_TEST: 'NEW_CREATIVE_TEST', ACCELERATE_TESTING: 'ACCELERATE_TESTING',
  MANUAL_BOOST: 'MANUAL_BOOST', CREATIVE_EXCLUSION: 'CREATIVE_EXCLUSION',
  CONTENT_ANGLE_TEST: 'CONTENT_ANGLE_TEST', AFFILIATE_TEST: 'AFFILIATE_TEST',
  PRODUCT_CREATIVE_TEST: 'PRODUCT_CREATIVE_TEST', LIVE_CREATIVE_TEST: 'LIVE_CREATIVE_TEST',
  OTHER_APPROVED: 'OTHER_APPROVED',
})
// classifyOutcome + OutcomeClass dipisah ke experimentClassify.mjs (bebas node
// deps) agar bisa dipakai browser juga; re-export supaya API modul ini tetap.
export { classifyOutcome, OutcomeClass } from './experimentClassify.mjs'
export const CHECKPOINT_OFFSETS = [1, 3, 7] // H+1, H+3, H+7

const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)
const addDays = (date, n) => { const d = new Date(Date.parse(date + 'T00:00:00Z')); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

// series: [{ date:'YYYY-MM-DD', spend, impressions, clicks, orders, revenue, roi }] untuk KREATIF ini.
// experiment: { start_at (ISO/date), baseline_start, baseline_end }.
export function computeCheckpoints({ experiment, series = [] }) {
  const byDate = new Map(series.map(r => [r.date, r]))
  const startDate = String(experiment.start_at).slice(0, 10)

  // Baseline: rata-rata harian metrik pada [baseline_start, baseline_end].
  let baseline = null, baselineDisclosed = false
  const bs = experiment.baseline_start, be = experiment.baseline_end
  if (bs && be) {
    const inRange = series.filter(r => r.date >= bs && r.date <= be)
    if (inRange.length) {
      baseline = {
        roi: avg(inRange.map(r => r.roi).filter(isNum)),
        revenue: avg(inRange.map(r => r.revenue).filter(isNum)),
        spend: avg(inRange.map(r => r.spend).filter(isNum)),
        days: inRange.length,
      }
      baselineDisclosed = true
    }
  }

  const checkpoints = CHECKPOINT_OFFSETS.map(off => {
    const date = addDays(startDate, off)
    const r = byDate.get(date) || null
    const roi = r && isNum(r.roi) ? r.roi : null
    const revenue = r && isNum(r.revenue) ? r.revenue : null
    const measured = roi != null || revenue != null
    return {
      label: `H+${off}`, date,
      roi, revenue, spend: r && isNum(r.spend) ? r.spend : null,
      measurement_label: measured ? ML.MEASURED : ML.UNKNOWN,
      roi_delta_vs_baseline: roi != null && baseline?.roi != null ? roi - baseline.roi : null,
      revenue_delta_vs_baseline: revenue != null && baseline?.revenue != null ? revenue - baseline.revenue : null,
    }
  })

  return { start_date: startDate, baseline, baseline_disclosed: baselineDisclosed, checkpoints }
}

// Signature deterministik eksperimen (identitas stabil, bukan narasi).
export function experimentSignature(experiment) {
  const stable = {
    workspace_id: experiment.workspace_id, store_id: experiment.store_id,
    experiment_type: experiment.experiment_type, creative_video_id: experiment.creative_video_id ?? null,
    product_id: experiment.product_id ?? null, campaign_id: experiment.campaign_id ?? null,
    start_at: String(experiment.start_at).slice(0, 10),
  }
  return 'sha256:' + createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}
