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
export const OutcomeClass = Object.freeze({
  SUSTAINABLE_WINNER: 'SUSTAINABLE_WINNER', WINNER_CANDIDATE: 'WINNER_CANDIDATE',
  TEMPORARY_SPIKE: 'TEMPORARY_SPIKE', INCONCLUSIVE: 'INCONCLUSIVE', WEAK: 'WEAK',
  STOPPED: 'STOPPED', DATA_INSUFFICIENT: 'DATA_INSUFFICIENT',
})
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

// Klasifikasi konservatif. ruleConfig (opsional, TEST-ONLY sampai disetujui):
//   { roiFloor, winnerPersistence (jumlah checkpoint ≥ floor utk sustainable),
//     spikeDropPct } — dari keputusan bisnis Skill 7 (TBD). Tanpa config → tak
//   menyimpulkan winner/weak (INCONCLUSIVE). "Winner dari views saja" mustahil:
//   hanya checkpoint ber-ROI terukur yang dihitung.
export function classifyOutcome({ computed, ruleConfig = {}, status = 'RUNNING' }) {
  const { baseline, baseline_disclosed, checkpoints } = computed
  const cited = checkpoints.filter(c => c.measurement_label === ML.MEASURED).map(c => c.label)
  const measured = checkpoints.filter(c => c.roi != null)

  if (status === 'STOPPED') return { conclusion: OutcomeClass.STOPPED, confidence: 'MEDIUM', reasons: ['eksperimen dihentikan'], cited_checkpoints: cited }
  if (!baseline_disclosed || !baseline) return { conclusion: OutcomeClass.DATA_INSUFFICIENT, confidence: 'DATA_INSUFFICIENT', reasons: ['baseline tak dinyatakan / tak ada data baseline'], cited_checkpoints: cited }
  if (measured.length === 0) return { conclusion: OutcomeClass.DATA_INSUFFICIENT, confidence: 'DATA_INSUFFICIENT', reasons: ['tak ada checkpoint ROI terukur'], cited_checkpoints: cited }

  // Tanpa ambang bisnis yang disetujui → tak menyimpulkan winner/weak.
  if (!isNum(ruleConfig.roiFloor)) {
    return { conclusion: OutcomeClass.INCONCLUSIVE, confidence: 'LOW',
      reasons: ['delta terukur, tetapi ambang winner/weak (roiFloor/persistence/spike) = TBD_BUSINESS_DECISION'],
      cited_checkpoints: cited }
  }

  const at = (label) => checkpoints.find(c => c.label === label && c.roi != null)
  const h1 = at('H+1'), h3 = at('H+3'), h7 = at('H+7')
  const floor = ruleConfig.roiFloor
  const persist = Number.isInteger(ruleConfig.winnerPersistence) ? ruleConfig.winnerPersistence : 2
  const overFloor = measured.filter(c => c.roi >= floor).length

  // TEMPORARY_SPIKE: kuat di H+1 lalu jatuh ≥ spikeDropPct di checkpoint kemudian.
  if (isNum(ruleConfig.spikeDropPct) && h1 && h1.roi >= floor) {
    const later = [h3, h7].filter(Boolean)
    if (later.length && later.every(c => c.roi <= h1.roi * (1 - ruleConfig.spikeDropPct)))
      return { conclusion: OutcomeClass.TEMPORARY_SPIKE, confidence: 'MEDIUM', reasons: [`ROI kuat H+1 lalu turun ≥ ${ruleConfig.spikeDropPct * 100}%`], cited_checkpoints: cited }
  }
  // SUSTAINABLE_WINNER: bertahan ≥ floor pada H+3 & H+7 (persistensi terpenuhi).
  if (h3 && h7 && h3.roi >= floor && h7.roi >= floor && overFloor >= persist)
    return { conclusion: OutcomeClass.SUSTAINABLE_WINNER, confidence: 'MEDIUM', reasons: [`ROI ≥ ${floor} bertahan pada ${overFloor} checkpoint`], cited_checkpoints: cited }
  // WINNER_CANDIDATE: sempat ≥ floor tapi belum cukup persisten.
  if (overFloor >= 1)
    return { conclusion: OutcomeClass.WINNER_CANDIDATE, confidence: 'LOW', reasons: [`ROI ≥ ${floor} pada ${overFloor} checkpoint, persistensi belum cukup`], cited_checkpoints: cited }
  // WEAK: semua di bawah floor.
  return { conclusion: OutcomeClass.WEAK, confidence: 'MEDIUM', reasons: [`semua checkpoint ROI < ${floor}`], cited_checkpoints: cited }
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
