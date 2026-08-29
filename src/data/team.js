// Keanggotaan workspace — sisi browser.
//
// BACA langsung dari Supabase (RLS `*_member_read` sudah menjaga: hanya
// workspace yang kita ikuti yang terlihat). MENULIS selalu lewat server
// (api/team/*), karena workspace_members & workspace_invites sengaja tak bisa
// ditulis browser — kalau bisa, siapa pun tinggal menyisipkan dirinya ke
// workspace orang lain.
import { supabase } from '../lib/supabase'
import { postJson } from '../lib/apiClient'
import { getCurrentWorkspaceId } from '../utils/workspace'

// Anggota + emailnya. `profiles` dibaca terpisah lalu digabung di sini:
// PostgREST tak bisa menembusi join ke profiles tanpa relasi FK yang dideklarasikan.
export async function listMembers(wsId = getCurrentWorkspaceId()) {
  if (!wsId) return []
  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, role, created_at')
    .eq('workspace_id', wsId)
  if (error) throw error
  const rows = data || []
  if (!rows.length) return []
  const { data: profs } = await supabase
    .from('profiles').select('id, email').in('id', rows.map(r => r.user_id))
  const byId = Object.fromEntries((profs || []).map(p => [p.id, p.email]))
  const urut = { owner: 0, editor: 1, viewer: 2 }
  return rows
    .map(r => ({ ...r, email: byId[r.user_id] || '—' }))
    .sort((a, b) => (urut[a.role] ?? 9) - (urut[b.role] ?? 9) || a.email.localeCompare(b.email))
}

// Undangan yang masih menunggu (belum dipakai, belum dicabut, belum kedaluwarsa).
export async function listPendingInvites(wsId = getCurrentWorkspaceId()) {
  if (!wsId) return []
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('token, email, role, expires_at, created_at')
    .eq('workspace_id', wsId)
    .is('accepted_at', null).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const inviteMember = (email, role, wsId = getCurrentWorkspaceId()) =>
  postJson('/api/team/invite', { workspace_id: wsId, email, role })

export const setMemberRole = (userId, role, wsId = getCurrentWorkspaceId()) =>
  postJson('/api/team/members', { workspace_id: wsId, action: 'set_role', user_id: userId, role })

export const removeMember = (userId, wsId = getCurrentWorkspaceId()) =>
  postJson('/api/team/members', { workspace_id: wsId, action: 'remove', user_id: userId })

export const revokeInvite = (token, wsId = getCurrentWorkspaceId()) =>
  postJson('/api/team/members', { workspace_id: wsId, action: 'revoke_invite', token })

export const acceptInvite = (token) => postJson('/api/team/accept', { token })
