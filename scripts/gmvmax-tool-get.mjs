// Ambil skema tool tt_video_* via tool_get (read-only).
import { createClient } from '@supabase/supabase-js'
import { loadMcpTokenFromSupabase } from '../src/gmvmax/providers/supabaseTokenStore.mjs'
import { TikTokMcpProvider } from '../src/gmvmax/providers/tiktokMcp.mjs'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
const t = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: '10280d7b-2994-4a40-b639-2d88e0e2018b' })
const provider = new TikTokMcpProvider({ token: t.accessToken, serverUrl: t.serverUrl, expiresAt: t.expiresAt })
await provider.ensureInit?.()

for (const name of ['tt_video_authorize_apply', 'tt_video_list_get', 'tt_video_info_get']) {
  const r = await provider._post({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'tool_get', arguments: { tool_name_list: [name] } } })
  const text = r?.data?.result?.content?.[0]?.text || r?.result?.content?.[0]?.text || JSON.stringify(r).slice(0, 300)
  console.log(`\n===== ${name} =====\n${text.slice(0, 2500)}`)
}
