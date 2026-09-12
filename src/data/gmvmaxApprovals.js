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
  SESSION_UPDATE: 'Ubah sesi boost',
  SESSION_DELETE: 'Hentikan sesi boost',
}

// Sinyal lintas-pohon. 🔔 duduk di topbar (Layout, DI LUAR GmvMaxProvider),
// sedangkan yang perlu menyegarkan diri setelah sebuah keputusan — Log Optimasi
// dan kartu aksi di AI Insight — hidup di dalamnya. Tanpa sinyal ini keduanya
// baru berubah setelah browser di-refresh: persis keluhan 12 Sep 2026 ("sudah
// approve tapi di log optimasi belum masuk"), padahal barisnya sudah di DB.
export const APPROVAL_EVENT = 'gmvmax:approval-changed'
export function notifyApprovalChanged(detail = {}) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(APPROVAL_EVENT, { detail }))
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

// Keadaan exclude per pasangan video×campaign, dibaca dari jejak approval.
//
// Kenapa perlu: snapshot TikTok baru menyusul besok pagi (07:30 WIB), sedangkan
// pengguna ingin barisnya hilang dari daftar kerja BEGITU ia menyetujui. Tanpa
// ini, kartu "video boros" menyuruh mengerjakan ulang pekerjaan yang barusan
// selesai — keluhan nyata 12 Sep 2026.
//
// Balik: { keluar, menunggu } berisi kunci `${videoId}|${campaignId}`.
//   keluar   — REMOVE yang sudah disetujui/dieksekusi & belum dibatalkan ADD.
//   menunggu — REMOVE yang masih antre di 🔔 (belum terjadi, tapi jangan diantrekan dua kali).
// REJECTED / EXPIRED / FAILED sengaja TIDAK dihitung: yang gagal berarti video
// itu masih membakar uang, dan daftar kerja harus tetap menagihnya.
export async function loadCreativeExcludeState({ limit = 300 } = {}) {
  const kosong = { keluar: new Set(), menunggu: new Set() }
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return kosong
  const { data, error } = await supabase.from('gmvmax_approvals')
    .select('target, proposed_value, status, created_at')
    .eq('workspace_id', wsId)
    .eq('action_type', 'CREATIVE_EXCLUDE')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const keluar = new Set(), menunggu = new Set(), diputus = new Set()
  for (const r of data || []) {          // terbaru dulu → keputusan pertama yang ketemu = yang berlaku
    const vid = r.target?.video_id, cid = r.target?.campaign_id
    if (!vid || !cid) continue
    const key = `${vid}|${cid}`
    if (r.status === 'PENDING') {
      if (r.proposed_value?.action === 'REMOVE') menunggu.add(key)
      continue
    }
    if (r.status !== 'APPROVED' && r.status !== 'EXECUTED') continue
    if (diputus.has(key)) continue
    diputus.add(key)
    if (r.proposed_value?.action === 'REMOVE') keluar.add(key)
  }
  return { keluar, menunggu }
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
  notifyApprovalChanged({ actionType: data.action_type, status: 'PENDING' })
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
      tiktokAccount: String(data.evidence?.akun || '').replace(/^@/, '') || null,
      actionTag: data.action_type,
      body: autoLogBody(data, decision),
      snapshotDate: null,
      roas: data.evidence?.roas_7d ?? null,
    })
  } catch { /* log gagal tak membatalkan keputusan */ }
  notifyApprovalChanged({ actionType: data.action_type, status: decision })
  return data
}

// Nilai bersarang (payload teknis spt `items` pada CREATIVE_EXCLUDE) DILEWATI —
// dirangkai apa adanya ia menjadi "items:[object Object]" di jurnal, yang tak
// memberi tahu pembacanya apa pun. Aturan yang sama dipakai kartu 🔔.
function fmtVal(v) {
  if (v == null) return '—'
  if (typeof v === 'object') {
    return Object.entries(v)
      .filter(([, x]) => x == null || typeof x !== 'object')
      .map(([k, x]) => `${k}:${x}`)
      .join(' ') || '…'
  }
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
