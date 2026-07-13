// Sync GMV Max: file hasil pull TikTok API (gmv_max_report_get) → Supabase.
// Dijalankan Claude Code (yang memegang MCP) sebagai worker ETL. Menulis snapshot
// ke gmvmax_imports/gmvmax_creatives memakai service-role (bypass RLS), workspace
// ditentukan eksplisit lewat manifest (bukan localStorage).
//
// Pemakaian:  node --run atau via esbuild bundle. Argumen: path manifest JSON.
//   node scripts/syncGmvMax.mjs manifest.json
// Manifest:
//   {
//     "workspaceId": "10280d7b-...",
//     "snapshot": { "date":"2026-07-08", "name":"2–8 Jul 2026 (API)",
//                   "startDate":"2026-07-02", "endDate":"2026-07-08", "currency":"IDR" },
//     "pairs": [ { "file":"/abs/pull.txt", "campaignId":"...", "campaignName":"...",
//                  "itemGroupId":"..." }, ... ]
//   }
// Setiap `file` = respons mentah gmv_max_report_get ({ data:{ list:[...] } }).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseGmvMaxApiRows } from '../src/utils/apiGmvMax.js'

const CHUNK = 500

function parseEnv(p) {
  return Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter(Boolean)
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
}

// Ambil data.list dari file pull (toleran terhadap pembungkus [{type,text}]).
function readPullList(file) {
  const raw = readFileSync(file, 'utf8')
  let obj = JSON.parse(raw)
  if (Array.isArray(obj) && obj[0]?.text) obj = JSON.parse(obj[0].text)
  const list = obj?.data?.list
  if (!Array.isArray(list)) throw new Error(`Format tak dikenali: ${file}`)
  return list
}

// Map row parser → baris tabel gmvmax_creatives (skema Supabase).
function creativeToRow(importId, r) {
  return {
    import_id: importId,
    video_id: r.videoId, campaign_name: r.campaignName, campaign_id: r.campaignId,
    product_id: r.productId, creative_type: r.creativeType, video_title: r.videoTitle,
    tiktok_account: r.tiktokAccount, time_posted: r.timePosted, status: r.status, auth_type: r.authType,
    cost: r.cost, sku_orders: r.skuOrders, cost_per_order: r.costPerOrder,
    gross_revenue: r.grossRevenue, roas: r.roas,
    impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, cvr: r.cvr,
    vr_2s: r.vr2s, vr_6s: r.vr6s, vr_25: r.vr25, vr_50: r.vr50, vr_75: r.vr75, vr_100: r.vr100,
    hook_tag: r.hookTag, raw_data: null,
  }
}

