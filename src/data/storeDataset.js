// Lapisan data Performa Toko — Supabase (tabel public.store_datasets).
// Menggantikan penyimpanan dataset toko di localStorage (quadrant_store_v1).
// 1 row per workspace; blob {files, lines} disimpan di kolom `data` jsonb.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { dedupeLines } from '../utils/storeData'

const EMPTY = { files: [], lines: [] }

export async function loadStore() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return { ...EMPTY }
  const { data, error } = await supabase
    .from('store_datasets')
    .select('data')
    .eq('workspace_id', wsId)
    .maybeSingle()
  if (error) throw error
  const blob = data?.data || { ...EMPTY }
  // Dedup saat baca: memperbaiki data lama yang mungkin mengandung baris dobel
  // dari import file tumpang-tindih, tanpa perlu re-import.
  const { lines, removed } = dedupeLines(blob.lines || [])
  return { ...blob, lines, dupRemoved: removed }
}

export async function saveStore(next) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase
    .from('store_datasets')
    .upsert(
      { workspace_id: wsId, data: next, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id' }
    )
  if (error) throw error
}

export async function clearStore() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return
  const { error } = await supabase.from('store_datasets').delete().eq('workspace_id', wsId)
  if (error) throw error
}
