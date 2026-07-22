// Klasifikasi outcome eksperimen — BEBAS dependensi node (createHash dsb) sehingga
// aman dipakai di BROWSER (vonis instan saat roiFloor diubah) MAUPUN server (pipeline).
// experimentTracker.mjs RE-EXPORT dari sini → satu sumber kebenaran. Konservatif:
// tanpa ruleConfig.roiFloor (keputusan bisnis) → tak menyimpulkan winner/weak.
export const OutcomeClass = Object.freeze({
  SUSTAINABLE_WINNER: 'SUSTAINABLE_WINNER', WINNER_CANDIDATE: 'WINNER_CANDIDATE',
  TEMPORARY_SPIKE: 'TEMPORARY_SPIKE', INCONCLUSIVE: 'INCONCLUSIVE', WEAK: 'WEAK',
  STOPPED: 'STOPPED', DATA_INSUFFICIENT: 'DATA_INSUFFICIENT',
})
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)
const MEASURED = 'MEASURED'

// computed: { baseline, baseline_disclosed, checkpoints: [{label,roi,measurement_label,...}] }.
// ruleConfig: { roiFloor, winnerPersistence=2, spikeDropPct? } — roiFloor = keputusan bisnis.
export function classifyOutcome({ computed, ruleConfig = {}, status = 'RUNNING' }) {
  const { baseline, baseline_disclosed, checkpoints } = computed
  const cited = checkpoints.filter(c => c.measurement_label === MEASURED).map(c => c.label)
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
