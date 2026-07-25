# GMV Max Runtime Capability Verification — Phase 0

> **Read-only verification.** Tidak ada endpoint tulis dipanggil. Tidak ada campaign/session/creative
> dibuat/diubah/dipause/dihapus/diboost/dieksklusi. Tidak ada perubahan kode/DB/migrasi. Tidak commit/push.
> Tanggal: **2026-07-20**. Repo: `tools/shopee-quadrant`.
>
> **Tujuan:** membuktikan apakah skema MCP GMV Max (dari audit sebelumnya) **benar-benar bekerja dengan
> kredensial tenant yang tersambung** — bukan sekadar ada di schema.
>
> **REDaksi:** seluruh advertiser ID, store ID, campaign ID, item/creative ID, room ID, identity ID, BC ID,
> dan nama akun/kreator **diganti alias** (ADV-A, STORE-A, CMP-A1, …). Tidak ada token/secret di dokumen ini
> (tidak ada tool yang mengembalikan token). Nilai bisnis (budget, ROAS, jumlah) ditampilkan sebagai contoh
> bentuk field milik tenant sendiri.
>
> **Alias tenant:**
> - **TENANT-A** = advertiser ADV-A ("perfume store A"), store STORE-A, BC BC-A — *primary/DEFAULT_ADVERTISER*.
> - **TENANT-B** = advertiser ADV-B ("perfume store B", yang di-authorize token), store STORE-B, BC BC-B.
> - **ADV-B2** = advertiser pihak-ketiga yang memegang *exclusive GMV Max authorization* STORE-B (di luar akses token).

---

## 1. Executive Summary

**Runtime GMV Max TERBUKTI bekerja untuk TENANT-A**, dan **TIDAK tersedia untuk TENANT-B** melalui kredensial
yang sekarang tersambung. Ini bukan kegagalan skema — 11 dari 11 endpoint read-only yang dicoba mengembalikan
`code:0` (sukses) untuk TENANT-A; masalahnya adalah **eligibility & otorisasi eksklusif per-tenant**.

Temuan kunci:

1. **TENANT-A fully eligible.** `gmv_max_store_list_get` → `is_gmv_max_available:true`, dan
   `exclusive_authorized_advertiser_info.advertiser_id` = **ADV-A** (cocok dengan akun yang dipanggil).
   Semua endpoint report/campaign/info/bid/session/identity/authorization/product **sukses**.
2. **TENANT-B TIDAK eligible via token ini.** `gmv_max_store_list_get(ADV-B)` → `is_gmv_max_available:**false**`,
   dan otorisasi eksklusif GMV Max STORE-B dipegang **ADV-B2** — advertiser yang **tidak ada** di daftar
   `auth_advertiser_get` (token tak bisa mengaksesnya). → **Hard blocker multi-tenant**, bukan bug transport.
3. **Field runtime lebih kaya dari skema audit.** `campaign_gmv_max_info_get` mengembalikan
   **`accelerate_testing_for_new_videos:"ON"`** (Accelerate Testing → naik dari *NOT_RELIABLY_BUILDABLE*
   jadi **RUNTIME_VERIFIED read**), dan `gmv_max_campaign_get` mengembalikan
   **`roi_protection_compensation_status:"IN_EFFECT"`** (status kompensasi ROI Protection, read-only).
4. **Recommended ROI nyata & berbeda** dari setting aktif: rekomendasi `roas_bid` vs aktif, dan rekomendasi
   `budget` jauh lebih besar dari budget aktif → sinyal Skill 5/6 valid.
5. **Data map 1:1 ke model existing.** Creative-level report cocok dengan `apiGmvMax.js` → `gmvmax_creatives`;
   campaign info cocok dengan `gmvmax_campaign_settings` (0020). LIVE report (dim `room_id`) belum ada tabelnya.

**Verdict runtime: `PARTIALLY_VERIFIED`** — READ terbukti penuh untuk 1 tenant; multi-tenant terblokir untuk
tenant ke-2; EXECUTE tetap SCHEMA_ONLY (tak diuji, sesuai aturan).

---

## 2. Environment and Tenant Scope

