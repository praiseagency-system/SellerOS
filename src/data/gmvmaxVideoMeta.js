// Cache metadata video (username/nama akun) di Supabase (gmvmax_video_meta).
// Global (data publik), key = video_id.
import { supabase } from '../lib/supabase'

// Ambil cache untuk sekumpulan video_id → map { [video_id]: {username, authorName, status} }.
export async function loadVideoMeta(videoIds) {
  const ids = [...new Set((videoIds || []).filter(Boolean))]
  if (ids.length === 0) return {}
  const map = {}
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase
      .from('gmvmax_video_meta')
      .select('video_id, username, author_name, status')
      .in('video_id', ids.slice(i, i + 300))
    if (error) throw error
    for (const r of data || []) {
      map[r.video_id] = { username: r.username, authorName: r.author_name, status: r.status }
    }
  }
  return map
}

// Simpan hasil enrich (upsert per video_id).
export async function saveVideoMeta(results) {
  if (!results?.length) return
  const rows = results.map(r => ({
    video_id: r.videoId,
    username: r.username,
    author_name: r.authorName,
    status: r.status,
    fetched_at: new Date().toISOString(),
  }))
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await supabase
      .from('gmvmax_video_meta')
      .upsert(rows.slice(i, i + 300), { onConflict: 'video_id' })
    if (error) throw error
  }
}
