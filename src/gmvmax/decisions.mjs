// VPS-SIDE WIRING — Decision Intelligence generation. Dipanggil oleh vpsCommit.mjs
// SETELAH commit kanonik sukses (NON-FATAL di sisi pemanggil). Membaca kanonik
// (read-only) via supabaseAdapter lalu generate + persist output Skills 1/2/3/4/9
// ke gmvmax_daily_facts + gmvmax_skill_outputs.
//
// BATASAN (dijaga pipeline): TIDAK menulis kanonik, TIDAK panggil TikTok, TIDAK
// eksekusi apa pun. execution_allowed=false invariant. Persist HANYA ke tabel
// output keputusan (0026/0027) — bukan gmvmax_imports/creatives.
import { supabaseAdapter } from './skills/loader.mjs'
import { generateDecisionIntelligence } from './skills/pipeline.mjs'

// Generate + persist keputusan utk satu workspace+tanggal yang snapshot-nya BARU
// ditulis. Melempar bila gagal → pemanggil (vpsCommit) menangkap & meng-log warn
// tanpa menjatuhkan commit. Deterministik & idempoten (signature konten-terpaut:
// data + versi skill/rule sama → baris sama, tak menggandakan).
export async function generateAndPersistDecisions({ sb, workspaceId, storeId, date, generatedAt }) {
  if (!sb) throw new Error('GEN_DECISIONS_BAD_ARGS: sb (service-role) wajib')
  if (!storeId) throw new Error('GEN_DECISIONS_BAD_ARGS: storeId wajib')
  const db = supabaseAdapter(sb)
  const res = await generateDecisionIntelligence({
    workspaceId, storeId, date, generatedAt,
    persist: true, db, sb, skills: [1, 2, 3, 4, 9],
  })
  return {
    persisted: res.persisted === true,
    daily_signature: res.daily_signature,
    missing_inputs: res.missing_inputs || [],
    validation_ok: res.validation?.ok === true,
    execution_allowed: res.execution_allowed,
  }
}