| Item | Temuan | Bukti | Conf |
|---|---|---|---|
| Kredensial MCP | Token `tiktok-ads` MCP tersambung (Claude Code CLI). Token **tak pernah** muncul di respons. | tool calls sukses | HIGH |
| Advertiser ter-authorize | **5 advertiser** dikembalikan `auth_advertiser_get` (2 di antaranya = TENANT-A & TENANT-B; 3 lainnya di luar scope registry worker) | `auth_advertiser_get` `code:0` | HIGH |
| TENANT-A (primary) | ADV-A = `DEFAULT_ADVERTISER` worker; store STORE-A region ID | `worker.mjs:24`, `store_list` | HIGH |
| TENANT-B | ADV-B ter-authorize token, TAPI store STORE-B `is_gmv_max_available:false` | `gmv_max_store_list_get(ADV-B)` | HIGH |
| ADV-B2 (exclusive auth STORE-B) | **Tidak ada** di `auth_advertiser_get` → token tak bisa akses | `store_list(ADV-B).exclusive_authorized_advertiser_info` | HIGH |
| store_id availability | STORE-A & STORE-B diketahui dari registry hardcode `advertisers.mjs` | `src/gmvmax/advertisers.mjs` | HIGH |
| Worker masih `DEFAULT_ADVERTISER`? | **Ya.** `worker.mjs:24,74` pakai `DEFAULT_ADVERTISER` + registry `advertisers.mjs`. Jalur zero-touch `connections.mjs` (baca `tiktok_connections`) **ada tapi belum jadi jalur worker aktif**. | `worker.mjs`, `connections.mjs` | HIGH |
| Migrasi 0021 applied ke DB? | **UNKNOWN / NOT_VERIFIABLE dari environment ini** — tak ada akses DB read yang dikonfirmasi (service_role tak dipakai; tak menyentuh Supabase). File migrasi ada. | migrasi 0021 (file) | DATA_UNAVAILABLE |
| Koneksi resolvable tanpa expose kredensial | Ya — mapping tenant di `advertisers.mjs` (bukan token). Token dikelola MCP-layer, tak dibaca di sini. | `advertisers.mjs` | HIGH |

> **Registry mismatch (risiko):** `advertisers.mjs` mendaftarkan ADV-B2 (Dasfelix "akun baru") sebagai eligible,
> tetapi ADV-B2 **tidak** ada di `auth_advertiser_get` token ini → worker akan gagal auth untuk entri itu.

---

## 3. Calls Attempted

| # | Tool (read-only) | Target | Tujuan |
|---|---|---|---|
| 1 | `auth_advertiser_get` | token | Daftar advertiser ter-authorize |
| 2 | `gmv_max_store_list_get` | ADV-A | **Capability gateway** TENANT-A |
| 3 | `gmv_max_store_list_get` | ADV-B | Capability gateway TENANT-B |
| 4 | `gmv_max_campaign_get` (PRODUCT) | ADV-A/STORE-A | Inventaris Product campaign |
| 5 | `gmv_max_campaign_get` (LIVE) | ADV-A/STORE-A | Inventaris LIVE campaign |
| 6 | `campaign_gmv_max_info_get` | CMP-A1 (aktif) | Field setting campaign |
| 7 | `gmv_max_bid_recommend_get` (PRODUCT) | STORE-A | Recommended ROI/budget |
| 8 | `gmv_max_report_get` (campaign+day) | CMP-A1 | Report campaign-level |
| 9 | `gmv_max_report_get` (item_id) | CMP-A1 + SPU | Report creative-level |
| 10 | `gmv_max_report_get` (room_id+day) | CMP-A-LIVE | Report LIVE-level |
| 11 | `campaign_gmv_max_session_list_get` | CMP-A1 | Sesi Max Delivery / Creative Boost aktif |
| 12 | `gmv_max_identity_get` | STORE-A | Sumber identitas kreatif |
| 13 | `gmv_max_exclusive_authorization_get` | STORE-A | Status otorisasi affiliate/store |
| 14 | `store_product_get` (GMV_MAX) | STORE-A | Eligibility produk + mapping |
| 15 | `gmv_max_video_get` | STORE-A/identity | Supply video authorized |

**Mutation endpoints: 0 dipanggil** (create/update/status/session_create/creative_update/exclusive_auth_create).

---

## 4. Calls Successful

Semua panggilan TENANT-A **sukses `code:0`** (14/14 yang ditujukan ke TENANT-A). Ringkas:

| Tool | Hasil ringkas (redacted) | Conf |
|---|---|---|
| `auth_advertiser_get` | 5 advertiser | HIGH |
| `gmv_max_store_list_get(ADV-A)` | `is_gmv_max_available:true`; exclusive auth = ADV-A (match); `store_authorized_bc_id`=BC-A | HIGH |
| `gmv_max_campaign_get PRODUCT` | **11 campaign** (3 ENABLE, 8 DISABLE); tiap baris punya `roi_protection_compensation_status` | HIGH |
| `gmv_max_campaign_get LIVE` | **2 campaign** (ENABLE; 1 `secondary_status=…TTS_TT_ASSET_UNAVAILABLE`) | HIGH |
| `campaign_gmv_max_info_get(CMP-A1)` | 24+ field (lihat §7) — budget 100000, roas_bid 8, auto_budget lengkap, roi_protection_enabled true, accelerate_testing_for_new_videos "ON" | HIGH |
| `gmv_max_bid_recommend_get` | `roas_bid` rekomendasi (≈4.8) & `budget` rekomendasi (≈4jt) — **beda dari aktif** | HIGH |
| `gmv_max_report_get` campaign+day | 7 baris harian; cost/net_cost/gross_revenue/orders/roi; `roas_bid:"0"` di level ini | HIGH |
| `gmv_max_report_get` item_id | **723 creative / 1 SPU, 73 halaman**; title, tt_account_name, creative_delivery_status, shop_content_type, + metrik | HIGH |
| `gmv_max_report_get` room_id+day | **616 baris / 31 halaman**; cost/gross_revenue/orders/roi per room+hari | HIGH |
| `campaign_gmv_max_session_list_get` | `session_list:[]` (sukses; **tak ada sesi aktif** saat ini) | HIGH |
| `gmv_max_identity_get` | 2 identity (TTS_TT, BC_AUTH_TT); `product_gmv_max_available:true`, `live_gmv_max_available:false`, `unavailable_reason:"OCCUPIED"` | HIGH |
| `gmv_max_exclusive_authorization_get` | `authorization_status:"EFFECTIVE"`, `cps_authorization_status:"UNAUTHORIZED"` | HIGH |
| `store_product_get GMV_MAX` | **142 produk, 29 halaman**; item_group_id, gmv_max_ads_status (OCCUPIED/UNOCCUPIED), status, price, historical_sales | HIGH |
| `gmv_max_video_get` | sukses `code:0` tapi `item_list:[]` (**0** untuk identity TTS_TT) — bukan error, sekadar tanpa data | HIGH |

---

## 5. Calls Failed

Tidak ada kegagalan permission. Kegagalan hanya **validasi filter** (mendidik, mengonfirmasi kontrak) + 1
eligibility:

| Tool | Kode | Pesan | Arti |
|---|---|---|---|
| `gmv_max_report_get` creative-level (percobaan awal) | `40002` | "Creative level report must have at least 1 campaign ID and 1 item group ID" | **Konfirmasi resep ingest**: creative-level WAJIB `campaign_ids` + `item_group_ids`. Diperbaiki → sukses. |
| `gmv_max_report_get` LIVE (percobaan awal) | `40002` | "Invalid filter(s): '[gmv_max_promotion_types]' are not supported" | Filter `gmv_max_promotion_types` **dilarang** untuk query room_id/LIVE. Dihapus → sukses. |
| `gmv_max_store_list_get(ADV-B)` | `0` (sukses) tapi `is_gmv_max_available:false` | — | **STORE-B tak eligible** untuk advertiser yang bisa diakses token. |

---

## 6. Permission and Eligibility Results

| Tenant | GMV Max Eligible? | Exclusive Auth | Product | LIVE | Klasifikasi |
|---|---|---|---|---|---|
| **TENANT-A** | ✅ `is_gmv_max_available:true` | ✅ ADV-A (match akun terpakai) | ✅ 11 campaign, report OK | ✅ 2 campaign, room report OK | **RUNTIME_VERIFIED** |
| **TENANT-B** | ❌ `is_gmv_max_available:false` | ⚠️ dipegang **ADV-B2** (tak diakses token) | ❌ tak bisa | ❌ tak bisa | **STORE_NOT_ELIGIBLE / PERMISSION_DENIED** |

**Implikasi:** cutover multi-tenant **tidak bisa** menganggap semua koneksi punya GMV Max. Setiap workspace
**wajib** lolos gerbang `gmv_max_store_list_get` (is_gmv_max_available=true **dan** exclusive advertiser ∈
advertiser ter-authorize) sebelum disinkron. TENANT-B butuh perbaikan otorisasi/koneksi di sisi TikTok dulu.

---

## 7. Exact Runtime Field Inventory

