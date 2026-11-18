// Refresh access_token TikTok MCP via grant refresh_token — SERVER-SIDE (Node),
// jadi TIDAK kena CORS (beda dgn browser yg wajib proxy). Endpoint & public
// client (tanpa secret) sama dgn alur "Connect TikTok" di website.
// Pure: fetchImpl, tokenEndpoint & sleepImpl di-inject → unit-testable tanpa jaringan.
import { retryTransient, isTransientNetworkError, DEFAULT_RETRY_DELAYS_MS } from '../runtime/retry.mjs'

export const TIKTOK_TOKEN_ENDPOINT =
  'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/token'

// Jawaban OAuth DEFINITIF (RFC 6749 §5.2): server sudah memutuskan. Mengulang
// tak akan mengubah jawabannya — dan karena refresh token bisa dirotasi,
// permintaan ulang berarti memakai lagi token yang sudah dijawab server.
// TIDAK PERNAH diulang, apa pun status HTTP-nya.
const DEFINITIVE_OAUTH_ERRORS = new Set([
  'invalid_grant', 'invalid_client', 'invalid_request', 'unauthorized_client',
  'unsupported_grant_type', 'invalid_scope', 'access_denied',
])
// Sabuk kedua: TikTok pernah menjawab "refresh token expired" (27 Sep 2026)
// tanpa kode standar yang bisa diandalkan → kenali juga dari kalimatnya.
const DEFINITIVE_MESSAGE_RE = /expired|revoked|invalid[_ ]grant/i

function refreshError(message, { transient, httpStatus = null, oauthError = null }) {
  const e = new Error(message)
  e.transient = transient; e.httpStatus = httpStatus; e.oauthError = oauthError
  return e
}

// Transien = galat JARINGAN (fetch melempar: permintaan tak sampai / jawaban tak
// diterima) atau HTTP 5xx/429 tanpa vonis OAuth di badannya. Selain itu definitif.
//
// Kenapa mengulang aman walau nasib permintaan pertama tak diketahui: kalau
// server ternyata sempat memproses dan merotasi token lalu jawabannya hilang di
// jalan, token baru itu toh sudah tak pernah kita terima — percobaan ulang
// paling buruk dijawab invalid_grant (definitif → berhenti), hasil yang sama
// dengan tidak mengulang sama sekali. Kalau server belum memproses (kasus
// 3 Okt 2026: `fetch failed` dalam 4 detik), percobaan ulang menyelamatkan hari itu.
export function isTransientRefreshError(e) {
  if (typeof e?.transient === 'boolean') return e.transient
  return isTransientNetworkError(e)
}

// SATU permintaan ke token endpoint. Melempar galat yang sudah diklasifikasi.
async function requestToken({ body, fetchImpl, tokenEndpoint }) {
  const res = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const text = await res.text()
  const retryableStatus = res.status >= 500 || res.status === 429
  let j = null
  try { j = JSON.parse(text) } catch { /* ditangani di bawah */ }
  if (!j || typeof j !== 'object') {
    // Badan bukan JSON: halaman galat gateway (5xx) → transien; selain itu tak dikenal → jangan diulang.
    throw refreshError(`token endpoint non-JSON (${res.status}): ${String(text).slice(0, 160)}`, { transient: retryableStatus, httpStatus: res.status })
  }
  if (!res.ok || j.error) {
    const definitive = DEFINITIVE_OAUTH_ERRORS.has(j.error) || DEFINITIVE_MESSAGE_RE.test(`${j.error || ''} ${j.error_description || ''}`)
    throw refreshError(j.error_description || j.error || `refresh gagal (HTTP ${res.status})`,
      { transient: retryableStatus && !definitive, httpStatus: res.status, oauthError: j.error || null })
  }
  if (!j.access_token) throw refreshError('respons refresh tanpa access_token', { transient: false, httpStatus: res.status })
  return j
}

// → { accessToken, refreshToken, scope, tokenType, expiresAt(ms), attempts }
// refreshToken hasil = rotasi bila server kembalikan yg baru, else pakai lama.
// Galat transien diulang sesuai `retryDelaysMs` (default 2s/5s/15s → maks 4
// permintaan); `retryDelaysMs: []` = sekali tembak seperti perilaku lama.
// onAttemptFailed dipanggil tiap percobaan gagal (pemanggil yang mencatat log).
export async function refreshTiktokToken({
  refreshToken, clientId, fetchImpl = globalThis.fetch, tokenEndpoint = TIKTOK_TOKEN_ENDPOINT, now = Date.now,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleepImpl, onAttemptFailed,
}) {
  if (!refreshToken) throw new Error('refreshToken wajib')
  if (!clientId) throw new Error('clientId wajib')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  }).toString()
  const { value: j, attempts } = await retryTransient(
    () => requestToken({ body, fetchImpl, tokenEndpoint }),
    { delaysMs: retryDelaysMs, isTransient: isTransientRefreshError, onAttemptFailed, sleepImpl },
  )
  const expiresInSec = Number(j.expires_in) || 0
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || refreshToken, // rotasi bila ada; else pertahankan
    scope: j.scope || null,
    tokenType: j.token_type || 'Bearer',
    expiresAt: now() + expiresInSec * 1000,
    attempts,
  }
}
