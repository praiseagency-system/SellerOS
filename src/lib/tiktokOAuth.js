// Klien OAuth TikTok Ads MCP (Authorization Code + PKCE, PUBLIC client).
// Endpoint & metadata dari discovery server .../oauth/.well-known/... :
//   token_endpoint_auth_methods_supported = ["none"]  → tanpa client secret
//   code_challenge_methods_supported       = ["S256"]  → PKCE wajib
//   grant_types_supported                  = [authorization_code, refresh_token]
// client_id di bawah didaftarkan via Dynamic Client Registration (RFC 7591)
// dengan redirect_uri domain kita (prod + localhost dev).

const BASE = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth'
export const TIKTOK_OAUTH = {
  authorizationEndpoint: `${BASE}/authorize`,
  tokenEndpoint: `${BASE}/token`,
  revocationEndpoint: `${BASE}/revoke`,
  serverUrl: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer',
  clientId: '8d6ac659da5fed5e13725951c9d9b749',
  scope: 'mcp:tt4b',
}

// redirect_uri HARUS sama persis dgn yang didaftarkan (per origin).
// Path SATU segmen ('/tiktok-callback', bukan '/oauth/tiktok/callback') supaya
// aset relative-base './' (vite base './', dipakai GitHub Pages subpath) tetap
// resolve ke /assets — path multi-segmen memecah resolusi aset → blank page.
export function redirectUri() {
  return `${window.location.origin}/tiktok-callback`
}

// ── PKCE ───────────────────────────────────────────────────────────────────
function base64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function randomString(len = 64) {
  const a = new Uint8Array(len)
  crypto.getRandomValues(a)
  return base64url(a)
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return base64url(new Uint8Array(buf))
}

// Buat {verifier, challenge, state} untuk memulai flow. verifier & state
// disimpan penelepon di sessionStorage sampai callback.
export async function createPkce() {
  const verifier = randomString(64)
  const challenge = await sha256(verifier)
  const state = randomString(24)
  return { verifier, challenge, state }
}

export function buildAuthorizeUrl({ challenge, state }) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: TIKTOK_OAUTH.clientId,
    redirect_uri: redirectUri(),
    scope: TIKTOK_OAUTH.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${TIKTOK_OAUTH.authorizationEndpoint}?${p.toString()}`
}

// Normalisasi respons token → {accessToken, refreshToken, scope, tokenType, expiresAt(ms)}
function normalizeToken(j) {
  const expiresInSec = Number(j.expires_in) || 0
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || null,
    scope: j.scope || TIKTOK_OAUTH.scope,
    tokenType: j.token_type || 'Bearer',
    expiresAt: Date.now() + expiresInSec * 1000,
  }
}

// Token endpoint TikTok tak mengirim header CORS → browser lewat proxy
// same-origin (Vercel function api/tiktok/token). Worker Node memakai endpoint
// asli langsung (tanpa CORS). Bisa dioverride via VITE_TIKTOK_TOKEN_PROXY.
const TOKEN_PROXY = import.meta.env.VITE_TIKTOK_TOKEN_PROXY || '/api/tiktok/token'

async function postToken(body) {
  const res = await fetch(TOKEN_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`Token endpoint balas non-JSON (${res.status}): ${text.slice(0, 200)}`) }
  if (!res.ok || j.error) throw new Error(j.error_description || j.error || `Token exchange gagal (${res.status})`)
  return normalizeToken(j)
}

// Tukar authorization code → token (dipanggil di halaman callback).
export function exchangeCode({ code, verifier }) {
  return postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: TIKTOK_OAUTH.clientId,
    code_verifier: verifier,
  })
}

// Perpanjang access_token via refresh_token (dipakai UI & — versi Node — worker).
export function refreshAccessToken(refreshToken) {
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: TIKTOK_OAUTH.clientId,
  })
}

// ── Sesi PKCE sementara (sessionStorage) antara tombol Connect → callback ────
const SS_KEY = 'tiktok_oauth' // { verifier, state, wsId }
export function stashOAuthSession(sess) { sessionStorage.setItem(SS_KEY, JSON.stringify(sess)) }
export function readOAuthSession() { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null') }
export function clearOAuthSession() { sessionStorage.removeItem(SS_KEY) }