Nama field **persis** dari respons (nilai contoh milik tenant sendiri; ID/akun diredaksi).

### `gmv_max_store_list_get`
`store_role, targeting_region_codes[], is_gmv_max_available, is_owner_bc, store_authorized_bc_info{bc_id,bc_name,bc_profile_image,user_role}, store_code, store_id, store_name, store_status, thumbnail_url, exclusive_authorized_advertiser_info{advertiser_id,advertiser_name,advertiser_status}, store_authorized_bc_id`

### `gmv_max_campaign_get`
`advertiser_id, campaign_id, campaign_name, objective_type(=PRODUCT_SALES), operation_status(ENABLE|DISABLE), secondary_status(CAMPAIGN_STATUS_ENABLE|_DISABLE|_PRODUCT_USED_BY_PRODUCT_GMV_MAX|_TTS_TT_ASSET_UNAVAILABLE), roi_protection_compensation_status(IN_EFFECT), create_time, modify_time` · `page_info{page,page_size,total_number,total_page}`

### `campaign_gmv_max_info_get` (Product) — **field terverifikasi**
`campaign_id, campaign_name, advertiser_id, store_id, store_authorized_bc_id, shopping_ads_type(PRODUCT), operation_status, optimization_goal(VALUE), deep_bid_type(VO_MIN_ROAS), billing_event(OCPM), roas_bid(=8), budget(=100000), auto_budget{auto_budget_enabled,budget_increase_percentage,current_budget,increase_limit,maximum_budget,next_increase,remained_times}, auto_budget_enabled, roi_protection_enabled(true), accelerate_testing_for_new_videos("ON"), promotion_days{is_enabled(false),custom_schedule_list[]}, affiliate_posts_enabled(true), product_specific_type(CUSTOMIZED_PRODUCTS), product_video_specific_type(AUTO_SELECTION), item_group_ids[10], item_list[], custom_anchor_video_list[], identity_list[{identity_id,identity_type(TTS_TT),store_id}], schedule_type(SCHEDULE_FROM_NOW), schedule_start_time, schedule_end_time, location_ids[], age_groups[], placements[PLACEMENT_TIKTOK,PLACEMENT_PANGLE,null]`

### `gmv_max_bid_recommend_get`
`roas_bid, budget` (dua-duanya = rekomendasi; **berbeda** dari campaign aktif)

### `gmv_max_report_get` — campaign+day
dim `campaign_id, stat_time_day`; metrics `cost, net_cost, gross_revenue, orders, roi, roas_bid("0" di level ini)` (semua STRING)

### `gmv_max_report_get` — creative (item_id)
dim `item_id`; metrics `title, tt_account_name, creative_delivery_status(NOT_ACTIVE|NOT_DELIVERYING|…), shop_content_type(VIDEO), cost, orders, cost_per_order, gross_revenue, roi, product_impressions, product_clicks, product_click_rate, ad_conversion_rate, ad_video_view_rate_2s, ad_video_view_rate_p100` (+_6s/_p25/_p50/_p75 tersedia). `page_info` menunjukkan **73 halaman** → paginasi wajib penuh.

### `gmv_max_report_get` — LIVE (room_id+day)
dim `room_id, stat_time_day`; metrics `cost, gross_revenue, orders, roi`. 31 halaman.

### `campaign_gmv_max_session_list_get`
`session_list[]` (kosong; skema sesi: bid_type NO_BID / CREATIVE_NO_BID, budget, schedule — tak ada sesi aktif untuk disampel)

### `gmv_max_identity_get`
`identity_list[{identity_id, identity_type(TTS_TT|BC_AUTH_TT), display_name, user_name?, profile_image, product_gmv_max_available(true), live_gmv_max_available(false), unavailable_reason(OCCUPIED), is_running_custom_shop_ads(false), store_id, identity_authorized_bc_id?, identity_authorized_shop_id?}]`

### `gmv_max_exclusive_authorization_get`
`authorization_status(EFFECTIVE), cps_authorization_status(UNAUTHORIZED), advertiser_status(STATUS_ENABLE), advertiser_id, advertiser_name, store_id, identity_id`

### `store_product_get` (ad_creation_eligible=GMV_MAX)
`store_products[{item_group_id, title, category, currency, min_price, max_price, quantity, historical_sales, status(AVAILABLE|NOT_AVAILABLE), gmv_max_ads_status(OCCUPIED|UNOCCUPIED), is_running_custom_shop_ads, product_image_url, store_id}]` · `page_info`