async function main() {
  const manifestPath = process.argv[2]
  if (!manifestPath) throw new Error('Argumen manifest JSON wajib.')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const { workspaceId, snapshot, pairs } = manifest
  if (!workspaceId || !snapshot?.date || !Array.isArray(pairs)) throw new Error('Manifest tidak lengkap.')

  // .env dibaca relatif cwd — jalankan dari root repo (tools/shopee-quadrant).
  const local = parseEnv('.env.local')
  const sync = parseEnv('.env.sync.local')
  const sb = createClient(local.VITE_SUPABASE_URL, sync.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

  // 1) Map semua pair → rows gabungan.
  // Bila manifest memuat `campaignTotals` (total campaign-level per campaign =
  // kebenaran dashboard), pakai MODE REKONSILIASI: buang baris sistem (-1) dari
  // mapper lalu tambah SATU baris "Non-attributed" per campaign senilai
  // residual = total_campaign − Σ(baris creative). Menjamin total snapshot =
  // total campaign = dashboard, tanpa risiko -1 dobel/kurang antar-SPU.
  const currency = snapshot.currency || 'IDR'
  const campaignTotals = manifest.campaignTotals || null
  const nameByCampaign = Object.fromEntries(pairs.map(p => [p.campaignId, p.campaignName]))
  const allRows = []
  const attributed = {} // campaignId → { cost, rev, orders }
  for (const p of pairs) {
    const list = readPullList(p.file)
    const { rows } = parseGmvMaxApiRows(list, {
      currency, campaignId: p.campaignId, campaignName: p.campaignName, productId: p.itemGroupId,
      startDate: snapshot.startDate, endDate: snapshot.endDate, snapshotDate: snapshot.date,
    })
    const kept = campaignTotals ? rows.filter(r => !r.isSystem) : rows
    allRows.push(...kept)
    if (campaignTotals) {
      const a = attributed[p.campaignId] || (attributed[p.campaignId] = { cost: 0, rev: 0, orders: 0 })
      for (const r of kept) { a.cost += r.cost ?? 0; a.rev += r.grossRevenue ?? 0; a.orders += r.skuOrders ?? 0 }
    }
    console.log(`  pair ${p.campaignName} / ${p.itemGroupId}: ${list.length} baris mentah → ${kept.length} aktif`)
  }

  if (campaignTotals) {
    for (const [cid, tot] of Object.entries(campaignTotals)) {
      const a = attributed[cid] || { cost: 0, rev: 0, orders: 0 }
      const rc = (Number(tot.cost) || 0) - a.cost
      const rr = (Number(tot.gross_revenue) || 0) - a.rev
      const ro = Math.max(0, (Number(tot.orders) || 0) - a.orders)
      if (rc > 1 || rr > 1) {
        allRows.push({
          videoId: null, campaignName: nameByCampaign[cid] || '', campaignId: cid, productId: null,
          creativeType: 'Product card', videoTitle: '(Non-attributed / sistem)', tiktokAccount: null,
          timePosted: null, status: '', authType: '', currency,
          cost: Math.max(0, rc), skuOrders: ro, costPerOrder: null, grossRevenue: Math.max(0, rr),
          roas: rc > 0 ? rr / rc : null, impressions: null, clicks: null, ctr: null, cvr: null,
          vr2s: null, vr6s: null, vr25: null, vr50: null, vr75: null, vr100: null,
          hookTag: null, hasSpend: rc > 0, isSystem: true,
        })
        console.log(`  rekonsiliasi ${nameByCampaign[cid] || cid}: +Rp${Math.round(Math.max(0, rc)).toLocaleString('id')} non-attributed`)
      }
    }
  }

  const totals = allRows.reduce((t, r) => {
    t.cost += r.cost ?? 0; t.revenue += r.grossRevenue ?? 0; t.orders += r.skuOrders ?? 0; return t
  }, { cost: 0, revenue: 0, orders: 0 })
  totals.roas = totals.cost > 0 ? totals.revenue / totals.cost : null

  // 2) Ganti snapshot tanggal yang sama (idempoten), lalu insert import + creatives.
  await sb.from('gmvmax_imports').delete().eq('workspace_id', workspaceId).eq('snapshot_date', snapshot.date)
  const { data: imp, error: e1 } = await sb.from('gmvmax_imports').insert({
    workspace_id: workspaceId, name: snapshot.name || snapshot.date,
    period_month: `${snapshot.date.slice(0, 7)}-01`, snapshot_date: snapshot.date,
    start_date: snapshot.startDate, end_date: snapshot.endDate, currency,
    source_filename: null, totals, settings: null,
  }).select('id').single()
  if (e1) throw new Error(`insert import gagal: ${e1.message}`)

  const payload = allRows.map(r => creativeToRow(imp.id, r))
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error: e2 } = await sb.from('gmvmax_creatives').insert(payload.slice(i, i + CHUNK))
    if (e2) throw new Error(`insert creatives gagal: ${e2.message}`)
  }

  console.log(`\n✅ Snapshot tersimpan (import ${imp.id})`)
  console.log(`   workspace ${workspaceId} | ${snapshot.name} | ${allRows.length} baris`)
  console.log(`   totals: cost=${Math.round(totals.cost).toLocaleString('id')} revenue=${Math.round(totals.revenue).toLocaleString('id')} roas=${totals.roas?.toFixed(2)}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
