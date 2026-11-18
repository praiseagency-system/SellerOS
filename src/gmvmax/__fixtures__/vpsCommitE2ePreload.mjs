// PRELOAD uji ujung-ke-ujung worker commit — dipakai vpsCommit.e2e.test.mjs lewat
// `node --import <file ini> src/gmvmax/vpsCommit.mjs`.
//
// vpsCommit.mjs menjalankan main() + process.exit saat diimpor, jadi tak bisa
// diuji sebagai modul. Di sini seluruh dunia luarnya diganti DALAM PROSES:
// globalThis.fetch diarahkan ke backend tiruan (Supabase REST, token endpoint
// TikTok, MCP layer). Tak ada satu byte pun keluar ke jaringan — URL yang tak
// dikenal dijawab 404 dan dicatat, lalu tes menggagalkannya.
//
// Skenario lewat env E2E_SCENARIO (JSON):
//   missing     { [workspaceId]: [k, ...] }  → tanggal (kemarin − k hari) TANPA import
//   tokenScript { [workspaceId]: ['net' | 'invalid_grant' | 'ok', ...] } → nasib tiap
//               POST refresh berurutan; habis → 'ok'
// Saat proses keluar, rekaman semua yang "ditulis" dicetak sebagai `E2E_RECORD {json}`.
import { resolveSnapshotDate, dateMinusDays } from '../runtime/jakartaDate.mjs'
import { ADVERTISERS } from '../advertisers.mjs'

const scenario = JSON.parse(process.env.E2E_SCENARIO || '{}')
const SB_ORIGIN = new URL(process.env.GMVMAX_SUPABASE_URL).origin
const TIKTOK = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer'
const NOW = Date.now()
const LATEST = resolveSnapshotDate('yesterday', NOW)
const POTRET = new Set(['gmvmax_campaign_settings', 'gmvmax_boost_sessions', 'gmvmax_spark_auth'])
const short = (ws) => ws.slice(0, 8)

const record = { latest: LATEST, tokenPosts: [], patches: [], rpc: [], potret: [], syncRuns: [], mcpTools: {}, sleeps: [], unexpected: [] }

// ── State awal ──────────────────────────────────────────────────────────────
// Token SEMUA workspace sudah kedaluwarsa 1 jam lalu → tiap run wajib refresh
// (di produksi expiry = jam run kemarin, jadi memang selalu begitu).
const workspaces = [...new Set(ADVERTISERS.map(a => a.workspaceId))]
const connections = Object.fromEntries(workspaces.map(ws => [ws, {
  workspace_id: ws, client_id: 'cid-e2e', access_token: `AT-${short(ws)}-0`, refresh_token: `RT-${short(ws)}-0`,
  expires_at: new Date(NOW - 3600 * 1000).toISOString(), scope: 'mcp:tt4b', token_type: 'Bearer',
}]))
// 30 hari riwayat sampai H-1 dari kemarin; "kemarin" sendiri belum ada (itulah tugas run ini).
const imports = []
for (const ws of workspaces) {
  const holes = new Set(scenario.missing?.[ws] || [])
  for (let k = 30; k >= 1; k--) if (!holes.has(k)) imports.push({ id: `imp-${short(ws)}-${k}`, ws, date: dateMinusDays(LATEST, k), current: true })
}
const tokenScript = Object.fromEntries(Object.entries(scenario.tokenScript || {}).map(([ws, s]) => [ws, [...s]]))

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const empty = (status) => new Response(null, { status })

// ── Token endpoint TikTok ───────────────────────────────────────────────────
function tokenEndpoint(init) {
  const rt = new URLSearchParams(String(init.body)).get('refresh_token')
  const ws = workspaces.find(w => rt.startsWith(`RT-${short(w)}-`))
  const outcome = tokenScript[ws]?.shift() ?? 'ok'
  record.tokenPosts.push({ ws, outcome, rt })
  if (outcome === 'net') throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) })
  if (outcome === 'invalid_grant') return json(400, { error: 'invalid_grant', error_description: 'refresh token expired' })
  const n = record.tokenPosts.filter(p => p.ws === ws && p.outcome === 'ok').length
  return json(200, { access_token: `AT-${short(ws)}-${n}`, refresh_token: `RT-${short(ws)}-${n}`, expires_in: 86400, scope: 'mcp:tt4b', token_type: 'Bearer' })
}

