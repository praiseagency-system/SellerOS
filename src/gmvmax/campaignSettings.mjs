// Snapshot SETTING campaign GMV Max (budget, roas_bid, auto-budget, status).
// Gabungan 2 sumber MCP:
//   - gmv_max_campaign_get     → daftar campaign + modify_time/create_time/secondary_status
//   - campaign_gmv_max_info_get → budget, roas_bid, auto_budget, schedule, item_group_ids
// Ditulis ke tabel BARU gmvmax_campaign_settings (BUKAN snapshot kanonik) → aman
// dipanggil worker shadow. Perubahan diturunkan dgn diff antar-hari (lihat diffSettings).
//
// CATATAN waktu: API mengembalikan "YYYY-MM-DD HH:mm:ss" tanpa zona. Kita parse
// sebagai UTC agar konsisten & bisa diurutkan; string aslinya tetap disimpan di `raw`.

const TYPES = ['PRODUCT_GMV_MAX', 'LIVE_GMV_MAX']
const PAGE = 50

const ts = (s) => {
  if (!s || typeof s !== 'string') return null
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const num = (v) => (v == null || v === '' ? null : Number(v))

// Ambil setting semua campaign GMV Max milik satu advertiser+store.
// → [{ campaign_id, campaign_name, promotion_type, budget, roas_bid, ... , raw }]
export async function fetchCampaignSettings(provider, { advertiserId, storeId }) {
  const out = []
  for (const type of TYPES) {
    let page = 1, totalPage = 1
    do {
      const list = await provider.callTool('gmv_max_campaign_get', {
        advertiser_id: advertiserId,
        filtering: { gmv_max_promotion_types: [type], store_ids: [storeId] },
        page, page_size: PAGE,
      })
      for (const c of list.list || []) {
        // Detail per campaign (di sinilah budget & bid berada).
        const info = await provider.callTool('campaign_gmv_max_info_get', {
          advertiser_id: advertiserId, campaign_id: c.campaign_id,
        })
        out.push(normalizeSettings(c, info, type))
      }
      totalPage = list.page_info?.total_page ?? 1
      page++
    } while (page <= totalPage)
  }
  return out
}

// Gabung respons list + detail → baris siap simpan. Pure (mudah dites).
export function normalizeSettings(c, info = {}, type = null) {
  return {
    campaign_id: c.campaign_id,
    campaign_name: (info.campaign_name ?? c.campaign_name ?? '').trim() || null,
    promotion_type: type,
    budget: num(info.budget),
    roas_bid: num(info.roas_bid),
    deep_bid_type: info.deep_bid_type ?? null,
    optimization_goal: info.optimization_goal ?? null,
    billing_event: info.billing_event ?? null,
    auto_budget: info.auto_budget ?? null,
    operation_status: info.operation_status ?? c.operation_status ?? null,
    secondary_status: c.secondary_status ?? null,
    schedule_start_time: ts(info.schedule_start_time),
    schedule_end_time: ts(info.schedule_end_time),
    roi_protection_enabled: info.roi_protection_enabled ?? null,
    store_id: info.store_id ?? null,
    item_group_ids: info.item_group_ids ?? null,
    shopping_ads_type: info.shopping_ads_type ?? null,
    modify_time: ts(c.modify_time),
    create_time: ts(c.create_time),
    raw: { list: c, info },
  }
}

// Simpan snapshot harian (idempoten: unique workspace+date+campaign → upsert).
export async function persistCampaignSettings(sb, { workspaceId, date, rows }) {
  if (!rows?.length) return { written: 0 }
  const payload = rows.map(r => ({ ...r, workspace_id: workspaceId, snapshot_date: date }))
  const { error } = await sb.from('gmvmax_campaign_settings')
    .upsert(payload, { onConflict: 'workspace_id,snapshot_date,campaign_id' })
  if (error) throw new Error(`persist campaign settings gagal: ${error.message}`)
  return { written: payload.length }
}

// Bidang yang perubahannya layak dicatat di Log Optimasi.
const WATCHED = [
  { key: 'budget', label: 'Budget' },
  { key: 'roas_bid', label: 'Target ROAS' },
  { key: 'operation_status', label: 'Status' },
  { key: 'deep_bid_type', label: 'Tipe bid' },
  { key: 'optimization_goal', label: 'Goal optimasi' },
]

// Diff 2 snapshot (hari sebelumnya → hari ini) → daftar perubahan siap tampil.
// prev/cur = array baris settings. → [{campaign_id, campaign_name, field, label, from, to, modify_time}]
export function diffSettings(prev = [], cur = []) {
  const byId = new Map(prev.map(r => [r.campaign_id, r]))
  const changes = []
  for (const c of cur) {
    const p = byId.get(c.campaign_id)
    if (!p) { // campaign baru
      changes.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: '_new', label: 'Campaign baru', from: null, to: c.campaign_name, modify_time: c.modify_time })
      continue
    }
    for (const { key, label } of WATCHED) {
      const a = p[key], b = c[key]
      if (a == null && b == null) continue
      if (String(a) !== String(b)) {
        changes.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: key, label, from: a, to: b, modify_time: c.modify_time })
      }
    }
    // auto-budget: bandingkan current_budget & enabled saja (sisanya turunan)
    const pa = p.auto_budget || {}, ca = c.auto_budget || {}
    if (String(pa.auto_budget_enabled) !== String(ca.auto_budget_enabled)) {
      changes.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: 'auto_budget_enabled', label: 'Auto-budget', from: pa.auto_budget_enabled, to: ca.auto_budget_enabled, modify_time: c.modify_time })
    }
  }
  return changes
}
