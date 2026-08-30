// BACKFILL SURUT — sesi boost yang sudah telanjur berjalan → eksperimen.
//
// Dipakai sekali saat Jembatan 2 dipasang (31 Agu 2026): potret sesi boost sudah
// terkumpul sejak 28 Agu tapi item_id-nya kosong (endpoint detail belum pernah
// dipanggil), jadi Creative Boost tak bisa ditautkan ke videonya. Skrip ini:
//   1. tarik item_id LIVE utk sesi yang masih berjalan → tambal baris potret lama
//   2. buka eksperimen dari sesi (openExperimentsFromSessions — idempoten)
//   3. hitung checkpoint langsung, tanpa menunggu run 07:30 besok
//
// Read-only ke TikTok (hanya *_get). Menulis: gmvmax_boost_sessions.item_id &
// gmvmax_experiments. TIDAK menyentuh kanonik. Aman diulang.
//   node scripts/gmvmax-backfill-boost-experiments.mjs [--dry]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { TikTokMcpProvider } from '../src/gmvmax/providers/tiktokMcp.mjs'
import { loadMcpTokenFromSupabase } from '../src/gmvmax/providers/supabaseTokenStore.mjs'
import { fetchSessionItemIds } from '../src/gmvmax/outOfBandCapture.mjs'
import { openExperimentsFromSessions } from '../src/gmvmax/experimentOpener.mjs'
import { evaluateExperiments } from '../src/gmvmax/experimentEval.mjs'

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const pe = (p) => { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '') } return o }
const emit = (o) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')

const dry = process.argv.includes('--dry')
const L = pe(`${REPO}/.env.local`), S = pe(`${REPO}/.env.sync.local`)
const sb = createClient(L.VITE_SUPABASE_URL, S.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

// Semua workspace yang punya potret sesi boost — bukan hanya satu tenant.
const { data: ws, error: wsErr } = await sb.from('gmvmax_boost_sessions')
  .select('workspace_id,advertiser_id,campaign_id,session_id,item_id')
if (wsErr) { emit({ event: 'BACKFILL', state: 'DB_ERROR', message: wsErr.message }); process.exit(9) }
if (!ws?.length) { emit({ event: 'BACKFILL', state: 'NO_SESSIONS' }); process.exit(0) }

// ── 1. Tambal item_id yang kosong ───────────────────────────────────────────
const perWs = new Map()
for (const r of ws) {
  if (!perWs.has(r.workspace_id)) perWs.set(r.workspace_id, { advertiserId: r.advertiser_id, byCampaign: new Map(), missing: 0 })
  const w = perWs.get(r.workspace_id)
  if (r.item_id) continue
  w.missing++
  if (!w.byCampaign.has(r.campaign_id)) w.byCampaign.set(r.campaign_id, new Set())
  w.byCampaign.get(r.campaign_id).add(r.session_id)
}

for (const [workspaceId, w] of perWs) {
  if (!w.missing) { emit({ event: 'ITEM_ID_BACKFILL', workspace_id: workspaceId, state: 'LENGKAP' }); continue }
  let provider
  try {
    const t = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId })
    provider = new TikTokMcpProvider({ token: t.accessToken, serverUrl: t.serverUrl, expiresAt: t.expiresAt })
  } catch (e) { emit({ event: 'ITEM_ID_BACKFILL', workspace_id: workspaceId, state: 'TOKEN_GAGAL', message: e.message }); continue }

  let patched = 0, unresolved = 0
  for (const [campaignId, ids] of w.byCampaign) {
    const map = await fetchSessionItemIds(provider, { advertiserId: w.advertiserId, campaignId, sessionIds: [...ids] })
    for (const sessionId of ids) {
      const itemId = map.get(sessionId)
      // Sesi yang sudah SELESAI tak lagi dikembalikan API → item_id-nya hilang
      // permanen. Dicatat apa adanya, tidak ditebak dari belanja video.
      if (!itemId) { unresolved++; continue }
      if (dry) { patched++; continue }
      const { error } = await sb.from('gmvmax_boost_sessions')
        .update({ item_id: itemId }).eq('workspace_id', workspaceId).eq('session_id', sessionId).is('item_id', null)
      if (error) { emit({ event: 'ITEM_ID_PATCH_FAILED', workspace_id: workspaceId, session_id: sessionId, message: error.message }); continue }
      patched++
    }
    await new Promise(r => setTimeout(r, 2000)) // MCP rate limit — jangan diserbu
  }
  emit({ event: 'ITEM_ID_BACKFILL', workspace_id: workspaceId, state: dry ? 'DRY' : 'OK', patched, unresolved })
}

