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
  overlapDayOf, checkpointsFormat, windowOf, dayOne, wibDateOf, isContaminated,
} from './skills/experimentWindows.mjs'

const DAY_MS = 86400000
const addIso = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
// Hari bolong di dalam jendela masih ditunggu selama ini sebelum jendelanya
// dianggap beku (penambal otomatis bekerja mundur beberapa hari).
export const GRACE_DAYS = 14

// PostgREST memotong diam-diam di ±1000 baris → selalu berhalaman & berurutan.
async function pageAll(build) {
  const out = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build().range(f, f + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

// Deret harian SUBJEK eksperimen: video_id → product_id → campaign_id → toko.
// Potret (is_current per tanggal) dan baris tiap potret dibaca SEKALI per run,
// lalu dipakai bersama semua eksperimen — dulu tiap eksperimen memindai ulang
// seluruh potret dari baseline sampai hari ini.
function makeSeriesSource(sb, workspaceId) {
  const rowsByImport = new Map()
  let imports = null
  const rowsOf = async (importId) => {
    if (!rowsByImport.has(importId)) {
      rowsByImport.set(importId, await pageAll(() => sb.from('gmvmax_creatives')
        .select('cost,gross_revenue,sku_orders,video_id,product_id,campaign_id')
        .eq('import_id', importId).order('id', { ascending: true })))
    }
    return rowsByImport.get(importId)
  }
  return {
    // Dipanggil sekali dengan rentang terlebar yang dibutuhkan run ini.
    async init(from, to) {
      imports = await pageAll(() => sb.from('gmvmax_imports')
        .select('id,snapshot_date').eq('workspace_id', workspaceId).eq('is_current', true)
        .gte('snapshot_date', from).lte('snapshot_date', to)
        .order('snapshot_date', { ascending: true }).order('id', { ascending: true }))
      return imports.length ? imports[imports.length - 1].snapshot_date : null
    },
    async series(from, to, subject) {
      const match = (r) => {
        if (subject.video_id) return r.video_id === subject.video_id
        if (subject.product_id) return r.product_id === subject.product_id
        if (subject.campaign_id) return r.campaign_id === subject.campaign_id
        return true // subjek level-toko
      }
      // Satu entri per TANGGAL (bukan per potret): dua potret bertanggal sama dijumlah.
      const byDate = new Map()
      for (const imp of imports || []) {
        if (imp.snapshot_date < from || imp.snapshot_date > to) continue
        const cur = byDate.get(imp.snapshot_date) || { date: imp.snapshot_date, spend: 0, revenue: 0, orders: 0 }
        for (const r of await rowsOf(imp.id)) if (match(r)) { cur.spend += +r.cost || 0; cur.revenue += +r.gross_revenue || 0; cur.orders += +r.sku_orders || 0 }
        byDate.set(imp.snapshot_date, cur)
      }
      return [...byDate.values()].map(d => ({ ...d, roi: d.spend > 0 ? d.revenue / d.spend : null }))
    },
  }
}

// Setelan per-workspace lewat resolveRuleConfig — fungsi yang SAMA dengan
// peramban, supaya keduanya tak pernah beda bawaan (dulu: tanpa baris setelan,
// peramban memakai lantai Rp50.000 sedangkan server menganggap lantai tak ada).
// Galat baca DILEMPAR: lebih baik evaluasi pagi ini gagal daripada semua vonis
// ditulis ulang dengan "ambang kosong". Tidak ada baris ≠ galat → bawaan.
async function loadRuleConfig(sb, workspaceId) {
  const { data, error } = await sb.from('gmvmax_settings')
    .select('spend_floor,experiment_roi_floor')
    .eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw error
  return resolveRuleConfig(data || {})
}

// Jendela BEKU = isinya tak akan berubah lagi: format v2, hari ke-7 sudah
// lewat, dan tak ada hari bolong (atau bolongnya sudah lewat masa tenggang).
// Baris beku tidak membaca deret lagi — vonisnya cukup dinilai ulang dari
// jendela tersimpan (murah), supaya ambang yang diubah pemilik tetap sampai ke
// kolom conclusion yang dibaca asisten AI.
function frozenWindows(exp, today) {
  if (checkpointsFormat(exp.checkpoints) !== 'v2') return false
  const w3 = windowOf(exp.checkpoints, 'w3'), w7 = windowOf(exp.checkpoints, 'w7')
  if (!w7?.complete) return false
  if (!(w7.missing > 0) && !(w3?.missing > 0)) return true
  return addIso(w7.to, GRACE_DAYS) < today
}
const sameCfg = (a, b) => (a?.roi_floor ?? null) === (b?.roi_floor ?? null) && (a?.spend_floor ?? null) === (b?.spend_floor ?? null)

// Evaluasi satu workspace. Status TIDAK diubah (owner yang menutup). Idempoten.
//   • RUNNING dan CONCLUDED dihitung; STOPPED (ditutup tanpa vonis) tidak disentuh.
//     CONCLUDED ikut karena tombol Tutup bisa ditekan sebelum data hari ke-7
//     masuk — tanpa ini jendelanya membeku dalam keadaan belum lengkap.
//   • Jendela yang belum beku: deret dibaca, jendela & vonis ditulis.
//   • Jendela beku: tanpa bacaan deret; ditulis HANYA bila vonis / cap setelan /
//     penanda boost-lain berubah.
// dryRun: hitung dan laporkan `changes`, TANPA menulis apa pun.
// force : perlakukan semua baris sebagai belum beku (hitung ulang penuh).
// Satu baris yang gagal tidak menghentikan baris lain (masuk `failed`).
export async function evaluateExperiments({ sb, workspaceId, ruleConfig, dryRun = false, force = false, now = Date.now() }) {
  const none = (extra = {}) => ({ updated: 0, unchanged: 0, failed: [], changes: [], rule_version: RULE_VERSION, ...extra })
  let all
  try {
    all = await pageAll(() => sb.from('gmvmax_experiments')
      .select('*').eq('workspace_id', workspaceId).order('id', { ascending: true }))
  } catch (error) {
    if (/relation .* does not exist|find the table/i.test(error.message || '')) return none({ absent: true })
    throw error
  }
  const due = all.filter(e => e.status === 'RUNNING' || e.status === 'CONCLUDED')
  if (!due.length) return none()
  ruleConfig = resolveRuleConfig(ruleConfig || await loadRuleConfig(sb, workspaceId))
  const cfgStamp = { roi_floor: ruleConfig.roiFloor ?? null, spend_floor: ruleConfig.spendFloor ?? null }
  const stamp = new Date(now).toISOString()
  const today = wibDateOf(stamp) // data harian = hari WIB

  const plan = due.map((exp) => {
    const day1 = dayOne(exp)
    const frozen = !force && !!day1 && frozenWindows(exp, today)
    const from = day1 && exp.baseline_start && exp.baseline_start < day1 ? exp.baseline_start : day1
    return { exp, day1, frozen, from, to: day1 ? addIso(day1, 6) : null }
  })
  const live = plan.filter(p => !p.frozen && p.day1)
  const source = makeSeriesSource(sb, workspaceId)
  // Tanggal data terakhir = potret terbaru workspace, SATU untuk semua eksperimen.
  const lastDataDate = live.length
    ? await source.init(live.reduce((a, p) => (p.from < a ? p.from : a), live[0].from), today)
    : null

  const changes = [], failed = []
  let updated = 0, unchanged = 0
  for (const { exp, day1, frozen, from, to } of plan) {
    try {
      if (!day1) throw new Error('start_at tak terbaca')
      // Boost lain pada video yang sama di dalam jendela — ikut disimpan supaya
      // peramban membatasi vonis dengan cara yang sama tanpa query tambahan.
      const overlapDay = overlapDayOf(exp, all)
      let windows
      if (frozen) {
        windows = JSON.parse(JSON.stringify(exp.checkpoints))
      } else {
        const series = await source.series(from, to < today ? to : today, { video_id: exp.creative_video_id, product_id: exp.product_id, campaign_id: exp.campaign_id })
        windows = computeWindows({ experiment: exp, series, lastDataDate, ruleConfig }).windows
      }
      const w7 = windowOf(windows, 'w7')
      const old7 = windowOf(exp.checkpoints, 'w7')
      w7.cfg = cfgStamp
      if (overlapDay != null) w7.overlap_day = overlapDay; else delete w7.overlap_day
      // TERCAMPUR tidak lagi memaksa "Data kurang": pemilik memutuskan (5 Okt
      // 2026) eksperimen tercampur tetap divonis tetapi DIBATASI — pembatasnya
      // ada di classifyWindows, sama untuk server dan peramban.
      const outcome = classifyWindows({
        windows, ruleConfig, status: exp.status, contaminated: isContaminated(exp),
        direction: actionDirection(exp), overlapDay,
      })
      if (frozen && outcome.conclusion === (exp.conclusion ?? null) && outcome.confidence === (exp.confidence ?? null)
        && sameCfg(old7?.cfg, cfgStamp) && (old7?.overlap_day ?? null) === (overlapDay ?? null)) { unchanged++; continue }
      changes.push({
        id: exp.id, experiment_type: exp.experiment_type, treatment: exp.treatment, start_at: exp.start_at,
        status: exp.status, contaminated: isContaminated(exp),
        before: { format: checkpointsFormat(exp.checkpoints), conclusion: exp.conclusion ?? null, confidence: exp.confidence ?? null },
        after: { conclusion: outcome.conclusion, confidence: outcome.confidence, code: outcome.code, params: outcome.params },
        windows,
      })
      if (!dryRun) {
        const { error: ue } = await sb.from('gmvmax_experiments').update({
          checkpoints: windows,
          conclusion: outcome.conclusion, confidence: outcome.confidence,
          updated_at: stamp,
        }).eq('workspace_id', workspaceId).eq('id', exp.id)
        if (ue) throw ue
      }
      updated++
    } catch (e) {
      failed.push({ id: exp.id, message: e?.message || String(e) })
    }
  }
  return { updated, unchanged, failed, changes, rule_version: RULE_VERSION }
}
