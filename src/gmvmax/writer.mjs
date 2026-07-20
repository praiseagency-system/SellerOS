// SnapshotWriter — persistence idempoten. DEFAULT: shadow (dry-run, TIDAK menulis DB;
// OLD tetap source of truth). Commit HANYA bila eksplisit { commit:true } — belum
// dipakai (belum cutover). Commit sekarang ATOMIK via RPC gmvmax_replace_snapshot
// (migration 0017): DELETE+INSERT dalam SATU transaksi → tak ada snapshot parsial
// visible. Bukan lagi DELETE-then-INSERT non-atomik.
import { creativeRowToDb } from './rowMap.mjs'

export async function writeSnapshot({ sb, workspaceId, date, name, result, currency = 'IDR', commit = false }) {
  const payloadRows = result.rows
  const plan = {
    mode: commit ? 'commit' : 'shadow',
    workspaceId, date, rowCount: payloadRows.length,
    totals: { cost: result.totals.cost, revenue: result.totals.revenue, orders: result.totals.orders, roas: result.totals.roas },
  }
  if (!commit) return { ...plan, written: false } // SHADOW: hitung payload, TIDAK menulis
  if (!sb) throw new Error('writeSnapshot commit: klien Supabase wajib')

  // Zero-data contract: allow_empty HANYA bila engine menandai COMPLETE_ZERO_DATA
  // (sukses penuh & rows=0), BUKAN sekadar karena rowCount 0. Guard defensif di Node
  // (RPC tetap guard terakhir di DB).
  const allowEmpty = result.meta?.completeness === 'COMPLETE_ZERO_DATA'
  if (payloadRows.length === 0 && !allowEmpty) {
    const e = new Error('REFUSE_EMPTY_COMMIT: payload kosong tanpa COMPLETE_ZERO_DATA — menolak menimpa snapshot lama')
    e.code = 'REFUSE_EMPTY_COMMIT'; throw e
  }

  // ATOMIK: seluruh ganti-snapshot dalam satu transaksi Postgres (RPC gmvmax_replace_snapshot).
  const importPayload = {
    name: name || date, period_month: `${date.slice(0, 7)}-01`, start_date: date, end_date: date,
    currency, source_filename: null, totals: plan.totals, settings: null,
  }
  const creatives = payloadRows.map(r => creativeRowToDb(null, r)) // import_id di-assign oleh RPC
  const { data: importId, error } = await sb.rpc('gmvmax_replace_snapshot', {
    p_workspace_id: workspaceId, p_snapshot_date: date, p_import: importPayload,
    p_creatives: creatives, p_allow_empty: allowEmpty,
  })
  if (error) { const e = new Error(`ATOMIC_REPLACE_FAILED: ${error.message}`); e.code = 'ATOMIC_REPLACE_FAILED'; throw e }
  return { ...plan, written: true, atomic: true, importId }
}