---

## 8. Runtime Feature Capability Matrix

| Feature | Runtime status | Bukti (tool → field) | Consumer code path | Conf |
|---|---|---|---|---|
| Product GMV Max | **RUNTIME_VERIFIED** | `gmv_max_campaign_get` PRODUCT → 11 campaign; report OK | `apiGmvMax.js`→`gmvmax_creatives` | HIGH |
| LIVE GMV Max | **RUNTIME_VERIFIED** | `campaign_get` LIVE → 2; report dim `room_id` OK | *tabel LIVE belum ada* | HIGH |
| Target ROI | **RUNTIME_VERIFIED (read)** | `info.roas_bid=8`, `deep_bid_type=VO_MIN_ROAS` | `campaignSettings.mjs`→`0020` | HIGH |
| Recommended ROI | **RUNTIME_VERIFIED** | `bid_recommend.roas_bid/budget` (beda aktif) | *baru* | HIGH |
| Daily Budget | **RUNTIME_VERIFIED (read)** | `info.budget=100000`; report cost harian | `0020` | HIGH |
| Auto Budget Increase | **RUNTIME_VERIFIED (read)** | `info.auto_budget{...enabled:true,limit:2,max:200000...}` | `0020.auto_budget` jsonb | HIGH |
| Promotion Days | **RUNTIME_VERIFIED (read)** | `info.promotion_days{is_enabled:false}` | *perluas 0020* | HIGH |
| ROI Protection status | **RUNTIME_VERIFIED (read-only)** | `info.roi_protection_enabled:true` + `campaign_get.roi_protection_compensation_status:IN_EFFECT` | `0020.roi_protection_enabled` (+field baru) | HIGH |
| Max Delivery | **RUNTIME_VERIFIED (endpoint)** / data kosong | `session_list_get` `code:0`, `session_list:[]` | *tabel session baru* | HIGH |
| Manual Creative Boost | **RUNTIME_VERIFIED (endpoint)** / data kosong | idem (bid_type CREATIVE_NO_BID) | *tabel session baru* | HIGH |
| Creative status (9 enum) | **RUNTIME_VERIFIED** | report `creative_delivery_status` (NOT_ACTIVE, NOT_DELIVERYING teramati) | `gmvmax_creatives.status` | HIGH |
| Affiliate authorization | **RUNTIME_VERIFIED** | `exclusive_authorization.authorization_status:EFFECTIVE`, `cps:UNAUTHORIZED`; creator via report `tt_account_name` | *baru* | HIGH |
| Creative source monitoring | **RUNTIME_VERIFIED (identity)** / video_get kosong | `identity_get` OK; `gmv_max_video_get` empty utk TTS_TT | report creative-level lebih kaya | MEDIUM |
| **Accelerate Testing (new videos)** | **RUNTIME_VERIFIED (read)** — *baru dari audit* | `info.accelerate_testing_for_new_videos:"ON"` | *registry* | HIGH |
| Full Shop (ALL products) | **SCHEMA_ONLY** (campaign sampel = CUSTOMIZED) | `info.product_specific_type=CUSTOMIZED_PRODUCTS` | — | MEDIUM |
| Selected Products | **RUNTIME_VERIFIED** | `info.item_group_ids[10]` | `0020.item_group_ids` | HIGH |
| Campaign scheduling | **RUNTIME_VERIFIED (read)** | `info.schedule_type/start/end` | `0020.schedule_*` | HIGH |
| Creative Exclusion (mutation) | **SCHEMA_ONLY** (tak diuji, sesuai aturan) | `gmv_max_creative_update` (tidak dipanggil) | — | HIGH |
| Semua mutation lain (create/update/pause/session/auth) | **SCHEMA_ONLY** | tidak dipanggil | — | HIGH |
| Incremental GMV / Estimated Paid ROI | **DATA_UNAVAILABLE** | tak ada field pemisah paid/organik di report | — | HIGH |

---

## 9. Existing Schema Mapping

