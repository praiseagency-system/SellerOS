// RunReporter — ringkasan operasional DETERMINISTIK (bukan reasoning). Log
// terstruktur + objek run untuk shadow/parity. Tak ada AI.
import { randomUUID } from 'node:crypto'

export function makeRunId() { return randomUUID().slice(0, 8) }

// result = output engine.runSync(); reconDelta = Σ residual non-attributed.
export function buildRunReport({ runId, result, status = 'success', authState, error = null }) {
  const m = result?.meta || {}
  const reconDelta = (result?.rows || []).filter(r => r.isSystem).reduce((s, r) => s + (r.cost ?? 0), 0)
  return {
    run_id: runId,
    advertiser_id: m.advertiserId ?? null,
    date: m.date ?? null,
    campaign_count: m.campaignCount ?? 0,
    page_count: m.pageCount ?? 0,
    raw_row_count: m.rawRowCount ?? 0,
    normalized_row_count: m.normalizedRowCount ?? 0,
    deduplicated_row_count: m.normalizedRowCount ?? 0, // dedup di-guard = fail; count final = normalized
    attributed_count: m.attributedCount ?? 0,
    non_attributed_count: m.nonAttributedCount ?? 0,
    inserted_count: 0, // shadow → tidak menulis DB
    reconciliation_delta: Math.round(reconDelta),
    total_cost: Math.round(result?.totals?.cost ?? 0),
    total_revenue: Math.round(result?.totals?.revenue ?? 0),
    duration_ms: m.durationMs ?? null,
    auth_state: authState ?? null,
    status,
    error: error ? { code: error.code || 'ERROR', message: error.message } : null,
  }
}

export function logRunReport(r, sink = console.log) {
  const p = '[gmvmax]'
  sink(`${p} run ${r.run_id} started`)
  sink(`${p} advertiser=${r.advertiser_id} date=${r.date} auth=${r.auth_state}`)
  if (r.status === 'success') {
    sink(`${p} campaigns=${r.campaign_count} pages=${r.page_count} raw_rows=${r.raw_row_count}`)
    sink(`${p} normalized=${r.normalized_row_count} attributed=${r.attributed_count} non_attributed=${r.non_attributed_count}`)
    sink(`${p} reconciliation_delta=${r.reconciliation_delta} cost=${r.total_cost} revenue=${r.total_revenue}`)
    sink(`${p} duration_ms=${r.duration_ms} status=success`)
  } else {
    sink(`${p} status=FAILED code=${r.error?.code} msg=${r.error?.message}`)
  }
}
