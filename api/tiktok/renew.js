// Perpanjang token TikTok untuk satu workspace (tombol "Perbarui token" di
// Pengaturan → Integrasi).
//
// Dulu ini dikerjakan browser: ia membaca `refresh_token` dari DB lalu
// menukarnya sendiri. Sekarang browser cukup menyebut workspace-nya — server
// yang membaca refresh_token (service_role, setelah kepemilikan terbukti),
// menukarnya ke TikTok, dan menyimpan hasilnya. Token tak pernah dikirim balik
// ke browser; yang dikembalikan hanya kapan kedaluwarsanya.
import { guard, parseBody } from '../_lib/guard.js'
import { connectionOrRespond } from '../_lib/tiktokToken.js'

export default async function handler(req, res) {
  const auth = await guard(req, res, { limit: 10, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)
    const conn = await connectionOrRespond(res, auth.token, body?.workspace_id, { force: true })
    if (!conn) return
    res.status(200).json({
      ok: true,
      expires_at: conn.expires_at,
      advertiser_id: conn.advertiser_id ?? null,
      advertiser_name: conn.advertiser_name ?? null,
    })
  } catch (e) {
    res.status(502).json({ error: 'renew_failed', error_description: String(e?.message || e) })
  }
}
