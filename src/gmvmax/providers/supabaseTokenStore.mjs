// Sumber token MCP dari Supabase (tabel tiktok_connections, hasil "Connect
// TikTok" di website) — pengganti Keychain+bridge. Baca token per-workspace,
// self-refresh bila mau kedaluwarsa, tulis balik token baru. Worker pakai
// service_role (bypass RLS). Pure: supabase, fetchImpl, sleepImpl & log di-inject.
import { refreshTiktokToken } from './tiktokTokenRefresh.mjs'
import { retryTransient, networkErrorCode, DEFAULT_RETRY_DELAYS_MS } from '../runtime/retry.mjs'
import { safeLog } from '../runtime/redact.mjs'

const SERVER_URL = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer'
const DEFAULT_MARGIN_MS = 10 * 60 * 1000 // refresh bila sisa < 10 menit

// supabase-js TIDAK melempar saat jaringan putus: ia mengembalikan
// { error:{message:'TypeError: fetch failed'}, status:0 }. Status 0 = permintaan
// tak pernah dijawab; 5xx/429 = dijawab tapi server sedang bermasalah.
function isTransientDbError(error, status) {
  if (status === 0 || status === 429 || (typeof status === 'number' && status >= 500)) return true
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(error?.message || '')
}

// → { accessToken, serverUrl, expiresAt(ms), source, canSelfRenew } ; kompatibel loadMcpToken().
// canSelfRenew = ada refresh_token tersimpan, jadi access token yang berumur ~24 jam
// akan dirotasi sendiri tiap run. Dipakai classifyAuth supaya umur pendek itu tidak
// dilaporkan sebagai keadaan darurat tiap hari.
//
// KETAHANAN (insiden 3 Okt 2026): token SELALU butuh refresh di run harian
// (expiry = jam run kemarin, margin 10 menit), jadi satu kedipan jaringan saat
// POST refresh dulu berarti satu hari data hilang. Sekarang galat transien
// diulang dengan jeda `retryDelaysMs`; jawaban OAuth definitif tidak.
export async function loadMcpTokenFromSupabase({
  supabase, workspaceId, fetchImpl = globalThis.fetch, now = Date.now(), marginMs = DEFAULT_MARGIN_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleepImpl, log = safeLog,
}) {
  if (!supabase) throw new Error('supabase client wajib')
  if (!workspaceId) throw new Error('workspaceId wajib (GMVMAX_TIKTOK_WORKSPACE_ID)')

  // Membaca baris TIDAK diulang di sini: supabase-js sudah mengulang sendiri
  // permintaan GET yang gagal di jaringan (PATCH/tulis-balik tidak → lihat bawah).
  const { data, error } = await supabase
    .from('tiktok_connections').select('*').eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw new Error(`baca tiktok_connections gagal: ${error.message}`)
  if (!data) throw new Error(`Belum ada koneksi TikTok utk workspace ${workspaceId} — Connect dulu di website.`)

  let expMs = Date.parse(data.expires_at)
  let accessToken = data.access_token
  let canSelfRenew = !!data.refresh_token
  const needRefresh = !Number.isFinite(expMs) || (expMs - now) < marginMs

  if (needRefresh) {
    if (!data.refresh_token) {
      throw new Error('access_token mau habis & tak ada refresh_token → user harus Connect ulang di website.')
    }
    // Satu baris log per percobaan yang gagal (termasuk yang terakhir). Nama
    // kunci sengaja menghindari kata "token"/"refresh" — redact.mjs menyensor
    // NILAI dari kunci yang memuat kata itu, dan angkanya justru ingin terbaca.
    const logAttempt = (step) => ({ error: e, attempt, maxAttempts, transient, willRetry, retryInMs }) => log({
      event: 'TOKEN_REFRESH_ATTEMPT_FAILED', level: willRetry ? 'warn' : 'error', workspace_id: workspaceId, step,
      attempt, max_attempts: maxAttempts, transient, will_retry: willRetry, retry_in_ms: retryInMs,
      http_status: e?.httpStatus ?? null, code: e?.oauthError ?? networkErrorCode(e) ?? null, message: e?.message ?? String(e),
    }, console.error)
    const logRecovered = (step, attempts) => {
      if (attempts > 1) log({ event: 'TOKEN_REFRESH_RECOVERED', workspace_id: workspaceId, step, attempts })
    }

    const tok = await refreshTiktokToken({
      refreshToken: data.refresh_token, clientId: data.client_id, fetchImpl, now: () => now,
      retryDelaysMs, sleepImpl, onAttemptFailed: logAttempt('oauth_post'),
    })
    logRecovered('oauth_post', tok.attempts)

    // Tulis balik DIULANG SENDIRI, tanpa pernah mengulang POST di atas. Server
    // sudah menjawab dan refresh token mungkin sudah dirotasi: token baru saat
    // ini hanya ada di memori proses. Kalau tulis balik gagal lalu kita
    // menyerah, run berikutnya memakai refresh token lama yang bisa jadi sudah
    // tak berlaku → koneksi mati sampai user Sambungkan ulang. UPDATE-nya
    // idempoten (nilai sama persis), jadi aman diulang.
    const patch = {
      access_token: tok.accessToken,
      refresh_token: tok.refreshToken,
      expires_at: new Date(tok.expiresAt).toISOString(),
      scope: tok.scope || data.scope,
      token_type: tok.tokenType,
      updated_at: new Date(now).toISOString(),
    }
    try {
      const wb = await retryTransient(async () => {
        const { error: uerr, status } = await supabase.from('tiktok_connections').update(patch).eq('workspace_id', workspaceId)
        if (uerr) {
          const e = new Error(`writeback token gagal: ${uerr.message}`)
          e.transient = isTransientDbError(uerr, status); e.httpStatus = status ?? null
          throw e
        }
      }, { delaysMs: retryDelaysMs, isTransient: e => e.transient === true, onAttemptFailed: logAttempt('writeback'), sleepImpl })
      logRecovered('writeback', wb.attempts)
    } catch (e) {
      log({
        event: 'TOKEN_WRITEBACK_LOST', level: 'critical', workspace_id: workspaceId, attempts: e.attempts ?? null,
        message: 'Refresh BERHASIL tapi token baru gagal disimpan. Bila TikTok merotasi refresh token, run berikutnya akan ditolak → Sambungkan ulang TikTok di website.',
      }, console.error)
      throw e
    }
    accessToken = tok.accessToken
    expMs = tok.expiresAt
    canSelfRenew = !!tok.refreshToken
  }

  return {
    accessToken, serverUrl: SERVER_URL, expiresAt: expMs, canSelfRenew,
    source: needRefresh ? 'supabase-refreshed' : 'supabase',
  }
}
