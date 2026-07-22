// VPS-SIDE (#3b-server) — hitung checkpoint H+1/H+3/H+7 eksperimen RUNNING dari
// time-series kanonik (is_current per tanggal), lalu klasifikasi outcome. Dipanggil
// vpsCommit setelah generate (NON-FATAL, flag GMVMAX_EVAL_EXPERIMENTS). Read-only
// kanonik + update HANYA tabel eksperimen (checkpoints/conclusion/confidence) —
// BUKAN kanonik, TIDAK panggil TikTok, tanpa eksekusi.
//
// ruleConfig.roiFloor = keputusan bisnis (TBD). Tanpa itu classifyOutcome tetap
// konservatif (tak mengarang winner/weak) — sengaja, jangan isi TBD.
import { computeCheckpoints, classifyOutcome } from './skills/experimentTracker.mjs'

// Series harian utk SUBJEK eksperimen: video_id → product_id → campaign_id → toko.
async function loadSeries(sb, { workspaceId, from, to, subject }) {
  const { data: imps, error } = await sb.from('gmvmax_imports')
    .select('id,snapshot_date').eq('workspace_id', workspaceId).eq('is_current', true)
    .gte('snapshot_date', from).lte('snapshot_date', to).order('snapshot_date', { ascending: true })
  if (error) throw error
  const match = (r) => {
    if (subject.video_id) return r.video_id === subject.video_id
    if (subject.product_id) return r.product_id === subject.product_id
    if (subject.campaign_id) return r.campaign_id === subject.campaign_id
    return true // subjek level-toko
  }
  const series = []
  for (const imp of imps || []) {
    let cost = 0, revenue = 0, orders = 0
    for (let f = 0; ; f += 1000) {
      const { data, error: e2 } = await sb.from('gmvmax_creatives')
        .select('cost,gross_revenue,sku_orders,video_id,product_id,campaign_id')
        .eq('import_id', imp.id).range(f, f + 999)
      if (e2) throw e2
      for (const r of data) if (match(r)) { cost += +r.cost || 0; revenue += +r.gross_revenue || 0; orders += +r.sku_orders || 0 }
      if (!data || data.length < 1000) break
    }
    series.push({ date: imp.snapshot_date, spend: cost, revenue, orders, roi: cost > 0 ? revenue / cost : null })
  }
  return series
}

// ruleConfig per-workspace: roiFloor dari gmvmax_settings (owner set via menu).
// null/absent → classifyOutcome tetap konservatif (jangan isi TBD).
async function loadRuleConfig(sb, workspaceId) {
  const { data } = await sb.from('gmvmax_settings')
    .select('experiment_roi_floor').eq('workspace_id', workspaceId).maybeSingle()
  const rf = data?.experiment_roi_floor
  return rf != null && Number.isFinite(Number(rf)) ? { roiFloor: Number(rf) } : {}
}

// Evaluasi semua eksperimen RUNNING satu workspace. Update checkpoints + conclusion
// (status TETAP RUNNING — tak auto-menyimpulkan; owner yang menutup). Idempoten.
export async function evaluateExperiments({ sb, workspaceId, ruleConfig }) {
  if (!ruleConfig) ruleConfig = await loadRuleConfig(sb, workspaceId)
  const { data: exps, error } = await sb.from('gmvmax_experiments')
    .select('*').eq('workspace_id', workspaceId).eq('status', 'RUNNING')
  if (error) { if (/relation .* does not exist|find the table/i.test(error.message || '')) return { updated: 0, absent: true }; throw error }
  const today = new Date().toISOString().slice(0, 10)
  let updated = 0
  for (const exp of exps || []) {
    const from = exp.baseline_start || String(exp.start_at).slice(0, 10)
    const subject = { video_id: exp.creative_video_id, product_id: exp.product_id, campaign_id: exp.campaign_id }
    const series = await loadSeries(sb, { workspaceId, from, to: today, subject })
    const computed = computeCheckpoints({ experiment: exp, series })
    const outcome = classifyOutcome({ computed, ruleConfig, status: exp.status })
    const { error: ue } = await sb.from('gmvmax_experiments').update({
      checkpoints: computed.checkpoints,
      conclusion: outcome.conclusion, confidence: outcome.confidence,
      updated_at: new Date().toISOString(),
    }).eq('id', exp.id)
    if (ue) throw ue
    updated++
  }
  return { updated }
}