// ── MCP layer (tool_execute) ────────────────────────────────────────────────
// Laporan performa dijawab KOSONG (zero-data sah → snapshot 0 baris tetap
// ditulis); yang diuji di sini adalah pengkabelan, bukan isi angka.
function toolData(name, params) {
  switch (name) {
    case 'gmv_max_report_get': return { list: [], page_info: { total_page: 1 } }
    case 'gmv_max_campaign_get':
      return params.filtering?.gmv_max_promotion_types?.[0] === 'PRODUCT_GMV_MAX'
        ? { list: [{ campaign_id: 'c-e2e', campaign_name: 'E2E' }], page_info: { total_page: 1 } }
        : { list: [], page_info: { total_page: 1 } }
    case 'campaign_gmv_max_info_get': return { budget: 100000, roas_bid: 6, operation_status: 'ENABLE' }
    case 'campaign_gmv_max_session_list_get': return { session_list: [{ session_id: 's-e2e', bid_type: 'NO_BID', budget: 50000 }] }
    case 'campaign_gmv_max_session_get': return { session_list: [] }
    case 'tt_video_list_get': return { list: [{ item_info: { item_id: 'v-e2e' } }], page_info: { total_page: 1 } }
    default: record.unexpected.push(`MCP tool ${name}`); return {}
  }
}
function mcp(init) {
  const body = JSON.parse(String(init.body))
  if (body.method === 'initialize') return json(200, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18' } })
  if (body.method === 'notifications/initialized') return empty(202)
  const { tool_name, params } = body.params.arguments
  record.mcpTools[tool_name] = (record.mcpTools[tool_name] || 0) + 1
  return json(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify({ code: 0, message: 'OK', data: toolData(tool_name, params) }) }] } })
}

// ── Supabase REST (PostgREST) ───────────────────────────────────────────────
function rest(u, init) {
  const table = u.pathname.replace('/rest/v1/', '')
  const q = u.searchParams
  const method = String(init.method || 'GET').toUpperCase()
  const eq = (k) => { const v = q.get(k); return v?.startsWith('eq.') ? v.slice(3) : null }
  const body = () => JSON.parse(String(init.body))

  if (table === 'tiktok_connections' && method === 'GET') return json(200, [connections[eq('workspace_id')]].filter(Boolean))
  if (table === 'tiktok_connections' && method === 'PATCH') {
    const ws = eq('workspace_id')
    Object.assign(connections[ws], body()); record.patches.push(ws)
    return empty(204)
  }
  if (table === 'gmvmax_imports' && method === 'GET') {
    let rows = imports.filter(r => r.ws === eq('workspace_id') && (q.get('is_current') !== 'eq.true' || r.current))
    for (const cond of q.getAll('snapshot_date')) {
      const op = cond.slice(0, cond.indexOf('.')), v = cond.slice(cond.indexOf('.') + 1)
      rows = rows.filter(r => (op === 'eq' ? r.date === v : op === 'gte' ? r.date >= v : op === 'lte' ? r.date <= v : true))
    }
    rows = rows.sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ id: r.id, name: r.date, snapshot_date: r.date, totals: {}, created_at: new Date(NOW).toISOString() }))
    if (q.get('limit')) rows = rows.slice(0, Number(q.get('limit')))
    return json(200, rows)
  }
  if (table === 'gmvmax_creatives' && method === 'GET') return json(200, [])
  if (table === 'rpc/gmvmax_write_versioned_snapshot' && method === 'POST') {
    const b = body()
    for (const r of imports) if (r.ws === b.p_workspace_id && r.date === b.p_snapshot_date) r.current = false
    const id = `imp-new-${record.rpc.length + 1}`
    imports.push({ id, ws: b.p_workspace_id, date: b.p_snapshot_date, current: true })
    record.rpc.push({ ws: b.p_workspace_id, date: b.p_snapshot_date, rows: b.p_creatives.length, writer_kind: b.p_writer_kind })
    return json(200, { import_id: id, version: 1, content_changed: true, noop: false })
  }
  if (POTRET.has(table) && method === 'POST') {
    const rows = body()
    record.potret.push({ table, ws: rows[0]?.workspace_id ?? null, dates: [...new Set(rows.map(r => r.snapshot_date))] })
    return empty(201)
  }
  if (table === 'gmvmax_sync_runs' && method === 'POST') {
    const b = body()
    record.syncRuns.push({ ws: b.workspace_id, date: b.snapshot_date, mode: b.mode, status: b.status, error: b.error })
    return empty(201)
  }
  record.unexpected.push(`${method} ${table}`)
  return json(404, { message: `rute tak dikenal backend tiruan: ${method} ${table}` })
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input))
  if (url === `${TIKTOK}/oauth/token`) return tokenEndpoint(init)
  if (url === TIKTOK) return mcp(init)
  const u = new URL(url)
  if (u.origin === SB_ORIGIN && u.pathname.startsWith('/rest/v1/')) return rest(u, init)
  record.unexpected.push(`fetch ${url}`)
  return json(404, { message: 'di luar backend tiruan' })
}

// Jeda (retry 2/5/15 dtk, spasi rate-limit 3 dtk) dicatat lalu dipadatkan jadi
// ≤1 ms supaya tes selesai dalam hitungan detik. Urutannya tetap sama.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...args) => {
  if (ms >= 1000) record.sleeps.push(ms)
  return realSetTimeout(fn, Math.min(ms ?? 0, 1), ...args)
}

// supabase-js (realtime) menolak dibuat di Node < 22 tanpa WebSocket global.
// Worker tak pernah membuka koneksi realtime; rintisan kosong cukup agar tes
// ini juga jalan di CI (Node 20). Di VPS produksi Node 22+ tetap WAJIB.
globalThis.WebSocket ??= class {}

process.on('exit', () => { process.stdout.write(`\nE2E_RECORD ${JSON.stringify(record)}\n`) })
