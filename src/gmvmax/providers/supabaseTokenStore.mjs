// Sumber token MCP dari Supabase (tabel tiktok_connections, hasil "Connect
// TikTok" di website) — pengganti Keychain+bridge. Baca token per-workspace,
// self-refresh bila mau kedaluwarsa, tulis balik token baru. Worker pakai
// service_role (bypass RLS). Pure: supabase & fetchImpl di-inject.
import { refreshTiktokToken } from './tiktokTokenRefresh.mjs'

const SERVER_URL = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer'
const DEFAULT_MARGIN_MS = 10 * 60 * 1000 // refresh bila sisa < 10 menit

// → { accessToken, serverUrl, expiresAt(ms), source } ; kompatibel loadMcpToken().
export async function loadMcpTokenFromSupabase({
  supabase, workspaceId, fetchImpl = globalThis.fetch, now = Date.now(), marginMs = DEFAULT_MARGIN_MS,
}) {
  if (!supabase) throw new Error('supabase client wajib')
  if (!workspaceId) throw new Error('workspaceId wajib (GMVMAX_TIKTOK_WORKSPACE_ID)')

  const { data, error } = await supabase
    .from('tiktok_connections').select('*').eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw new Error(`baca tiktok_connections gagal: ${error.message}`)
  if (!data) throw new Error(`Belum ada koneksi TikTok utk workspace ${workspaceId} — Connect dulu di website.`)

  let expMs = Date.parse(data.expires_at)
  let accessToken = data.access_token
  const needRefresh = !Number.isFinite(expMs) || (expMs - now) < marginMs

  if (needRefresh) {
    if (!data.refresh_token) {
      throw new Error('access_token mau habis & tak ada refresh_token → user harus Connect ulang di website.')
    }
    const tok = await refreshTiktokToken({ refreshToken: data.refresh_token, clientId: data.client_id, fetchImpl, now: () => now })
    const { error: uerr } = await supabase.from('tiktok_connections').update({
      access_token: tok.accessToken,
      refresh_token: tok.refreshToken,
      expires_at: new Date(tok.expiresAt).toISOString(),
      scope: tok.scope || data.scope,
      token_type: tok.tokenType,
      updated_at: new Date(now).toISOString(),
    }).eq('workspace_id', workspaceId)
    if (uerr) throw new Error(`writeback token gagal: ${uerr.message}`)
    accessToken = tok.accessToken
    expMs = tok.expiresAt
  }

  return { accessToken, serverUrl: SERVER_URL, expiresAt: expMs, source: needRefresh ? 'supabase-refreshed' : 'supabase' }
}
