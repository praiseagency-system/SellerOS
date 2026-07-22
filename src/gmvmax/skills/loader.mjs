// GMV Max — DECISION INTELLIGENCE: canonical read-only loader (Phase 3A 2C).
// Server-side, READ-ONLY. Loads ONLY existing canonical/internal data the skills
// need. NO TikTok call, NO canonical write, NO cross-workspace cache. Every query
// is explicitly workspace- AND date-filtered. Null-preserving. Errors redacted.
//
// Testable via a `db` adapter (methods below). supabaseAdapter(sb) builds the
// adapter from a service-role Supabase client; tests inject a plain fake.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const num = (v) => (v == null ? null : Number(v))
const DELIVERING = new Set(['DELIVERING', 'DITAYANGKAN'])

// Redact anything that could carry a secret/connection detail out of an error.
export function redactError(e) {
  const msg = String(e?.message ?? e ?? 'unknown').replace(/(key|token|secret|password|authorization)=[^\s&]+/gi, '$1=[redacted]')
  return msg.length > 200 ? msg.slice(0, 200) + '…' : msg
}

// Map a canonical creative DB row → the null-preserving object the builder wants.
function mapCreative(r) {
  return {
    videoId: r.video_id, campaignId: r.campaign_id, productId: r.product_id,
    creativeType: r.creative_type, videoTitle: r.video_title, tiktokAccount: r.tiktok_account,
    timePosted: r.time_posted, status: r.status, authType: r.auth_type,
    cost: num(r.cost), skuOrders: num(r.sku_orders), grossRevenue: num(r.gross_revenue), roas: num(r.roas),
    impressions: num(r.impressions), clicks: num(r.clicks), ctr: num(r.ctr), cvr: num(r.cvr),
  }
}

function aggregate(creatives) {
  const s = { grossRevenue: 0, cost: 0, orders: 0, clicks: 0, delivering: 0, hasRev: false, hasCost: false, hasOrders: false }
  const vids = new Set()
  for (const c of creatives) {
    if (c.grossRevenue != null) { s.grossRevenue += c.grossRevenue; s.hasRev = true }
    if (c.cost != null) { s.cost += c.cost; s.hasCost = true }
    if (c.skuOrders != null) { s.orders += c.skuOrders; s.hasOrders = true }
    if (c.clicks != null) s.clicks += c.clicks
    if (c.status && DELIVERING.has(String(c.status).toUpperCase())) s.delivering += 1
    if (c.videoId && c.videoId !== 'N/A') vids.add(c.videoId)
  }
  return {
    grossRevenue: s.hasRev ? s.grossRevenue : null, cost: s.hasCost ? s.cost : null, orders: s.hasOrders ? s.orders : null,
    roi: s.hasRev && s.hasCost && s.cost > 0 ? s.grossRevenue / s.cost : null,
    cvr: s.hasOrders && s.clicks > 0 ? s.orders / s.clicks : null,
    deliveringCreatives: s.delivering, videoIds: vids,
  }
}

const prevDate = (date) => { const d = new Date(Date.parse(date + 'T00:00:00Z')); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }

