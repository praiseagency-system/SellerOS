// Refresh access_token TikTok MCP via grant refresh_token — SERVER-SIDE (Node),
// jadi TIDAK kena CORS (beda dgn browser yg wajib proxy). Endpoint & public
// client (tanpa secret) sama dgn alur "Connect TikTok" di website.
// Pure: fetchImpl & tokenEndpoint di-inject → unit-testable tanpa jaringan.

export const TIKTOK_TOKEN_ENDPOINT =
  'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/token'

// → { accessToken, refreshToken, scope, tokenType, expiresAt(ms) }
// refreshToken hasil = rotasi bila server kembalikan yg baru, else pakai lama.
export async function refreshTiktokToken({
  refreshToken, clientId, fetchImpl = globalThis.fetch, tokenEndpoint = TIKTOK_TOKEN_ENDPOINT, now = Date.now,
}) {
  if (!refreshToken) throw new Error('refreshToken wajib')
  if (!clientId) throw new Error('clientId wajib')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  const res = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`token endpoint non-JSON (${res.status}): ${String(text).slice(0, 160)}`) }
  if (!res.ok || j.error) throw new Error(j.error_description || j.error || `refresh gagal (HTTP ${res.status})`)
  if (!j.access_token) throw new Error('respons refresh tanpa access_token')
  const expiresInSec = Number(j.expires_in) || 0
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || refreshToken, // rotasi bila ada; else pertahankan
    scope: j.scope || null,
    tokenType: j.token_type || 'Bearer',
    expiresAt: now() + expiresInSec * 1000,
  }
}
