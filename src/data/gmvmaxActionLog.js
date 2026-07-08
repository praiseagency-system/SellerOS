// Log Optimasi GMV Max (gmvmax_action_log) — jurnal APPEND: tiap tindakan
// optimasi = 1 row, tak menimpa. RLS per pemilik workspace.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

// Daftar entri log (terbaru dulu). Opsi filter per video.
export async function listActionLog({ videoId = null, limit = 500 } = {}) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  let q = supabase.from('gmvmax_action_log').select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (videoId) q = q.eq('video_id', videoId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// Tambah 1 entri log.
export async function addActionLog(entry) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { data, error } = await supabase.from('gmvmax_action_log')
    .insert({
      workspace_id: wsId,
      video_id: entry.videoId || null,
      video_title: entry.videoTitle || null,
      tiktok_account: entry.tiktokAccount || null,
      action_tag: entry.actionTag || null,
      body: entry.body || null,
      snapshot_date: entry.snapshotDate || null,
      roas: entry.roas ?? null,
    })
    .select('*').single()
  if (error) throw error
  return data
}

export async function deleteActionLog(id) {
  const { error } = await supabase.from('gmvmax_action_log').delete().eq('id', id)
  if (error) throw error
}