| Runtime field | Existing table.column | Aksi | Conf |
|---|---|---|---|
| creative report (cost, orders, cost_per_order, gross_revenue, roi, product_impressions, product_clicks, rates, view-rates, title, tt_account_name, creative_delivery_status, shop_content_type) | `gmvmax_creatives.*` (via `apiGmvMax.js`) | **map penuh (ada)** | HIGH |
| item_id="-1" residual | `apiGmvMax.js` → `videoId=null`, `creative_type='Product card'` | ada (reconcile) | HIGH |
| campaign info (budget, roas_bid, auto_budget, roi_protection_enabled, deep_bid_type, schedule, item_group_ids, operation_status) | `gmvmax_campaign_settings.*` (0020) | **map penuh (ada)** | HIGH |
| `accelerate_testing_for_new_videos` | — | **kolom/registry baru** (`ACCELERATE_NEW_VIDEO_TESTING`) | HIGH |
| `promotion_days{...}` | — (0020 belum simpan) | **perluas 0020 / registry** | HIGH |
| `roi_protection_compensation_status` | — | **kolom baru** (monitor-only) | HIGH |
| campaign report harian (cost/net_cost/revenue/orders/roi per day) | diturunkan dari snapshot; totals di `gmvmax_imports.totals` | ada (rollup) | MEDIUM |
| LIVE report (room_id, stat_time_day, metrics) | **belum ada** | **tabel baru** `gmvmax_live_*` | HIGH |
| session (Max Delivery / Creative Boost) | **belum ada** | **tabel baru** `gmvmax_optimization_sessions` | HIGH |
| identity (`product/live_gmv_max_available`, unavailable_reason) | **belum ada** | registry / tabel identity | MEDIUM |
| exclusive_authorization (status, cps_authorization_status) | **belum ada** | registry / feature flag | HIGH |
| store_product (item_group_id, gmv_max_ads_status, price, historical_sales) | sebagian ke `calc_products` (nama/harga) — **matching SPU↔kode lemah** | mapping baru (SPU sbagai kunci) | MEDIUM |
| bid_recommend (roas_bid, budget) | **belum ada** | tabel rekomendasi | HIGH |

---

## 10. Missing Fields (harus tetap OPTIONAL / tak diasumsikan)

- **Pemisahan paid vs organik/affiliate revenue** — tak ada field. `gross_revenue` = GMV terAtribusi campur.
  → Incremental GMV, Incremental MER, Estimated Paid ROI = **DATA_UNAVAILABLE**.
- **HPP/COGS** — `store_product_get` hanya beri listing price (min/max), bukan modal. Contribution profit
  butuh input manual.
- **ROI Protection eligibility & credit history** — hanya `roi_protection_enabled` + `..._compensation_status`
  yang muncul; nominal kredit / eligibility **NOT_RETURNED**.
- **Commission Savings** — tak ada di API.
- **time_posted per creative** — report tak memuat waktu posting (`apiGmvMax.js` set `timePosted:null`).
- **Field yang tak muncul di respons** (mis. beberapa sub-field promotion_days saat disabled) → perlakukan
  sebagai **NOT_RETURNED / DATA_UNAVAILABLE**, bukan `false`.

---

## 11. Data Quality Risks

| Risiko | Bukti | Dampak | Mitigasi |
|---|---|---|---|
| **Paginasi berat** | creative 73 halaman/1 SPU; LIVE 31 halaman; produk 29 halaman | Sync lambat/parsial bila tak lengkap | `fail-explicit` full-pagination (sudah di DESIGN.md/engine) |
| **Mayoritas creative NOT_ACTIVE/cost 0** | 723 creative, sebagian besar cost "0" | Pool besar noise; ROAS receh = artefak | spend floor (sudah di `gmvmaxClassify.js`) |
| **Metrik = STRING** | "64438", "7.04", "0.00" | Salah tipe bila tak di-parse | `parseNum` (sudah ada) |
| **`roas_bid:"0"` di report** | campaign+day report | Bukan berarti ROI target 0 (itu campaign-level) | ambil roas_bid dari `info`, bukan report |
| **Late-arriving attribution** | revenue/orders bisa naik dalam window | Drift snapshot antar-tarikan | bandingkan tarikan waktu-sama (DESIGN.md) |
| **SPU↔produk lokal matching lemah** | store_product item_group_id vs `calc_products.kode` | Profit/nama salah tempel | jadikan item_group_id kunci kanonik |
| **Rate = persen** | product_click_rate "7.50"=7.5% | Salah skala bila dianggap rasio | `RATE_IS_RATIO=false` (sudah) |

---

## 12. Multi-tenant Risks

