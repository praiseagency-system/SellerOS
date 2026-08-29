// Buat undangan anggota — hanya owner workspace.
// Balik { token, url } yang tinggal disalin & dikirim owner lewat WhatsApp.
// Email TIDAK dikirim dari sini: SMTP proyek masih bawaan Supabase yang
// dibatasi beberapa email per jam (lihat 0055).
import { guard, parseBody } from '../_lib/guard.js'
import { assertOwner, service, respondTeamError, TeamError, normEmail, isEmail } from '../_lib/team.js'

const ROLES = new Set(['editor', 'viewer'])

export default async function handler(req, res) {
  const auth = await guard(req, res, { limit: 20, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)
    const email = normEmail(body?.email)
    const role = body?.role || 'editor'
    if (!isEmail(email)) throw new TeamError(400, 'invalid_request', 'Alamat email tidak valid.')
    // 'owner' sengaja tak bisa diundang — kepemilikan tak dipindah lewat tautan chat.
    if (!ROLES.has(role)) throw new TeamError(400, 'invalid_request', 'Peran hanya boleh editor atau viewer.')

    await assertOwner(auth.token, auth.userId, body?.workspace_id)

    // Sudah jadi anggota? Undangan baru cuma membingungkan. Email pengguna ada
    // di `profiles` (auth.users tak diekspos PostgREST).
    const profil = await service(`profiles?select=id&email=eq.${encodeURIComponent(email)}&limit=1`)
    const calonId = Array.isArray(profil) ? profil[0]?.id : null
    if (calonId) {
      const sudah = await service(
        `workspace_members?workspace_id=eq.${encodeURIComponent(body.workspace_id)}` +
        `&user_id=eq.${calonId}&select=user_id&limit=1`
      )
      if (Array.isArray(sudah) && sudah[0]) {
        throw new TeamError(409, 'already_member', 'Orang ini sudah menjadi anggota workspace.')
      }
    }

    // Undangan aktif yang belum dipakai untuk email yang sama: pakai ulang
    // supaya tidak menumpuk tautan yang sama-sama sah.
    const live = await service(
      `workspace_invites?workspace_id=eq.${encodeURIComponent(body.workspace_id)}` +
      `&email=eq.${encodeURIComponent(email)}&accepted_at=is.null&revoked_at=is.null` +
      `&expires_at=gt.${new Date().toISOString()}&select=token,role&limit=1`
    )
    let token = Array.isArray(live) && live[0] ? live[0].token : null

    if (!token) {
      const created = await service('workspace_invites', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          workspace_id: body.workspace_id, email, role, invited_by: auth.userId,
        }),
      })
      token = Array.isArray(created) ? created[0]?.token : created?.token
    }
    if (!token) throw new TeamError(502, 'invite_failed', 'Undangan gagal dibuat.')

    const origin = req.headers?.origin || 'https://selleros.praiseagency.id'
    res.status(200).json({ token, url: `${origin}/join-team?t=${token}`, email, role })
  } catch (e) { await respondTeamError(res, e) }
}
