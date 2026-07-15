// Enumerasi advertiser/toko yang dilihat token — Vercel serverless.
// MCP tt-ads (Streamable-HTTP) blok CORS dari browser → panggil server-side.
// Browser kirim access_token miliknya sendiri (boleh ia baca via RLS owner);
// fungsi ini panggil tool `auth_advertiser_get` lalu balikin {advertiser_id,name}.
// TIDAK menyimpan token.

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
  if (txt.trim()) {
    if (txt.includes('data:')) {
      const line = txt.split('\n').find(x => x.startsWith('data:'))
      data = line ? JSON.parse(line.slice(5).trim()) : null
    } else data = JSON.parse(txt)
  }
  return { status: res.status, data }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }
  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body || '{}')
    const token = body?.access_token
    if (!token) { res.status(400).json({ error: 'invalid_request', error_description: 'access_token wajib' }); return }

    // Handshake MCP (sama seperti worker): initialize → initialized → tools/call.
    const init = await mcpPost(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selleros', version: '1' } } })
    if (init.status === 401) { res.status(401).json({ error: 'auth', error_description: 'Token kedaluwarsa/invalid — perbarui token dulu.' }); return }
    if (init.status !== 200 || !init.data?.result) { res.status(502).json({ error: 'mcp_init', error_description: `initialize gagal (${init.status})` }); return }
    await mcpPost(token, { jsonrpc: '2.0', method: 'notifications/initialized' })

    const r = await mcpPost(token, { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'tool_execute', arguments: { tool_name: 'auth_advertiser_get', params: {} } } })
    if (r.status === 401) { res.status(401).json({ error: 'auth', error_description: 'Token kedaluwarsa/invalid.' }); return }
    const text = r.data?.result?.content?.[0]?.text
    const payload = text ? JSON.parse(text) : null
    if (!payload || payload.code !== 0) { res.status(502).json({ error: 'mcp_error', error_description: payload?.message || 'auth_advertiser_get gagal' }); return }

    const list = (payload.data?.list || []).map(x => ({ advertiser_id: x.advertiser_id, advertiser_name: x.advertiser_name }))
    res.status(200).json({ advertisers: list })
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
