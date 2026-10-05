// VPS-SIDE (#3b-server) — nilai eksperimen dari time-series kanonik (is_current
// per tanggal). Dipanggil vpsCommit setelah generate (NON-FATAL, flag
// GMVMAX_EVAL_EXPERIMENTS). Read-only kanonik + update HANYA tabel eksperimen
// (checkpoints/conclusion/confidence) — BUKAN kanonik, TIDAK panggil TikTok,
// tanpa eksekusi.
//
// ATURAN v2 (experimentWindows.mjs): vonis dari JENDELA KUMULATIF hari ke-1–3
// dan hari ke-1–7, bukan lagi dari tiga hari tunggal H+1/H+3/H+7. Kolom
// checkpoints kini berisi dua objek jendela (v: 2). Peramban menilai baris
// berformat lama dengan aturan lama sampai evaluator ini menulis ulang.
//
// ruleConfig.roiFloor = keputusan bisnis pemilik. Tanpa itu vonis tetap
// konservatif (tak mengarang winner/weak) — sengaja, jangan diisi dari sini.
import {
  RULE_VERSION, computeWindows, classifyWindows, resolveRuleConfig, actionDirection,
  overlapDayOf, checkpointsFormat, windowOf, dayOne,
} from './skills/experimentWindows.mjs'

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
      // Diurutkan: paginasi .range() tanpa urutan tetap bisa mengulang atau
      // melewatkan baris di antara halaman.
      const { data, error: e2 } = await sb.from('gmvmax_creatives')
        .select('cost,gross_revenue,sku_orders,video_id,product_id,campaign_id')
        .eq('import_id', imp.id).order('id', { ascending: true }).range(f, f + 999)
      if (e2) throw e2
      for (const r of data || []) if (match(r)) { cost += +r.cost || 0; revenue += +r.gross_revenue || 0; orders += +r.sku_orders || 0 }
      if (!data || data.length < 1000) break
    }
    series.push({ date: imp.snapshot_date, spend: cost, revenue, orders, roi: cost > 0 ? revenue / cost : null })
  }
  return series
}

// Setelan per-workspace lewat resolveRuleConfig — fungsi yang SAMA dengan
// peramban, supaya keduanya tak pernah beda bawaan (dulu: tanpa baris setelan,
// peramban memakai lantai Rp50.000 sedangkan server menganggap lantai tak ada).
async function loadRuleConfig(sb, workspaceId) {
  const { data } = await sb.from('gmvmax_settings')
    .select('spend_floor,experiment_roi_floor')
    .eq('workspace_id', workspaceId).maybeSingle()
  return resolveRuleConfig(data || {})
}

// Jendela 7 hari sudah final (lengkap, berformat v2) → tak perlu dihitung lagi.
const isFinal = (exp) => checkpointsFormat(exp.checkpoints) === 'v2' && windowOf(exp.checkpoints, 'w7')?.complete === true

// Evaluasi satu workspace. Status TIDAK diubah (owner yang menutup). Idempoten.
//   • RUNNING selalu dihitung.
//   • CONCLUDED dihitung sampai jendela 7 harinya lengkap: tombol Tutup bisa
//     ditekan sebelum data hari ke-7 masuk, dan tanpa ini jendelanya membeku
//     dalam keadaan belum lengkap selamanya.
//   • STOPPED (ditutup tanpa vonis) tidak disentuh.
// dryRun: hitung dan laporkan `changes`, TANPA menulis apa pun.
// Satu baris yang gagal tidak menghentikan baris lain (masuk `failed`).
export async function evaluateExperiments({ sb, workspaceId, ruleConfig, dryRun = false, now = Date.now() }) {
  ruleConfig = resolveRuleConfig(ruleConfig || await loadRuleConfig(sb, workspaceId))
  const { data: all, error } = await sb.from('gmvmax_experiments')
    .select('*').eq('workspace_id', workspaceId)
  if (error) { if (/relation .* does not exist|find the table/i.test(error.message || '')) return { updated: 0, absent: true, failed: [], changes: [], rule_version: RULE_VERSION }; throw error }
  const due = (all || []).filter(e => e.status === 'RUNNING' || (e.status === 'CONCLUDED' && !isFinal(e)))
  const today = new Date(now).toISOString().slice(0, 10)
  const changes = [], failed = []
  let updated = 0
  for (const exp of due) {
    try {
      const day1 = dayOne(exp)
      if (!day1) throw new Error('start_at tak terbaca')
      const from = exp.baseline_start && exp.baseline_start < day1 ? exp.baseline_start : day1
      const subject = { video_id: exp.creative_video_id, product_id: exp.product_id, campaign_id: exp.campaign_id }
      const series = await loadSeries(sb, { workspaceId, from, to: today, subject })
      const { windows } = computeWindows({ experiment: exp, series, ruleConfig })
      // Boost lain pada video yang sama di dalam jendela — ikut disimpan supaya
      // peramban membatasi vonis dengan cara yang sama tanpa query tambahan.
      const overlapDay = overlapDayOf(exp, all)
      if (overlapDay != null) windowOf(windows, 'w7').overlap_day = overlapDay
      // TERCAMPUR tidak lagi memaksa "Data kurang": pemilik memutuskan (5 Okt
      // 2026) eksperimen tercampur tetap divonis tetapi DIBATASI — pembatasnya
      // ada di classifyWindows, sama untuk server dan peramban.
      const outcome = classifyWindows({
        windows, ruleConfig, status: exp.status, contaminated: !!exp.contaminated,
        direction: actionDirection(exp), overlapDay,
      })
      changes.push({
        id: exp.id, experiment_type: exp.experiment_type, treatment: exp.treatment, start_at: exp.start_at,
        status: exp.status, contaminated: !!exp.contaminated,
        before: { format: checkpointsFormat(exp.checkpoints), conclusion: exp.conclusion ?? null, confidence: exp.confidence ?? null },
        after: { conclusion: outcome.conclusion, confidence: outcome.confidence, code: outcome.code, params: outcome.params },
        windows,
      })
      if (!dryRun) {
        const { error: ue } = await sb.from('gmvmax_experiments').update({
          checkpoints: windows,
          conclusion: outcome.conclusion, confidence: outcome.confidence,
          updated_at: new Date(now).toISOString(),
        }).eq('id', exp.id)
        if (ue) throw ue
      }
      updated++
    } catch (e) {
      failed.push({ id: exp.id, message: e?.message || String(e) })
    }
  }
  return { updated, failed, changes, rule_version: RULE_VERSION }
}
