// Sesi boost hasil potret harian worker (tabel gmvmax_boost_sessions, migrasi
// 0048) — READ-ONLY dari webapp. Inilah satu-satunya jejak Creative Boost &
// Max Delivery yang dijalankan langsung di Seller Centre / Ads Manager: aksi
// begitu tak pernah lewat tombol persetujuan, jadi tak ada di gmvmax_approvals.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { foldSessions } from '../utils/gmvmaxSessions'

const PAGE = 1000

// [] bila tabelnya belum ada (migrasi belum dijalankan) supaya halaman tetap
// hidup, bukan meledak — pola yang sama dengan loadLatestSparkAuth.
export async function loadBoostSessions({ days = 60, wsId = getCurrentWorkspaceId() } = {}) {
  if (!wsId) return []
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gmvmax_boost_sessions').select('*')
      .eq('workspace_id', wsId).gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return foldSessions(all)
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return foldSessions(all)
}

export { foldSessions }
