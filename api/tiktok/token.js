// Proxy token endpoint TikTok MCP OAuth (Vercel serverless).
// Token endpoint TikTok TIDAK mengirim header CORS → browser tak bisa fetch
// langsung. Fungsi ini meneruskan (server-to-server, bebas CORS). Public client
// (PKCE, tanpa secret) → proxy hanya merelai, tak menyimpan/menandatangani apa pun.
// Body masuk: JSON { grant_type, code?, refresh_token?, redirect_uri?, client_id, code_verifier? }
// Diteruskan sebagai application/x-www-form-urlencoded ke token endpoint.

const TOKEN_ENDPOINT = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/token'
const ALLOWED = new Set([
  'grant_type', 'code', 'refresh_token', 'redirect_uri', 'client_id', 'code_verifier', 'scope',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body || '{}')
    if (!body || typeof body !== 'object') body = {}

    const form = new URLSearchParams()
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED.has(k) && v != null && v !== '') form.set(k, String(v))
    }
    if (!form.get('grant_type') || !form.get('client_id')) {
      res.status(400).json({ error: 'invalid_request', error_description: 'grant_type & client_id wajib.' })
      return
    }

    const upstream = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    // Teruskan apa adanya (JSON token atau JSON error OAuth).
    res.send(text || '{}')
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