export async function loadDecisionInputs({ db, workspaceId, storeId, date }) {
  if (!workspaceId || !UUID_RE.test(String(workspaceId))) throw new Error('LOADER_BAD_ARGS: workspaceId (uuid) wajib')
  if (!storeId) throw new Error('LOADER_BAD_ARGS: storeId wajib')
  if (!date || !DATE_RE.test(String(date))) throw new Error('LOADER_BAD_ARGS: date (YYYY-MM-DD) wajib')
  if (!db) throw new Error('LOADER_BAD_ARGS: db adapter wajib')

  const missing = []
  try {
    const imp = await db.getImport(workspaceId, date)
    let canonicalData = null, comparisonData = null
    if (!imp) {
      missing.push('canonical_snapshot')
    } else {
      const rows = (await db.getCreatives(workspaceId, imp.id)).map(mapCreative)
      canonicalData = {
        snapshotId: imp.id, generatedAt: imp.created_at || null,
        creatives: rows, paginationComplete: imp.pagination_complete ?? true,
        canonicalStatus: 'CANONICAL', currency: imp.currency || 'IDR', timezone: 'Asia/Jakarta',
      }
      // Previous-day comparison ONLY when that day's canonical truly exists.
      const pDate = prevDate(date)
      const pImp = await db.getImport(workspaceId, pDate)
      if (pImp) {
        const pRows = (await db.getCreatives(workspaceId, pImp.id)).map(mapCreative)
        const a = aggregate(pRows)
        comparisonData = { previousDay: { grossRevenue: a.grossRevenue, cost: a.cost, orders: a.orders, roi: a.roi, cvr: a.cvr, deliveringCreatives: a.deliveringCreatives }, priorVideoIds: a.videoIds }
      } else { missing.push('previous_day_comparison') }
    }

    const campaignSettings = await db.getCampaignSettings(workspaceId, date)
    if (!campaignSettings || !campaignSettings.length) missing.push('campaign_settings')
    const featureRows = await db.getFeatureRegistry(workspaceId, storeId)
    if (!featureRows || !featureRows.length) missing.push('feature_registry')
    const featureRegistry = featureRows && featureRows.length ? featureRows.map(f => ({ feature_code: f.feature_code, availability_status: f.availability_status, enabled: f.enabled, active: f.active, confidence: f.confidence })) : null

    const run = await db.getSyncRun(workspaceId, date)
    const syncMetadata = run ? {
      runId: run.run_id ?? null,
      sourcesExpected: run.advertiser_sources_expected ?? null,
      sourcesProcessed: run.advertiser_sources_succeeded ?? null,
      sourcesFailed: run.advertiser_sources_failed ?? null,
      pagesFetched: run.pages_fetched ?? null,
      status: run.status ?? null, parityStatus: run.parity ?? null,
      advertiserLineage: run.advertiser_lineage ?? null,
    } : null
    if (!run) missing.push('sync_metadata')

    // Advertiser lineage (tenant_advertisers) — ALL rows; skills split active vs
    // inactive LEGACY. Retained in lineage, excluded from active counts.
    const advRows = (await db.getTenantAdvertisers(workspaceId)) || []
    const businessStructure = {
      workspaceName: null, storeName: null,
      activeAdvertisers: advRows.map(a => ({ advertiser_id: a.advertiser_id, role: a.advertiser_role, is_active: a.is_active !== false, connection_group_id: a.connection_group_id ?? null, effective_to: a?.metadata?.effective_to ?? null, reason: a?.metadata?.reason ?? null })),
      historicalAdvertisers: [],
    }
    if (!advRows.length) missing.push('advertiser_lineage')

    return {
      workspaceId, storeId, date,
      canonicalData, campaignSettings: campaignSettings && campaignSettings.length ? campaignSettings : null,
      featureRegistry, syncMetadata, comparisonData, businessStructure,
      priorSnapshots: null, sourceBreakdown: null, // honestly absent: no multi-version store / per-source breakdown here
      liveDataAvailable: false,
      source_snapshot_ids: canonicalData ? [canonicalData.snapshotId] : [],
      missing_inputs: [...new Set(missing)],
    }
  } catch (e) {
    throw new Error(`LOADER_ERROR: ${redactError(e)}`)
  }
}

// Build the db adapter from a service-role Supabase client. Every query is
// explicitly workspace-scoped; creatives are paginated defensively (>1000).
export function supabaseAdapter(sb) {
  const PAGE = 1000
  return {
    async getImport(ws, date) {
      const { data, error } = await sb.from('gmvmax_imports')
        .select('id,currency,totals,created_at,name,source_filename,snapshot_date')
        .eq('workspace_id', ws).eq('snapshot_date', date)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data || null
    },
    async getCreatives(ws, importId) {
      const cols = 'video_id,campaign_id,product_id,creative_type,video_title,tiktok_account,time_posted,status,auth_type,cost,sku_orders,gross_revenue,roas,impressions,clicks,ctr,cvr'
      const out = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from('gmvmax_creatives').select(cols)
          .eq('import_id', importId).order('id', { ascending: true }).range(from, from + PAGE - 1)
        if (error) throw error
        out.push(...(data || []))
        if (!data || data.length < PAGE) break
      }
      return out
    },
    async getCampaignSettings(ws, date) {
      const { data, error } = await sb.from('gmvmax_campaign_settings')
        .select('campaign_id,campaign_name,budget,roas_bid,auto_budget,operation_status,roi_protection_enabled,promotion_type,store_id')
        .eq('workspace_id', ws).eq('snapshot_date', date).order('campaign_id', { ascending: true })
      if (error) throw error
      return data || []
    },
    async getFeatureRegistry(ws, storeId) {
      const { data, error } = await sb.from('gmvmax_feature_registry')
        .select('feature_code,availability_status,enabled,active,confidence,store_id')
        .eq('workspace_id', ws).eq('store_id', storeId).order('feature_code', { ascending: true })
      if (error) throw error
      return data || []
    },
    async getSyncRun(ws, date) {
      const { data, error } = await sb.from('gmvmax_sync_runs')
        .select('run_id,status,parity,advertiser_sources_expected,advertiser_sources_succeeded,advertiser_sources_failed,advertiser_lineage,pages_fetched')
        .eq('workspace_id', ws).eq('snapshot_date', date).order('run_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data || null
    },
    async getTenantAdvertisers(ws) {
      const { data, error } = await sb.from('gmvmax_tenant_advertisers')
        .select('advertiser_id,advertiser_role,is_active,connection_group_id,store_id,metadata,priority')
        .eq('workspace_id', ws).order('priority', { ascending: true })
      if (error) throw error
      return data || []
    },
  }
}
