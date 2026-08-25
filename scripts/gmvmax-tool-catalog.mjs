// Enumerasi READ-ONLY katalog tool MCP tt-ads — memastikan ada/tidaknya endpoint
// pendaftaran kode spark/otorisasi video. Tidak memanggil endpoint tulis.
// tool_list/tool_get adalah TOOL MCP level atas (sibling tool_execute), jadi
// dipanggil via tools/call langsung, bukan lewat dispatcher tool_execute.
import { createClient } from '@supabase/supabase-js'
import { loadMcpTokenFromSupabase } from '../src/gmvmax/providers/supabaseTokenStore.mjs'
import { TikTokMcpProvider } from '../src/gmvmax/providers/tiktokMcp.mjs'

const sbUrl = process.env.VITE_SUPABASE_URL
const sbKey = process.env.SUPABASE_SECRET_KEY
const workspaceId = process.env.GMVMAX_WORKSPACE || '10280d7b-2994-4a40-b639-2d88e0e2018b'
if (!sbUrl || !sbKey) { console.error('env supabase kurang'); process.exit(1) }

const sb = createClient(sbUrl, sbKey)
const t = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId })
const provider = new TikTokMcpProvider({ token: t.accessToken, serverUrl: t.serverUrl, expiresAt: t.expiresAt })
await provider.ensureInit?.()

async function rawCall(name, args) {
  const r = await provider._post({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } })
  return r
}

// 1) Tools level atas MCP.
const top = await provider._post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
console.log('== MCP top-level tools ==')
for (const tl of top?.result?.tools || []) console.log('-', tl.name)

// 2) Katalog penuh via tool_list (coba tanpa arg, lalu variasi umum).
for (const args of [{}, { category: '' }, { query: 'video' }, { query: 'spark' }, { query: 'authorize' }]) {
  try {
    const r = await rawCall('tool_list', args)
    const text = r?.result?.content?.[0]?.text || JSON.stringify(r?.result || r)
    console.log(`\n== tool_list ${JSON.stringify(args)} ==\n${text}`)
    if (Object.keys(args).length === 0) break // tanpa arg sudah cukup bila sukses
  } catch (e) { console.log(`tool_list ${JSON.stringify(args)} gagal: ${e.message}`) }
}
