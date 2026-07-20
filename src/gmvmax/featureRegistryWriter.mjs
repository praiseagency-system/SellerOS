// GMV Max Feature Registry — WRITER (tenant-aware, read-of-MCP → write-to-DB).
// Menulis HANYA ke gmvmax_feature_registry(+_history). TIDAK menyentuh TikTok.
// Idempoten: merge berbasis signature (lihat mergeRegistry). Perubahan material
// saja yang menambah baris history.
import { mergeRegistry, assertWorkspaceScope } from './featureRegistry.mjs'

// Stamp identitas tenant ke record normalizer (yang belum punya workspace_id).
export function stampRecords(records, { workspaceId, userId = null, connectionId = null, brandId = null }) {
  return records.map(r => ({
    ...r, workspace_id: workspaceId, user_id: userId, connection_id: connectionId, brand_id: brandId,
  }))
}

// Resolusi user_id pemilik workspace (denormalisasi; RLS tetap pakai join workspace).
export async function resolveWorkspaceOwner(sb, workspaceId) {
  const { data, error } = await sb.from('workspaces').select('user_id').eq('id', workspaceId).single()
  if (error) throw new Error(`resolve owner workspace gagal: ${error.message}`)
  return data?.user_id ?? null
}

// Tulis registry untuk SATU workspace. records = output buildRegistry().records.
export async function persistRegistry(sb, { workspaceId, userId = null, connectionId = null, records = [], now = new Date().toISOString() }) {
  if (!workspaceId) throw new Error('workspaceId wajib')
  const stamped = stampRecords(records, { workspaceId, userId, connectionId })
  assertWorkspaceScope(stamped, workspaceId) // guard selain RLS

  // Muat state saat ini (per workspace) untuk deteksi perubahan.
  const { data: existing, error: e1 } = await sb
    .from('gmvmax_feature_registry').select('*').eq('workspace_id', workspaceId)
  if (e1) throw new Error(`baca registry gagal: ${e1.message}`)

  const { writes, history } = mergeRegistry(existing || [], stamped, now)

  const updates = writes.filter(w => w.id)
  const inserts = writes.filter(w => !w.id)

  if (inserts.length) {
    const { error } = await sb.from('gmvmax_feature_registry').insert(inserts)
    if (error) throw new Error(`insert registry gagal: ${error.message}`)
  }
  for (const u of updates) {
    const { error } = await sb.from('gmvmax_feature_registry').update(u).eq('id', u.id)
    if (error) throw new Error(`update registry gagal: ${error.message}`)
  }
  if (history.length) {
    const { error } = await sb.from('gmvmax_feature_registry_history').insert(history)
    if (error) throw new Error(`insert history gagal: ${error.message}`)
  }
  return { written: writes.length, inserted: inserts.length, updated: updates.length, changes: history.length }
}