// ── 1b. Tautkan eksperimen yang telanjur dibuka TANPA asal-usul ─────────────
// Eksperimen yang dibuka sebelum migrasi 0057 di-apply masuk lewat jalur cadangan
// (tanpa kolom source_session_id). Kunci naturalnya sama dgn yang dipakai pembuka,
// jadi tautannya bisa dipulihkan tanpa menebak: subjek sama + mulai dalam 6 jam.
const NEAR_MS = 6 * 3600 * 1000
for (const [workspaceId] of perWs) {
  const { data: exps, error: ee } = await sb.from('gmvmax_experiments')
    .select('id,experiment_type,creative_video_id,campaign_id,start_at,source_session_id,source_approval_id')
    .eq('workspace_id', workspaceId).is('source_session_id', null).is('source_approval_id', null)
  if (ee) {
    // Kolomnya belum ada (0057 belum di-apply) → lewati, bukan gagal.
    emit({ event: 'EXP_LINK', workspace_id: workspaceId, state: 'DILEWATI', message: ee.message })
    continue
  }
  if (!exps?.length) { emit({ event: 'EXP_LINK', workspace_id: workspaceId, state: 'TAK_ADA_YATIM' }); continue }
  const { data: sess } = await sb.from('gmvmax_boost_sessions').select('*').eq('workspace_id', workspaceId)
  let linked = 0, ambigu = 0
  for (const e of exps) {
    const t = Date.parse(e.start_at)
    const cocok = [...new Map((sess || []).map(x => [x.session_id, x])).values()].filter(x => {
      const subjekSama = e.creative_video_id ? x.item_id === e.creative_video_id
        : (!e.creative_video_id && x.campaign_id === e.campaign_id)
      const st = Date.parse(x.schedule_start_time)
      return subjekSama && Number.isFinite(st) && Math.abs(st - t) <= NEAR_MS
    })
    // Dua sesi yang sama-sama cocok = tak bisa dipastikan yang mana; biarkan null
    // daripada memasang asal-usul yang salah.
    if (cocok.length !== 1) { ambigu++; continue }
    if (dry) { linked++; continue }
    const { error } = await sb.from('gmvmax_experiments')
      .update({ source_session_id: cocok[0].session_id }).eq('id', e.id)
    if (!error) linked++
  }
  emit({ event: 'EXP_LINK', workspace_id: workspaceId, state: dry ? 'DRY' : 'OK', linked, ambigu })
}

// ── 2 & 3. Buka eksperimen + hitung checkpoint ──────────────────────────────
for (const [workspaceId] of perWs) {
  const { data: conn } = await sb.from('tiktok_connections').select('store_id').eq('workspace_id', workspaceId).maybeSingle()
  if (!conn?.store_id) { emit({ event: 'EXP_OPEN', workspace_id: workspaceId, state: 'TANPA_STORE_ID' }); continue }
  if (dry) { emit({ event: 'EXP_OPEN', workspace_id: workspaceId, state: 'DRY' }); continue }
  try {
    const o = await openExperimentsFromSessions({ sb, workspaceId, storeId: conn.store_id })
    emit({ event: 'EXP_OPEN', workspace_id: workspaceId, state: 'OK', ...o })
  } catch (e) { emit({ event: 'EXP_OPEN', workspace_id: workspaceId, state: 'GAGAL', message: e.message }); continue }
  try {
    const r = await evaluateExperiments({ sb, workspaceId })
    emit({ event: 'EXP_EVAL', workspace_id: workspaceId, state: 'OK', updated: r.updated })
  } catch (e) { emit({ event: 'EXP_EVAL', workspace_id: workspaceId, state: 'GAGAL', message: e.message }) }
}
emit({ event: 'BACKFILL', state: 'SELESAI', dry })
