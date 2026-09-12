// Portal campaign untuk client/atasan — satu link per WORKSPACE yang memuat
// seluruh campaign beserta status jadwal & status persetujuannya.
//
// Sisi approver hanya lewat RPC token-gated (SECURITY DEFINER): tak ada akses
// RLS ke tabel. Sisi owner memakai tabel `workspaces` biasa (owner-only via
// policy ws_owner_modify).
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

// ── Sisi approver ───────────────────────────────────────────────────────────
// Daftar campaign yang boleh dilihat pemegang token. Melempar 'invalid token'
// atau 'not authorized'.
export async function getPortalCampaigns(token) {
  const { data, error } = await supabase.rpc('portal_campaigns', { p_token: token })
  if (error) throw error
  return data
}

// ── Sisi owner ──────────────────────────────────────────────────────────────
export async function getPortalSettings() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return null
  const { data, error } = await supabase
    .from('workspaces').select('id, name, portal_token, portal_access, portal_emails').eq('id', wsId).single()
  if (error) throw error
  return {
    id: data.id,
    name: data.name,
    token: data.portal_token || '',
    access: data.portal_access === 'public' ? 'public' : 'private',
    emails: Array.isArray(data.portal_emails) ? data.portal_emails : [],
  }
}

const cleanEmails = list => [...new Set((list || []).map(e => (e || '').trim().toLowerCase()).filter(Boolean))]

export async function updatePortalSettings({ access, emails }) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase.from('workspaces').update({
    portal_access: access === 'public' ? 'public' : 'private',
    portal_emails: cleanEmails(emails),
  }).eq('id', wsId)
  if (error) throw error
}

// Buat token portal sekali; kalau sudah ada, pakai yang lama.
export async function ensurePortalToken() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { data, error } = await supabase.from('workspaces').select('portal_token').eq('id', wsId).single()
  if (error) throw error
  if (data?.portal_token) return data.portal_token
  const { data: upd, error: e2 } = await supabase
    .from('workspaces').update({ portal_token: crypto.randomUUID() }).eq('id', wsId).select('portal_token').single()
  if (e2) throw e2
  return upd.portal_token
}

// Token baru = link lama langsung mati.
export async function regeneratePortalToken() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { data, error } = await supabase
    .from('workspaces').update({ portal_token: crypto.randomUUID() }).eq('id', wsId).select('portal_token').single()
  if (error) throw error
  return data.portal_token
}

// Sembunyikan / tampilkan satu campaign di portal client.
export async function setCampaignPortalHidden(campaignId, hidden) {
  const { error } = await supabase.from('campaigns').update({ portal_hidden: !!hidden }).eq('id', campaignId)
  if (error) throw error
}
