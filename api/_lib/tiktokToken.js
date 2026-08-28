// Penyelesai token TikTok di SISI SERVER.
//
// Sebelum ini browser membaca `access_token` & `refresh_token` dari
// `tiktok_connections` lalu mengirimnya sendiri ke setiap endpoint. RLS memang
// mencegah tenant lain membacanya, tapi tokennya tetap ada di memori tab,
// di payload tiap permintaan, dan di DevTools siapa pun yang membuka laptop itu.
// Sekarang browser cukup menyebut `workspace_id`; server yang mengambil token.
//
// Dua lapis izin, sengaja dipisah perannya:
//   1. KEPEMILIKAN diperiksa dengan JWT PEMANGGIL (RLS `workspaces` yang
//      memutuskan). Kalau workspace itu bukan miliknya, di sini sudah berhenti.
//   2. TOKEN dibaca dengan service_role — justru karena pemanggil TIDAK boleh
//      membacanya. Ini beda dengan verifikasi approval (yang cukup JWT
//      pemanggil): di sana kita membaca milik dia, di sini kita membaca yang
//      sengaja disembunyikan darinya.
// Urutan itu penting: service_role menembus semua RLS, jadi ia tak boleh
// dipakai sebelum kepemilikan terbukti.
import { selectAsUser, supabaseEnv } from './guard.js'

const TOKEN_ENDPOINT = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/token'
// Segarkan lebih awal: permintaan yang dimulai tepat sebelum kedaluwarsa bisa
// tiba di TikTok setelah lewat.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

class TokenError extends Error {
  constructor(http, error, description) {
    super(description || error)
    this.http = http; this.error = error; this.description = description
  }
}
export const isTokenError = (e) => e instanceof TokenError

async function serviceRequest(path, init = {}) {
  const { url, secretKey } = supabaseEnv()
  if (!url || !secretKey) {
    throw new TokenError(503, 'server_unconfigured',
      'SUPABASE_SECRET_KEY belum tersedia di runtime fungsi.')
  }
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) {
    throw new TokenError(502, 'connection_lookup_failed', `PostgREST ${r.status}: ${(await r.text()).slice(0, 120)}`)
  }
  return r.status === 204 ? null : r.json()
}

// Lapis 1: benar-benar milik pemanggil? RLS `workspaces` yang menjawab.
async function assertOwnsWorkspace(userJwt, workspaceId) {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId || '')) {
    throw new TokenError(400, 'invalid_request', 'workspace_id bukan UUID.')
  }
  let rows
  try {
    rows = await selectAsUser(userJwt, `workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=id&limit=1`)
  } catch (e) {
    throw new TokenError(502, 'workspace_lookup_failed', String(e?.message || e))
  }
  // "Bukan milikmu" dan "tak ada" sengaja berjawaban sama.
  if (!Array.isArray(rows) || !rows[0]) {
    throw new TokenError(403, 'forbidden_workspace', 'Workspace ini bukan milik akunmu.')
  }
}

async function refreshToken(conn) {
  if (!conn.refresh_token) {
    throw new TokenError(401, 'reconnect_required',
      'Token kedaluwarsa dan tak ada refresh_token. Sambungkan ulang akun TikTok.')
  }
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
    ...(conn.client_id ? { client_id: conn.client_id } : {}),
  })
  const r = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  })
  const text = await r.text()
  let j
  try { j = JSON.parse(text) } catch {
    throw new TokenError(502, 'refresh_failed', `Token endpoint balas non-JSON (${r.status}).`)
  }
  if (!r.ok || j.error || !j.access_token) {
    throw new TokenError(401, 'reconnect_required',
      j.error_description || j.error || `Perpanjangan token gagal (${r.status}). Sambungkan ulang akun TikTok.`)
  }

  const expiresAt = new Date(Date.now() + (Number(j.expires_in) || 0) * 1000).toISOString()
  await serviceRequest(`tiktok_connections?workspace_id=eq.${encodeURIComponent(conn.workspace_id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      access_token: j.access_token,
      // TikTok tak selalu memutar refresh_token; jangan hapus yang lama bila tak dikirim.
      ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }),
  })
  return { ...conn, access_token: j.access_token, refresh_token: j.refresh_token || conn.refresh_token, expires_at: expiresAt }
}

// Balik { access_token, advertiser_id, advertiser_name, expires_at, refreshed }.
// `force` dipakai tombol "Perbarui token" di Pengaturan.
export async function resolveConnection(userJwt, workspaceId, { force = false } = {}) {
  await assertOwnsWorkspace(userJwt, workspaceId)

  const rows = await serviceRequest(
    `tiktok_connections?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
    '&select=workspace_id,client_id,access_token,refresh_token,expires_at,advertiser_id,advertiser_name&limit=1'
  )
  const conn = Array.isArray(rows) ? rows[0] : null
  if (!conn) {
    throw new TokenError(404, 'not_connected', 'TikTok Ads belum tersambung untuk workspace ini.')
  }

  const expiresMs = Date.parse(conn.expires_at || '') || 0
  const stale = !conn.access_token || expiresMs - Date.now() < REFRESH_MARGIN_MS
  if (force || stale) {
    const fresh = await refreshToken(conn)
    return { ...fresh, refreshed: true }
  }
  return { ...conn, refreshed: false }
}

// Bungkus pemanggilan agar tiap endpoint tak menyalin blok try/catch yang sama.
// Balik null bila sudah mengirim respons error.
export async function connectionOrRespond(res, userJwt, workspaceId, opts) {
  try {
    return await resolveConnection(userJwt, workspaceId, opts)
  } catch (e) {
    if (isTokenError(e)) {
      res.status(e.http).json({ error: e.error, error_description: e.description })
      return null
    }
    res.status(502).json({ error: 'token_resolve_failed', error_description: String(e?.message || e) })
    return null
  }
}
