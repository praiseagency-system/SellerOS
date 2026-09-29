// Otorisasi spark hasil potret harian worker (tabel gmvmax_spark_auth, migrasi
// 0048) — READ-ONLY dari webapp. Berisi kode spark utuh, produk yang tertaut, dan
// kapan izinnya berakhir, untuk SETIAP video ter-otorisasi ke ad account —
// termasuk yang kodenya dimasukkan lewat Seller Centre / Ads Manager.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const PAGE = 1000

// Baris potret TERBARU (satu tanggal saja — yang paling akhir tersedia).
// Mengembalikan [] bila tabelnya belum ada (migrasi belum dijalankan) supaya
// halaman tetap hidup, bukan meledak.
export async function loadLatestSparkAuth({ wsId = getCurrentWorkspaceId() } = {}) {
  if (!wsId) return []
  const { data: last, error: e1 } = await supabase
    .from('gmvmax_spark_auth')
    .select('snapshot_date').eq('workspace_id', wsId)
    .order('snapshot_date', { ascending: false }).limit(1)
  if (e1) return []
  const date = last?.[0]?.snapshot_date
  if (!date) return []

  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gmvmax_spark_auth').select('*')
      .eq('workspace_id', wsId).eq('snapshot_date', date)
      .range(from, from + PAGE - 1)
    if (error) return all
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return all
}

// Kapan video diikat (TikTok tak menyediakannya — hanya kapan IZIN kreator mulai):
//   executed  video_id → waktu PERSIS, untuk ikatan lewat SellerOS (approval SPARK_BIND EXECUTED)
//   firstSeen video_id → tanggal pertama terlihat AUTHORIZED di potret harian worker
//   firstSnapshot      → potret paling awal; terlihat di tanggal itu = "sebelum/pada" tanggal itu
export async function loadBindTimes({ wsId = getCurrentWorkspaceId() } = {}) {
  const out = { executed: new Map(), firstSeen: new Map(), firstSnapshot: null }
  if (!wsId) return out
  const { data: aps } = await supabase.from('gmvmax_approvals')
    .select('target, executed_at').eq('workspace_id', wsId)
    .eq('action_type', 'SPARK_BIND').eq('status', 'EXECUTED').limit(1000)
  for (const a of aps || []) {
    const v = a?.target?.video_id
    if (v && a.executed_at && !out.executed.has(String(v))) out.executed.set(String(v), a.executed_at)
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('gmvmax_spark_auth')
      .select('item_id, snapshot_date').eq('workspace_id', wsId).eq('ad_auth_status', 'AUTHORIZED')
      .order('snapshot_date', { ascending: true }).range(from, from + PAGE - 1)
    if (error) break
    for (const r of data || []) {
      out.firstSnapshot ??= r.snapshot_date
      if (!out.firstSeen.has(String(r.item_id))) out.firstSeen.set(String(r.item_id), r.snapshot_date)
    }
    if (!data || data.length < PAGE) break
  }
  return out
}
