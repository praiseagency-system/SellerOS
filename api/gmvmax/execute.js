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
  'SPARK_BIND', 'SPARK_UNBIND', 'BUDGET_UPDATE', 'ROI_UPDATE', 'PRODUCTS_UPDATE',
  'STATUS_UPDATE', 'CREATIVE_EXCLUDE', 'SESSION_CREATE', 'SESSION_DELETE',
])
const ENABLED = new Set(['SPARK_BIND', 'SPARK_UNBIND', 'BUDGET_UPDATE', 'ROI_UPDATE', 'STATUS_UPDATE', 'PRODUCTS_UPDATE', 'CREATIVE_EXCLUDE']) // E1 + E3 + E4a

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

    // ── E4a: CREATIVE_EXCLUDE (keluarkan/pulihkan video dari rotasi) ────────
    if (action_type === 'CREATIVE_EXCLUDE') {
      const advId = String(params?.advertiser_id || '')
      const campaignId = String(params?.campaign_id || '')
      const act = params?.action
      const items = Array.isArray(params?.items) ? params.items : null
      if (!advId || !campaignId || !items?.length) { res.status(400).json({ error: 'invalid_request', error_description: 'advertiser_id, campaign_id & items[] wajib' }); return }
      if (!['REMOVE', 'ADD'].includes(act)) { res.status(400).json({ error: 'invalid_request', error_description: 'action hanya REMOVE (exclude) / ADD (pulihkan).' }); return }
      if (items.length > 400) { res.status(400).json({ error: 'invalid_request', error_description: 'Maksimal 400 video per permintaan (aturan API).' }); return }

      const applied = await callBusinessTool(access_token, 'gmv_max_creative_update', {
        advertiser_id: advId, campaign_id: campaignId, action: act,
        item_list: items.map(it => ({
          item_id: String(it.item_id),
          ...(it.spu_id_list?.length ? { spu_id_list: it.spu_id_list.map(String) } : {}),
        })),
      })
      if (applied.error) { res.status(applied.http).json({ ...applied, step: 'apply' }); return }

      // Aturan resmi: status EXCLUDED baru terlihat ±20 menit di report —
      // read-back langsung TIDAK bisa memverifikasi; kejujuran > kepastian palsu.
      res.status(200).json({
        executed: true, action_type, approval_id,
        apply_result: applied.data ?? {},
        read_back: { verified: null, note: 'Status berubah ±20 menit di report TikTok; konfirmasi final di snapshot berikutnya.' },
      })
      return
    }

    // ── E3.5: PRODUCTS_UPDATE (kelola produk campaign) ──────────────────────
    if (action_type === 'PRODUCTS_UPDATE') {
      const advId = String(params?.advertiser_id || '')
      const campaignId = String(params?.campaign_id || '')
      const ids = Array.isArray(params?.item_group_ids) ? params.item_group_ids.map(String) : null
      if (!advId || !campaignId || !ids) { res.status(400).json({ error: 'invalid_request', error_description: 'advertiser_id, campaign_id & item_group_ids[] wajib' }); return }
      if (ids.length === 0) { res.status(400).json({ error: 'invalid_request', error_description: 'Campaign CUSTOMIZED_PRODUCTS minimal 1 produk — untuk mematikan campaign pakai Pause, bukan mengosongkan produk.' }); return }
      if (ids.length > 400) { res.status(400).json({ error: 'invalid_request', error_description: 'Maksimal 400 produk per campaign (aturan API).' }); return }

      const applied = await callBusinessTool(access_token, 'campaign_gmv_max_update', {
        advertiser_id: advId, campaign_id: campaignId, item_group_ids: ids,
      })
      if (applied.error) { res.status(applied.http).json({ ...applied, step: 'apply' }); return }

      const info = await callBusinessTool(access_token, 'campaign_gmv_max_info_get', { advertiser_id: advId, campaign_id: campaignId })
      let verified = null, observed = null
      if (!info.error) {
        observed = (info.data?.item_group_ids || []).map(String).sort()
        const want = [...ids].sort()
        verified = observed.length === want.length && observed.every((v, i) => v === want[i])
      }
      res.status(200).json({
        executed: true, action_type, approval_id,
        apply_result: applied.data ?? {},
        read_back: { observed_count: observed ? observed.length : null, verified, info_error: info.error ? info.error_description : null },
      })
      return
    }

    // ── E3: CAMPAIGN CONTROL (budget / ROI / status) ────────────────────────
    if (action_type === 'BUDGET_UPDATE' || action_type === 'ROI_UPDATE' || action_type === 'STATUS_UPDATE') {
      const advId = String(params?.advertiser_id || '')
      const campaignId = String(params?.campaign_id || '')
      if (!advId || !campaignId) { res.status(400).json({ error: 'invalid_request', error_description: 'params.advertiser_id & params.campaign_id wajib' }); return }

      let applied
      if (action_type === 'STATUS_UPDATE') {
        const op = params?.operation_status
        // Pagar keras: DELETE tidak akan pernah lewat pintu ini.
        if (!['ENABLE', 'DISABLE'].includes(op)) { res.status(400).json({ error: 'invalid_request', error_description: 'operation_status hanya ENABLE/DISABLE.' }); return }
        applied = await callBusinessTool(access_token, 'campaign_status_update', {
          advertiser_id: advId, campaign_ids: [campaignId], operation_status: op,
        })
      } else {
        const upd = { advertiser_id: advId, campaign_id: campaignId }
        if (action_type === 'BUDGET_UPDATE') {
          const budget = Number(params?.budget)
          if (!Number.isFinite(budget) || budget <= 0) { res.status(400).json({ error: 'invalid_request', error_description: 'params.budget tidak valid' }); return }
          upd.budget = budget
        } else {
          const roas = Math.round(Number(params?.roas_bid) * 10) / 10 // aturan API: maks 1 desimal
          if (!Number.isFinite(roas) || roas <= 0) { res.status(400).json({ error: 'invalid_request', error_description: 'params.roas_bid tidak valid' }); return }
          upd.roas_bid = roas
        }
        applied = await callBusinessTool(access_token, 'campaign_gmv_max_update', upd)
      }
      if (applied.error) { res.status(applied.http).json({ ...applied, step: 'apply' }); return }

      // READ-BACK: baca ulang setting campaign, cocokkan nilai yang diminta.
      const info = await callBusinessTool(access_token, 'campaign_gmv_max_info_get', {
        advertiser_id: advId, campaign_id: campaignId,
      })
      let verified = null, observed = null
      if (!info.error) {
        if (action_type === 'BUDGET_UPDATE') { observed = Number(info.data?.budget); verified = observed === Number(params.budget) }
        else if (action_type === 'ROI_UPDATE') { observed = Number(info.data?.roas_bid); verified = observed === Math.round(Number(params.roas_bid) * 10) / 10 }
        else { observed = info.data?.operation_status; verified = observed === params.operation_status }
      }
      res.status(200).json({
        executed: true, action_type, approval_id,
        apply_result: applied.data ?? {},
        read_back: { observed, verified, info_error: info.error ? info.error_description : null },
      })
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
