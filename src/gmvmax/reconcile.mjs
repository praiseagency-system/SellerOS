// Canonical GMV Max reconciliation — SATU sumber kebenaran (Architecture Rule).
// Diekstrak APA ADANYA dari scripts/syncGmvMax.mjs (baris 74-115) tanpa mengubah
// semantik. Karakterisasi test (reconcile.test.mjs) membuktikan kesetaraan dengan
// perilaku produksi lama. Murni & tanpa dependency (mudah diuji via node:test).
//
// Kontrak (dibuktikan read-only 2026-07-10):
//  - Baris `-1` = non-attributed per (campaign, item_group_id). residual per
//    campaign = campaignTotal − Σ(baris attributed) = Σ(cost -1 antar-SPU) ≥ 0
//    SELAMA pairs+pages lengkap. Kelengkapan wajib dijamin caller (Reliability Rule).
//  - Identity kanonik baris = (campaign_id, item_group_id, item_id); item_id TIDAK
//    unik lintas pair — lihat identity.mjs.
//
// Input:
//   pairs: [{ campaignId, campaignName, itemGroupId, rows }]
//     rows = hasil apiGmvMax.parseGmvMaxApiRows(...).rows (sudah ternormalisasi,
//            sudah terfilter "active", membawa flag isSystem).
//   campaignTotals: { [campaignId]: { cost, gross_revenue, orders } } | null
//     Bila null → mode passthrough (rows apa adanya, TANPA rekonsiliasi) — persis
//     cabang lama `campaignTotals ? ... : rows`.
//   currency: string (default 'IDR').
//
// Output: { rows, totals, report }
//   rows    = attributed rows (tanpa -1) + baris rekonsiliasi non-attributed.
//   totals  = { cost, revenue, orders, roas }.
//   report  = ringkasan deterministik untuk RunReporter/observability.

const RECON_THRESHOLD = 1 // tulis baris rekonsiliasi bila residual cost/rev > 1 (sama seperti lama)

export function reconcile({ pairs, campaignTotals = null, currency = 'IDR' }) {
  if (!Array.isArray(pairs)) throw new Error('reconcile: pairs harus array')
  const nameByCampaign = Object.fromEntries(pairs.map(p => [p.campaignId, p.campaignName]))
  const allRows = []
  const attributed = {} // campaignId → { cost, rev, orders }
  let attributedCount = 0

  for (const p of pairs) {
    const rows = p.rows || []
    const kept = campaignTotals ? rows.filter(r => !r.isSystem) : rows
    allRows.push(...kept)
    attributedCount += kept.length
    if (campaignTotals) {
      const a = attributed[p.campaignId] || (attributed[p.campaignId] = { cost: 0, rev: 0, orders: 0 })
      for (const r of kept) { a.cost += r.cost ?? 0; a.rev += r.grossRevenue ?? 0; a.orders += r.skuOrders ?? 0 }
    }
  }

  const reconRows = []
  let negativeResidual = false // invariant guard: residual seharusnya ≥ 0
  if (campaignTotals) {
    for (const [cid, tot] of Object.entries(campaignTotals)) {
      const a = attributed[cid] || { cost: 0, rev: 0, orders: 0 }
      const rc = (Number(tot.cost) || 0) - a.cost
      const rr = (Number(tot.gross_revenue) || 0) - a.rev
      const ro = Math.max(0, (Number(tot.orders) || 0) - a.orders)
      if (rc < -RECON_THRESHOLD || rr < -RECON_THRESHOLD) negativeResidual = true // over-count → invariant rusak
      if (rc > RECON_THRESHOLD || rr > RECON_THRESHOLD) {
        const row = {
          videoId: null, campaignName: nameByCampaign[cid] || '', campaignId: cid, productId: null,
          creativeType: 'Product card', videoTitle: '(Non-attributed / sistem)', tiktokAccount: null,
          timePosted: null, status: '', authType: '', currency,
          cost: Math.max(0, rc), skuOrders: ro, costPerOrder: null, grossRevenue: Math.max(0, rr),
          roas: rc > 0 ? rr / rc : null, impressions: null, clicks: null, ctr: null, cvr: null,
          vr2s: null, vr6s: null, vr25: null, vr50: null, vr75: null, vr100: null,
          hookTag: null, hasSpend: rc > 0, isSystem: true,
        }
        reconRows.push(row)
        allRows.push(row)
      }
    }
  }

  const totals = allRows.reduce((t, r) => {
    t.cost += r.cost ?? 0; t.revenue += r.grossRevenue ?? 0; t.orders += r.skuOrders ?? 0; return t
  }, { cost: 0, revenue: 0, orders: 0 })
  totals.roas = totals.cost > 0 ? totals.revenue / totals.cost : null

  return {
    rows: allRows,
    totals,
    report: {
      mode: campaignTotals ? 'reconcile' : 'passthrough',
      attributedCount,
      nonAttributedCount: reconRows.length,
      reconciledCampaigns: reconRows.length,
      negativeResidual, // TRUE = over-count terdeteksi (invariant rusak → caller harus gagalkan run)
    },
  }
}
