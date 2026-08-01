// Lapisan data Prioritas Kuadran (public.quadrant_priorities).
// Tahan kalau tabelnya belum ada — daftar jadi kosong, halaman tetap jalan.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const MISSING_TABLE = /relation .*quadrant_priorities.* does not exist|schema cache/i

export const STATUS = { OPEN: 'open', IN_PROGRESS: 'in_progress', DONE: 'done', DISMISSED: 'dismissed' }
export const STATUS_LABEL = {
  open: 'Open', in_progress: 'Dikerjakan', done: 'Selesai', dismissed: 'Diabaikan',
}

function rowToItem(r) {
  return {
    id: r.id,
    canonicalProductId: r.canonical_product_id,
    productName: r.product_name,
    marketplaceMode: r.marketplace_mode,
    periodValue: r.period_value,
    quadrant: r.quadrant,
    problemCategory: r.problem_category,
    funnelStage: r.funnel_stage,
    recommendation: r.recommendation,
    priorityScore: r.priority_score,
    potentialGmv: r.potential_gmv,
    dataConfidence: r.data_confidence,
    confidenceLevel: r.confidence_level,
    status: r.status,
    owner: r.owner,
    dueDate: r.due_date,
    notes: r.notes,
    expectedImpact: r.expected_impact,
    actualResult: r.actual_result,
    beforeSnapshot: r.before_snapshot || {},
    afterSnapshot: r.after_snapshot || null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }
}

export async function listPriorities() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('quadrant_priorities').select('*')
    .eq('workspace_id', wsId).order('created_at', { ascending: false })
  if (error) {
    if (MISSING_TABLE.test(error.message || '')) {
      console.info('[prioritas] tabel quadrant_priorities belum ada — jalankan migrasi 0044')
      return []
    }
    throw error
  }
  return (data || []).map(rowToItem)
}

// Buat draft Log Optimasi dari satu rekomendasi. Snapshot metrik SEBELUM
// optimasi dibekukan di sini — tak boleh dihitung ulang belakangan, karena
// data periode bisa berubah setelah import ulang.
export async function createPriority({ product, scored, recommendation, marketplaceMode, periodValue, benchmark, owner, dueDate, expectedImpact }) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const row = {
    workspace_id: wsId,
    canonical_product_id: product.canonicalProductId || product.kode_produk,
    product_name: product.shortName || product.nama_produk || '',
    marketplace_mode: marketplaceMode || 'all',
    period_value: periodValue || null,
    quadrant: product.quadrant ?? null,
    problem_category: recommendation?.category ?? null,
    funnel_stage: recommendation?.stage ?? null,
    recommendation: (recommendation?.actions || []).join(' · ') || null,
    priority_score: scored?.priorityScore ?? null,
    potential_gmv: scored?.opportunity?.potentialGmv ?? null,
    data_confidence: scored?.confidence?.score ?? null,
    confidence_level: scored?.confidence?.level ?? null,
    status: STATUS.OPEN,
    owner: owner || null,
    due_date: dueDate || null,
    expected_impact: expectedImpact || null,
    before_snapshot: {
      qualifiedTraffic: product.qualifiedTraffic ?? null,
      ctr: product.ctrBlended ?? product.ctr ?? null,
      atcRate: product.atcRate ?? null,
      conversionRate: product.conversionRate ?? null,
      buyers: product.buyers ?? null,
      gmv: product.gmv ?? null,
      roas: product.roasBlended ?? product.roas ?? null,
      benchmark: benchmark ? {
        trafficThreshold: benchmark.trafficThreshold ?? null,
        conversionThreshold: benchmark.conversionThreshold ?? null,
        source: benchmark.source ?? null,
      } : null,
      capturedAt: new Date().toISOString(),
    },
  }
  const { data, error } = await supabase.from('quadrant_priorities').insert(row).select('*').single()
  if (error) throw error
  return rowToItem(data)
}

export async function updatePriority(id, patch) {
  const payload = { updated_at: new Date().toISOString() }
  if (patch.status) {
    payload.status = patch.status
    if (patch.status === STATUS.DONE) payload.completed_at = new Date().toISOString()
  }
  if ('owner' in patch) payload.owner = patch.owner || null
  if ('dueDate' in patch) payload.due_date = patch.dueDate || null
  if ('notes' in patch) payload.notes = patch.notes || null
  if ('actualResult' in patch) payload.actual_result = patch.actualResult || null
  if ('afterSnapshot' in patch) payload.after_snapshot = patch.afterSnapshot || null
  const { error } = await supabase.from('quadrant_priorities').update(payload).eq('id', id)
  if (error) throw error
}

// Perbandingan sebelum → sesudah. Sengaja TIDAK mengklaim sebab-akibat.
export function comparePriority(item, currentProduct) {
  const b = item?.beforeSnapshot || {}
  if (!currentProduct) return null
  const d = (a, c) => (a == null || c == null) ? null : c - a
  return {
    conversionRate: { before: b.conversionRate ?? null, after: currentProduct.conversionRate ?? null, deltaPp: d(b.conversionRate, currentProduct.conversionRate) },
    qualifiedTraffic: { before: b.qualifiedTraffic ?? null, after: currentProduct.qualifiedTraffic ?? null, deltaPct: (b.qualifiedTraffic > 0 && currentProduct.qualifiedTraffic != null) ? ((currentProduct.qualifiedTraffic - b.qualifiedTraffic) / b.qualifiedTraffic) * 100 : null },
    gmv: { before: b.gmv ?? null, after: currentProduct.gmv ?? null, delta: d(b.gmv, currentProduct.gmv) },
    ctr: { before: b.ctr ?? null, after: currentProduct.ctrBlended ?? currentProduct.ctr ?? null, deltaPp: d(b.ctr, currentProduct.ctrBlended ?? currentProduct.ctr) },
    note: 'Perubahan terobservasi setelah optimasi — bukan bukti sebab-akibat.',
  }
}
