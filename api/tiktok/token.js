// Proxy token endpoint TikTok MCP OAuth (Vercel serverless).
// Token endpoint TikTok TIDAK mengirim header CORS → browser tak bisa fetch
// langsung. Fungsi ini meneruskan (server-to-server, bebas CORS). Public client
// (PKCE, tanpa secret) → proxy hanya merelai, tak menyimpan/menandatangani apa pun.
// Body masuk: JSON { grant_type, code?, refresh_token?, redirect_uri?, client_id, code_verifier? }
// Diteruskan sebagai application/x-www-form-urlencoded ke token endpoint.
//
// WAJIB sesi Supabase (header Authorization: Bearer <JWT>) + origin dikenal +
// batas laju — lihat api/_lib/guard.js. Sebelumnya endpoint ini terbuka untuk
// siapa saja di internet.
import { guard, parseBody } from '../_lib/guard.js'
import { saveConnectionServerSide, isTokenError } from '../_lib/tiktokToken.js'

const TOKEN_ENDPOINT = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/token'
const ALLOWED = new Set([
  'grant_type', 'code', 'refresh_token', 'redirect_uri', 'client_id', 'code_verifier', 'scope',
])

export default async function handler(req, res) {
  // Menukar/menyegarkan token itu jarang: 10 per menit sudah longgar untuk
  // pemakaian wajar, tapi menutup penyalahgunaan beruntun.
  const auth = await guard(req, res, { limit: 10, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)

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

    // Bila pemanggil menyebut workspace_id, koneksi disimpan DI SINI dan token
    // TIDAK dikembalikan ke browser — jadi token tak pernah menyentuh browser
    // sama sekali, bahkan saat connect pertama. Tanpa workspace_id, perilaku
    // lama dipertahankan (relai apa adanya) agar tak ada pemanggil yang putus
    // mendadak saat peralihan.
    const wsId = body?.workspace_id
    if (wsId && upstream.ok) {
      let tok = null
      try { tok = JSON.parse(text) } catch { tok = null }
      if (tok?.access_token) {
        try {
          const saved = await saveConnectionServerSide(auth.token, wsId, tok, form.get('client_id'))
          res.status(200).json({ ok: true, expires_at: saved.expires_at })
        } catch (e) {
          if (isTokenError(e)) res.status(e.http).json({ error: e.error, error_description: e.description })
          else res.status(502).json({ error: 'save_connection_failed', error_description: String(e?.message || e) })
        }
        return
      }
    }

    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    // Teruskan apa adanya (JSON token atau JSON error OAuth).
    res.send(text || '{}')
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
