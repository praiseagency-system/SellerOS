// Spark Ads — proxy READ-ONLY (Vercel serverless). MCP blok CORS dari browser.
// op:'info' → tt_video_info_get (pratinjau video dari auth code, TANPA mengikat)
// op:'list' → tt_video_list_get (daftar post ter-otorisasi ke ad account)
// Browser kirim access_token miliknya sendiri (RLS owner). TIDAK menyimpan token.

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
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = null }
  if (!payload) return { error: 'mcp_error', error_description: `respons tak terbaca (${r.status})${r.raw ? `: ${r.raw}` : ''}`, http: 502 }
  if (payload.code !== 0) return { error: 'tiktok_error', error_description: payload.message || `code ${payload.code}`, code: payload.code, http: 502 }
  return { data: payload.data }
}

// Aturan TikTok: setiap '+' dalam auth code wajib jadi '%2B'.
export const sanitizeAuthCode = (code) => String(code || '').trim().replace(/\+/g, '%2B')

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }
  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body || '{}')
    const { access_token, advertiser_id, op } = body || {}
    if (!access_token || !advertiser_id) { res.status(400).json({ error: 'invalid_request', error_description: 'access_token & advertiser_id wajib' }); return }

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

    res.status(400).json({ error: 'invalid_request', error_description: `op tak dikenal: ${op}` })
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
