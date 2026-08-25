// Spark Binding (Execute Layer E1) — sisi browser.
// Alur: pratinjau kode (info, read-only) → createApproval SPARK_BIND →
// setelah APPROVED → executeSparkBind (proxy execute) → update baris approval
// EXECUTED/FAILED + jurnal [AUTO] hasil eksekusi ke Log Optimasi.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { getConnection } from './tiktokConnection'
import { addActionLog } from './gmvmaxActionLog'
import { createApproval, decideApproval } from './gmvmaxApprovals'

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

// Koneksi + advertiser aktif workspace (token dibaca via RLS owner).
async function requireConn() {
  const conn = await getConnection()
  if (!conn?.access_token) throw new Error('TikTok Ads belum tersambung untuk workspace ini.')
  if (!conn?.advertiser_id) throw new Error('Advertiser belum dipilih (Pengaturan → Integrasi).')
  return conn
}

// Pratinjau video dari auth code — TIDAK mengikat apa pun.
export async function fetchSparkInfo(authCode) {
  const conn = await requireConn()
  const { info } = await post('/api/gmvmax/tt-video', {
    access_token: conn.access_token, advertiser_id: conn.advertiser_id, op: 'info', auth_code: authCode,
  })
  return info // { item_id?, item_info?/video_info?, ... } — bentuk penuh dari TikTok
}

// Daftar Spark posts ter-otorisasi ke ad account (sumber kebenaran ikatan).
export async function fetchSparkList({ page = 1, keyword = null } = {}) {
  const conn = await requireConn()
  const { list } = await post('/api/gmvmax/tt-video', {
    access_token: conn.access_token, advertiser_id: conn.advertiser_id, op: 'list', page,
    ...(keyword ? { keyword } : {}),
  })
  return list // { list: [...], page_info: {...} }
}

// Eksekusi SPARK_BIND untuk baris approval APPROVED. Mengembalikan hasil dan
// meng-update baris approval (EXECUTED/FAILED + execution_result).
export async function executeSparkBind(approvalRow) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const conn = await requireConn()
  const authCode = approvalRow?.proposed_value?.auth_code
  if (!authCode) throw new Error('Approval tidak membawa auth_code.')

  let result = null, failMsg = null
  try {
    result = await post('/api/gmvmax/execute', {
      access_token: conn.access_token,
      action_type: 'SPARK_BIND',
      approval_id: approvalRow.id,
      params: {
        advertiser_id: conn.advertiser_id,
        auth_code: authCode,
        item_id: approvalRow?.target?.video_id || null,
        ...(approvalRow?.proposed_value?.original_post_auth_code
          ? { original_post_auth_code: approvalRow.proposed_value.original_post_auth_code } : {}),
      },
    })
  } catch (e) { failMsg = e.message }

  const status = failMsg ? 'FAILED' : 'EXECUTED'
  await supabase.from('gmvmax_approvals')
    .update({
      status, executed_at: new Date().toISOString(),
      execution_result: failMsg ? { error: failMsg } : { apply: result.apply_result, read_back: result.read_back },
    })
    .eq('id', approvalRow.id).eq('workspace_id', wsId)

  // Jurnal hasil eksekusi (pelengkap entri "Disetujui" dari decideApproval).
  try {
    const rb = result?.read_back
    await addActionLog({
      videoId: approvalRow?.target?.video_id || rb?.item_id || null,
      videoTitle: approvalRow?.target?.video_title || null,
      actionTag: 'SPARK_BIND',
      body: failMsg
        ? `[AUTO] Eksekusi GAGAL: Daftarkan kode spark · ${failMsg}`
        : `[AUTO] Dieksekusi: kode spark terikat ke advertiser ${conn.advertiser_id}${rb?.item_id ? ` · video ${rb.item_id}` : ''}${rb?.verified === true ? ' · read-back COCOK ✓' : rb?.verified === false ? ' · read-back BELUM terlihat (cek daftar)' : ''}`,
    })
  } catch { /* log gagal tak mengubah hasil */ }

  if (failMsg) { const e = new Error(failMsg); e.failed = true; throw e }
  return result
}

// ── Jalur LANGSUNG (tanpa mampir 🔔) — untuk aksi yang dipicu user sendiri ──
// Audit tetap utuh: baris approval dibuat lalu diputuskan APPROVED atas nama
// user (kill switch tetap dicek di createApproval/decideApproval), eksekusi +
// read-back + log otomatis sama persis dengan jalur antrean.
export async function bindSparkNow({ authCode, videoId = null, videoTitle = '', author = '' }) {
  const row = await createApproval({
    actionType: 'SPARK_BIND',
    target: { video_id: videoId, video_title: videoTitle || `kode …${authCode.slice(-6)}`, author },
    currentValue: { terikat: 'belum' },
    proposedValue: { terikat: 'ya', auth_code: authCode },
    reason: videoTitle ? `Ikat video "${videoTitle.slice(0, 80)}" ke ad account (langsung).` : 'Ikat Spark post ke ad account (langsung).',
    evidence: videoId ? { item_id: videoId } : null,
    source: 'MANUAL', risk: 'LOW',
  })
  const approved = await decideApproval(row.id, 'APPROVED')
  return executeSparkBind(approved)
}

export async function unbindSparkNow({ videoId, videoTitle = '' }) {
  const row = await createApproval({
    actionType: 'SPARK_UNBIND',
    target: { video_id: videoId, video_title: videoTitle },
    currentValue: { terikat: 'ya' },
    proposedValue: { terikat: 'lepas' },
    reason: 'Lepas ikatan Spark post dari ad account (langsung).',
    source: 'MANUAL', risk: 'MEDIUM',
  })
  const approved = await decideApproval(row.id, 'APPROVED')
  return executeSparkUnbind(approved)
}

// Eksekusi SPARK_UNBIND untuk baris approval APPROVED.
export async function executeSparkUnbind(approvalRow) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const conn = await requireConn()
  const itemId = approvalRow?.target?.video_id
  if (!itemId) throw new Error('Approval tidak membawa video_id.')

  let result = null, failMsg = null
  try {
    result = await post('/api/gmvmax/execute', {
      access_token: conn.access_token,
      action_type: 'SPARK_UNBIND',
      approval_id: approvalRow.id,
      params: { advertiser_id: conn.advertiser_id, item_id: itemId },
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
    await addActionLog({
      videoId: itemId,
      videoTitle: approvalRow?.target?.video_title || null,
      actionTag: 'SPARK_UNBIND',
      body: failMsg
        ? `[AUTO] Eksekusi GAGAL: Lepas ikatan spark · ${failMsg}`
        : `[AUTO] Dieksekusi: ikatan spark video ${itemId} dilepas dari advertiser ${conn.advertiser_id}${result?.read_back?.verified === true ? ' · read-back COCOK ✓' : ''}`,
    })
  } catch { /* log gagal tak mengubah hasil */ }

  if (failMsg) { const e = new Error(failMsg); e.failed = true; throw e }
  return result
}
