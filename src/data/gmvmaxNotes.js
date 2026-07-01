// Catatan/aksi per video (gmvmax_notes), hidup lintas periode. Kunci logis =
// (workspace + video_id). RLS per pemilik workspace.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

// Semua catatan workspace aktif → map { [video_id]: note } (terbaru menang).
export async function listNotes() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return {}
  const { data, error } = await supabase
    .from('gmvmax_notes')
    .select('*')
    .eq('workspace_id', wsId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const n of data || []) if (!map[n.video_id]) map[n.video_id] = n
  return map
}

// Simpan/timpa catatan untuk satu video (1 catatan aktif per video).
export async function upsertNote(videoId, { body, actionTag }) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { data: existing } = await supabase
    .from('gmvmax_notes')
    .select('id')
    .eq('workspace_id', wsId).eq('video_id', videoId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('gmvmax_notes')
      .update({ body, action_tag: actionTag, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await supabase.from('gmvmax_notes')
    .insert({ workspace_id: wsId, video_id: videoId, body, action_tag: actionTag })
    .select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteNote(videoId) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return
  const { error } = await supabase.from('gmvmax_notes')
    .delete().eq('workspace_id', wsId).eq('video_id', videoId)
  if (error) throw error
}