| Risiko | Bukti | Severity |
|---|---|---|
| **TENANT-B tak eligible via token** | `store_list(ADV-B).is_gmv_max_available:false` | **HARD BLOCKER** utk TENANT-B |
| **Exclusive auth di advertiser tak-terakses** | STORE-B exclusive = ADV-B2 ∉ `auth_advertiser_get` | **HARD BLOCKER** |
| **Registry hardcode ≠ realita token** | `advertisers.mjs` daftar ADV-B2 (tak diakses token) | Worker gagal auth entri itu |
| **Worker single-tenant** | `worker.mjs` pakai `DEFAULT_ADVERTISER` + `advertisers.mjs` (bukan `connections.mjs`) | Belum data-driven |
| **Migrasi 0021 apply UNKNOWN** | tak ada DB read dikonfirmasi | store_id per-koneksi belum terbukti tersimpan |
| **Token tunggal utk banyak advertiser** | 1 token MCP → 5 advertiser | Scope/kuota bersama; 1 token expiry → semua tenant sync mati |

**Gerbang wajib per-workspace sebelum sync:** `gmv_max_store_list_get` →
(`is_gmv_max_available==true` **AND** `exclusive_authorized_advertiser_info.advertiser_id` ∈ advertiser
ter-authorize) → baru eligible. Simpan hasilnya (mis. `gmvmax_sync_runs` / registry) sebagai status tenant.

---

## 13. Security Findings

- **Tidak ada token/secret** yang muncul di respons manapun (aman). Tidak ada yang di-log ke dokumen.
- Respons memuat **PII kreator** (username, avatar URL) dan **ID bisnis** — sudah **diredaksi** di dokumen ini.
- **Tidak** menyentuh `tiktok_connections` / service_role dari environment ini (menghindari expose kredensial).
- Temuan sebelumnya tetap berlaku (di luar Phase 0): token TikTok plaintext di DB, proxy Vercel terbuka —
  harus dibereskan **sebelum** lapisan EXECUTE (`PRODUCT_CONTEXT §16`).
- **Rekomendasi:** worker harus menyimpan hanya **ID + status** ke DB, redaksi title/username bila tak perlu,
  dan tak pernah menaruh token di log (sudah ada `runtime/redact.mjs`).

---

## 14. Phase 1 Readiness

**Feature Registry (Phase 1) — SIAP untuk TENANT-A.** Semua sumber field registry terbukti bekerja:
`store_list` (eligibility), `campaign_get` (+compensation status), `campaign_gmv_max_info_get`
(TARGET_ROI, AUTO_BUDGET_INCREASE, PROMOTION_DAYS, ROI_PROTECTION, ACCELERATE_NEW_VIDEO_TESTING,
affiliate_posts, product/video selection), `session_list` (MAX_DELIVERY, CREATIVE_BOOST),
`bid_recommend`. Isi `source=MCP`, `confidence=HIGH`, `availability_status` dari field nyata.

Prasyarat sebelum mulai:
1. Registry harus **per-tenant, di-gate** oleh hasil `store_list` (TENANT-B = NOT_AVAILABLE).
2. Tambah feature_code baru: `ACCELERATE_NEW_VIDEO_TESTING`, `ROI_PROTECTION_COMPENSATION`.
3. Tetap read-only; tak ada schema change dieksekusi di Phase 0/1 tanpa approval terpisah.

**Phase 2 (read-only cutover) — SIAP secara data untuk TENANT-A, BELUM untuk multi-tenant.** Butuh:
worker data-driven (`connections.mjs`) + gate eligibility per-workspace + konfirmasi migrasi 0021 applied +
resolusi otorisasi TENANT-B.

---

## 15. Final Runtime Verdict

