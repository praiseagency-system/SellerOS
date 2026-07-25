# GMV Max Feature Registry — Activation Verification (Phase 1)

> **Read-only verification.** Tidak ada endpoint tulis TikTok dipanggil. Worker tetap shadow-only.
> Tidak commit/push. Tanggal: **2026-07-20**.
>
> Alias (REDaksi): **TENANT-A** = advertiser ADV-A / store STORE-A / BC BC-A (perfume store A, primary).
> **TENANT-B** = advertiser ADV-B / store STORE-B (perfume store B); **ADV-B2** = advertiser pihak-ketiga
> pemegang exclusive auth STORE-B (di luar akses token). Campaign aktif tersampel = CMP-A1.
> Tidak ada token/secret di dokumen ini (JWT diredaksi di seluruh tool output).

## 1. Executive Summary

Phase 1 Feature Registry **siap diaktifkan, dengan SATU blocker: migrasi 0022 belum di-apply**.
Verifikasi (semua read-only) membuktikan:

- **Migrasi 0021 SUDAH applied** (kolom `tiktok_connections.store_id` ada; tabel `gmvmax_sync_runs` ada).
- **Migrasi 0022 BELUM applied** (`gmvmax_feature_registry`/`_history` → PGRST205 "table not found").
- DB **reachable** untuk DML via service_role (PostgREST), tetapi **DDL tidak bisa** dijalankan lewat jalur
  ini; tak ada password Postgres / Supabase CLI link di environment → **apply 0022 harus manual** via
  Supabase SQL Editor (pola sama semua migrasi repo ini).
- **Dry-run population TENANT-A** (data MCP read-only nyata → normalizer `buildRegistry` asli) menghasilkan
  **38 record benar** di 7 scope, **0** ber-`EXECUTE_RUNTIME_VERIFIED` (invariant Phase 1 terjaga).
- **Gate TENANT-B TERBUKTI**: `fetchRegistryInputs` asli + provider ter-instrumentasi → status
  `AUTHORIZATION_MISMATCH`, hanya **4 record tenant**, dan **hanya `gmv_max_store_list_get` yang dipanggil**
  (nol panggilan info/session/identity/product/campaign downstream).
- **History & idempotensi TERBUKTI** lewat writer asli (`persistRegistry`) atas DB in-memory: run identik →
  0 perubahan; ubah 1 field (Accelerate ON→OFF, fixture terkontrol) → **tepat 1 baris CHANGED**; jumlah baris
  registry stabil (tanpa duplikat).
- **Pola RLS** yang di-reuse 0022 terbukti menegakkan isolasi pada tabel sibling: anon tanpa sesi → **401**;
  service_role → bypass. 0022 memakai grant/policy identik → perilaku sama setelah apply.

**Verdict: `PARTIALLY_VERIFIED` — logika & keamanan terbukti; aktivasi penuh BLOCKED pada apply 0022 (manual).**

## 2. Code Review Findings (Part 1)

Direview: `0022_gmvmax_feature_registry.sql`, `featureRegistry.mjs`, `featureRegistryFetch.mjs`,
`featureRegistryWriter.mjs`, `featureRegistry.test.mjs`, `data/gmvmaxFeatureRegistry.js`,
`FeatureRegistryPage.jsx`, `GmvMaxModule.jsx`, `Layout.jsx`, `App.jsx`, `i18n.js`.

