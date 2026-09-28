// Kode spark dari Pikat — satu pintu server untuk sambungan & tarikan.
// action: 'connect' { token } | 'disconnect' | 'pull'
//   connect/disconnect → owner (sama seperti koneksi TikTok)
//   pull               → owner & editor; hasilnya ditulis ke pikat_spark_inbox
// Browser membaca kotak masuknya sendiri lewat RLS (migrasi 0064).
import { guard, parseBody } from '../_lib/guard.js'
import { respondTeamError, TeamError } from '../_lib/team.js'
import { assertRole, connectLink, disconnectLink, pullIntoInbox } from '../_lib/pikat.js'

export default async function handler(req, res) {
  // Tarikan = satu per halaman Boost dibuka / tombol "Tarik sekarang".
  const auth = await guard(req, res, { limit: 20, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)
    const wsId = body?.workspace_id
    const action = body?.action

    if (action === 'connect') {
      await assertRole(auth.token, auth.userId, wsId, ['owner'])
      const r = await connectLink(wsId, auth.userId, body?.token)
      res.status(200).json({ ok: true, ...r }); return
    }
    if (action === 'disconnect') {
      await assertRole(auth.token, auth.userId, wsId, ['owner'])
      await disconnectLink(wsId)
      res.status(200).json({ ok: true }); return
    }
    if (action === 'pull') {
      await assertRole(auth.token, auth.userId, wsId, ['owner', 'editor'])
      const r = await pullIntoInbox(wsId)
      res.status(200).json({ ok: true, ...r }); return
    }
    throw new TeamError(400, 'invalid_request', 'action harus connect, disconnect, atau pull.')
  } catch (e) {
    respondTeamError(res, e)
  }
}
