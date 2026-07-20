# GMV Max Feature Registry — Design (Phase 1)

> **Read-only, per-tenant, historis.** Dibangun 2026-07-20. Tidak ada endpoint tulis TikTok.
> Worker produksi tetap **shadow-only**. Belum di-commit/push. Migrasi belum di-apply ke DB.
>
> Prasyarat konteks: [GMV_MAX_FEATURE_FEASIBILITY_AUDIT.md](GMV_MAX_FEATURE_FEASIBILITY_AUDIT.md) (Phase −1)
> dan [GMV_MAX_RUNTIME_CAPABILITY_VERIFICATION.md](GMV_MAX_RUNTIME_CAPABILITY_VERIFICATION.md) (Phase 0).

## 1. Purpose

Menyimpan **kapabilitas GMV Max NYATA** per workspace — membedakan tegas antara *"ada di schema MCP"*
dan *"tersedia di runtime untuk tenant ini"*. Menjawab:

1. Apakah workspace/store eligible GMV Max?
2. Fitur Product/LIVE mana yang available/enabled/active?
3. Fitur mana read-only / schema-only / tak tersedia?
4. Apa source & confidence-nya?
5. Kapan tiap fitur pertama & terakhir terdeteksi?
6. Apakah berubah sejak deteksi sebelumnya?
7. Apakah workspace terblokir oleh authorization mismatch?

Registry **tidak** berpura-pura schema availability = runtime availability.

## 2. Schema (migrasi `0022_gmvmax_feature_registry.sql`)

Dua tabel (Opsi A: current-state + history terpisah — paling sederhana & konsisten dgn pola snapshot):

**`gmvmax_feature_registry`** (STATE saat ini, 1 baris/fitur):
`id, user_id, workspace_id, brand_id?, connection_id?, advertiser_id, store_id, campaign_id?, identity_id?,
feature_scope, feature_code, availability_status, capability_level, enabled?, active?, source, confidence,
signature, first_detected_at, last_detected_at, last_changed_at?, metadata jsonb, created_at, updated_at`

**`gmvmax_feature_registry_history`** (APPEND-only, hanya saat state material berubah):
`id, workspace_id, store_id, campaign_id?, identity_id?, feature_code, change_type(DETECTED|CHANGED),
prev/new_availability_status, prev/new_enabled, prev/new_active, prev/new_signature, metadata, detected_at`

**Identitas unik NULL-safe** (fitur tenant/identity punya `campaign_id`/`identity_id` NULL):
```sql
unique index (workspace_id, store_id, feature_code, coalesce(campaign_id,''), coalesce(identity_id,''))
```
UNIQUE biasa memperlakukan NULL sebagai distinct → tak cukup. Writer juga match null-safe via `keyOf()`.
Index: workspace_id, (workspace_id,store_id), (workspace_id,campaign_id), (workspace_id,feature_code),
(workspace_id,availability_status), (workspace_id,last_detected_at desc).

## 3. Feature Codes

- **TENANT:** `GMV_MAX_ELIGIBILITY`, `EXCLUSIVE_GMV_MAX_AUTHORIZATION`, `PRODUCT_GMV_MAX_AVAILABLE`, `LIVE_GMV_MAX_AVAILABLE`
- **CAMPAIGN:** `TARGET_ROI`, `RECOMMENDED_ROI`, `DAILY_BUDGET`, `AUTO_BUDGET_INCREASE`, `PROMOTION_DAYS`,
  `ROI_PROTECTION`, `ROI_PROTECTION_COMPENSATION`, `ACCELERATE_NEW_VIDEO_TESTING`, `AFFILIATE_POSTS`,
  `FULL_SHOP`, `SELECTED_PRODUCTS`, `AUTO_SELECT_CREATIVE`, `CAMPAIGN_SCHEDULING`, `MAX_DELIVERY`, `CREATIVE_BOOST`
- **CREATIVE/PRODUCT/STORE:** `CREATIVE_STATUS_MONITORING`, `AFFILIATE_AUTHORIZATION`, `CREATIVE_EXCLUSION`, `PRODUCT_GMV_MAX_ELIGIBILITY`
- **IDENTITY:** `IDENTITY_PRODUCT_GMV_MAX_AVAILABLE`, `IDENTITY_LIVE_GMV_MAX_AVAILABLE`, `IDENTITY_LIVE_UNAVAILABLE_REASON`
- **SCHEMA-ONLY / UNAVAILABLE:** `AUTO_GENERATED_IMAGES`, `SHOP_CREATIVE_HUB`, `PREFERRED_VIDEO`,
  `LIVE_CREATIVE_BOOST`, `VIEWER_BOOST`, `VIDEO_TO_LIVE_CONTROL`, `LIVE_TO_LIVE_CONTROL`, `MEGA_LIVE`, `COMMISSION_SAVINGS`

