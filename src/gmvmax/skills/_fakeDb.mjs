// Deterministic in-memory db adapter for loader/pipeline tests (not a test file).
// Records every call so tests can assert workspace isolation + read-only access.
const READ_METHODS = new Set(['getImport', 'getCreatives', 'getCampaignSettings', 'getFeatureRegistry', 'getSyncRun', 'getTenantAdvertisers'])

export function creativeRow(o = {}) {
  return { video_id: 'v1', campaign_id: 'c1', product_id: 'p1', creative_type: 'Video', status: 'DELIVERING', cost: 100000, gross_revenue: 600000, sku_orders: 10, impressions: 1000, clicks: 100, ctr: 0.1, cvr: 0.1, ...o }
}

export function fakeDb(seed = {}, ws = 'ws-A') {
  const data = {
    imports: seed.imports || { '2026-07-20': { id: 'imp-1', currency: 'IDR', created_at: '2026-07-20T10:00:00Z' } },
    creatives: seed.creatives || { 'imp-1': [creativeRow()] },
    campaignSettings: seed.campaignSettings ?? [{ campaign_id: 'c1', budget: 500000, roas_bid: 6, operation_status: 'ENABLE', roi_protection_enabled: true, auto_budget: { auto_budget_enabled: false }, store_id: 'store-A' }],
    featureRegistry: seed.featureRegistry ?? [{ feature_code: 'ROI_PROTECTION', availability_status: 'AVAILABLE', enabled: true, active: true, confidence: 'HIGH', store_id: 'store-A' }],
    syncRun: seed.syncRun ?? { run_id: 'r1', status: 'SUCCESS', parity: 'MATCH', advertiser_sources_expected: 1, advertiser_sources_succeeded: 1, advertiser_sources_failed: 0, advertiser_lineage: [{ advertiser_id: '7313', role: 'PRIMARY' }], pages_fetched: 1 },
    tenantAdvertisers: seed.tenantAdvertisers ?? [{ advertiser_id: '7313', advertiser_role: 'PRIMARY', is_active: true, connection_group_id: 'g1', store_id: 'store-A', priority: 100 }],
  }
  const calls = []
  const rec = (m, w) => calls.push([m, w])
  return {
    calls, ws,
    async getImport(w, date) { rec('getImport', w); return w === ws ? (data.imports[date] || null) : null },
    async getCreatives(w, importId) { rec('getCreatives', w); return w === ws ? (data.creatives[importId] || []) : [] },
    async getCampaignSettings(w) { rec('getCampaignSettings', w); return w === ws ? data.campaignSettings : [] },
    async getFeatureRegistry(w) { rec('getFeatureRegistry', w); return w === ws ? data.featureRegistry : [] },
    async getSyncRun(w) { rec('getSyncRun', w); return w === ws ? data.syncRun : null },
    async getTenantAdvertisers(w) { rec('getTenantAdvertisers', w); return w === ws ? data.tenantAdvertisers : [] },
  }
}

export const isReadOnly = (db) => db.calls.every(([m]) => READ_METHODS.has(m))