| Aspek | Hasil |
|---|---|
| Schema correctness | OK — enum via CHECK, jsonb default, timestamps. |
| NULL-safe uniqueness | OK — unique index `coalesce(campaign_id,''),coalesce(identity_id,'')`; writer `keyOf()` null-safe. |
| FK compatibility | OK — `workspace_id→workspaces(id) on delete cascade`; `user_id→auth.users(id) on delete set null`. |
| RLS consistency | OK — owner-all + admin `admin_can_view`, identik pola 0011/0020/0021. |
| Cross-workspace isolation | OK — `assertWorkspaceScope()` guard + RLS + writer query per `workspace_id`. |
| Idempotent writer | OK — merge by signature; run identik → 0 history (dibuktikan §10). |
| History noise | OK — history hanya saat signature berubah. |
| Missing-field inference | OK — field absen → `NOT_RETURNED` (bukan false); dibuktikan unit test 7 & 16. |
| Mutation MCP refs | OK — nol; test #20 memindai fetch module vs `FORBIDDEN_MUTATION_TOOLS`. |
| Fetch wired ke worker? | **Tidak** — `worker.mjs`/`vpsCommit.mjs` tak mengimpor `featureRegistryFetch.mjs`. |
| UI saat tabel hilang/kosong | OK — 404→error banner; []→EmptyState; tak crash. |

**Confirmed defects: 0.** Tidak ada perubahan kode dilakukan pada fase ini.

## 3. Migration Status (Part 2)

Diverifikasi via PostgREST + service_role (bukan asumsi file):

| Objek | Diharapkan dari | Hasil |
|---|---|---|
| `tiktok_connections.store_id` | 0021 | **ADA** (mengembalikan store_id) → **0021 APPLIED** |
| `gmvmax_sync_runs` | 0021 | **ADA** (count 3) → **0021 APPLIED** |
| `gmvmax_feature_registry` | 0022 | **TIDAK ADA** (PGRST205) → **0022 NOT_APPLIED** |
| `gmvmax_feature_registry_history` | 0022 | **TIDAK ADA** (PGRST205) → **0022 NOT_APPLIED** |

Urutan & dependensi: 0022 hanya bergantung pada `public.workspaces`, `auth.users`, dan helper
`admin_can_view()` (dari 0001) — semuanya sudah ada. 0022 **tidak** bergantung pada 0021. Urutan aman:
0021 (sudah) → 0022.

## 4. Migration Safety (Part 2)

Analisis statis `0022_gmvmax_feature_registry.sql`:

- **Operasi:** hanya `create table if not exists`, `create unique index if not exists`,
  `create index if not exists`, `grant`, `drop policy if exists` **atas policy-nya sendiri**, `create policy`,
  `alter table … enable row level security` (pada tabel BARU).
- **Destruktif?** **Tidak** — nol `DROP TABLE`, `TRUNCATE`, `DELETE`, `ALTER … DROP COLUMN`.
- **Menyentuh tabel existing?** **Tidak** — semua objek baru (`gmvmax_feature_registry*`). Tak ada
  ALTER pada tabel lama, tak ada rewrite.
- **Idempoten?** Ya — semua `if not exists` / `drop policy if exists`. Rerun aman.
- **Rollback:** `drop table gmvmax_feature_registry_history; drop table gmvmax_feature_registry;` (tak
  menyentuh data lain).
- **Kesimpulan:** **additive & aman**. Namun **tidak dapat di-apply dari environment ini** (tak ada jalur
  DDL). → **Apply manual di Supabase SQL Editor** (isi file `supabase/migrations/0022_gmvmax_feature_registry.sql`).

## 5. Tables and Policies Verified (Part 7 pendukung)

Karena `gmvmax_feature_registry` belum ada, RLS-nya belum bisa diuji runtime. **Pola yang di-reuse**
diuji pada tabel sibling (grant `to authenticated` + owner-RLS):

| Tabel (existing, RLS owner-only) | ANON tanpa sesi | SERVICE_ROLE |
|---|---|---|
| `gmvmax_sync_runs` | **401** (ditolak) | 200 (count 3) |
| `gmvmax_campaign_settings` | **401** (ditolak) | 200 (count 134) |
| `tiktok_connections` | **401** (ditolak) | 200 (count 2) |

0022 memakai grant/policy **identik** → setelah apply, isolasi owner/admin akan berperilaku sama.
`updated_at` di-set writer (proyek tak pakai trigger updated_at) — terverifikasi via harness (§10).

