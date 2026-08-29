// Terima undangan anggota workspace.
//
// Yang menerima adalah pemanggil sendiri (dari sesinya), bukan siapa pun yang
// disebut di body — jadi tautan yang bocor tak bisa dipakai mendaftarkan orang
// lain. Ditambah undangan TERIKAT EMAIL: hanya pemilik alamat yang dituju yang
// bisa memakainya, sehingga tautan yang tersebar di grup WA tetap tak berguna
// bagi orang lain.
import { guard, parseBody, selectAsUser } from '../_lib/guard.js'
import { service, respondTeamError, TeamError, normEmail } from '../_lib/team.js'

export default async function handler(req, res) {
  const auth = await guard(req, res, { limit: 20, windowMs: 60_000 })
  if (!auth) return
  try {
    const token = parseBody(req)?.token
    if (!/^[0-9a-f-]{36}$/i.test(token || '')) {
      throw new TeamError(400, 'invalid_request', 'Token undangan tidak valid.')
    }

    const rows = await service(
      `workspace_invites?token=eq.${encodeURIComponent(token)}` +
      '&select=token,workspace_id,email,role,expires_at,accepted_at,revoked_at&limit=1'
    )
    const inv = Array.isArray(rows) ? rows[0] : null
    // Semua kegagalan token berjawaban sama: token tak sah/kedaluwarsa tak
    // boleh bisa dibedakan dari token milik workspace lain.
    if (!inv || inv.revoked_at || inv.accepted_at || Date.parse(inv.expires_at) < Date.now()) {
      throw new TeamError(404, 'invite_invalid', 'Undangan tidak berlaku, sudah dipakai, atau kedaluwarsa.')
    }

    // Email pemanggil diambil dari sesinya sendiri, bukan dari body.
    let me
    try { me = await selectAsUser(auth.token, `profiles?id=eq.${auth.userId}&select=email&limit=1`) }
    catch (e) { throw new TeamError(502, 'profile_lookup_failed', String(e?.message || e)) }
    const myEmail = normEmail(Array.isArray(me) ? me[0]?.email : null)
    if (!myEmail || myEmail !== normEmail(inv.email)) {
      throw new TeamError(403, 'email_mismatch',
        `Undangan ini ditujukan untuk ${inv.email}. Masuk dengan akun itu untuk menerimanya.`)
    }

    await service('workspace_members', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        workspace_id: inv.workspace_id, user_id: auth.userId, role: inv.role,
      }),
    })
    await service(`workspace_invites?token=eq.${encodeURIComponent(token)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ accepted_at: new Date().toISOString(), accepted_by: auth.userId }),
    })

    res.status(200).json({ ok: true, workspace_id: inv.workspace_id, role: inv.role })
  } catch (e) { await respondTeamError(res, e) }
}
