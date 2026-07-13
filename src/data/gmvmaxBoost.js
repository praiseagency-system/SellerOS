// Boost Center GMV Max (gmvmax_boost) — pipeline kode boost per video.
// Kunci logis = (workspace + video_id). RLS per pemilik workspace.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

// Semua entri boost workspace → map { [video_id]: row } (terbaru diperbarui dulu).
export async function listBoost() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return {}
  const { data, error } = await supabase
    .from('gmvmax_boost')
    .select('*')
    .eq('workspace_id', wsId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const r of data || []) if (!map[r.video_id]) map[r.video_id] = r
  return map
}

// Buat/perbarui entri boost untuk satu video.
export async function upsertBoost(videoId, patch) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { data: existing } = await supabase
    .from('gmvmax_boost')
    .select('id')
    .eq('workspace_id', wsId).eq('video_id', videoId)
    .maybeSingle()

  const fields = {}
  if ('status' in patch) fields.status = patch.status
  if ('boostCode' in patch) fields.boost_code = patch.boostCode
  if ('note' in patch) fields.note = patch.note
  if ('videoTitle' in patch) fields.video_title = patch.videoTitle
  if ('tiktokAccount' in patch) fields.tiktok_account = patch.tiktokAccount
  if ('roas' in patch) fields.roas = patch.roas
  // Tanggal boost (migrasi 0018). null diperbolehkan (mis. hapus tanggal akhir).
  if ('boostStart' in patch) fields.boost_start = patch.boostStart || null
  if ('boostEnd' in patch) fields.boost_end = patch.boostEnd || null

  // Retry tanpa kolom tanggal bila migrasi 0018 belum dijalankan (kolom hilang).
  const dateKeys = ['boost_start', 'boost_end']
  const stripDates = (f) => {
    const c = { ...f }; dateKeys.forEach(k => delete c[k]); return c
  }
  async function run(f) {
    if (existing) {
      return supabase.from('gmvmax_boost')
        .update({ ...f, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select('*').single()
    }
    return supabase.from('gmvmax_boost')
      .insert({ workspace_id: wsId, video_id: videoId, ...f }).select('*').single()
  }

  let res = await run(fields)
  if (res.error && isMissingBoostDateColumn(res.error)) res = await run(stripDates(fields))
  if (res.error) throw res.error
  return res.data
}

// True bila error karena kolom boost_start/boost_end belum ada (migrasi 0018).
function isMissingBoostDateColumn(error) {
  return (
    error?.code === '42703' || error?.code === 'PGRST204' ||
    (/boost_(start|end)/i.test(error?.message || '') &&
      /column|does not exist|schema cache/i.test(error?.message || ''))
  )
}

export async function deleteBoost(videoId) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return
  const { error } = await supabase.from('gmvmax_boost')
    .delete().eq('workspace_id', wsId).eq('video_id', videoId)
  if (error) throw error
}
