// Potret harian AKSI DI LUAR SELLEROS — sesi boost & otorisasi spark.
//
// KENAPA ADA: gmvmax_approvals hanya mengenal aksi yang lewat tombol 🔔. Aksi yang
// dikerjakan langsung di Ads Manager / Seller Centre tak pernah masuk ke sana.
// Untuk SETELAN campaign lubang itu sudah tertutup (gmvmax_campaign_settings
// dipotret harian lalu di-diff). Dua aksi paling penting belum:
//
//   * SESI BOOST — `campaign_gmv_max_session_list_get` hanya mengembalikan sesi
//     yang SEDANG BERJALAN. Tanpa potret harian, sesi yang sudah selesai lenyap
//     tanpa bekas dan belanja-nya muncul di grafik tanpa sebab yang bisa dilacak.
//     Konsekuensi jujur: sesi lebih pendek dari 24 jam masih bisa lolos di antara
//     dua potret; sesi ≥24 jam pasti tertangkap.
//
//     BUTUH DUA PANGGILAN. Daftar (`_list_get`) TIDAK membawa `item_id`, jadi
//     Creative Boost — yang justru bekerja pada SATU video — tak bisa ditautkan ke
//     videonya; s/d 2026-08-31 seluruh baris tersimpan dgn item_id null. Endpoint
//     detail `campaign_gmv_max_session_get` (parameter `session_ids`, JAMAK)
//     membawanya (diverifikasi runtime 2026-08-31 atas 3 sesi CREATIVE_NO_BID).
//     Tanpa item_id, sesi boost tak bisa membuka eksperimen ber-subjek video.
//
//   * OTORISASI SPARK — `tt_video_list_get` membawa auth_code UTUH, produk yang
//     tertaut, dan kapan izin berakhir. Kode yang dimasukkan lewat Seller Centre
//     jadi ikut tercatat, bukan cuma bayangannya (perpindahan status di snapshot).
//
// Read-only ke TikTok; menulis HANYA ke 2 tabel potret (migrasi 0048), tidak
// menyentuh kanonik. Idempoten: upsert by (workspace, tanggal, id).
const PAGE = 50
const TYPES = ['PRODUCT_GMV_MAX', 'LIVE_GMV_MAX']

// API mengembalikan "YYYY-MM-DD HH:mm:ss" tanpa zona → baca sebagai UTC supaya
// bisa diurutkan. String aslinya tetap tersimpan di `raw` (pola campaignSettings).
const ts = (s) => {
  if (!s || typeof s !== 'string') return null
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const num = (v) => (v == null || v === '' ? null : Number(v))
const unwrap = (r, key) => r?.[key] ?? r?.data?.[key] ?? null

// ── Sesi boost ──────────────────────────────────────────────────────────────
// Bentuk baris (defensif — MCP kadang membungkus di .data):
//   { session_id, bid_type, budget, item_id, product_list:[{spu_id}], schedule_* }
export function normalizeSession(s, { advertiserId, campaignId, campaignName }) {
  const spu = Array.isArray(s?.product_list) && s.product_list.length
    ? String(s.product_list[0]?.spu_id ?? '') || null
    : (s?.spu_id != null ? String(s.spu_id) : null)
  return {
    advertiser_id: String(advertiserId),
    campaign_id: String(campaignId),
    campaign_name: campaignName || null,
    session_id: String(s?.session_id ?? ''),
    bid_type: s?.bid_type ?? null,
    budget: num(s?.budget),
    item_id: s?.item_id != null ? String(s.item_id) : null,
    spu_id: spu,
    schedule_start_time: ts(s?.schedule_start_time),
    schedule_end_time: ts(s?.schedule_end_time),
    status: s?.status ?? s?.session_status ?? null,
    raw: s,
  }
}

// item_id per sesi — HANYA ada di endpoint detail. Dipanggil sekali per campaign
// (session_ids jamak), bukan per sesi, supaya hemat kuota: campaign tanpa sesi
// aktif tidak memicu panggilan sama sekali. Gagal = kembalikan peta kosong;
// potretnya tetap ditulis dgn item_id null, seperti perilaku lama.
export async function fetchSessionItemIds(provider, { advertiserId, campaignId, sessionIds }) {
  const map = new Map()
  if (!sessionIds?.length) return map
  try {
    const r = await provider.callTool('campaign_gmv_max_session_get', {
      advertiser_id: advertiserId, campaign_id: campaignId, session_ids: sessionIds,
    })
    for (const row of unwrap(r, 'session_list') || []) {
      if (row?.session_id != null && row?.item_id != null) {
        map.set(String(row.session_id), String(row.item_id))
      }
    }
  } catch { /* detail gagal — potret tetap jalan tanpa item_id */ }
  return map
}

// Semua sesi aktif seluruh campaign GMV Max milik satu advertiser+store.
export async function fetchBoostSessions(provider, { advertiserId, storeId }) {
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
        // Satu campaign gagal TIDAK boleh menjatuhkan potret campaign lain.
        try {
          const s = await provider.callTool('campaign_gmv_max_session_list_get', {
            advertiser_id: advertiserId, campaign_id: c.campaign_id,
          })
          const rows = []
          for (const row of unwrap(s, 'session_list') || []) {
            const n = normalizeSession(row, {
              advertiserId, campaignId: c.campaign_id, campaignName: c.campaign_name,
            })
            if (n.session_id) rows.push(n)
          }
          const items = await fetchSessionItemIds(provider, {
            advertiserId, campaignId: c.campaign_id, sessionIds: rows.map(r => r.session_id),
          })
          for (const n of rows) {
            if (!n.item_id) n.item_id = items.get(n.session_id) ?? null
            out.push(n)
          }
        } catch { /* campaign ini dilewati; sisanya lanjut */ }
      }
      totalPage = list.page_info?.total_page ?? 1
      page++
    } while (page <= totalPage)
  }
  return out
}

