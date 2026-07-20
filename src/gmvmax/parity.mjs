// Parity harness — OLD (snapshot produksi Supabase, source of truth) vs NEW
// (engine deterministik, in-memory). Aggregate + ROW-LEVEL by identity kanonik.
// TANPA toleransi sembarang: monetary exact; mismatch dilaporkan apa adanya.
import { rowIdentity } from './identity.mjs'

// Baca snapshot OLD dari Supabase → rows dalam bentuk kanonik (camelCase subset).
export async function loadOldSnapshot(sb, workspaceId, date) {
  const { data: imp, error: e1 } = await sb.from('gmvmax_imports')
    .select('id,name,snapshot_date,totals,created_at').eq('workspace_id', workspaceId).eq('snapshot_date', date).maybeSingle()
  if (e1) throw new Error(`loadOldSnapshot import: ${e1.message}`)
  if (!imp) return null
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('gmvmax_creatives')
      .select('video_id,campaign_id,product_id,creative_type,tiktok_account,cost,gross_revenue,sku_orders,roas')
      .eq('import_id', imp.id).range(from, from + 999)
    if (error) throw new Error(`loadOldSnapshot creatives: ${error.message}`)
    for (const r of data) rows.push({
      videoId: r.video_id, campaignId: r.campaign_id, productId: r.product_id,
      creativeType: r.creative_type, tiktokAccount: r.tiktok_account,
      cost: num(r.cost), grossRevenue: num(r.gross_revenue), skuOrders: num(r.sku_orders), roas: num(r.roas),
      isSystem: r.video_id == null, // baris non-attributed (reconciliation) → video_id null
    })
    if (data.length < 1000) break
    from += 1000
  }
  return { import: imp, rows }
}

const num = (v) => (v == null ? null : Number(v))
const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] ?? 0), 0)

export function compareParity(oldRows, newRows) {
  const agg = (rows) => ({
    cost: sum(rows, 'cost'), revenue: sum(rows, 'grossRevenue'), orders: sum(rows, 'skuOrders'),
    rowCount: rows.length,
    attributedCount: rows.filter(r => !r.isSystem).length,
    nonAttributedCount: rows.filter(r => r.isSystem).length,
  })
  const O = agg(oldRows), N = agg(newRows)
  O.roas = O.cost > 0 ? O.revenue / O.cost : null
  N.roas = N.cost > 0 ? N.revenue / N.cost : null

  const aggregate = {}
  for (const k of ['cost', 'revenue', 'orders', 'rowCount', 'attributedCount', 'nonAttributedCount']) {
    const d = N[k] - O[k]
    aggregate[k] = { old: O[k], new: N[k], absoluteDelta: d, status: d === 0 ? 'MATCH' : 'MISMATCH' }
  }
  aggregate.roas = { old: O.roas, new: N.roas, absoluteDelta: (N.roas ?? 0) - (O.roas ?? 0),
    status: fmtRoas(O.roas) === fmtRoas(N.roas) ? 'MATCH' : 'MISMATCH' }

  // Row-level by identity kanonik (campaign_id|product_id|video_id).
  const oi = index(oldRows), ni = index(newRows)
  const missingInNew = [], missingInOld = [], valueDiffs = [], classificationDiffs = []
  for (const [k, o] of oi) {
    const n = ni.get(k)
    if (!n) { missingInNew.push({ key: k, old: pick(o) }); continue }
    for (const f of ['cost', 'grossRevenue', 'skuOrders']) {
      if ((o[f] ?? 0) !== (n[f] ?? 0)) valueDiffs.push({ key: k, field: f, old: o[f], new: n[f], delta: (n[f] ?? 0) - (o[f] ?? 0) })
    }
    if (!!o.isSystem !== !!n.isSystem || o.creativeType !== n.creativeType)
      classificationDiffs.push({ key: k, old: { isSystem: o.isSystem, type: o.creativeType }, new: { isSystem: n.isSystem, type: n.creativeType } })
  }
  for (const [k, n] of ni) if (!oi.has(k)) missingInOld.push({ key: k, new: pick(n) })

  const rowLevelClean = !missingInNew.length && !missingInOld.length && !valueDiffs.length && !classificationDiffs.length
  const aggregateClean = Object.values(aggregate).every(a => a.status === 'MATCH')
  return {
    status: rowLevelClean && aggregateClean ? 'MATCH' : 'MISMATCH',
    aggregate,
    rowLevel: { missingInNew, missingInOld, valueDiffs, classificationDiffs,
      counts: { missingInNew: missingInNew.length, missingInOld: missingInOld.length, valueDiffs: valueDiffs.length, classificationDiffs: classificationDiffs.length } },
  }
}

// Identity kanonik bisa tabrakan HANYA bila data cacat; parity mengagregasi
// (menjumlah) baris ber-key sama agar perbandingan tetap total-preserving.
function index(rows) {
  const m = new Map()
  for (const r of rows) {
    const k = rowIdentity(r)
    const e = m.get(k)
    if (e) { e.cost += r.cost ?? 0; e.grossRevenue += r.grossRevenue ?? 0; e.skuOrders += r.skuOrders ?? 0; e._n++ }
    else m.set(k, { ...r, cost: r.cost ?? 0, grossRevenue: r.grossRevenue ?? 0, skuOrders: r.skuOrders ?? 0, _n: 1 })
  }
  return m
}
const pick = (r) => ({ campaignId: r.campaignId, productId: r.productId, videoId: r.videoId, cost: r.cost, grossRevenue: r.grossRevenue, isSystem: r.isSystem })
const fmtRoas = (v) => (v == null ? null : v.toFixed(2))
