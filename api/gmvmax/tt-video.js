// Spark Ads — proxy READ-ONLY (Vercel serverless). MCP blok CORS dari browser.
// op:'info' → tt_video_info_get (pratinjau video dari auth code, TANPA mengikat)
// op:'list' → tt_video_list_get (daftar post ter-otorisasi ke ad account)
// Browser kirim access_token miliknya sendiri (RLS owner). TIDAK menyimpan token.

//
// WAJIB sesi Supabase + origin dikenal + batas laju (api/_lib/guard.js).
import { guard, parseBody } from '../_lib/guard.js'
import { connectionOrRespond } from '../_lib/tiktokToken.js'

const MCP_URL = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer'

async function mcpPost(token, body) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const txt = await res.text()
  let data = null
  try {
    if (txt.trim()) {
      if (txt.includes('data:')) {
        const line = txt.split('\n').find(x => x.startsWith('data:'))
        data = line ? JSON.parse(line.slice(5).trim()) : null
      } else data = JSON.parse(txt)
    }
  } catch { data = null }
  return { status: res.status, data, raw: txt.slice(0, 200) }
}

// Handshake + tools/call tool_execute — pola sama dengan advertisers.js.
export async function callBusinessTool(token, toolName, params) {
  const init = await mcpPost(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selleros', version: '1' } } })
  if (init.status === 401) return { error: 'auth', error_description: 'Token kedaluwarsa/invalid — perbarui token atau sambungkan ulang.', http: 401 }
  if (init.status !== 200 || !init.data?.result) return { error: 'mcp_init', error_description: `initialize gagal (${init.status})${init.raw ? `: ${init.raw}` : ''}`, http: 502 }
  await mcpPost(token, { jsonrpc: '2.0', method: 'notifications/initialized' })

  const r = await mcpPost(token, { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'tool_execute', arguments: { tool_name: toolName, params } } })
  if (r.status === 401) return { error: 'auth', error_description: 'Token kedaluwarsa/invalid.', http: 401 }
  const text = r.data?.result?.content?.[0]?.text
  let payload
  try { payload = text ? JSON.parse(text) : null } catch { payload = null }
  if (!payload) return { error: 'mcp_error', error_description: `respons tak terbaca (${r.status})${r.raw ? `: ${r.raw}` : ''}`, http: 502 }
  if (payload.code !== 0) return { error: 'tiktok_error', error_description: payload.message || `code ${payload.code}`, code: payload.code, http: 502 }
  return { data: payload.data }
}

// Aturan TikTok: setiap '+' dalam auth code wajib jadi '%2B'.
export const sanitizeAuthCode = (code) => String(code || '').trim().replace(/\+/g, '%2B')

export default async function handler(req, res) {
  // Read-only, tapi tetap relai ke MCP TikTok atas nama token pemanggil →
  // butuh sesi. 60/menit menampung paginasi daftar video yang panjang.
  const auth = await guard(req, res, { limit: 60, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)
    const { op } = body || {}
    // Token diambil server (browser cukup menyebut workspace_id). advertiser_id
    // ikut diambil dari koneksi supaya klien tak bisa menunjuk akun lain.
    const conn = await connectionOrRespond(res, auth.token, body?.workspace_id)
    if (!conn) return
    const access_token = conn.access_token
    const advertiser_id = conn.advertiser_id
    if (!advertiser_id) { res.status(400).json({ error: 'invalid_request', error_description: 'Advertiser belum dipilih (Pengaturan → Integrasi).' }); return }

    if (op === 'info') {
      if (!body.auth_code) { res.status(400).json({ error: 'invalid_request', error_description: 'auth_code wajib untuk op info' }); return }
      const r = await callBusinessTool(access_token, 'tt_video_info_get', {
        advertiser_id: String(advertiser_id), auth_code: sanitizeAuthCode(body.auth_code),
      })
      if (r.error) { res.status(r.http).json(r); return }
      res.status(200).json({ info: r.data })
      return
    }

    if (op === 'list') {
      const r = await callBusinessTool(access_token, 'tt_video_list_get', {
        advertiser_id: String(advertiser_id),
        page: body.page || 1, page_size: Math.min(body.page_size || 50, 50),
        ...(body.keyword ? { keyword: String(body.keyword) } : {}),
      })
      if (r.error) { res.status(r.http).json(r); return }
      res.status(200).json({ list: r.data })
      return
    }

    // Katalog produk eligible GMV Max (utk kelola produk campaign). Paginasi
    // penuh; bc_id di-resolve dari store_list (tak tersimpan di koneksi).
    if (op === 'store_products') {
      const storeId = String(body.store_id || '')
      if (!storeId) { res.status(400).json({ error: 'invalid_request', error_description: 'store_id wajib untuk op store_products' }); return }
      let bcId = null
      const sl = await callBusinessTool(access_token, 'gmv_max_store_list_get', { advertiser_id: String(advertiser_id) })
      if (!sl.error) {
        const store = (sl.data?.store_list || []).find(s => String(s.store_id) === storeId)
        bcId = store?.store_authorized_bc_id || null
      }
      const products = []
      for (let page = 1; page <= 10; page++) {
        const r = await callBusinessTool(access_token, 'store_product_get', {
          advertiser_id: String(advertiser_id), store_id: storeId,
          ...(bcId ? { bc_id: bcId } : {}),
          filtering: { ad_creation_eligible: 'GMV_MAX' }, page, page_size: 100,
        })
        if (r.error) { res.status(r.http).json(r); return }
        const items = r.data?.store_products || []
        products.push(...items)
        const totalPage = r.data?.page_info?.total_page ?? 1
        if (page >= totalPage || items.length === 0) break
      }
      res.status(200).json({ products })
      return
    }

    // Daftar sesi boost (Max Delivery / Creative Boost) satu campaign.
    if (op === 'session_list') {
      const campaignId = String(body.campaign_id || '')
      if (!campaignId) { res.status(400).json({ error: 'invalid_request', error_description: 'campaign_id wajib untuk op session_list' }); return }
      const r = await callBusinessTool(access_token, 'campaign_gmv_max_session_list_get', {
        advertiser_id: String(advertiser_id), campaign_id: campaignId,
      })
      if (r.error) { res.status(r.http).json(r); return }
      res.status(200).json({ sessions: r.data?.session_list || [] })
      return
    }

    res.status(400).json({ error: 'invalid_request', error_description: `op tak dikenal: ${op}` })
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
