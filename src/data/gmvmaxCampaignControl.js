// Campaign Control (Execute Layer E3) — budget / Target ROI / pause-aktifkan.
// SEMUA aksi lewat antrean 🔔 (beda dgn spark yang langsung): nilai uangnya
// besar, jadi ajukan → tinjau kartu (before→after + alasan) → Setujui → eksekusi
// campaign_gmv_max_update / campaign_status_update → read-back info_get.
// Pagar di sini (bukan cuma UI): bounds % kenaikan budget + cooldown per campaign.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { getConnection } from './tiktokConnection'
import { addActionLog } from './gmvmaxActionLog'
import { createApproval, getExecutionSettings } from './gmvmaxApprovals'

async function requireConn() {
  const conn = await getConnection()
  if (!conn?.access_token) throw new Error('TikTok Ads belum tersambung untuk workspace ini.')
  if (!conn?.advertiser_id) throw new Error('Advertiser belum dipilih (Pengaturan → Integrasi).')
  return conn
}

// Cooldown: adakah aksi campaign yang SUDAH dieksekusi/disetujui dalam N menit
// terakhir untuk campaign yang sama? (PENDING tak dihitung — belum terjadi.)
async function assertCooldown(campaignId, settings) {
  const wsId = getCurrentWorkspaceId()
  const mins = settings.cooldown_minutes ?? 360
  if (!mins) return
  const since = new Date(Date.now() - mins * 60_000).toISOString()
  const { data, error } = await supabase.from('gmvmax_approvals')
    .select('id, action_type, decided_at')
    .eq('workspace_id', wsId)
    .in('action_type', ['BUDGET_UPDATE', 'ROI_UPDATE', 'STATUS_UPDATE'])
    .in('status', ['APPROVED', 'EXECUTED'])
    .eq('target->>campaign_id', String(campaignId))
    .gte('decided_at', since)
    .limit(1)
  if (error) throw error
  if (data?.length) {
    const last = new Date(data[0].decided_at)
    const readyAt = new Date(last.getTime() + mins * 60_000)
    throw new Error(`Cooldown aktif untuk campaign ini — aksi terakhir ${last.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}, bisa lagi ${readyAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`)
  }
}

// Ajukan ubah budget harian. Bound: kenaikan ≤ max_budget_increase_pct.
export async function requestBudgetChange({ campaignId, campaignName, currentBudget, newBudget, reason = null, evidence = null }) {
  const settings = await getExecutionSettings()
  const cur = Number(currentBudget) || 0
  const next = Number(newBudget)
  if (!Number.isFinite(next) || next <= 0) throw new Error('Budget baru tidak valid.')
  const maxPct = settings.max_budget_increase_pct ?? 50
  if (cur > 0 && next > cur * (1 + maxPct / 100)) {
    throw new Error(`Kenaikan melebihi batas ${maxPct}%/hari (maks ${Math.floor(cur * (1 + maxPct / 100)).toLocaleString('id-ID')}). Ubah batas di Pengaturan → Eksekusi bila memang perlu.`)
  }
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'BUDGET_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { budget: cur },
    proposedValue: { budget: next },
    reason, evidence,
    source: 'MANUAL', risk: next > cur ? 'MEDIUM' : 'LOW',
  })
}

// Ajukan ubah Target ROI (roas_bid, maks 1 desimal — aturan API).
export async function requestRoiChange({ campaignId, campaignName, currentRoi, newRoi, reason = null, evidence = null }) {
  const settings = await getExecutionSettings()
  const next = Math.round(Number(newRoi) * 10) / 10
  if (!Number.isFinite(next) || next <= 0) throw new Error('Target ROI baru tidak valid.')
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'ROI_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { roas_bid: currentRoi != null ? Number(currentRoi) : null },
    proposedValue: { roas_bid: next },
    reason, evidence,
    // Menurunkan target = melonggarkan delivery = spend naik → MEDIUM.
    source: 'MANUAL', risk: currentRoi != null && next < Number(currentRoi) ? 'MEDIUM' : 'LOW',
  })
}

// Katalog produk eligible GMV Max toko ini (utk dialog kelola produk).
// gmv_max_ads_status: UNOCCUPIED = bisa ditambah; OCCUPIED = dipakai campaign lain.
export async function fetchStoreProducts() {
  const conn = await requireConn()
  if (!conn.store_id) throw new Error('store_id koneksi kosong — cek Pengaturan → Integrasi.')
  const r = await post('/api/gmvmax/tt-video', {
    access_token: conn.access_token, advertiser_id: conn.advertiser_id,
    op: 'store_products', store_id: conn.store_id,
  })
  return r.products || []
}

