# Runbook: Sinkron harian GMV Max → Supabase (worker ETL)

Kamu adalah worker ETL non-interaktif. Tarik data GMV Max KEMARIN dari TikTok via
MCP `tiktok-ads`, lalu tulis ke Supabase workspace Asterixsty. Kerjakan langkah
demi langkah, JANGAN bertanya, jangan berhenti sampai selesai atau error jelas.
Di akhir, laporkan ringkas (jumlah pair, baris, totals) lalu berhenti.

## Konstanta
- advertiser_id : `7313535999831769090`
- store_id      : `7495201716088572081`
- workspaceId   : `10280d7b-2994-4a40-b639-2d88e0e2018b` (Asterixsty)
- Writer        : `/Users/macbook/claude/tools/shopee-quadrant/scripts/syncGmvMax.mjs`
- Dir kerja     : `/private/tmp/gmvmax-sync` (buat/kosongkan di awal)
- TANGGAL       : `echo ${GMVMAX_SYNC_DATE:-$(date -v-1d +%F)}` — default KEMARIN;
                  override untuk backfill via env `GMVMAX_SYNC_DATE=YYYY-MM-DD`.

## Metric creative-level (pakai persis daftar ini)
`title, tt_account_name, tt_account_profile_image_url, tt_account_authorization_type,
creative_delivery_status, shop_content_type, cost, orders, cost_per_order,
gross_revenue, roi, product_impressions, product_clicks, product_click_rate,
ad_conversion_rate, ad_video_view_rate_2s, ad_video_view_rate_6s,
ad_video_view_rate_p25, ad_video_view_rate_p50, ad_video_view_rate_p75,
ad_video_view_rate_p100`

## Langkah
1. `mkdir -p /private/tmp/gmvmax-sync && rm -f /private/tmp/gmvmax-sync/*`.
2. **Campaign yang BELANJA pada TANGGAL** (JANGAN pakai filter status — campaign
   yang kini paused tapi sempat belanja pada TANGGAL WAJIB ikut, kalau tidak total
   akan kurang):
   a. `gmv_max_report_get` `{advertiser_id, store_ids:[store_id], start_date:TANGGAL,
      end_date:TANGGAL, dimensions:['campaign_id'],
      metrics:['cost','gross_revenue','orders'], page_size:100}`
      → ambil semua `campaign_id` dengan `cost>0`. SIMPAN total per campaign
      `{cost, gross_revenue, orders}` — ini `campaignTotals` untuk rekonsiliasi
      (dipakai writer agar total snapshot = total dashboard).
   b. Nama campaign: `gmv_max_campaign_get`
      `{advertiser_id, filtering:{gmv_max_promotion_types:['PRODUCT_GMV_MAX'], store_ids:[store_id]}, page_size:100}`
      (TANPA `primary_status`; paginasi bila `total_page>1`) → peta `campaign_id → campaign_name`.
   Proses hanya campaign dari (a).
3. **SPU per campaign** — untuk tiap campaign, `gmv_max_report_get`:
   `{advertiser_id, store_ids:[store_id], start_date:TANGGAL, end_date:TANGGAL,
     dimensions:['item_group_id'], filtering:{campaign_ids:[cid]},
     metrics:['cost','gross_revenue','orders','roi'], page_size:100}`.
   Ambil `item_group_id` yang `cost>0`.
4. **Creative per (campaign, SPU)** — `gmv_max_report_get`:
   `{advertiser_id, store_ids:[store_id], start_date:TANGGAL, end_date:TANGGAL,
     dimensions:['item_id'], filtering:{campaign_ids:[cid], item_group_ids:[spu]},
     metrics:<daftar di atas>, sort_field:'cost', sort_type:'DESC', page_size:1000}`.
   Paginasi sampai `page >= total_page`. Simpan seluruh respons MENTAH (objek
   `{data:{list:[...]}}` gabungan semua halaman) ke
   `/private/tmp/gmvmax-sync/<cid>__<spu>.json`. (Kalau output tool ter-persist ke
   file tool-results otomatis, salin isinya ke path itu.)
5. **Manifest** — tulis `/private/tmp/gmvmax-sync/manifest.json`:
   ```json
   { "workspaceId":"10280d7b-2994-4a40-b639-2d88e0e2018b",
     "snapshot":{ "date":"TANGGAL", "name":"<label tanggal> (API)",
                  "startDate":"TANGGAL", "endDate":"TANGGAL", "currency":"IDR" },
     "campaignTotals":{ "<cid>":{"cost":123,"gross_revenue":456,"orders":7} },
     "pairs":[ { "file":"/private/tmp/gmvmax-sync/<cid>__<spu>.json",
                 "campaignId":"<cid>", "campaignName":"<nama>", "itemGroupId":"<spu>" } ] }
   ```
   `campaignTotals` = total campaign-level dari langkah 2a (WAJIB, untuk rekonsiliasi).
6. **Tulis ke Supabase** — jalankan:
   ```bash
   cd /Users/macbook/claude/tools/shopee-quadrant \
     && npx esbuild scripts/syncGmvMax.mjs --bundle --platform=node --format=esm \
        --packages=external --outfile=_sync.bundle.mjs --log-level=error \
     && node _sync.bundle.mjs /private/tmp/gmvmax-sync/manifest.json ; rm -f _sync.bundle.mjs
   ```
7. Laporkan hasil writer, lalu `rm -rf /private/tmp/gmvmax-sync`.

## Catatan
- Idempoten: menjalankan ulang tanggal yang sama mengganti snapshot itu (aman).
- Kalau MCP `tiktok-ads` minta re-auth (token 30 hari), STOP dan laporkan bahwa
  perlu `/mcp` → Authenticate manual — worker tak bisa OAuth sendiri.