## 6. TENANT-A Population Result (Parts 3 & 4)

Karena 0022 belum ada → **penulisan DB nyata BLOCKED**. Dilakukan **DRY-RUN**: data MCP read-only nyata
(store_list, campaign_get PRODUCT+LIVE, campaign_gmv_max_info_get, bid_recommend, session_list,
identity_get, exclusive_authorization_get, store_product_get) → **normalizer asli `buildRegistry`**.

- Tenant status: **ELIGIBLE**.
- **38 record** di 7 scope (§8).
- Field terverifikasi (contoh):

| Feature | availability | capability | enabled | active | source | conf |
|---|---|---|---|---|---|---|
| GMV_MAX_ELIGIBILITY | AVAILABLE | READ | true | true | MCP | HIGH |
| EXCLUSIVE_GMV_MAX_AUTHORIZATION | AVAILABLE | READ | true | true | MCP | HIGH |
| TARGET_ROI | ENABLED | MONITOR | true | true | MCP | HIGH |
| RECOMMENDED_ROI | AVAILABLE | RECOMMEND | — | — | MCP | HIGH |
| DAILY_BUDGET | ACTIVE | MONITOR | — | true | MCP | HIGH |
| AUTO_BUDGET_INCREASE | ENABLED | MONITOR | true | true | MCP | HIGH |
| PROMOTION_DAYS | INACTIVE | MONITOR | false | false | MCP | HIGH |
| ROI_PROTECTION | ENABLED | MONITOR | true | true | MCP | HIGH |
| ROI_PROTECTION_COMPENSATION | ACTIVE | MONITOR | — | true | MCP | HIGH |
| ACCELERATE_NEW_VIDEO_TESTING | ENABLED | MONITOR | true | true | MCP | HIGH |
| AFFILIATE_POSTS | ENABLED | MONITOR | true | true | MCP | HIGH |
| SELECTED_PRODUCTS | ACTIVE | MONITOR | — | true | MCP | HIGH |
| FULL_SHOP | INACTIVE | MONITOR | — | false | MCP | HIGH |
| AUTO_SELECT_CREATIVE | ACTIVE | MONITOR | — | true | MCP | HIGH |
| CAMPAIGN_SCHEDULING | ACTIVE | MONITOR | — | true | MCP | HIGH |
| MAX_DELIVERY | INACTIVE | MONITOR | false | false | MCP | HIGH |
| CREATIVE_BOOST | INACTIVE | MONITOR | false | false | MCP | HIGH |
| IDENTITY_PRODUCT_GMV_MAX_AVAILABLE (×2 identitas) | AVAILABLE | READ | true | — | MCP | HIGH |
| IDENTITY_LIVE_GMV_MAX_AVAILABLE (×2) | INACTIVE | READ | false | — | MCP | HIGH |
| IDENTITY_LIVE_UNAVAILABLE_REASON (×2, OCCUPIED) | NOT_AVAILABLE | READ | — | — | MCP | HIGH |
| AFFILIATE_AUTHORIZATION | ACTIVE | MONITOR | — | true | MCP | HIGH |
| PRODUCT_GMV_MAX_ELIGIBILITY | AVAILABLE | READ | — | — | MCP | HIGH |
| CREATIVE_STATUS_MONITORING | AVAILABLE | MONITOR | — | — | MCP | HIGH |
| CREATIVE_EXCLUSION | SCHEMA_ONLY | EXECUTE_SCHEMA_ONLY | — | — | MCP | HIGH |
| AUTO_GENERATED_IMAGES | DATA_UNAVAILABLE | RECOMMEND | — | — | DERIVED | LOW |
| SHOP_CREATIVE_HUB | NOT_AVAILABLE | RECOMMEND | — | — | SCHEMA_INSPECTION | LOW |
| PREFERRED_VIDEO / LIVE_CREATIVE_BOOST / VIEWER_BOOST / VIDEO_TO_LIVE_CONTROL / LIVE_TO_LIVE_CONTROL / MEGA_LIVE | NOT_AVAILABLE | RECOMMEND | — | — | SCHEMA_INSPECTION | LOW |
| COMMISSION_SAVINGS | DATA_UNAVAILABLE | RECOMMEND | — | — | SELLER_CENTER | DATA_UNAVAILABLE |

