// Kelola anggota yang sudah ada — hanya owner.
// action: 'set_role' (editor|viewer) | 'remove' | 'revoke_invite'
import { guard, parseBody } from '../_lib/guard.js'
import { assertOwner, service, respondTeamError, TeamError } from '../_lib/team.js'

const ROLES = new Set(['editor', 'viewer'])

export default async function handler(req, res) {
  const auth = await guard(req, res, { limit: 30, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)
    const wsId = body?.workspace_id
    await assertOwner(auth.token, auth.userId, wsId)

    if (body?.action === 'revoke_invite') {
      if (!/^[0-9a-f-]{36}$/i.test(body?.token || '')) {
        throw new TeamError(400, 'invalid_request', 'Token undangan tidak valid.')
      }
      await service(
        `workspace_invites?token=eq.${encodeURIComponent(body.token)}` +
        `&workspace_id=eq.${encodeURIComponent(wsId)}`,
        { method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ revoked_at: new Date().toISOString() }) }
      )
      res.status(200).json({ ok: true }); return
    }

    const targetId = body?.user_id
    if (!/^[0-9a-f-]{36}$/i.test(targetId || '')) {
      throw new TeamError(400, 'invalid_request', 'user_id tidak valid.')
    }
    // Owner tak boleh menurunkan/mengeluarkan dirinya sendiri — itu jalan cepat
    // menuju workspace tanpa owner, yang tak bisa dikelola siapa pun lagi.
    if (targetId === auth.userId) {
      throw new TeamError(400, 'cannot_target_self',
        'Kamu tidak bisa mengubah atau mengeluarkan dirimu sendiri sebagai pemilik.')
    }
    // Owner lain juga tak bisa disentuh lewat jalur ini.
    const cur = await service(
      `workspace_members?workspace_id=eq.${encodeURIComponent(wsId)}` +
      `&user_id=eq.${encodeURIComponent(targetId)}&select=role&limit=1`
    )
    if (!Array.isArray(cur) || !cur[0]) {
      throw new TeamError(404, 'not_member', 'Orang ini bukan anggota workspace.')
    }
    if (cur[0].role === 'owner') {
      throw new TeamError(400, 'cannot_target_owner', 'Sesama pemilik tidak bisa diubah dari sini.')
    }

    const q = `workspace_members?workspace_id=eq.${encodeURIComponent(wsId)}&user_id=eq.${encodeURIComponent(targetId)}`
    if (body.action === 'remove') {
      await service(q, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else if (body.action === 'set_role') {
      if (!ROLES.has(body?.role)) {
        throw new TeamError(400, 'invalid_request', 'Peran hanya boleh editor atau viewer.')
      }
      await service(q, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
                         body: JSON.stringify({ role: body.role }) })
    } else {
      throw new TeamError(400, 'invalid_action', `action tak dikenal: ${body?.action}`)
    }
    res.status(200).json({ ok: true })
  } catch (e) { await respondTeamError(res, e) }
}
