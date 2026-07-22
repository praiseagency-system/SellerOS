// Lapisan baca DECISION INTELLIGENCE (Phase 3C). READ-ONLY: membaca output yang
// sudah di-persist server (gmvmax_skill_outputs + gmvmax_daily_facts) — TIDAK
// menjalankan pipeline di browser, TIDAK memakai service role. RLS owner-read
// membatasi ke workspace pemilik. Bila migrasi 0026/0027 belum di-apply →
// available:false (UI menampilkan pesan, bukan error).
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const SKILL_COLS =
  'skill_code, skill_version, scope_type, scope_id, status, severity, confidence, ' +
  'payload, source_snapshot_ids, rule_ids, rule_versions, deterministic_signature, ' +
  'generated_at, expires_at, reviewed_at, dismissed_at, snoozed_until'

const isMissingTable = (e) => e?.code === 'PGRST205' || e?.code === '42P01' ||
  /relation .* does not exist|could not find the table/i.test(e?.message || '')

// Muat keputusan TERBARU (tanggal dengan output ter-persist paling baru) untuk
// workspace aktif. Ambil versi terbaru (generated_at) per skill_code.
export async function loadLatestDecision() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return { available: true, empty: true }

  // 1) tanggal output terbaru
  const { data: latest, error: e0 } = await supabase
    .from('gmvmax_skill_outputs')
    .select('output_date')
    .eq('workspace_id', wsId)
    .order('output_date', { ascending: false })
    .limit(1)
  if (e0) { if (isMissingTable(e0)) return { available: false }; throw e0 }
  if (!latest?.length) return { available: true, empty: true }

  return loadDecision(latest[0].output_date)
}

// Muat keputusan untuk satu tanggal (skill terbaru per skill_code + daily facts).
export async function loadDecision(date) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId || !date) return { available: true, empty: true }

  const { data: rows, error } = await supabase
    .from('gmvmax_skill_outputs')
    .select(SKILL_COLS)
    .eq('workspace_id', wsId)
    .eq('output_date', date)
    .order('generated_at', { ascending: false })
  if (error) { if (isMissingTable(error)) return { available: false }; throw error }
  if (!rows?.length) return { available: true, empty: true, date }

  const skills = {}
  for (const r of rows) if (!skills[r.skill_code]) skills[r.skill_code] = r // terbaru menang

  let dailyFacts = null
  const { data: df } = await supabase
    .from('gmvmax_daily_facts')
    .select('facts, comparisons, data_quality, source_snapshot_ids, deterministic_signature, generated_at')
    .eq('workspace_id', wsId).eq('fact_date', date)
    .order('generated_at', { ascending: false }).limit(1)
  if (df?.length) dailyFacts = df[0]

  const s9 = skills['GMVMAX_SKILL_09']
  return {
    available: true, empty: false, date,
    skills, dailyFacts,
    generatedAt: s9?.generated_at || rows[0].generated_at,
    expiresAt: s9?.expires_at || null,
    // ringkasan kualitas data (dari Skill 1 blueprint bila ada)
    dataQuality: skills['GMVMAX_SKILL_01']?.payload?.blueprint?.DATA_QUALITY || dailyFacts?.data_quality || null,
    executionAllowed: false,
  }
}
