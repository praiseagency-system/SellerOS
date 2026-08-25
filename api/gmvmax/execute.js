// Execute Layer — SATU-SATUNYA pintu eksekusi ke TikTok (Vercel serverless).
// FASE E0: kerangka + validasi kontrak; SEMUA aksi ditolak NOT_ENABLED —
// nol panggilan tulis TikTok, sesuai gerbang E0. Aksi pertama yang akan
// dibuka di E1: SPARK_BIND (tt_video_authorize_apply) setelah uji runtime.
//
// Kontrak body: { access_token, action_type, approval_id, params }
// Browser mengirim access_token miliknya sendiri (RLS owner) — pola sama
// dengan api/tiktok/advertisers.js. Endpoint ini yang bicara ke MCP (CORS).

const ALLOWED = new Set([
  'SPARK_BIND', 'SPARK_UNBIND', 'BUDGET_UPDATE', 'ROI_UPDATE',
  'STATUS_UPDATE', 'CREATIVE_EXCLUDE', 'SESSION_CREATE', 'SESSION_DELETE',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }
  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body || '{}')
    const { access_token, action_type, approval_id } = body || {}
    if (!access_token) { res.status(400).json({ error: 'invalid_request', error_description: 'access_token wajib' }); return }
    if (!ALLOWED.has(action_type)) { res.status(400).json({ error: 'invalid_action', error_description: `action_type tak dikenal: ${action_type}` }); return }
    if (!approval_id) { res.status(400).json({ error: 'approval_required', error_description: 'Eksekusi hanya menerima aksi ber-approval (approval_id wajib).' }); return }

    // FASE E0 — gerbang keras: belum ada satu pun aksi yang diaktifkan.
    res.status(501).json({
      error: 'not_enabled',
      error_description: `Aksi ${action_type} belum diaktifkan (Fase E0 — nol tulis TikTok). Aktivasi per aksi terjadi bertahap mulai E1.`,
    })
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
