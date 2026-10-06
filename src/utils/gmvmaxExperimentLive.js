// Vonis LIVE eksperimen dari titik ukur tersimpan + setelan terkini (server
// menyamakan tiap evaluasi harian). Dipakai daftar, drawer, dan panel sesi.
//
// DUA FORMAT hidup berdampingan selama transisi:
//   v2     — dua jendela kumulatif (hari ke-1–3, ke-1–7) → aturan baru
//            (experimentWindows.mjs). Ditulis bundel VPS baru.
//   legacy — tiga titik ukur satu hari (H+1/H+3/H+7) → aturan LAMA apa adanya.
//            Masih ditulis bundel VPS lama; hilang sendiri begitu server diganti.
//   empty  — belum pernah dihitung (baru dicatat) → "belum konklusif", BUKAN
//            "data kurang": tak ada yang kurang, evaluatornya saja belum jalan.
//   unknown— versi lain/campuran → jangan menghitung sendiri; pakai vonis DB.
//
// cfg: { roiFloor, spendFloor } (thresholds peramban) — atau angka roiFloor saja
// dari pemanggil lama. Lantai belanja SELALU ada (bawaan Rp50.000).
import { classifyOutcome } from '../gmvmax/skills/experimentClassify.mjs'
import {
  classifyWindows, checkpointsFormat, resolveRuleConfig, actionDirection, windowOf, isContaminated,
} from '../gmvmax/skills/experimentWindows.mjs'

export { checkpointsFormat }

export function liveConclusion(exp, cfg) {
  const ruleConfig = resolveRuleConfig(cfg != null && typeof cfg === 'object' ? cfg : { roiFloor: cfg })
  const checkpoints = Array.isArray(exp.checkpoints) ? exp.checkpoints : []
  const format = checkpointsFormat(checkpoints)

  if (format === 'v2') {
    return {
      format, ...classifyWindows({
        windows: checkpoints, ruleConfig, status: exp.status, contaminated: isContaminated(exp),
        direction: actionDirection(exp), overlapDay: windowOf(checkpoints, 'w7')?.overlap_day ?? null,
      }),
    }
  }
  if (format === 'unknown') {
    return { format, conclusion: exp.conclusion || 'INCONCLUSIVE', confidence: exp.confidence || 'LOW', code: 'UNKNOWN_FORMAT', params: {}, provisional: false }
  }
  // Baris yang ditutup pun masih dihitung evaluator sampai jendelanya lengkap.
  if (format === 'empty' && exp.status !== 'STOPPED') {
    return { format, conclusion: 'INCONCLUSIVE', confidence: 'LOW', code: 'NOT_EVALUATED', params: {}, provisional: true }
  }
  // Aturan lama, tak diubah. baseline_disclosed dibaca dari penanda
  // baseline_state; baris yang lebih lama lagi direkonstruksi dari adanya delta.
  // "Ada baseline tapi tak sebanding" TIDAK sama dengan "tak ada baseline".
  const state = checkpoints.find(c => c.baseline_state)?.baseline_state
  const disclosed = state ? state !== 'ABSENT' : checkpoints.some(c => c.roi_delta_vs_baseline != null)
  const computed = { baseline: disclosed ? {} : null, baseline_disclosed: disclosed, checkpoints }
  const legacyCfg = ruleConfig.roiFloor != null ? { roiFloor: ruleConfig.roiFloor } : {}
  return { format, ...classifyOutcome({ computed, ruleConfig: legacyCfg, status: exp.status }) }
}