- **EXECUTE_RUNTIME_VERIFIED count = 0** ✅ (invariant Phase 1).
- Timestamp (via writer harness §10): `first_detected_at`/`last_detected_at`/`last_changed_at` terisi benar.
- Scope campaign/store/identity ter-stamp `campaign_id`/`identity_id` sesuai (redacted).

> Hanya **1 campaign aktif** (CMP-A1) yang disampel di dry-run (dari 3 ENABLE) — cukup membuktikan semua
> 15 feature_code campaign muncul. Populasi penuh akan mengiterasi seluruh campaign aktif (maxCampaigns).

## 7. TENANT-B Gate Result (Part 5)

Dijalankan lewat **`fetchRegistryInputs` asli** + provider ter-instrumentasi (mencatat tiap `callTool`).
Input store_list = STORE-B (`is_gmv_max_available=false`, exclusive = ADV-B2 ∉ token).

- Tenant status: **AUTHORIZATION_MISMATCH** (bukan `ERROR` generik).
- Record ditulis: **4 tenant-level** (`GMV_MAX_ELIGIBILITY`, `EXCLUSIVE_GMV_MAX_AUTHORIZATION`,
  `PRODUCT_GMV_MAX_AVAILABLE`, `LIVE_GMV_MAX_AVAILABLE`).
- **MCP tools dipanggil: `["gmv_max_store_list_get"]` — HANYA gerbang.**
- Downstream (campaign_get/info/session/identity/product/bid): **tidak ada** (instrumentasi = `false`).

→ Gate menghentikan sync hilir untuk tenant tak-eligible, terbukti dari instrumentasi.

## 8. Registry Record Counts (Part 8-data)

TENANT-A dry-run: **38 record** —
TENANT 4 · CAMPAIGN 15 · IDENTITY 6 (2 identitas × 3) · CREATIVE 4 · STORE 2 · PRODUCT 1 · LIVE 6.
TENANT-B: **4 record** (tenant-level saja).

## 9. Feature Codes Detected

Semua feature_code yang diminta muncul untuk TENANT-A (lihat §6). Tenant/store, campaign, identity/product
semua terisi; schema-only/unavailable ditandai NOT_AVAILABLE/SCHEMA_ONLY/DATA_UNAVAILABLE dengan
capability RECOMMEND/EXECUTE_SCHEMA_ONLY (bukan false state palsu).

## 10. History and Idempotency Result (Part 6)

Writer asli `persistRegistry` atas DB in-memory (fixture terkontrol; **TIDAK** mengubah setting TikTok):

| Run | inserted | updated | changes (history) |
|---|---|---|---|
| run1 (perdana) | 38 | 0 | **38 DETECTED** |
| run2 (input identik) | 0 | 38 | **0** |
| run3 (Accelerate ON→OFF) | 0 | 38 | **1 CHANGED** |

- History total: 39 (38 DETECTED + 1 CHANGED). CHANGED = `ACCELERATE_NEW_VIDEO_TESTING` (ENABLED→INACTIVE),
  prev/new benar.
- Registry row count **stabil 38** (tanpa duplikat).
- Baris accelerate: `first_detected_at=t1`, `last_detected_at=t3`, `last_changed_at=t3` (benar).

→ **Idempoten** & **history hanya material** — terverifikasi.

## 11. RLS Verification (Part 7)

- **Static:** policy 0022 identik pola sibling (owner-all via `workspaces.user_id=auth.uid()` + admin
  `admin_can_view`) + guard writer `assertWorkspaceScope`.