## 4. Runtime Mappings (hanya field Phase 0 terverifikasi)

| Field MCP (read-only) | feature_code | Normalisasi |
|---|---|---|
| `store_list.is_gmv_max_available` + `exclusive_authorized_advertiser_info` | GMV_MAX_ELIGIBILITY, EXCLUSIVE_GMV_MAX_AUTHORIZATION | gate §5 |
| campaign_get per tipe (count) | PRODUCT/LIVE_GMV_MAX_AVAILABLE | count>0 → AVAILABLE, else UNKNOWN |
| `info.roas_bid`,`deep_bid_type` | TARGET_ROI | ENABLED (MONITOR; execute schema-only) |
| `bid_recommend.roas_bid`,`budget` | RECOMMENDED_ROI | AVAILABLE (RECOMMEND) + delta vs aktif |
| `info.budget` | DAILY_BUDGET | ACTIVE |
| `info.auto_budget{...}` | AUTO_BUDGET_INCREASE | enabled→ENABLED, else INACTIVE; metadata angka |
| `info.promotion_days.is_enabled` | PROMOTION_DAYS | true→ACTIVE, false→INACTIVE; sub-field absen→NOT_RETURNED |
| `info.roi_protection_enabled` | ROI_PROTECTION | ENABLED/INACTIVE (execute=SELLER_CENTER_ONLY) |
| `campaign_get.roi_protection_compensation_status` | ROI_PROTECTION_COMPENSATION | IN_EFFECT→ACTIVE |
| `info.accelerate_testing_for_new_videos` | ACCELERATE_NEW_VIDEO_TESTING | ON→ENABLED, OFF→INACTIVE |
| `info.affiliate_posts_enabled` | AFFILIATE_POSTS | ENABLED/INACTIVE |
| `info.product_specific_type` | FULL_SHOP / SELECTED_PRODUCTS | ALL vs CUSTOMIZED_PRODUCTS |
| `info.product_video_specific_type` | AUTO_SELECT_CREATIVE | AUTO_SELECTION→ACTIVE |
| `info.schedule_type/start/end` | CAMPAIGN_SCHEDULING | ACTIVE |
| `session_list` NO_BID / CREATIVE_NO_BID | MAX_DELIVERY / CREATIVE_BOOST | sesi aktif→ACTIVE; **[]→INACTIVE** (bukan NOT_AVAILABLE) |
| `identity_get.product/live_gmv_max_available`,`unavailable_reason` | IDENTITY_* | per identity; live tak-tersedia ≠ store LIVE unavailable |
| `exclusive_authorization_get.authorization_status`,`cps_...` | AFFILIATE_AUTHORIZATION | EFFECTIVE→ACTIVE |
| `store_product_get.gmv_max_ads_status` | PRODUCT_GMV_MAX_ELIGIBILITY | AVAILABLE + count occupied/unoccupied |

## 5. Tenant Eligibility Gate (`evaluateTenantEligibility`)

Urutan (paling spesifik dulu):
1. Koneksi tak lengkap → `CONNECTION_MISSING`.
2. store_list error permission → `PERMISSION_DENIED`; error lain → `DATA_UNAVAILABLE`.
3. store_list absen → `UNKNOWN`.
4. store_id koneksi tak ada di store_list → `STORE_NOT_FOUND`.
5. exclusive advertiser ada & (≠ advertiser koneksi **atau** di luar `auth_advertiser_get`) → **`AUTHORIZATION_MISMATCH`**.
6. `is_gmv_max_available !== true` → `NOT_AVAILABLE`.
7. lainnya → `ELIGIBLE`.

**Gate perilaku:** bila status ≠ ELIGIBLE, `buildRegistry` **tidak** mendeteksi fitur campaign/identity —
hanya emit record tenant (eligibility + exclusive auth). (Kasus nyata TENANT-B/Dasfelix: `AUTHORIZATION_MISMATCH`.)

## 6. Status Semantics

- **availability_status:** AVAILABLE, ENABLED, ACTIVE, INACTIVE, NOT_AVAILABLE, ROLLOUT_LIMITED,
  AUTHORIZATION_MISMATCH, PERMISSION_DENIED, UNKNOWN, **NOT_RETURNED**, DATA_UNAVAILABLE, SCHEMA_ONLY.