// Ajukan ubah daftar produk campaign. API menerima daftar LENGKAP baru —
// delta (± produk) disimpan di approval supaya kartunya bisa menampilkan
// perubahan, bukan 2 daftar panjang.
export async function requestProductsChange({ campaignId, campaignName, currentIds = [], newIds = [], addedNames = [], removedNames = [], reason = null }) {
  const cur = [...new Set(currentIds.map(String))]
  const next = [...new Set(newIds.map(String))]
  if (next.length === 0) throw new Error('Minimal 1 produk — untuk mematikan campaign gunakan Pause.')
  if (next.length > 400) throw new Error('Maksimal 400 produk per campaign (aturan API).')
  const same = cur.length === next.length && [...cur].sort().every((v, i) => v === [...next].sort()[i])
  if (same) throw new Error('Tidak ada perubahan produk.')
  const settings = await getExecutionSettings()
  await assertCooldown(campaignId, settings)
  const removed = cur.filter(id => !next.includes(id))
  return createApproval({
    actionType: 'PRODUCTS_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { produk: cur.length },
    proposedValue: { produk: next.length, item_group_ids: next },
    reason,
    evidence: {
      ditambah: addedNames.length ? addedNames : next.filter(id => !cur.includes(id)),
      dicabut: removedNames.length ? removedNames : removed,
    },
    source: 'MANUAL',
    // Mencabut produk menghentikan iklan produk itu di campaign — risiko lebih tinggi.
    risk: removed.length ? 'MEDIUM' : 'LOW',
  })
}

// Ajukan pause/aktifkan. DELETE sengaja TIDAK pernah tersedia.
export async function requestStatusChange({ campaignId, campaignName, currentStatus, newStatus, reason = null }) {
  if (!['ENABLE', 'DISABLE'].includes(newStatus)) throw new Error('Status hanya boleh ENABLE/DISABLE.')
  const settings = await getExecutionSettings()
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'STATUS_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { operation_status: currentStatus || null },
    proposedValue: { operation_status: newStatus },
    reason,
    source: 'MANUAL', risk: newStatus === 'DISABLE' ? 'MEDIUM' : 'LOW',
  })
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`balasan non-JSON (${res.status})`) }
  if (!res.ok || j.error) { const e = new Error(j.error_description || j.error || `gagal (${res.status})`); e.payload = j; throw e }
  return j
}

// Eksekusi aksi campaign untuk baris approval APPROVED (dipanggil ApprovalBell).
export async function executeCampaignAction(approvalRow) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const conn = await requireConn()
  const campaignId = approvalRow?.target?.campaign_id
  if (!campaignId) throw new Error('Approval tidak membawa campaign_id.')

  const params = { advertiser_id: conn.advertiser_id, campaign_id: campaignId }
  if (approvalRow.action_type === 'BUDGET_UPDATE') params.budget = approvalRow.proposed_value?.budget
  if (approvalRow.action_type === 'ROI_UPDATE') params.roas_bid = approvalRow.proposed_value?.roas_bid
  if (approvalRow.action_type === 'STATUS_UPDATE') params.operation_status = approvalRow.proposed_value?.operation_status
  if (approvalRow.action_type === 'PRODUCTS_UPDATE') params.item_group_ids = approvalRow.proposed_value?.item_group_ids

  let result = null, failMsg = null
  try {
    result = await post('/api/gmvmax/execute', {
      access_token: conn.access_token,
      action_type: approvalRow.action_type,
      approval_id: approvalRow.id,
      params,
    })
  } catch (e) { failMsg = e.message }

  const status = failMsg ? 'FAILED' : 'EXECUTED'
  await supabase.from('gmvmax_approvals')
    .update({
      status, executed_at: new Date().toISOString(),
      execution_result: failMsg ? { error: failMsg } : { apply: result.apply_result, read_back: result.read_back },
    })
    .eq('id', approvalRow.id).eq('workspace_id', wsId)

  try {
    const fmt = (v) => (v && typeof v === 'object') ? Object.entries(v).map(([k, x]) => `${k}:${x}`).join(' ') : String(v)
    const rb = result?.read_back
    await addActionLog({
      actionTag: approvalRow.action_type,
      body: failMsg
        ? `[AUTO] Eksekusi GAGAL: ${approvalRow.action_type} · ${approvalRow.target?.campaign_name || campaignId} · ${failMsg}`
        : `[AUTO] Dieksekusi: ${approvalRow.action_type} · ${approvalRow.target?.campaign_name || campaignId} · ${fmt(approvalRow.current_value)} → ${fmt(approvalRow.proposed_value)}${rb?.verified === true ? ' · read-back COCOK ✓' : rb?.verified === false ? ' · read-back BELUM cocok (cek Ads Manager)' : ''}`,
    })
  } catch { /* log gagal tak mengubah hasil */ }

  if (failMsg) { const e = new Error(failMsg); e.failed = true; throw e }
  return result
}
