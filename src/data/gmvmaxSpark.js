// Spark Binding (Execute Layer E1) — sisi browser.
// Alur: pratinjau kode (info, read-only) → createApproval SPARK_BIND →
// setelah APPROVED → executeSparkBind (proxy execute) → update baris approval
// EXECUTED/FAILED + jurnal [AUTO] hasil eksekusi ke Log Optimasi.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { getConnection } from './tiktokConnection'
import { addActionLog } from './gmvmaxActionLog'

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
