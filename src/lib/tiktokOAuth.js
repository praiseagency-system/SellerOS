// Klien OAuth TikTok Ads MCP (Authorization Code + PKCE, PUBLIC client).
// Endpoint & metadata dari discovery server .../oauth/.well-known/... :
//   token_endpoint_auth_methods_supported = ["none"]  → tanpa client secret
//   code_challenge_methods_supported       = ["S256"]  → PKCE wajib
//   grant_types_supported                  = [authorization_code, refresh_token]
// client_id di bawah didaftarkan via Dynamic Client Registration (RFC 7591)
// dengan redirect_uri domain kita (prod + localhost dev).
// 2026-08-28: didaftarkan ULANG untuk domain baru selleros.praiseagency.id
// (mencakup juga seller-os-pink.vercel.app lama + localhost) — klien lama
// 8d6ac659… hanya mengenal domain vercel.app. Daftarkan ulang dgn
// scripts/tiktok-register-client.mjs bila domain berubah lagi.

import { authHeaders } from './apiClient'

const BASE = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth'
export const TIKTOK_OAUTH = {
  authorizationEndpoint: `${BASE}/authorize`,
  tokenEndpoint: `${BASE}/token`,
  revocationEndpoint: `${BASE}/revoke`,
  serverUrl: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer',
  clientId: '8d21407c43626c21a7c95bab1783b7fa',
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

// Tukar authorization code → token, LALU SIMPAN DI SERVER.
//
// Browser tidak lagi menerima tokennya: proxy yang menukar kode ke TikTok dan
// langsung menyimpan koneksi (api/tiktok/token → saveConnectionServerSide),
// jadi token tak pernah menyentuh browser bahkan saat connect pertama.
// Yang kembali hanya { ok, expires_at }.
//
// Ini juga yang memungkinkan hak baca kolom token dicabut dari `authenticated`:
// upsert versi browser dulu menulis `on conflict do update set access_token =
// excluded.access_token`, dan referensi `excluded.access_token` itu MEMBACA
// kolomnya — sehingga mustahil dikunci selama penyimpanan masih di browser.
const TOKEN_PROXY = import.meta.env.VITE_TIKTOK_TOKEN_PROXY || '/api/tiktok/token'

export async function exchangeCodeAndSave({ code, verifier, workspaceId }) {
  if (!workspaceId) throw new Error('Workspace tidak diketahui untuk koneksi ini.')
  const res = await fetch(TOKEN_PROXY, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: TIKTOK_OAUTH.clientId,
      code_verifier: verifier,
      workspace_id: workspaceId,
    }),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`Token endpoint balas non-JSON (${res.status}): ${text.slice(0, 200)}`) }
  if (!res.ok || j.error) throw new Error(j.error_description || j.error || `Token exchange gagal (${res.status})`)
  return j
}

// Daftar advertiser/toko yang dilihat token (lewat proxy serverless — MCP kena
// CORS dari browser). → [{ advertiser_id, advertiser_name }]
// Cukup sebut workspace-nya: token diambil & disegarkan di sisi server.
const ADV_PROXY = import.meta.env.VITE_TIKTOK_ADV_PROXY || '/api/tiktok/advertisers'
export async function fetchAdvertisers(workspaceId) {
  const res = await fetch(ADV_PROXY, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ workspace_id: workspaceId }),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`advertisers proxy non-JSON (${res.status})`) }
  if (!res.ok || j.error) throw new Error(j.error_description || j.error || `gagal ambil daftar akun (${res.status})`)
  return j.advertisers || []
}

// ── Sesi PKCE sementara (sessionStorage) antara tombol Connect → callback ────
const SS_KEY = 'tiktok_oauth' // { verifier, state, wsId }
export function stashOAuthSession(sess) { sessionStorage.setItem(SS_KEY, JSON.stringify(sess)) }
export function readOAuthSession() { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null') }
export function clearOAuthSession() { sessionStorage.removeItem(SS_KEY) }