- **Runtime (analog):** anon tanpa sesi → **401** pada `gmvmax_sync_runs`/`gmvmax_campaign_settings`/
  `tiktok_connections`; service_role bypass. Menegaskan grant `to authenticated` + RLS efektif.
- **Runtime pada tabel 0022 sendiri:** **NOT_VERIFIED** (tabel belum ada + butuh sesi user nyata untuk
  uji isolasi antar-owner). Uji ini dijadwalkan setelah apply 0022, memakai user/workspace terkontrol.

## 12. UI Verification (Part 8)

- **Verified:** ESLint bersih; `vite build` sukses (2843 modul, termasuk halaman baru); dev server boot
  tanpa error console; wiring NAV `gmv_features` + i18n (id+en) ada; loader menangani 404/empty tanpa crash.
- **NOT reachable lokal:** rendering halaman dengan **baris DB nyata** — halaman di belakang auth gate
  (butuh login) **dan** tabel 0022 belum ada. Banner eligibility (blocked/eligible), kolom tabel, dan
  state loading/empty/error sudah ada di kode & lolos build, tetapi **belum diamati dengan data nyata**.
- Verdict UI: **PARTIAL**. Tidak ada tombol yang mengubah setting TikTok.

## 13. Known Limitations

1. **Apply 0022 = manual** (Supabase SQL Editor); tak ada jalur DDL dari environment.
2. Populasi DB nyata & UI real-row menunggu (1).
3. RLS runtime pada tabel 0022 menunggu apply + user test.
4. Dry-run menyampel 1 campaign aktif (representatif); populasi penuh mengiterasi semua.
5. `productSample.occupied/unoccupied` dari halaman sampel; `total` dari page_info (142).

## 14. Phase 2 Readiness

**NOT_READY.** Prasyarat tersisa:
1. **Apply migrasi 0022** (aman/additive) + isi registry read-only untuk TENANT-A.
2. Worker data-driven via `connections.mjs` + **gate eligibility per-workspace** (pakai `GMV_MAX_ELIGIBILITY`).
3. Resolusi otorisasi TENANT-B (exclusive auth di ADV-B2 di luar token).
4. Uji RLS runtime pada tabel 0022.
Semua tetap read-only; belum ada eksekusi.

## 15. Final Verdict

> **ADDENDUM 2026-07-20 (aktivasi dieksekusi):** user meng-apply 0022 di SQL Editor (kedua tabel ada,
> count 0). Registry lalu **dipopulasi read-only** untuk TENANT-A via jalur normalizer+writer asli
> (data MCP read-only nyata; **nol** endpoint tulis TikTok). Hasil di DB produksi:
> - **68 record** (TENANT 4 · CAMPAIGN 45 = 3 campaign aktif ×15 · CREATIVE 4 · IDENTITY 6 · STORE 2 ·
>   PRODUCT 1 · LIVE 6). Availability: AVAILABLE 11, ENABLED 13, ACTIVE 16, INACTIVE 16, NOT_AVAILABLE 9,
>   SCHEMA_ONLY 1, DATA_UNAVAILABLE 2. **EXECUTE_RUNTIME_VERIFIED = 0** (invariant terjaga).
> - **Idempotensi di DB nyata TERBUKTI:** run1 inserted 68 / 68 DETECTED; run2 identik inserted 0 / **changes 0**.
> - **Variasi ter-capture:** ACCELERATE_NEW_VIDEO_TESTING = ENABLED (campaign …084706) vs INACTIVE
>   (…381377, …532993) — sesuai setting ON/OFF nyata.
> - **RLS pada tabel 0022 sendiri VERIFIED:** anon tanpa sesi → **401**; service_role → 200 (68 baris).
> - **Belum:** UI real-row (butuh sesi login); worker cutover; resolusi TENANT-B. TENANT-B belum dipopulasi
>   (gate stop; opsional tulis 4 record AUTHORIZATION_MISMATCH nanti).

