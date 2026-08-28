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
