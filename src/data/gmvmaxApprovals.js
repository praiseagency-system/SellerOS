// Execute Layer E0 — antrean approval + setelan eksekusi (RLS owner).
// Satu jalur untuk SEMUA aksi tulis: ajukan → putuskan → (E1+) eksekusi.
// Setiap keputusan APPROVED otomatis menulis jurnal ke Log Optimasi
// (gmvmax_action_log) — inilah "semua aktivitas terdata" tanpa jurnal manual.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { addActionLog } from './gmvmaxActionLog'

// Label ringkas per jenis aksi (dipakai kartu, panel lonceng, dan log).
export const ACTION_LABELS = {
  TEST: 'Uji alur approval',
  SPARK_BIND: 'Daftarkan kode spark',
  SPARK_UNBIND: 'Lepas ikatan spark',
  BUDGET_UPDATE: 'Ubah budget harian',
  ROI_UPDATE: 'Ubah Target ROI',
  STATUS_UPDATE: 'Ubah status campaign',
  PRODUCTS_UPDATE: 'Ubah produk campaign',
  CREATIVE_EXCLUDE: 'Keluarkan video dari rotasi',
  SESSION_CREATE: 'Mulai sesi boost',
  SESSION_DELETE: 'Hentikan sesi boost',
}

// Daftar approval workspace aktif; default hanya yang PENDING & belum lewat TTL.
// Baris PENDING yang kedaluwarsa ditandai EXPIRED dulu (lazy — tanpa cron).
export async function listApprovals({ status = 'PENDING', limit = 50 } = {}) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  await expireStale(wsId)
  let q = supabase.from('gmvmax_approvals').select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

async function expireStale(wsId) {
  // Best-effort; gagal diam-diam tak mengganggu daftar (baris tetap PENDING).
  try {
    await supabase.from('gmvmax_approvals')
      .update({ status: 'EXPIRED' })
      .eq('workspace_id', wsId).eq('status', 'PENDING')
      .lt('expires_at', new Date().toISOString())
  } catch { /* noop */ }
}

// Ajukan satu aksi. entry: {actionType, target, currentValue, proposedValue,
// reason, evidence, source, risk}
export async function createApproval(entry) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const settings = await getExecutionSettings(wsId)
  if (!settings.enabled) throw new Error('Eksekusi sedang dimatikan (kill switch). Nyalakan di Pengaturan → Eksekusi.')
  const { data: userRes } = await supabase.auth.getUser()
  const ttlMs = (settings.approval_ttl_hours || 24) * 3600 * 1000
  const { data, error } = await supabase.from('gmvmax_approvals').insert({
    workspace_id: wsId,
    action_type: entry.actionType,
    target: entry.target ?? null,
    current_value: entry.currentValue ?? null,
    proposed_value: entry.proposedValue ?? null,
    reason: entry.reason ?? null,
    evidence: entry.evidence ?? null,
    source: entry.source || 'MANUAL',
    risk: entry.risk || 'LOW',
    requested_by: userRes?.user?.id ?? null,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  }).select('*').single()
  if (error) throw error
  return data
}

// Putuskan: decision = 'APPROVED' | 'REJECTED'. Guard status=PENDING di filter
// supaya dobel-klik/2 tab tak menimpa keputusan yang sudah jatuh.
export async function decideApproval(id, decision) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  if (decision === 'APPROVED') {
    const settings = await getExecutionSettings(wsId)
    if (!settings.enabled) throw new Error('Kill switch aktif — tidak bisa menyetujui aksi.')
  }
  const { data: userRes } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('gmvmax_approvals')
    .update({ status: decision, decided_by: userRes?.user?.id ?? null, decided_at: new Date().toISOString() })
    .eq('id', id).eq('workspace_id', wsId).eq('status', 'PENDING')
    .select('*').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Approval sudah diputuskan/kedaluwarsa.')

  // Jurnal otomatis — Log Optimasi mencatat keputusan apa pun (setuju/tolak).
  try {
    await addActionLog({
      videoId: data.target?.video_id || null,
      videoTitle: data.target?.video_title || null,
      actionTag: data.action_type,
      body: autoLogBody(data, decision),
      snapshotDate: null,
      roas: data.evidence?.roas_7d ?? null,
    })
  } catch { /* log gagal tak membatalkan keputusan */ }
  return data
}

function fmtVal(v) {
  if (v == null) return '—'
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}:${x}`).join(' ')
  return String(v)
}
function autoLogBody(row, decision) {
  const label = ACTION_LABELS[row.action_type] || row.action_type
  const delta = (row.current_value != null || row.proposed_value != null)
    ? ` ${fmtVal(row.current_value)} → ${fmtVal(row.proposed_value)}` : ''
  const tgt = row.target?.campaign_name || row.target?.video_title || ''
  return `[AUTO] ${decision === 'APPROVED' ? 'Disetujui' : 'Ditolak'}: ${label}${tgt ? ` · ${tgt}` : ''}${delta}${row.reason ? ` · alasan: ${row.reason}` : ''}`
}

// ── Setelan eksekusi (kill switch + bounds + cooldown) ──────────────────────
const DEFAULT_SETTINGS = { enabled: true, max_budget_increase_pct: 50, cooldown_minutes: 360, approval_ttl_hours: 24 }

export async function getExecutionSettings(wsId = getCurrentWorkspaceId()) {
  if (!wsId) return { ...DEFAULT_SETTINGS }
  const { data, error } = await supabase.from('gmvmax_execution_settings')
    .select('*').eq('workspace_id', wsId).maybeSingle()
  if (error) throw error
  return data || { ...DEFAULT_SETTINGS, workspace_id: wsId }
}

export async function saveExecutionSettings(patch, wsId = getCurrentWorkspaceId()) {
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase.from('gmvmax_execution_settings')
    .upsert({ workspace_id: wsId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' })
  if (error) throw error
}