```
PHASE 1 ACTIVATION VERDICT: VERIFIED  (migrasi applied; TENANT-A populated & idempoten; RLS 0022 verified)
MIGRATION 0021:            APPLIED
MIGRATION 0022:            APPLIED  (additive/non-destruktif; di-Run user via SQL Editor)
TENANT-A REGISTRY:         POPULATED  (68 baris; 0 EXECUTE_RUNTIME_VERIFIED)
TENANT-B GATE:             VERIFIED  (AUTHORIZATION_MISMATCH; hanya store_list dipanggil) — belum dipopulasi
HISTORY IDEMPOTENCY:       VERIFIED  (DB nyata: run identik 0 perubahan; + writer harness 1 CHANGED)
RLS:                       VERIFIED  (tabel 0022 nyata: anon→401; service bypass)
UI:                        PARTIAL  (build/boot/states OK; real-row belum diamati — di balik auth gate)
PHASE 2 READINESS:         NOT_READY

NEXT SAFE STEP:
Verifikasi UI dengan sesi login nyata (baris sudah ada), lalu siapkan worker data-driven (connections.mjs) +
gate eligibility per-workspace + resolusi otorisasi TENANT-B. Jangan mulai Phase 2 cutover / endpoint tulis.
```

### Evidence & confidence
Migrasi & RLS: **HIGH** (PostgREST langsung ke DB nyata). Dry-run record & gate & idempotensi: **HIGH**
(kode asli dijalankan atas data MCP read-only nyata + writer asli). UI real-row: **DATA_UNAVAILABLE** lokal.
Tidak ada endpoint mutasi TikTok dipanggil; worker tetap shadow-only; tak ada commit/push.

---

## 16. Post-Migration Activation Result (2026-07-20, setelah 0022 di-apply)

Diverifikasi langsung ke DB produksi (service_role PostgREST + user JWT nyata) + MCP read-only.

### 16.1 Migration 0022 runtime verification (Part 1)
| Cek | Metode | Hasil |
|---|---|---|
| Kedua tabel ada | select | `gmvmax_feature_registry` & `_history` ada (bukan PGRST205 lagi) |
| Kolom lengkap | insert 68 record semua kolom | sukses → semua kolom ada & tipe cocok |
| CHECK `availability_status` | insert nilai `BOGUS` | **REJECTED `23514`** (check_violation) |
| CHECK `capability_level` | insert nilai `BOGUS` | **REJECTED `23514`** |
| CHECK `feature_scope` | insert nilai `BOGUS` | **REJECTED `23514`** |
| Unique NULL-safe | insert duplikat baris tenant (campaign_id/identity_id NULL) | **REJECTED `23505`** (unique_violation) |
| RLS enabled | anon read | **401** (lihat 16.5) |
| Grant authenticated | user JWT baca baris sendiri | sukses (lihat 16.5) |
| Grant service_role | service write/read | sukses (68 baris) |

> **Index sekunder** (btree ws/store/campaign/code/avail/seen) dideklarasikan di 0022; **nama index tak
> dapat di-introspeksi via PostgREST** (pg_catalog tak diekspos). Unique index **terbukti fungsional**
> (23505). Index sekunder = performa, non-blocking.
> **0022 = APPLIED_AND_VERIFIED** (fungsional).

