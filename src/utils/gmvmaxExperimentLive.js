// Vonis LIVE eksperimen dari checkpoint tersimpan + roiFloor terkini (server
// sinkron tiap eval harian). Diekstrak dari ExperimentPanel supaya drawer detail
// bisa memakai fungsi yang sama tanpa import melingkar.
// baseline_disclosed dibaca dari penanda baseline_state; baris lama (ditulis
// sebelum penanda itu ada) direkonstruksi dari adanya delta-vs-baseline.
// PENTING: "ada baseline tapi tak sebanding" TIDAK sama dengan "tak ada baseline"
// — deltanya memang sengaja null, dan itu bukan alasan memvonis DATA_INSUFFICIENT.
import { classifyOutcome } from '../gmvmax/skills/experimentClassify.mjs'

export function liveConclusion(exp, roiFloor) {
  const checkpoints = Array.isArray(exp.checkpoints) ? exp.checkpoints : []
  const state = checkpoints.find(c => c.baseline_state)?.baseline_state
  const disclosed = state ? state !== 'ABSENT' : checkpoints.some(c => c.roi_delta_vs_baseline != null)
  const computed = { baseline: disclosed ? {} : null, baseline_disclosed: disclosed, checkpoints }
  const ruleConfig = roiFloor != null ? { roiFloor } : {}
  return classifyOutcome({ computed, ruleConfig, status: exp.status })
}