```
RUNTIME VERDICT: PARTIALLY_VERIFIED
(READ terbukti penuh untuk TENANT-A; multi-tenant terblokir untuk TENANT-B; EXECUTE tetap SCHEMA_ONLY.)

TENANT GMV MAX ELIGIBILITY:
- TENANT-A: ELIGIBLE (is_gmv_max_available=true; exclusive auth match; Product+LIVE ada)
- TENANT-B: NOT_AVAILABLE (is_gmv_max_available=false; exclusive auth dipegang advertiser di luar token)

READ CAPABILITIES VERIFIED (TENANT-A):
- Store eligibility & exclusive authorization
- Campaign inventory (Product 11, LIVE 2) + secondary_status + roi_protection_compensation_status
- Campaign settings: budget, roas_bid(Target ROI), auto_budget(Auto Budget Increase), promotion_days,
  roi_protection_enabled, accelerate_testing_for_new_videos, item_group_ids(Selected Products),
  affiliate_posts_enabled, schedule, identity_list
- Recommended ROI + budget (berbeda dari aktif)
- Reporting: campaign+day, creative(item_id), LIVE(room_id) — semua metrik inti + creative_delivery_status
- Optimization sessions (Max Delivery / Creative Boost) endpoint (kosong saat ini)
- Identity source availability, exclusive/affiliate authorization status
- Product eligibility (gmv_max_ads_status, price, historical_sales)

SCHEMA-ONLY CAPABILITIES (tidak diuji, sesuai aturan):
- campaign create/update, campaign status update, session create/update/delete,
  creative_update (Creative Exclusion), exclusive_authorization_create
- Full Shop (ALL) — campaign sampel memakai CUSTOMIZED_PRODUCTS

PERMISSION BLOCKERS:
- TENANT-B: GMV Max exclusive authorization berada di advertiser (ADV-B2) yang TIDAK ter-authorize token.
- Registry worker mendaftarkan advertiser (ADV-B2) yang tak diakses token → akan gagal auth.

DATA BLOCKERS:
- Paid vs organik/affiliate tak terpisah → Incremental GMV / Estimated Paid ROI = DATA_UNAVAILABLE.
- COGS/HPP tidak dari API → Contribution profit butuh input manual.
- ROI Protection eligibility & credit nominal = NOT_RETURNED.

FIELDS SAFE TO BUILD AGAINST (RUNTIME_VERIFIED, source=MCP, confidence HIGH):
- creative: cost, orders, cost_per_order, gross_revenue, roi, product_impressions, product_clicks,
  product_click_rate, ad_conversion_rate, ad_video_view_rate_2s/6s/p25/p50/p75/p100,
  creative_delivery_status, shop_content_type, tt_account_name, title, item_id(+"-1" residual)
- campaign info: budget, roas_bid, deep_bid_type, auto_budget{...}, roi_protection_enabled,
  accelerate_testing_for_new_videos, promotion_days, item_group_ids, affiliate_posts_enabled, schedule_*
- campaign_get: operation_status, secondary_status, roi_protection_compensation_status, modify/create_time
- report LIVE: room_id, stat_time_day, cost, gross_revenue, orders, roi
- bid_recommend: roas_bid, budget
- store_product: item_group_id, gmv_max_ads_status, status, min/max_price, historical_sales
- authorization: authorization_status, cps_authorization_status

FIELDS THAT MUST REMAIN OPTIONAL:
- promotion_days sub-fields saat disabled; time_posted; roi_protection compensation nominal;
  gmv_max_video_get item_list (bisa kosong per identity); paid/organik split (tak ada)

PHASE 1 FEATURE REGISTRY READY: YES (untuk TENANT-A; gate per-tenant wajib)

PHASE 2 READ-ONLY CUTOVER READY: NO (butuh worker data-driven + gate eligibility per-workspace +
konfirmasi migrasi 0021 applied + resolusi otorisasi TENANT-B)

NEXT SAFE STEP:
Bangun Phase 1 Feature Registry (read-only, per-tenant, di-gate store_list) UNTUK TENANT-A saja,
sambil menyiapkan gate eligibility multi-tenant. Jangan cutover sampai TENANT-B teratasi.
Tetap tidak menyentuh endpoint tulis.
```

---

### Evidence & confidence
Setiap klaim di §7–8 punya: nama tool MCP + field respons (redacted) + status sukses/error + code path
konsumen + confidence (HIGH kecuali disebut MEDIUM/DATA_UNAVAILABLE). Tidak ada fitur diklaim didukung hanya
karena tool-nya ada — semua RUNTIME_VERIFIED punya respons `code:0` nyata; yang tak diuji ditandai SCHEMA_ONLY;
yang tak tersedia ditandai NOT_AVAILABLE / NOT_RETURNED / DATA_UNAVAILABLE.

---

### Phase 1 implementation reference (ditambahkan 2026-07-20)

Bukti runtime di dokumen ini menjadi dasar **Phase 1 Feature Registry** (read-only) —
lihat [GMV_MAX_FEATURE_REGISTRY_DESIGN.md](GMV_MAX_FEATURE_REGISTRY_DESIGN.md) dan migrasi
`0022_gmvmax_feature_registry.sql`. Registry meng-encode gate eligibility per-tenant (§6/§12 dok ini),
field runtime terverifikasi (§7–8), dan menandai fitur mutasi tetap **SCHEMA_ONLY**. Bukti di dokumen ini
tidak diubah.
