// Enumerasi advertiser/toko yang dilihat token — Vercel serverless.
// MCP tt-ads (Streamable-HTTP) blok CORS dari browser → panggil server-side.
// Browser kirim access_token miliknya sendiri (boleh ia baca via RLS owner);
// fungsi ini panggil tool `auth_advertiser_get` lalu balikin {advertiser_id,name}.
// TIDAK menyimpan token.
//
// WAJIB sesi Supabase + origin dikenal + batas laju (api/_lib/guard.js).
// Sebelumnya siapa pun bisa memakai endpoint ini sebagai relai ke MCP TikTok.
import { guard, parseBody } from '../_lib/guard.js'
import { connectionOrRespond } from '../_lib/tiktokToken.js'

const MCP_URL = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer'

async function mcpPost(token, body) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const txt = await res.text()
  // MCP kadang balas teks polos (mis. "unauthorized" saat 401) — jangan biarkan
  // JSON.parse melempar sebelum status sempat diperiksa penelepon.
  let data = null
  try {
    if (txt.trim()) {
      if (txt.includes('data:')) {
        const line = txt.split('\n').find(x => x.startsWith('data:'))
        data = line ? JSON.parse(line.slice(5).trim()) : null
      } else data = JSON.parse(txt)
    }
  } catch { data = null }
  return { status: res.status, data, raw: txt.slice(0, 200) }
}

export default async function handler(req, res) {
  // Enumerasi advertiser dipanggil beberapa kali saat menyambung akun →
  // 20 per menit cukup lapang, tetap membatasi relai massal.
  const auth = await guard(req, res, { limit: 20, windowMs: 60_000 })
  if (!auth) return
  try {
    const body = parseBody(req)
    // Browser tak lagi mengirim token — cukup sebut workspace-nya, server yang
    // mengambil (dan menyegarkan) token setelah kepemilikan terbukti.
    const conn = await connectionOrRespond(res, auth.token, body?.workspace_id)
    if (!conn) return
    const token = conn.access_token

    // Handshake MCP (sama seperti worker): initialize → initialized → tools/call.
    const init = await mcpPost(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selleros', version: '1' } } })
    if (init.status === 401) { res.status(401).json({ error: 'auth', error_description: 'Token kedaluwarsa/invalid — perbarui token atau sambungkan ulang.' }); return }
    if (init.status !== 200 || !init.data?.result) { res.status(502).json({ error: 'mcp_init', error_description: `initialize gagal (${init.status})${init.raw ? `: ${init.raw}` : ''}` }); return }
    await mcpPost(token, { jsonrpc: '2.0', method: 'notifications/initialized' })

    const r = await mcpPost(token, { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'tool_execute', arguments: { tool_name: 'auth_advertiser_get', params: {} } } })
    if (r.status === 401) { res.status(401).json({ error: 'auth', error_description: 'Token kedaluwarsa/invalid.' }); return }
    const text = r.data?.result?.content?.[0]?.text
    const payload = text ? JSON.parse(text) : null
    if (!payload || payload.code !== 0) { res.status(502).json({ error: 'mcp_error', error_description: payload?.message || 'auth_advertiser_get gagal' }); return }

    const list = (payload.data?.list || []).map(x => ({ advertiser_id: x.advertiser_id, advertiser_name: x.advertiser_name }))
    res.status(200).json({ advertisers: list })
  } catch (e) {
    res.status(502).json({ error: 'proxy_error', error_description: String(e?.message || e) })
  }
}
