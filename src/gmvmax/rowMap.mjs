// Canonical row → gmvmax_creatives (Architecture Rule: satu pemetaan).
// Diekstrak dari scripts/syncGmvMax.mjs:creativeToRow (identik). Karakterisasi
// via rowMap.test.mjs. Old-path (syncGmvMax.mjs, gmvmaxImports.js) di-rewire ke
// sini sebagai langkah terkendali (belum, agar backfill jalan tak terganggu).
export function creativeRowToDb(importId, r) {
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