- **NOT_RETURNED** ≠ false: field yang **absen** dari respons (undefined) → NOT_RETURNED; `null` → DATA_UNAVAILABLE.
- **session_list `[]`** → INACTIVE (endpoint terverifikasi read), **bukan** NOT_AVAILABLE.
- **capability_level:** READ, MONITOR, RECOMMEND, EXECUTE_SCHEMA_ONLY, **EXECUTE_RUNTIME_VERIFIED (DILARANG di Phase 1)**.
- **source:** MCP, OFFICIAL_API, SELLER_CENTER, FILE_IMPORT, MANUAL_INPUT, DERIVED, SCHEMA_INSPECTION.
- **confidence:** HIGH, MEDIUM, LOW, DATA_UNAVAILABLE.

## 7. Read vs Execute

Registry hanya menandai **apa yang bisa dibaca/dimonitor sekarang**. Fitur yang punya jalur mutasi API
(TARGET_ROI, DAILY_BUDGET, AUTO_BUDGET_INCREASE, PROMOTION_DAYS, MAX_DELIVERY, CREATIVE_BOOST, CREATIVE_EXCLUSION)
menandai `metadata.execute = 'SCHEMA_ONLY'` dan capability tetap MONITOR/READ (kecuali CREATIVE_EXCLUSION =
EXECUTE_SCHEMA_ONLY). **Tidak ada** EXECUTE_RUNTIME_VERIFIED di Phase 1. ROI_PROTECTION → execute=SELLER_CENTER_ONLY.

## 8. Change Detection

`signature` = serialisasi stabil `[availability_status, enabled, active, signal-material]`.
`mergeRegistry(existing, incoming, now)` (pure):
- record baru → insert + history `DETECTED`.
- signature berubah → update + history `CHANGED` (`last_changed_at`=now).
- signature sama → hanya bump `last_detected_at` (tanpa history — tak ada baris noise).

## 9. RLS / Security

- RLS owner-all (`workspaces.user_id = auth.uid()`) + admin consent-based (`admin_can_view`) — **identik**
  pola `gmvmax_*` lain (0011/0020/0021). Tak melemahkan RLS mana pun.
- Writer memanggil `assertWorkspaceScope()` (guard tambahan selain RLS) → tolak penulisan lintas-workspace.
- `user_id` denormalisasi (nullable); otoritas tetap via join workspace.
- UI tak menampilkan tombol yang mengubah setting TikTok; ID mentah diminimalkan.

## 10. Known Limitations

- Migrasi 0022 **belum di-apply** ke DB (di luar scope tanpa approval). UI menampilkan empty/error state
  hingga tabel ada + registry terisi.
- Isi registry butuh proses read-only yang menjalankan `fetchRegistryInputs` (belum dijadwalkan; worker tetap
  shadow-only). Bisa dijalankan manual/skrip saat diminta.
- Verifikasi UI end-to-end lokal terhalang auth gate + tabel belum ada (lihat pola verifikasi lokal). Diverifikasi:
  ESLint bersih, `vite build` sukses, dev server boot tanpa error, 20/20 unit test lulus.
- `RECOMMENDED_ROI` bersumber `bid_recommend` level store; dilekatkan per campaign Product (bukan per LIVE).
- Incremental/Paid ROI **tidak** dimodelkan (DATA_UNAVAILABLE — lihat Phase 0).

## 11. Phase 2 Dependencies

Sebelum cutover read-only worker (Phase 2):
1. Apply migrasi 0022 (+ 0021) ke DB.
2. Worker data-driven via `connections.mjs` (bukan `advertisers.mjs` hardcode) + **gate eligibility per-workspace**
   (registry `GMV_MAX_ELIGIBILITY`) sebelum sync.
3. Resolusi otorisasi TENANT-B (Dasfelix) di sisi TikTok.
4. Penjadwalan pengisian registry read-only (masih tanpa endpoint tulis).

## 12. Files (Phase 1)

- `supabase/migrations/0022_gmvmax_feature_registry.sql` — tabel + RLS + index.
- `src/gmvmax/featureRegistry.mjs` — normalizer + gate + merge/change-detect (pure).
- `src/gmvmax/featureRegistryFetch.mjs` — orchestrator read-only (tak diimpor worker).
- `src/gmvmax/featureRegistryWriter.mjs` — writer tenant-aware + guard.
- `src/gmvmax/featureRegistry.test.mjs` — 20 test (node:test).
- `src/data/gmvmaxFeatureRegistry.js` — loader read-only webapp.
- `src/pages/gmvmax/FeatureRegistryPage.jsx` — UI read-only + banner eligibility.
- Wiring: `GmvMaxModule.jsx`, `Layout.jsx` (NAV `gmv_features`), `App.jsx` (PAGE_META), `i18n.js` (id+en).