export async function persistBoostSessions(sb, { workspaceId, date, rows }) {
  if (!rows?.length) return { written: 0 }
  const payload = rows.map(r => ({ ...r, workspace_id: workspaceId, snapshot_date: date }))
  const { error } = await sb.from('gmvmax_boost_sessions')
    .upsert(payload, { onConflict: 'workspace_id,snapshot_date,session_id' })
  if (error) throw new Error(`persist boost sessions gagal: ${error.message}`)
  return { written: payload.length }
}

// ── Otorisasi spark ─────────────────────────────────────────────────────────
// Bentuk baris TERVERIFIKASI runtime (2026-08-25 & dicek ulang 2026-08-28):
//   item_info.{item_id, text, auth_code, anchor_list:[{spu_id,title}]}
//   user_info.tiktok_name · auth_info.{ad_auth_status, auth_end_time}
export function normalizeSparkAuth(v, { advertiserId }) {
  const it = v?.item_info || {}
  const anchor = Array.isArray(it.anchor_list) && it.anchor_list.length ? it.anchor_list[0] : null
  return {
    advertiser_id: String(advertiserId),
    item_id: it.item_id != null ? String(it.item_id) : null,
    auth_code: it.auth_code ?? null,
    spu_id: anchor?.spu_id != null ? String(anchor.spu_id) : null,
    product_title: anchor?.title ?? null,
    tiktok_name: v?.user_info?.tiktok_name ?? null,
    ad_auth_status: v?.auth_info?.ad_auth_status ?? null,
    auth_end_time: ts(v?.auth_info?.auth_end_time),
    video_text: it.text ?? null,
    raw: v,
  }
}

export async function fetchSparkAuth(provider, { advertiserId }) {
  const out = []
  let page = 1, totalPage = 1
  do {
    const r = await provider.callTool('tt_video_list_get', {
      advertiser_id: advertiserId, page, page_size: PAGE,
    })
    for (const v of unwrap(r, 'list') || []) {
      const n = normalizeSparkAuth(v, { advertiserId })
      if (n.item_id) out.push(n)
    }
    totalPage = (unwrap(r, 'page_info') || {}).total_page ?? 1
    page++
  } while (page <= totalPage)
  return out
}

export async function persistSparkAuth(sb, { workspaceId, date, rows }) {
  if (!rows?.length) return { written: 0 }
  // Satu video bisa muncul >1 kali (tertaut beberapa produk); unique key tabel
  // adalah (workspace, tanggal, item_id) → ambil kemunculan pertama saja supaya
  // upsert tidak menabrak dirinya sendiri dalam satu payload.
  const seen = new Set()
  const payload = []
  for (const r of rows) {
    if (seen.has(r.item_id)) continue
    seen.add(r.item_id)
    payload.push({ ...r, workspace_id: workspaceId, snapshot_date: date })
  }
  const { error } = await sb.from('gmvmax_spark_auth')
    .upsert(payload, { onConflict: 'workspace_id,snapshot_date,item_id' })
  if (error) throw new Error(`persist spark auth gagal: ${error.message}`)
  return { written: payload.length }
}