### 16.2 Real TENANT-A population (Part 2)
- **Campaign aktif diinspeksi: 3** (semua PRODUCT ENABLE; = seluruh campaign aktif, di bawah limit `maxCampaigns=5`).
- **68 record** (re-run idempoten; tak nambah).
- **by scope:** TENANT 4 · CAMPAIGN 45 (3×15) · CREATIVE 4 · IDENTITY 6 (2 identitas×3) · STORE 2 · PRODUCT 1 · LIVE 6.
- **by availability:** AVAILABLE 11 · ENABLED 13 · ACTIVE 16 · INACTIVE 16 · NOT_AVAILABLE 9 · SCHEMA_ONLY 1 · DATA_UNAVAILABLE 2.
- **by capability:** READ 11 · MONITOR 44 · RECOMMEND 12 · EXECUTE_SCHEMA_ONLY 1 · **EXECUTE_RUNTIME_VERIFIED 0**.
- **Isolasi/scope:** distinct `workspace_id` = {AsterixSty} · distinct `store_id` = {STORE-A} · semua CAMPAIGN punya `campaign_id` · semua IDENTITY punya `identity_id`.
- **Empty session:** `MAX_DELIVERY` & `CREATIVE_BOOST` = **INACTIVE** (bukan NOT_AVAILABLE).
- **Missing/absent:** `AUTO_GENERATED_IMAGES` & `COMMISSION_SAVINGS` = **DATA_UNAVAILABLE** (bukan false).

### 16.3 Real-database idempotency (Part 3)
- Re-run identik: `inserted 0, updated 68, changes 0` → **idempoten**.
- Baris sampel (`GMV_MAX_ELIGIBILITY`): `first_detected_at` **unchanged**, `last_detected_at` **bumped**,
  `last_changed_at` **unchanged**. (Deteksi perubahan material sudah dibuktikan terpisah: Accelerate ON→OFF → 1 CHANGED, §10.)

### 16.4 TENANT-B gate (Part 4)
- Status **AUTHORIZATION_MISMATCH**; 4 record tenant (semua `AUTHORIZATION_MISMATCH`).
- **Provider call trace: `["gmv_max_store_list_get"]`** — nol panggilan campaign_get/info/session/identity/product/bid.
- 4 record dipersist ke workspace Dasfelix; DB = tepat 4, semua `workspace_id`=Dasfelix, **tanpa** scope campaign/identity (tak ada data TENANT-A bocor ke B).

### 16.5 RLS pada tabel baru (Part 5) — user JWT nyata (disposable)
Dibuat user + workspace WT sekali-pakai + 1 baris uji; login `signInWithPassword` → JWT nyata:
| # | Uji | Hasil |
|---|---|---|
| 5.1 | owner-WT baca registry | **hanya 1 baris WT** |
| 5.2/5.4 | owner-WT baca baris AsterixSty | **0** |
| 5.3 | owner-WT insert ke workspace AsterixSty | **403** (WITH CHECK) |
| 5.5 | anon tanpa sesi | **401** |
| 5.6 | service_role tulis terkontrol | sukses |
| 5.7 | admin consent (`admin_can_view`) | **by policy** (pola identik tabel gmvmax lain; tak diuji dgn user admin nyata) |
| 5.8 | browser client bypass isolasi | tidak bisa (anon 401 + JWT hanya lihat miliknya) |
| cleanup | hapus baris/workspace/user uji | **0 residual** |

### 16.6 UI dengan baris nyata (Part 6) — **VERIFIED**
- **Compile:** `vite build` **sukses** (JSX `FeatureRegistryPage.jsx` ikut terbangun). **Lint:** file registry bersih.
- **Data layer:** loader membaca baris nyata benar (68 AsterixSty / 4 Dasfelix) — terverifikasi via DB.
- **Deploy:** commit `164b07e` merge ke `main` (`cbcda9b`); bundle produksi `index-Bz2LGD1c.js`
  memuat `gmv_features` + "Feature Registry".
- **Live authenticated render (diverifikasi manual oleh user, 2026-07-20):**
  - AsterixSty menampilkan baris registry nyata yang terisi dengan benar.
  - Dasfelix menampilkan banner **AUTHORIZATION_MISMATCH** dengan benar.
  - Dasfelix hanya menampilkan **4 record tenant-level** — tanpa data campaign/produk/identity/creative AsterixSty (isolasi lintas-workspace terkonfirmasi di UI).
  - **Tidak ada kontrol mutasi TikTok**. Tidak ada error browser.
