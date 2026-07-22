// Lapisan data EXPERIMENT TRACKER (#3b). Owner CRUD miliknya (RLS 0031). Owner
// membuat DEFINISI eksperimen + stop/kesimpulan manual; checkpoint H+1/H+3/H+7 &
// kesimpulan OTOMATIS dihitung server (pipeline) dari time-series kanonik. Tetap
// tanpa eksekusi apa pun ke TikTok — ini pencatatan operasional (seperti notes).
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

export const EXPERIMENT_TYPES = [
  ['MANUAL_BOOST', 'Boost manual (video code)'],
  ['NEW_CREATIVE_TEST', 'Uji kreatif baru'],
  ['ACCELERATE_TESTING', 'Percepat testing'],
  ['CREATIVE_EXCLUSION', 'Kecualikan kreatif'],
  ['CONTENT_ANGLE_TEST', 'Uji angle konten'],
  ['AFFILIATE_TEST', 'Uji afiliasi'],
  ['PRODUCT_CREATIVE_TEST', 'Uji kreatif produk'],
  ['LIVE_CREATIVE_TEST', 'Uji kreatif Live'],
  ['OTHER_APPROVED', 'Lainnya'],
]
export const CONCLUSION_LABEL = {
  SUSTAINABLE_WINNER: 'Pemenang berkelanjutan', WINNER_CANDIDATE: 'Kandidat pemenang',
  TEMPORARY_SPIKE: 'Lonjakan sementara', INCONCLUSIVE: 'Belum konklusif',
  WEAK: 'Lemah', STOPPED: 'Dihentikan', DATA_INSUFFICIENT: 'Data kurang',
}
const isMissingTable = (e) => e?.code === 'PGRST205' || e?.code === '42P01' ||
  /relation .* does not exist|could not find the table/i.test(e?.message || '')

// store_id workspace aktif — dari baris skill_output/daily_facts terbaru (data-driven).
export async function getStoreId() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return null
  const { data } = await supabase.from('gmvmax_skill_outputs')
    .select('store_id').eq('workspace_id', wsId)
    .order('generated_at', { ascending: false }).limit(1).maybeSingle()
  return data?.store_id || null
}

// Daftar eksperimen workspace (terbaru dulu). available:false bila 0031 belum apply.
export async function listExperiments() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return { available: true, rows: [] }
  const { data, error } = await supabase.from('gmvmax_experiments')
    .select('*').eq('workspace_id', wsId).order('start_at', { ascending: false })
  if (error) { if (isMissingTable(error)) return { available: false, rows: [] }; throw error }
  return { available: true, rows: data || [] }
}

// Buat eksperimen. Wajib: experiment_type, treatment, start_at, baseline_start/end.
export async function createExperiment(exp) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('workspace tak valid')
  const store_id = exp.store_id || await getStoreId()
  if (!store_id) throw new Error('store_id tak ditemukan — jalankan generate keputusan dulu')
  const row = {
    workspace_id: wsId, store_id,
    experiment_type: exp.experiment_type,
    treatment: exp.treatment || null,
    creative_video_id: exp.creative_video_id || null,
    product_id: exp.product_id || null,
    campaign_id: exp.campaign_id || null,
    affiliate_id: exp.affiliate_id || null,
    start_at: exp.start_at || new Date().toISOString(),
    baseline_start: exp.baseline_start || null,
    baseline_end: exp.baseline_end || null,
    stop_condition: exp.stop_condition || null,
    notes: exp.notes || null,
    status: 'RUNNING',
  }
  const { data, error } = await supabase.from('gmvmax_experiments').insert(row).select().single()
  if (error) { if (isMissingTable(error)) throw new Error('Tabel eksperimen (migrasi 0031) belum di-apply.'); throw error }
  return data
}

// Ubah (stop/simpulkan manual/edit catatan). Owner-only via RLS.
export async function updateExperiment(id, patch) {
  const { data, error } = await supabase.from('gmvmax_experiments')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function stopExperiment(id) {
  return updateExperiment(id, { status: 'STOPPED', conclusion: 'STOPPED' })
}

export async function deleteExperiment(id) {
  const { error } = await supabase.from('gmvmax_experiments').delete().eq('id', id)
  if (error) throw error
  return true
}
