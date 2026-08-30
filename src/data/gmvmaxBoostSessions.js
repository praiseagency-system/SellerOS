// Sesi boost hasil potret harian worker (tabel gmvmax_boost_sessions, migrasi
// 0048) — READ-ONLY dari webapp. Inilah satu-satunya jejak Creative Boost &
// Max Delivery yang dijalankan langsung di Seller Centre / Ads Manager: aksi
// begitu tak pernah lewat tombol persetujuan, jadi tak ada di gmvmax_approvals.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const PAGE = 1000

// Satu sesi muncul di SETIAP potret harian selama ia masih berjalan. Yang
// menarik bagi pembaca adalah SESI-nya, bukan penampakan hariannya — jadi
// digabung: penampakan pertama (= kapan ia mulai terlihat), penampakan terakhir
// (= masih hidup atau sudah lenyap), dan item_id dari potret mana pun yang
// memilikinya (baris sebelum 31 Agu 2026 ditulis sebelum endpoint detail
// dipanggil, jadi item_id-nya kosong).
export function foldSessions(rows = []) {
  const by = new Map()
  for (const r of rows) {
    const cur = by.get(r.session_id)
    if (!cur) { by.set(r.session_id, { ...r, first_seen: r.snapshot_date, last_seen: r.snapshot_date, seen_days: 1 }); continue }
    cur.last_seen = r.snapshot_date > cur.last_seen ? r.snapshot_date : cur.last_seen
    cur.first_seen = r.snapshot_date < cur.first_seen ? r.snapshot_date : cur.first_seen
    cur.seen_days += 1
    if (!cur.item_id && r.item_id) cur.item_id = r.item_id
    if (!cur.spu_id && r.spu_id) cur.spu_id = r.spu_id
  }
  return [...by.values()].sort((a, b) =>
    String(b.schedule_start_time || b.first_seen).localeCompare(String(a.schedule_start_time || a.first_seen)))
}

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
