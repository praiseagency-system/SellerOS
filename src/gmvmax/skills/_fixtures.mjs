// Deterministic test fixtures for Phase 3A skills (not a test file itself).
export function creative(o = {}) {
  return {
    videoId: 'v1', campaignId: 'c1', productId: 'p1', creativeType: 'Video',
    status: 'DELIVERING', cost: 100000, grossRevenue: 600000, skuOrders: 10,
    impressions: 1000, clicks: 100, ...o,
  }
}

export function canonical(rows, extra = {}) {
  return {
    snapshotId: 'imp-1', generatedAt: '2026-07-20T10:00:00Z',
    creatives: rows, paginationComplete: true, canonicalStatus: 'CANONICAL',
    currency: 'IDR', timezone: 'Asia/Jakarta', ...extra,
  }
}

export function syncMeta(o = {}) {
  return { runId: 'run-1', sourcesExpected: 1, sourcesProcessed: 1, sourcesFailed: 0, pagesFetched: 1, status: 'success', parityStatus: 'MATCH', advertiserLineage: [{ advertiser_id: '7313', role: 'PRIMARY', is_active: true }], ...o }
}

export function baseInput(rows, extra = {}) {
  return {
    workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20',
    canonicalData: canonical(rows), syncMetadata: syncMeta(),
    campaignSettings: [{ campaign_id: 'c1', budget: 500000, roas_bid: 6, operation_status: 'ENABLE', roi_protection_enabled: true, auto_budget: { auto_budget_enabled: false } }],
    featureRegistry: [{ feature_code: 'ROI_PROTECTION', availability_status: 'AVAILABLE', enabled: true }],
    ...extra,
  }
}
