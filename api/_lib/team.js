// Operasi keanggotaan workspace — SEMUANYA di sisi server.
//
// workspace_members & workspace_invites sengaja tak bisa ditulis browser
// (0052 & 0055): kalau bisa, siapa pun tinggal menyisipkan dirinya ke workspace
// orang lain. Jadi seluruh perubahan keanggotaan lewat sini.
//
// Pola izinnya sama dengan api/_lib/tiktokToken.js dan urutannya sama pentingnya:
// kepemilikan diperiksa dengan JWT PEMANGGIL dulu (RLS yang memutuskan), baru
// service_role dipakai. service_role menembus semua RLS, jadi ia tak boleh
// menyentuh apa pun sebelum hak si pemanggil terbukti.
import { selectAsUser, supabaseEnv } from './guard.js'

export class TeamError extends Error {
  constructor(http, error, description) {
    super(description || error)
    this.http = http; this.error = error; this.description = description
  }
}
export const isTeamError = (e) => e instanceof TeamError

export async function service(path, init = {}) {
  const { url, secretKey } = supabaseEnv()
  if (!url || !secretKey) {
    throw new TeamError(503, 'server_unconfigured', 'Kunci server belum tersedia di runtime fungsi.')
  }
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: secretKey, Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) {
    throw new TeamError(502, 'db_error', `PostgREST ${r.status}: ${(await r.text()).slice(0, 140)}`)
  }
  // Badan kosong sah untuk return=minimal (204 pada PATCH, 201 pada POST).
  const body = await r.text()
  return body.trim() ? JSON.parse(body) : null
}

const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(v || '')

// Hanya owner yang boleh mengelola anggota. Diperiksa dengan JWT pemanggil:
// RLS `workspace_members_member_read` hanya memperlihatkan baris workspace yang
// dia ikuti, jadi baris "owner" milik orang lain tak akan pernah terbaca.
export async function assertOwner(userJwt, userId, workspaceId) {
  if (!isUuid(workspaceId)) throw new TeamError(400, 'invalid_request', 'workspace_id bukan UUID.')
  let rows
  try {
    rows = await selectAsUser(
      userJwt,
      `workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`
    )
  } catch (e) {
    throw new TeamError(502, 'membership_lookup_failed', String(e?.message || e))
  }
  // "Bukan owner" dan "bukan anggota" sengaja berjawaban sama.
  if (!Array.isArray(rows) || rows[0]?.role !== 'owner') {
    throw new TeamError(403, 'not_owner', 'Hanya pemilik workspace yang bisa mengelola anggota.')
  }
}

export async function respondTeamError(res, e) {
  if (isTeamError(e)) { res.status(e.http).json({ error: e.error, error_description: e.description }); return }
  res.status(502).json({ error: 'team_failed', error_description: String(e?.message || e) })
}

export const normEmail = (v) => String(v || '').trim().toLowerCase()
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
