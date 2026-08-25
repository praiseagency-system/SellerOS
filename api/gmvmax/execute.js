// Execute Layer — SATU-SATUNYA pintu eksekusi ke TikTok (Vercel serverless).
// FASE E1: aksi pertama yang AKTIF = SPARK_BIND (tt_video_authorize_apply).
// Aksi lain tetap ditolak NOT_ENABLED sampai fasenya tiba (E3/E4).
//
// Kontrak body: { access_token, action_type, approval_id, params }
// - SPARK_BIND params: { advertiser_id, auth_code, original_post_auth_code? }
// Setelah apply sukses, endpoint langsung READ-BACK: tt_video_list_get dengan
// keyword item_id (bila info tersedia) → bukti ikatan benar-benar terjadi.
import { callBusinessTool, sanitizeAuthCode } from './tt-video.js'

const ALLOWED = new Set([
  'SPARK_BIND', 'SPARK_UNBIND', 'BUDGET_UPDATE', 'ROI_UPDATE',
  'STATUS_UPDATE', 'CREATIVE_EXCLUDE', 'SESSION_CREATE', 'SESSION_DELETE',
])
const ENABLED = new Set(['SPARK_BIND', 'SPARK_UNBIND']) // E1

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }
  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body || '{}')
    const { access_token, action_type, approval_id, params } = body || {}
    if (!access_token) { res.status(400).json({ error: 'invalid_request', error_description: 'access_token wajib' }); return }
    if (!ALLOWED.has(action_type)) { res.status(400).json({ error: 'invalid_action', error_description: `action_type tak dikenal: ${action_type}` }); return }
    if (!approval_id) { res.status(400).json({ error: 'approval_required', error_description: 'Eksekusi hanya menerima aksi ber-approval (approval_id wajib).' }); return }
    if (!ENABLED.has(action_type)) {
      res.status(501).json({ error: 'not_enabled', error_description: `Aksi ${action_type} belum diaktifkan (aktivasi bertahap; kini baru SPARK_BIND).` })
      return
    }

    // ── SPARK_UNBIND ────────────────────────────────────────────────────────
    if (action_type === 'SPARK_UNBIND') {
      const advId = String(params?.advertiser_id || '')
      const itemId = String(params?.item_id || '')
      if (!advId || !itemId) { res.status(400).json({ error: 'invalid_request', error_description: 'params.advertiser_id & params.item_id wajib' }); return }
      const un = await callBusinessTool(access_token, 'tt_video_unbind', { advertiser_id: advId, item_id: itemId })
      if (un.error) { res.status(un.http).json({ ...un, step: 'unbind' }); return }
      // READ-BACK: sukses = item TIDAK lagi ada di daftar ter-otorisasi.
      const list = await callBusinessTool(access_token, 'tt_video_list_get', { advertiser_id: advId, page: 1, page_size: 50, keyword: itemId })
      const items = list.error ? null : (list.data?.list || [])
      const stillThere = items ? !!items.find(x => String(x?.item_info?.item_id ?? x?.item_id) === itemId) : null
      res.status(200).json({
        executed: true, action_type, approval_id,
        apply_result: un.data ?? {},
        read_back: { item_id: itemId, verified: stillThere == null ? null : !stillThere, list_error: list.error ? list.error_description : null },
      })
      return
    }

    // ── SPARK_BIND ──────────────────────────────────────────────────────────
    const advertiserId = String(params?.advertiser_id || '')
    const authCode = sanitizeAuthCode(params?.auth_code)
    if (!advertiserId || !authCode) { res.status(400).json({ error: 'invalid_request', error_description: 'params.advertiser_id & params.auth_code wajib' }); return }

    const applyParams = { advertiser_id: advertiserId, auth_code: authCode }
    if (params?.original_post_auth_code) applyParams.original_post_auth_code = sanitizeAuthCode(params.original_post_auth_code)

    const applied = await callBusinessTool(access_token, 'tt_video_authorize_apply', applyParams)
    if (applied.error) { res.status(applied.http).json({ ...applied, step: 'apply' }); return }

    // READ-BACK: pastikan post muncul di daftar ter-otorisasi. item_id diambil
    // dari hasil apply bila ada; kalau tidak, kirim daftar halaman 1 sebagai bukti.
    const itemId = applied.data?.item_id || params?.item_id || null
    const list = await callBusinessTool(access_token, 'tt_video_list_get', {
      advertiser_id: advertiserId, page: 1, page_size: 50,
      ...(itemId ? { keyword: String(itemId) } : {}),
    })
    const listItems = list.error ? null : (list.data?.list || [])
    const verified = itemId
      ? !!(listItems || []).find(x => String(x?.item_info?.item_id ?? x?.item_id) === String(itemId))
      : null // tanpa item_id, kebenaran diverifikasi klien dari daftar

    res.status(200).json({
      executed: true, action_type, approval_id,
      apply_result: applied.data ?? {},
      read_back: { item_id: itemId, verified, list_count: listItems ? listItems.length : null, list_error: list.error ? list.error_description : null },
    })
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