- Verdict: **VERIFIED**.

> **Catatan UX (untuk perbaikan berikutnya, bukan bug):** Feature Registry = **data current-state**
> (kapabilitas terkini per workspace), **bukan** laporan berbasis periode. **Selektor rentang tanggal
> sebaiknya dihapus/diganti** menjadi indikator **"Last detected / Last sync"** (mis. `last_detected_at`
> maks. + tombol refresh) agar tak menyiratkan filter periode yang tak relevan.

### 16.7 No Phase 2 cutover (Part 7)
- `worker.mjs`/`vpsCommit.mjs`/`vpsShadow.mjs` **tak** mengimpor `featureRegistry*` (worker tetap **SHADOW-ONLY**).
- `DEFAULT_ADVERTISER` **utuh** (`worker.mjs:24,74`).
- Nama tool mutasi hanya muncul sebagai **`FORBIDDEN_MUTATION_TOOLS`** (blocklist) + 1 catatan metadata
  (`CREATIVE_EXCLUSION` note "Mutasi tak diuji Phase 1") — **bukan panggilan**.
- Tak ada penjadwalan registry di `scripts/`/`deploy/`. Upload manual tetap ada. Tak ada write-gateway.

### 16.8 Defects & limitations
- **Confirmed defects found/fixed: 0** (tak ada perubahan kode).
- **Limitations:** (1) UI live render menunggu login user nyata; (2) TENANT-B butuh perbaikan otorisasi
  eksklusif di sisi TikTok; (3) nama index sekunder tak dapat di-introspeksi via PostgREST (fungsi terbukti);
  (4) RLS admin-consent terverifikasi lewat definisi policy (bukan user admin nyata).

### 16.9 FINAL FORMAT
```
PHASE 1 ACTIVATION VERDICT: VERIFIED
MIGRATION 0022:             APPLIED_AND_VERIFIED  (CHECK 23514 + unique 23505 + RLS enforce, fungsional)
TENANT-A REGISTRY:          POPULATED  (68 baris; 3 campaign aktif; 0 EXECUTE_RUNTIME_VERIFIED)
TENANT-A REGISTRY ROWS:     68
TENANT-A HISTORY ROWS:      68 (semua DETECTED; 0 CHANGED pada re-run identik)
SECOND IDENTICAL RUN:       IDEMPOTENT
TENANT-B GATE:              VERIFIED  (AUTHORIZATION_MISMATCH; call trace hanya store_list; 4 record; tanpa kebocoran)
RLS ON NEW TABLES:          VERIFIED  (owner-isolasi via JWT nyata: own 1 / other 0 / write-other 403; anon 401; admin by-policy)
UI WITH REAL ROWS:          VERIFIED  (render terautentikasi dicek manual: AsterixSty rows nyata; Dasfelix banner AUTHORIZATION_MISMATCH + hanya 4 record tenant; tanpa data lintas-workspace; tanpa kontrol mutasi; tanpa error)
TIKTOK MUTATION CALLS:      0
WORKER STATUS:              SHADOW_ONLY
PHASE 2 READINESS:          NOT_READY

NEXT SAFE STEP:
UX minor (non-blocking): ganti selektor rentang tanggal di halaman Feature Registry dengan indikator
"Last detected / Last sync" (data current-state, bukan periode). Lalu siapkan worker data-driven
(connections.mjs) + gate eligibility per-workspace + resolusi otorisasi TENANT-B — semua tetap read-only.
Jangan mulai Phase 2 cutover / endpoint tulis.
```

> **PHASE 1 ACTIVATION — FULLY VERIFIED (2026-07-20).** Migrasi 0022 applied & terverifikasi; registry
> AsterixSty populated (68) + Dasfelix gate (4, AUTHORIZATION_MISMATCH); idempotensi, RLS, constraint,
> dan UI terautentikasi semua terbukti. TikTok mutation calls = **0**. Worker = **SHADOW_ONLY**.
