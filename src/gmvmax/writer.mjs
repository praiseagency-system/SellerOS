// SnapshotWriter — persistence idempoten. DEFAULT: shadow (dry-run, TIDAK menulis DB;
// OLD tetap source of truth). Commit HANYA bila eksplisit { commit:true } — belum
// dipakai (belum cutover). Commit sekarang ATOMIK via RPC gmvmax_replace_snapshot
// (migration 0017): DELETE+INSERT dalam SATU transaksi → tak ada snapshot parsial
// visible. Bukan lagi DELETE-then-INSERT non-atomik.
import { creativeRowToDb } from './rowMap.mjs'
import { contentSignature } from './provenance.mjs'

export const WRITER_VERSION = 'versioned-0.1.0'

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

// VERSIONED WRITER (provenance hardening) — OPT-IN, belum dipakai produksi.
// No-op idempotency + versioning + lineage via RPC gmvmax_write_versioned_snapshot
// (migrasi 0029+0030). Konten identik → NO-OP (pertahankan import id, cegah churn
// seperti kejadian 07:50). Konten berubah → versi baru (versi lama TIDAK dihapus →
// provenance utuh). Menghitung content_signature deterministik dari payload.
// Shadow (commit=false) → hitung signature, TIDAK menulis. Old-path writeSnapshot
// SENGAJA tidak diubah (belum cutover).
export async function writeSnapshotVersioned({
  sb, workspaceId, date, name, result, currency = 'IDR',
  writerKind = 'COMMIT', writerVersion = WRITER_VERSION, runId = null, syncRunId = null, actorRole = null, commit = false,
}) {
  const payloadRows = result.rows
  const totals = { cost: result.totals.cost, revenue: result.totals.revenue, orders: result.totals.orders, roas: result.totals.roas }
  const signature = contentSignature({ workspaceId, date, rows: payloadRows, totals })
  const plan = { mode: commit ? 'commit' : 'shadow', workspaceId, date, rowCount: payloadRows.length, totals, content_signature: signature }
  if (!commit) return { ...plan, written: false } // SHADOW: hitung signature, TIDAK menulis
  if (!sb) throw new Error('writeSnapshotVersioned commit: klien Supabase wajib')

  const allowEmpty = result.meta?.completeness === 'COMPLETE_ZERO_DATA'
  if (payloadRows.length === 0 && !allowEmpty) {
    const e = new Error('REFUSE_EMPTY_COMMIT: payload kosong tanpa COMPLETE_ZERO_DATA — menolak menimpa snapshot lama')
    e.code = 'REFUSE_EMPTY_COMMIT'; throw e
  }

  const importPayload = {
    name: name || date, period_month: `${date.slice(0, 7)}-01`, start_date: date, end_date: date,
    currency, source_filename: null, totals, settings: null,
  }
  const creatives = payloadRows.map(r => creativeRowToDb(null, r)) // import_id di-assign oleh RPC
  const { data, error } = await sb.rpc('gmvmax_write_versioned_snapshot', {
    p_workspace_id: workspaceId, p_snapshot_date: date, p_content_signature: signature,
    p_import: importPayload, p_creatives: creatives, p_writer_kind: writerKind,
    p_writer_version: writerVersion, p_run_id: runId, p_sync_run_id: syncRunId,
    p_actor_role: actorRole, p_allow_empty: allowEmpty,
  })
  if (error) { const e = new Error(`VERSIONED_WRITE_FAILED: ${error.message}`); e.code = 'VERSIONED_WRITE_FAILED'; throw e }
  return {
    ...plan, written: true, atomic: true,
    importId: data?.import_id ?? null, version: data?.version ?? null,
    content_changed: data?.content_changed === true, noop: data?.noop === true,
  }
}
