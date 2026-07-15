// Koneksi TikTok Ads per workspace (tabel tiktok_connections, RLS owner-only).
// Menyimpan token OAuth hasil "Connect TikTok" agar worker GMV Max bisa
// self-refresh. Satu baris per workspace.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { TIKTOK_OAUTH } from '../lib/tiktokOAuth'

// Ambil koneksi workspace aktif (atau null bila belum connect).
export async function getConnection(wsId = getCurrentWorkspaceId()) {
  if (!wsId) return null
  const { data, error } = await supabase
    .from('tiktok_connections')
    .select('*')
    .eq('workspace_id', wsId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

// Simpan/timpa koneksi (upsert by workspace_id). tok = hasil exchange/refresh.
export async function saveConnection(tok, wsId = getCurrentWorkspaceId()) {
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { data: userRes } = await supabase.auth.getUser()
  const { error } = await supabase.from('tiktok_connections').upsert({
    workspace_id: wsId,
    client_id: tok.clientId || TIKTOK_OAUTH.clientId,
    scope: tok.scope,
    token_type: tok.tokenType,
    access_token: tok.accessToken,
    refresh_token: tok.refreshToken,
    expires_at: new Date(tok.expiresAt).toISOString(),
    connected_by: userRes?.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id' })
  if (error) throw error
}

// Simpan advertiser/toko terpilih (pemetaan 1 workspace ↔ 1 advertiser).
export async function saveAdvertiser({ advertiser_id, advertiser_name }, wsId = getCurrentWorkspaceId()) {
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase.from('tiktok_connections')
    .update({ advertiser_id, advertiser_name, updated_at: new Date().toISOString() })
    .eq('workspace_id', wsId)
  if (error) throw error
}

// Putuskan koneksi (hapus baris).
export async function deleteConnection(wsId = getCurrentWorkspaceId()) {
  if (!wsId) return
  const { error } = await supabase.from('tiktok_connections').delete().eq('workspace_id', wsId)
  if (error) throw error
}
