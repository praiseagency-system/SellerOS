# PRODUCT_CONTEXT — SellerOS (shopee-quadrant)

> Dokumen kondisi produk berdasarkan **audit kode saat ini** (read-only, tanpa
> perubahan kode). Tanggal audit: **2026-07-18**. Commit HEAD saat audit:
> `5590dbc`. Repo: `github.com/praiseagency-system/SellerOS`.
>
> **Status keterangan** dipakai di seluruh dokumen:
> - **VERIFIED** — terbukti langsung dari kode / migrasi / config.
> - **INFERRED** — kesimpulan dari struktur kode, belum dijalankan/diamati runtime.
> - **UNKNOWN** — tidak dapat dipastikan hanya dari kode.
>
> **Sumber kebenaran = kode.** README.md & HANDOFF.md dipakai sebagai referensi,
> tetapi keduanya **sudah usang** di banyak titik (lihat §20). Di mana dokumen
> lama berbeda dari kode, kode yang dipakai.

---

## 1. Product Overview

- **Nama produk:** SellerOS (nama paket: `shopee-quadrant`; brand di sidebar:
  "Praise Agency · SellerOS"). **VERIFIED** (`package.json`, `src/components/Layout.jsx:207-208`).
- **Fungsi utama:** webapp analitik & pengambilan keputusan untuk seller/agency
  e-commerce di **Shopee** dan **TikTok Shop**. Dua domain besar:
  1. **Marketplace** — import ekspor toko (Excel/CSV) → analisis kuadran
     (Traffic × Conversion Rate), kalkulator fee & profit, performa toko,
     campaign/voucher. **VERIFIED** (`src/pages/QuadrantPage.jsx`, `CalculatorPage.jsx`, `StorePerformancePage.jsx`).
  2. **GMV Max Ads** — pelacakan performa iklan TikTok Shop GMV Max per
     video/produk/creator, insight rule-based, boost center, log optimasi,
     setting campaign. **VERIFIED** (`src/pages/gmvmax/*`, migrasi 0011–0020).
- **Masalah yang diselesaikan:** menggantikan spreadsheet manual untuk (a)
  menghitung fee/ongkir/profit per produk marketplace, (b) memetakan produk ke
  kuadran keputusan, dan (c) memonitor performa iklan GMV Max harian +
  merekomendasikan aksi (scale/watch/kill/boost). **INFERRED** dari komentar
  kode & fungsi (`README.md`, `src/utils/gmvmaxInsights.js:1-3`).
- **Target pengguna:** internal **Praise Agency** — owner/founder, marketplace
  specialist, ads specialist. **VERIFIED** (README.md baris 3-6; HANDOFF.md §1).
- **Kategori produk:** **internal tool** (operating system agency), *belum* SaaS
  publik. **VERIFIED** (README.md: "internal operating system … belum SaaS publik").
- **Tahap produk:** **internal production** untuk modul yang matang (Marketplace
  Calculator + Quadrant + GMV Max manual upload sudah dipakai & terdeploy ke
  `seller-os-*.vercel.app`), dengan bagian **prototype/eksperimental** (worker
  VPS sync otomatis masih shadow, belum cutover; halaman Reports & AI Tools
  stub). **INFERRED** (kombinasi migrasi live, `vercel.json`, memori proyek,
  `src/gmvmax/worker.mjs:1-3`).
- **Value proposition (dari implementasi):** "satu tempat" untuk menghitung
  profit marketplace + memonitor & menindaki performa iklan GMV Max harian,
  dengan rekomendasi aksi otomatis berbasis threshold ROAS per-workspace.
  **INFERRED**.

---

## 2. Current Product Scope

### 2.1 Fully Working (jalur end-to-end ada di kode & didukung persistence Supabase)

| Fitur | Tujuan | Lokasi (page id) | File utama | Data | Dependensi | Batasan | Bukti |
|---|---|---|---|---|---|---|---|
| Autentikasi | Login/daftar user | `LoginPage` (gate) | `src/pages/LoginPage.jsx`, `src/contexts/AuthContext.jsx` | Supabase Auth + tabel `profiles` | env Supabase | Tak ada reset-password UI (lihat §11) | AuthContext.jsx:42-64 |
| Multi-workspace | Pisah data per toko/brand | switcher (semua page) | `src/data/workspaces.js`, `src/components/WorkspaceSwitcher.jsx`, `App.jsx:126-178` | Supabase `workspaces` (RLS per user) | Auth | Pointer aktif per-device (localStorage) | workspaces.js; migrasi 0001 |
| Analisis Kuadran | Petakan produk 2×2 | `quadrant` | `src/pages/QuadrantPage.jsx`, `src/contexts/QuadrantContext.jsx`, `src/components/QuadrantChart.jsx` | Supabase `periods`,`products` | Workspace | Marketplace-centric | migrasi 0001; QuadrantContext |
| Import marketplace | Upload ekspor Shopee/TikTok | `import`/`quadrant` | `src/pages/ImportPage.jsx`, `src/utils/parseShopeeData.js`, `parseTikTokData.js` | file xlsx/csv → Supabase | Workspace | Fee hardcoded | parse*.js |
| Kalkulator fee/profit | Hitung profit per produk | `calculator` | `src/pages/CalculatorPage.jsx`, `src/utils/calc.js`, `feeData.js` | Supabase `calc_products` | Workspace | Tabel fee statis | calc.js; migrasi 0004 |
| Daftar Produk | Kelola produk tersimpan | `products` | `src/pages/ProductsPage.jsx`, `src/data/calcProducts.js` | Supabase `calc_products` | Kalkulator | — | migrasi 0004 |
| Performa Toko | Analitik level toko | `performance` | `src/pages/StorePerformancePage.jsx`, `src/utils/storeAnalytics.js` | Supabase `store_datasets` | Workspace | — | migrasi 0005 |
| Campaign (marketplace) | Susun campaign+item | `campaign` | `src/pages/CampaignPage.jsx`, `src/data/campaigns.js` | Supabase `campaigns` (+items jsonb) | Workspace | — | migrasi 0008/0009 |
| Voucher | Simpan voucher toko | (dalam campaign/perf) | `src/components/VoucherPanel.jsx`, `src/data/vouchers.js` | Supabase `vouchers` | Workspace | — | migrasi 0006 |
| GMV Max — Import manual | Upload xlsx GMV Max → snapshot harian | `gmv_input` | `src/pages/gmvmax/InputPage.jsx`, `src/data/gmvmaxImports.js`, `src/utils/parseGmvMax.js` | Supabase `gmvmax_imports`+`gmvmax_creatives` | Workspace | Non-atomic write (lihat §16) | gmvmaxImports.js:201-239 |
| GMV Max — Dashboard | Ringkas performa video | `gmv_dashboard` | `src/pages/gmvmax/DashboardPage.jsx` | rollup dari creatives | Import | — | GmvMaxContext |
| GMV Max — Performa Video | Semua video + rekomendasi aksi | `gmv_overview` | `src/pages/gmvmax/OverviewPage.jsx`, `src/utils/gmvmaxClassify.js` | rollup creatives | Import | — | gmvmaxClassify.js |
| GMV Max — Produk | Rollup per produk | `gmv_product` | `src/pages/gmvmax/ProductPage.jsx`, `src/utils/gmvmaxRollup.js` | creatives + nama dari `calc_products` | Import | Nama produk perlu match kode | ProductPage.jsx |
| GMV Max — Creator | Leaderboard kreator | `gmv_creator` | `src/pages/gmvmax/CreatorPage.jsx` | rollup creatives + enrich oEmbed | Import | Akun sering perlu enrich | CreatorPage.jsx |
| GMV Max — Insight | Rekomendasi rule-based | `gmv_insight` | `src/pages/gmvmax/InsightPage.jsx`, `src/utils/gmvmaxInsights.js` | rollup + threshold | Import | Bukan LLM (lihat §10) | gmvmaxInsights.js:1 |
| GMV Max — Boost Center | Pipeline kode boost video | `gmv_boost` | `src/pages/gmvmax/BoostPage.jsx`, `src/data/gmvmaxBoost.js` | Supabase `gmvmax_boost` | Import | Pipeline manual | migrasi 0015/0018 |
| GMV Max — Log Optimasi | Jurnal aksi ber-timestamp | `gmv_log` | `src/pages/gmvmax/LogPage.jsx`, `src/data/gmvmaxActionLog.js` | Supabase `gmvmax_action_log` | — | — | migrasi 0014 |
| GMV Max — Threshold | Setting ROAS per workspace | (settings modul) | `src/data/gmvmaxSettings.js` | Supabase `gmvmax_settings` | Workspace | — | migrasi 0011 |
| Enrichment akun | Isi username via oEmbed publik | background | `src/utils/gmvmaxEnrich.js`, `src/data/gmvmaxVideoMeta.js` | Supabase `gmvmax_video_meta` (cache global) | — | Cache dibagi semua user (§7) | migrasi 0012 |
| TikTok Connect (OAuth) | Sambung akun TikTok Ads per workspace | `settings` → Integrasi | `src/pages/SettingsPage.jsx` (IntegrasiTab), `src/lib/tiktokOAuth.js`, `src/data/tiktokConnection.js` | Supabase `tiktok_connections` (RLS owner-only) | Vercel proxy `api/tiktok/*` | Token plaintext di DB (§8) | migrasi 0019; SettingsPage.jsx:263+ |
| Privasi/consent | Toggle share_with_admin | `settings` → Profil | `SettingsPage.jsx` (PrivacySection) | Supabase `profiles.share_with_admin` | Auth | — | SettingsPage.jsx:471-479 |
| i18n & tema | ID/EN + dark/light | header | `src/contexts/LanguageContext.jsx`, `ThemeContext.jsx`, `src/i18n.js` | — | — | — | main.jsx |

### 2.2 Partially Working

- **Sinkron GMV Max otomatis via API/worker.** Engine deterministik + provider
  MCP + token self-refresh + writer atomik **ADA & diuji** (`src/gmvmax/*`, 26
  file `*.test.mjs`), tapi **belum cutover ke produksi**: `worker.mjs` = *shadow
  only* (tidak menulis DB), `vpsCommit.mjs` menulis produksi tetapi **digerbang
  ganda** (`GMVMAX_RUNTIME=vps` + `GMVMAX_COMMIT=1`) dan belum jadi penulis
  aktif. **VERIFIED** (`worker.mjs:1-3`, `writer.mjs:1-6`, `vpsCommit.mjs:1-14`).
- **Setting Campaign Ads (budget/target ROAS/auto-budget).** Tabel `gmvmax_campaign_settings`
  + halaman `gmv_campaign` ada; sumber datanya MCP `campaign_gmv_max_info_get`
  yang **ditulis oleh worker** (bukan upload manual) → hanya terisi bila worker
  jalan. **VERIFIED** (migrasi 0020; `CampaignAdsPage.jsx`).

### 2.3 UI Only / Mock Data / Wiring mati

- **Jalur import GMV Max via API di sisi browser** (`src/utils/gmvmaxApiService.js`,
  `gmvmaxApiPoller.js`, dan seam `importDataset` di context) **tidak dipanggil
  dari page/komponen mana pun** — hanya terekspos di context value.
  Ingest browser yang aktif = **upload xlsx manual**. **VERIFIED** (grep: tidak
  ada pemanggil `importDataset`/`gmvmaxApiService` di `src/pages`/`src/components`).

### 2.4 Planned but Not Implemented (stub)

- **Reports** (`reports`, flag `soon:true`) — placeholder WIP. **VERIFIED** (Layout.jsx:51).
- **AI Tools / Ads** (`ads`, flag `soon:true`) — stub display-only, tak
  terhubung worker. **VERIFIED** (Layout.jsx:37).
- **Team / undang anggota** — tombol `disabled`, "segera hadir". **VERIFIED**
  (SettingsPage.jsx TeamTab).
- **Halaman `/admin`** — disebut pending di HANDOFF, **tidak ada di kode**.
  **VERIFIED** (tidak ada page admin; tak ada konsumsi `isAdmin` selain badge).

### 2.5 Deprecated / tak lagi dipakai

- **Runbook LLM lama** untuk sync — digantikan engine deterministik. **VERIFIED**
  (`engine.mjs:1` "pengganti runbook LLM"). Menurut memori proyek, runbook lama
  masih penulis produksi sampai cutover — **UNKNOWN** dari kode repo ini.
- **Token store berbasis Keychain** (`providers/tokenStore.mjs`, baca Keychain
  "Claude Code-credentials") — digantikan `supabaseTokenStore.mjs` untuk jalur
  VPS. Masih ada di kode sebagai fallback interaktif. **VERIFIED**.
- **`src/utils/storage.js`** kini murni helper sesi (export/import `.json`);
  persistensi periode/produk sudah pindah ke Supabase. **VERIFIED** (storage.js:1-3).

---

## 3. Pages and Routes Inventory

Routing **tanpa library** — satu SPA, halaman dipilih via state `currentPage`
(`App.jsx`). Tidak ada URL per-halaman; hanya beberapa **query deep-link** &
satu path khusus. **VERIFIED** (`App.jsx`, `vercel.json` rewrite semua → index.html).

| "Route" (state id / path) | Page Name | Purpose | User Role | Data Source | Status | Main Files |
|---|---|---|---|---|---|---|
| `/tiktok-callback` (path) | TikTok OAuth callback | Tukar code→token, simpan koneksi | authenticated | `api/tiktok/token` + `tiktok_connections` | Working | `src/components/TiktokCallback.jsx`, `tiktokOAuth.js` |
| (gate) | Login | Login/daftar/Google | anon | Supabase Auth | Working | `src/pages/LoginPage.jsx` |
| `overview` | Overview / Command center | Ringkasan 3 domain | authenticated | GMV Max + Quadrant | Working | `src/pages/OverviewPage.jsx` |
| `gmv_dashboard` | GMV Max Ads | Ringkas performa video | authenticated | `gmvmax_*` | Working | `pages/gmvmax/DashboardPage.jsx` |
| `gmv_campaign` | Campaign Ads | Budget/ROAS/auto-budget | authenticated | `gmvmax_campaign_settings` | Partial (butuh worker) | `pages/gmvmax/CampaignAdsPage.jsx` |
| `gmv_monitoring` | (grup, tanpa route) | Container submenu | — | — | Nav only | Layout.jsx:27 |
| `gmv_input` | Import Data GMV Max | Upload xlsx + riwayat | authenticated | `gmvmax_imports` | Working | `pages/gmvmax/InputPage.jsx` |
| `gmv_overview` | Performa Video | Semua video + aksi | authenticated | creatives rollup | Working | `pages/gmvmax/OverviewPage.jsx` |
| `gmv_product` | Performa Produk | Rollup per produk | authenticated | creatives + calc_products | Working | `pages/gmvmax/ProductPage.jsx` |
| `gmv_creator` | Creator | Leaderboard kreator | authenticated | creatives + video_meta | Working | `pages/gmvmax/CreatorPage.jsx` |
| `gmv_insight` | AI Insight (rule-based) | Rekomendasi aksi | authenticated | rollup + threshold | Working | `pages/gmvmax/InsightPage.jsx` |
| `gmv_boost` | Boost Center | Pipeline kode boost | authenticated | `gmvmax_boost` | Working | `pages/gmvmax/BoostPage.jsx` |
| `gmv_log` | Log Optimasi | Jurnal aksi | authenticated | `gmvmax_action_log` | Working | `pages/gmvmax/LogPage.jsx` |
| `ads` | Ads (stub) | — | authenticated | — | `soon` stub | Layout.jsx:37 |
| `performance` | Performa Toko | Analitik toko | authenticated | `store_datasets` | Working | `pages/StorePerformancePage.jsx` |
| `quadrant` | Kuadran Traffic | Peta 2×2 | authenticated | `periods`,`products` | Working | `pages/QuadrantPage.jsx` |
| `calculator` | Kalkulator | Fee/profit | authenticated | `calc_products` | Working | `pages/CalculatorPage.jsx` |
| `products` | Produk | Daftar produk | authenticated | `calc_products` | Working | `pages/ProductsPage.jsx` |
| `campaign` | Campaign (marketplace) | Susun campaign | authenticated | `campaigns` | Working | `pages/CampaignPage.jsx` |
| `reports` | Reports (stub) | — | authenticated | — | `soon` stub | Layout.jsx:51 |
| `settings` (+`?page=integrasi`/`?connected=tiktok`) | Pengaturan | Profil/Brand/Integrasi/Team | authenticated | mixed | Working (Team stub) | `pages/SettingsPage.jsx` |

- **Hidden/URL-only:** `import`, `ai`, `reports` bukan di NAV utama sebagai route
  aktif (`import` tak ada di NAV; `gmv_input` yang dipakai). `settings` diakses
  via ikon bawah sidebar + avatar menu. **INFERRED**.
- **Redirect:** query deep-link dibersihkan sekali via `history.replaceState`
  (`App.jsx:71-73`). **VERIFIED**.
- **Error pages:** tak ada halaman 404 khusus; page tak dikenal → fallback ke
  `quadrant` atau teks WIP `page.wip`. **VERIFIED** (App.jsx:159, 225-230).
- **Experimental:** `ads`, `reports` (stub); modul `src/gmvmax/` (worker CLI, di
  luar UI). **VERIFIED**.

---

## 4. Navigation Structure

**VERIFIED** dari `src/components/Layout.jsx` (array `NAV`).

- **Sidebar** (desktop, kolaps/lebar, persist localStorage `sq_sidebar_collapsed`):
  - **MAIN:** Overview.
  - **GMV MAX ADS:** Dashboard, Campaign Ads, **Monitoring** (submenu: Import
    Data, Performa Video, Performa Produk, Creator), AI Insight, Boost Center,
    Log Optimasi, Ads *(soon)*.
  - **MARKETPLACE:** Performa Toko, Kuadran (dengan sub-teks), Kalkulator,
    Produk, Campaign, Reports *(soon)*.
  - **Bawah:** Pengaturan.
- **Header/topbar:** breadcrumb (seksi › induk) + judul/subjudul halaman +
  `HeaderControls` (tema, bahasa, periode kondisional, avatar → Settings,
  logout). **VERIFIED** (Layout.jsx:414-436; HeaderControls.jsx).
- **Mobile navigation:** overlay sidebar penuh (tombol Menu), isi sama dengan
  desktop non-kolaps. **VERIFIED** (Layout.jsx:386-409).
- **Dropdown/flyout:** submenu Monitoring memakai flyout via `createPortal`
  saat sidebar kolaps. **VERIFIED** (Layout.jsx:128-166).
- **Workspace switcher:** di atas nav, ganti workspace → remount provider
  (`wsKey`). **VERIFIED** (Layout.jsx:224-232; App.jsx:174-178).
- **Breadcrumb:** dari `findCrumb`; halaman di luar NAV (mis. settings) tak
  render breadcrumb. **VERIFIED**.
- **Role-based navigation:** **tidak ada** — NAV identik untuk semua user;
  tak ada item khusus admin. **VERIFIED**.
- **Hanya via URL/query (bukan dari NAV):** tab Integrasi & Team di Settings
  (via `?page=integrasi` atau ikon); `/tiktok-callback`. **INFERRED**.

---

## 5. User Roles and Permissions

Role yang ADA di sistem: **`user`** dan **`admin`** (kolom `profiles.role`,
CHECK constraint). Tidak ada Owner/Manager/Specialist/Member/Viewer sebagai
role terpisah. **VERIFIED** (migrasi 0001:13).

| Role | Hak akses | Halaman | Aksi | Cara diperiksa | Enforcement | Catatan |
|---|---|---|---|---|---|---|
| `user` (default) | Data workspace miliknya sendiri | Semua page | CRUD data sendiri | RLS `user_id = auth.uid()` di setiap tabel | **Backend (Postgres RLS)** | Enforcement kuat di DB |
| `admin` | Baca-saja data user lain **yang opt-in** (`share_with_admin=true`) | Semua page (UI sama) | **Hanya SELECT** lintas user via policy `*_admin_read` | `is_admin()` + `admin_can_view(owner)` (SECURITY DEFINER) | **Backend (RLS)** | **Tidak ada UI admin** untuk memakainya |

- **Cara permission diperiksa:** RLS Postgres per-baris (owner-all + admin-read
  consent-based). Helper `is_admin()` & `admin_can_view()` `SECURITY DEFINER`
  agar tak rekursi. Trigger `profiles_guard_update` mencegah user menaikkan
  role/mengubah id/email sendiri. **VERIFIED** (migrasi 0001:49-112).
- **Frontend vs backend:** enforcement utama **di backend/DB (RLS)** — bukan
  hanya frontend. UI hanya menampilkan badge "Admin/Pengguna" (SettingsPage.jsx:131),
  tak ada gating navigasi. **VERIFIED**.
- **Permission gap / risiko:**
  - **Role `admin` tanpa UI:** admin hanya bisa memakai akses baca lintas-user
    lewat SQL Editor / query langsung, bukan dari aplikasi. **VERIFIED**.
  - **`gmvmax_video_meta` global-writable** untuk semua `authenticated`
    (`using(true) with check(true)`) — cache publik, tapi user mana pun bisa
    menulis/menimpa baris (potensi cache-poisoning ringan; bukan data privat).
    **VERIFIED** (migrasi 0012:21-22).
  - Role escalation via API dicegah trigger; **eskalasi via service_role**
    (worker) di luar cakupan RLS — by design. **VERIFIED**.
- **Kondisi multi-user:** sistem multi-user **ada di level data** (auth +
  workspace + RLS per user), tetapi **kolaborasi tim dalam satu workspace belum
  ada** (Team = stub; 1 workspace dimiliki 1 `user_id`). Jadi "multi-tenant per
  akun" ✅, "multi-user dalam satu tenant" ❌. **VERIFIED** (migrasi 0001:18-23;
  SettingsPage TeamTab).

---

## 6. Core User Workflows

### Workflow A — Analisis Kuadran Marketplace **(VERIFIED alur)**
- **Aktor:** marketplace specialist. **Trigger:** buka `quadrant`/`import`.
- **Langkah:** pilih workspace → pilih platform (Shopee/TikTok) + tipe periode →
  upload ekspor produk (+ file iklan) → parser normalisasi → simpan ke Supabase
  (`periods`+`products`) → auto-compare periode sebelumnya → tampil peta 2×2 +
  tab Perubahan.
- **Input:** file `.xlsx`/`.csv`. **Proses:** `parseShopeeData`/`parseTikTokData`
  → `quadrantUtils` → simpan `periods`/`products`.
- **Output:** kuadran + delta + badge naik/turun. **Failure:** file format salah
  → `parseImportedSession` throw. **Belum selesai:** model data Shopee-centric
  vs skema ternormalisasi belum direkonsiliasi (HANDOFF §8.2). **INFERRED**.

### Workflow B — Kalkulator Fee & Profit **(VERIFIED)**
- **Aktor:** specialist. **Trigger:** klik Kalkulator (selalu produk baru) atau
  buka produk dari daftar. **Langkah:** isi harga/modal/kategori → pilih fee
  Shopee/ongkir/fee TikTok (tabel hardcoded) → lihat rincian + ROAS ladder →
  Simpan → tersimpan ke `calc_products`. **Output:** breakdown profit. **Batas:**
  fee statis di kode. **Bukti:** `calc.js`, `feeData.js`, `App.jsx:103-121`.

### Workflow C — Monitoring GMV Max (upload manual) **(VERIFIED)**
- **Aktor:** ads specialist. **Trigger:** `gmv_input`. **Langkah:** upload xlsx
  ekspor GMV Max → `parseGmvMaxFile` → `saveImport` (1 snapshot harian = 1
  `gmvmax_imports` + N `gmvmax_creatives`, ganti snapshot tanggal sama) →
  background enrich username (oEmbed) → rollup ke Dashboard/Video/Produk/Creator/
  Insight. **Input:** xlsx harian. **Output:** tabel + kartu + tren + insight
  scale/watch/kill. **Failure:** `saveImport` **non-atomic** (delete lalu insert
  tanpa transaksi) → bila insert gagal setelah delete, snapshot lama hilang
  (lihat §16). **Bukti:** `gmvmaxImports.js:201-239`, `GmvMaxContext.jsx:315-337`.

### Workflow D — Boost Video **(VERIFIED)**
- **Aktor:** ads specialist. **Trigger:** tombol boost di Boost Center/Video.
  **Langkah:** `requestBoost` → tulis `gmvmax_boost` (status "diminta") + tulis
  `gmvmax_action_log` ("Boost"). **Output:** entri pipeline + log. **Failure:**
  error tulis → state UI rollback via try. **Belum selesai:** eksekusi boost
  di TikTok tetap **manual** (di luar app). **Bukti:** `GmvMaxContext.jsx:416-435`.

### Workflow E — Connect TikTok Ads (OAuth) **(VERIFIED)**
- **Aktor:** owner/workspace owner. **Trigger:** Settings → Integrasi → Connect.
  **Langkah:** buat PKCE (S256) → stash `sessionStorage` → redirect ke TikTok →
  callback `/tiktok-callback` → `exchangeCode` via proxy Vercel → `saveConnection`
  (upsert `tiktok_connections`) → pilih advertiser via proxy `api/tiktok/advertisers`.
  **Output:** koneksi tersimpan + token auto-refresh. **Failure:** token non-JSON/
  error → pesan; token kedaluwarsa → tombol "Perbarui token". **Batas:** 1 koneksi/
  workspace; token plaintext. **Bukti:** `SettingsPage.jsx` IntegrasiTab, `tiktokOAuth.js`, `tiktokConnection.js`.

### Workflow F — Sync otomatis GMV Max (worker VPS) **(VERIFIED alur, belum aktif produksi)**
- **Aktor:** sistem (cron/launchd/systemd). **Trigger:** timer terjadwal.
  **Langkah:** baca token dari `tiktok_connections` (service_role, self-refresh)
  → engine deterministik tarik report per campaign/SPU → hitung snapshot →
  **shadow:** simpan ke `logs/shadow/` + parity vs OLD (tak menulis DB); **commit
  (gated):** tulis via RPC atomik `gmvmax_replace_snapshot`. **Output:** snapshot
  + laporan parity. **Belum selesai:** **cutover belum dilakukan**; commit
  worker digerbang env. **Bukti:** `worker.mjs`, `vpsCommit.mjs`, `writer.mjs`,
  `supabaseTokenStore.mjs`, migrasi 0017.

---

## 7. Data Architecture

- **Database:** **Supabase Postgres**. **VERIFIED** (`@supabase/supabase-js`,
  `src/lib/supabase.js`, migrasi 0001–0020).
- **Client/ORM:** `@supabase/supabase-js` (PostgREST), akses lewat lapisan
  `src/data/*`. Worker Node pakai `createClient` dengan `service_role`
  (bypass RLS). **VERIFIED**.
- **File upload / storage:** bucket Supabase Storage `product-images`
  (public read, insert/update/delete untuk `authenticated`). **VERIFIED**
  (migrasi 0007). Foto profil & logo brand disimpan sebagai **data URL di
  localStorage** (bukan Storage). **VERIFIED** (`localIdentity.js`).
- **Server state:** Supabase (semua entitas bisnis). **Client state:** React
  Context (Auth/Quadrant/GmvMax/Identity/Theme/Language). **Cache:** in-memory
  memo di context + tabel cache `gmvmax_video_meta`. **VERIFIED**.
- **Data isolation:** per **workspace** (milik satu `user_id`) via RLS.
  Pointer workspace aktif = per-device (localStorage). **VERIFIED**.

### Entitas utama

| Entity | Purpose | Main Fields | Relationships | Storage | Status |
|---|---|---|---|---|---|
| `profiles` | Identitas+role user | id, email, role, share_with_admin | 1:1 `auth.users` | Supabase (RLS) | VERIFIED |
| `workspaces` | Tenant/toko | id, user_id, name, color | 1:N → periods, calc_products, gmvmax_*, dll | Supabase (RLS) | VERIFIED |
| `periods` | Snapshot periode kuadran | workspace_id, name, start/end | N:1 workspace; 1:N products | Supabase (RLS) | VERIFIED |
| `products` | Produk kuadran | period_id, traffic_value, conversion_value, quadrant, raw_data | N:1 period | Supabase (RLS) | VERIFIED |
| `calc_products` | Produk kalkulator | workspace_id, name, kode_produk, … | N:1 workspace | Supabase (RLS) | VERIFIED |
| `store_datasets` | Data performa toko | workspace_id (PK) | 1:1 workspace | Supabase (RLS) | VERIFIED |
| `vouchers` | Voucher | workspace_id, … | N:1 workspace | Supabase (RLS) | VERIFIED |
| `campaigns` | Campaign marketplace | workspace_id, items(jsonb) | N:1 workspace | Supabase (RLS) | VERIFIED |
| `gmvmax_imports` | Snapshot harian GMV Max | workspace_id, snapshot_date (unik), totals | 1:N creatives | Supabase (RLS + unique ws+date) | VERIFIED |
| `gmvmax_creatives` | Baris video/product-card | import_id, video_id, campaign_id, cost, roas, … | N:1 import | Supabase (RLS + unique identity) | VERIFIED |
| `gmvmax_notes` | Catatan per video | workspace_id, video_id, action_tag | N:1 workspace | Supabase (RLS) | VERIFIED |
| `gmvmax_settings` | Threshold ROAS | workspace_id (PK), roas_good/bad/great, spend_floor, kill_floor | 1:1 workspace | Supabase (RLS) | VERIFIED |
| `gmvmax_action_log` | Jurnal aksi | workspace_id, video_id, action_tag | N:1 workspace | Supabase (RLS) | VERIFIED |
| `gmvmax_boost` | Pipeline boost | workspace_id, video_id, status, boost_start/end | N:1 workspace | Supabase (RLS) | VERIFIED |
| `gmvmax_campaign_settings` | Setting campaign harian | workspace_id, snapshot_date, campaign_id, budget, roas_bid, auto_budget | N:1 workspace | Supabase (RLS) | VERIFIED |
| `gmvmax_video_meta` | Cache oEmbed username | video_id (PK), username | — (global) | Supabase (**RLS true/true**) | VERIFIED |
| `tiktok_connections` | Token OAuth TikTok | workspace_id (unik), access/refresh_token, expires_at | 1:1 workspace | Supabase (**RLS owner-only**) | VERIFIED |
| Profil/Brand lokal | Foto/nama/logo | avatar, name, phone, logo | key per uid/wsId | **localStorage** (per-device) | VERIFIED |

**Penegasan lokasi data:**
- **Benar-benar di DB:** semua entitas bisnis di tabel di atas (kuadran,
  kalkulator, GMV Max, koneksi TikTok). **VERIFIED**.
- **Hanya di browser (localStorage):** foto profil, nama/telepon profil, nama/
  logo brand per-workspace, pointer workspace aktif, state kolaps sidebar.
  **Tidak sinkron antar device.** **VERIFIED** (`localIdentity.js:1-5`).
- **Mock data:** tak ditemukan mock di jalur produksi UI; fixtures hanya untuk
  test worker (`src/gmvmax/__fixtures__/`). **VERIFIED**.
- **Tanpa persistence:** hasil enrichment oEmbed di-cache tapi bila gagal
  di-refetch; hasil poller API browser tak dipakai. **INFERRED**.
- **Berpotensi bercampur antar-user:** hanya `gmvmax_video_meta` (global by
  design, data publik). Tabel bisnis lain terisolasi RLS. **VERIFIED**.

---

## 8. External Integrations

| Integrasi | Tujuan | Status | Auth | Baca | Tulis | File | Env var | Risiko/Batas | Prod-ready |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase** (Auth+Postgres+Storage) | Auth & DB & file | Aktif | anon key (browser), service_role (worker) | semua tabel | semua tabel | `lib/supabase.js`, `src/data/*` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` (worker) | service_role rahasia; anon di-guard RLS | Ya |
| **TikTok Ads MCP (OAuth)** | Sambung akun, tarik data GMV Max | Aktif (connect) / worker gated | OAuth Auth-Code + PKCE (public client, no secret) | advertiser list, report GMV Max | token ke `tiktok_connections` | `tiktokOAuth.js`, `api/tiktok/*`, `providers/tiktokMcp.mjs` | `VITE_TIKTOK_TOKEN_PROXY`, `VITE_TIKTOK_ADV_PROXY` (opsional); `client_id` hardcoded | Token plaintext di DB; proxy tanpa auth/rate-limit | Sebagian |
| **TikTok Business/Marketing API** (produksi) | Alternatif tarik report tanpa MCP | **Di-hold** | Access-Token long-term (butuh approval app) | report | — | `gmvmaxApiPoller.js`, `gmvmaxApiService.js` | — | Belum diwiring ke UI | Tidak |
| **oEmbed TikTok (publik)** | Isi username kreator by video_id | Aktif (background) | — (endpoint publik) | metadata video | cache `gmvmax_video_meta` | `gmvmaxEnrich.js` | — | Rate/availability publik | Ya (best-effort) |
| **Vercel Serverless Functions** | Proxy CORS token & advertisers | Aktif | — (relay) | — | — | `api/tiktok/token.js`, `api/tiktok/advertisers.js` | — | Open relay (§16) | Ya |
| **Google OAuth** (via Supabase) | Login | Aktif (jika provider diaktifkan) | Supabase OAuth | profil dasar | session | `AuthContext.jsx:56-62` | dikonfigurasi di Supabase | — | Ya |
| **VPS worker** | Sync GMV Max terjadwal | Shadow running, commit gated | service_role + token Supabase | report TikTok | shadow files / (gated) DB | `src/gmvmax/*`, `deploy/vps-shadow/*` | `GMVMAX_RUNTIME`, `GMVMAX_COMMIT`, `GMVMAX_TIKTOK_WORKSPACE_ID`, dll | Belum cutover | Sebagian |

- **Shopee / Meta / Google Sheets / Google Forms / WhatsApp / Email / Payment
  gateway:** **tidak ada integrasi** di repo ini (Shopee hanya via import file
  manual; sisanya milik produk lain "Praise Affiliate OS"). **VERIFIED** (grep).
- **Nilai rahasia env tidak ditampilkan** (sesuai instruksi). `.env.local` tidak
  dibaca isinya.

---

## 9. Automation and Background Processes

| Proses | Jenis | Berjalan di | Status | Aman multi-user? | Bukti |
|---|---|---|---|---|---|
| Enrichment username (oEmbed) | Background fetch saat upload | **Frontend (browser)** | Aktif | Cache global (public) — aman | `GmvMaxContext.jsx:359-383` |
| Auto-refresh sesi Supabase | Token refresh | Frontend (SDK) | Aktif | Ya | `lib/supabase.js:21-25` |
| Auto-restore periode | On-mount | Frontend | Aktif | Ya (per workspace) | QuadrantContext |
| Worker GMV Max **shadow** | CLI terjadwal | **VPS / launchd** (`com.praise.gmvmaxsync.plist`, `deploy/vps-shadow/*.service`) | Running (shadow-only) | Ya (service_role per workspace) | `worker.mjs`, `scripts/gmvmax-*.sh` |
| Worker GMV Max **commit** | CLI menulis DB | VPS (gated env) | **Belum aktif** (butuh `GMVMAX_COMMIT=1` + cutover) | RPC atomik + guard | `vpsCommit.mjs` |
| Backfill historis | Skrip sekali-jalan | Lokal/VPS | Ada (proof di `logs/`) | — | `scripts/gmvmax-backfill.sh`, `gmvmax-resume-backfill.mjs` |
| Retensi snapshot | Prune bulan lampau | Frontend (`pruneOldSnapshots`) + skrip VPS | Ada | Per workspace | `gmvmaxImports.js:252-269`, `deploy/vps-shadow/gmvmax-retention.sh` |
| Token sync/refresh | Skrip | VPS | Ada | Per workspace | `scripts/gmvmax-token-sync.sh`, `gmvmax-vps-update-token.sh` |
| Lock/idempotensi | File lock per advertiser+date | Worker | Ada | Mencegah run konkuren | `lock.mjs` |
| Retry/recovery | Recovery + parity proof | Worker | Ada (68/68 proof per memori) | — | `scripts/gmvmax-p3-recovery-proof.mjs` |

- **Queue/scheduler kelas produksi (BullMQ dsb):** tidak ada. Penjadwalan =
  cron/launchd/systemd timer di luar repo. **VERIFIED**.
- **Notification system in-app:** hanya ikon notif di header (kosong/placeholder,
  perlu verifikasi); toast "pusat perhatian" milik produk Praise lain, **bukan**
  di repo ini. **INFERRED**.

---

## 10. AI Features

**Temuan kunci: tidak ada inferensi LLM/model AI di produk ini.** Semua "AI"
adalah **heuristik rule-based**. **VERIFIED** (grep `anthropic|openai|gpt|claude|
gemini|llm|completion` di `src` → hanya komentar tentang token store Keychain &
"pengganti runbook LLM", tak ada pemanggilan model).

| Fitur | Use case | Model/Provider | Input | Output | Prompt location | Data access | Cost | Privacy | Halusinasi | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| **AI Insight** (`gmv_insight`) | Rekomendasi scale/watch/kill/boost + action plan + winning framework | **Rule-based (bukan AI)** | rollup video + threshold | kartu & langkah aksi | `src/utils/gmvmaxInsights.js` | data lokal (in-memory) | Nol | Nol (lokal) | Nol (deterministik) | Working |
| **Ads / AI Tools** (`ads`, `reports`) | Placeholder Phase 4 | — | — | — | — | — | — | — | Stub `soon` |

- **AI yang benar-benar berjalan:** tidak ada (LLM). **VERIFIED**.
- **UI AI tanpa backend:** label "AI Insight" (sebenarnya rule-based) & stub
  "AI Tools". **VERIFIED**.
- **Konsep AI di dokumentasi saja:** "AI Recommendation Engine" (Phase 4) di
  README/HANDOFF; rencana kredit AI assistant ada di memori proyek, **tak ada di
  kode repo ini**. **VERIFIED**.

---

## 11. Authentication and Multi-Tenancy

**VERIFIED** kecuali disebut lain.

- **Login:** email/password + Google OAuth (via Supabase). `AuthContext.jsx:42-62`.
- **Registration:** `signUp` (email/password, `emailRedirectTo=origin`) di
  LoginPage (mode "Daftar"). Trigger DB auto-buat `profiles`. Migrasi 0001:73-87.
- **Password reset:** **tidak ada** fungsi/`resetPasswordForEmail` di kode.
  **VERIFIED** (grep). Gap.
- **Session handling:** `persistSession + autoRefreshToken + detectSessionInUrl`;
  `onAuthStateChange`. `lib/supabase.js`, `AuthContext.jsx`.
- **User profile:** `profiles` (id/email/role/share_with_admin) di DB; nama/foto/
  telepon di **localStorage** (belum di DB). `localIdentity.js`.
- **Organization/workspace:** `workspaces` milik satu `user_id`. Tenant = workspace.
- **Store ownership:** 1 workspace ↔ (opsional) 1 advertiser TikTok via
  `tiktok_connections`. `tiktokConnection.js`.
- **Tenant isolation / RLS:** aktif di **semua** tabel bisnis; owner-all =
  `user_id = auth.uid()` (langsung/lewat join). Migrasi 0001,0004–0020.
- **API authorization:** browser pakai anon key → RLS yang menjaga. Proxy Vercel
  (`api/tiktok/*`) **tanpa cek sesi** (relay). Worker pakai service_role.
- **Role checks:** hanya `is_admin()`/`admin_can_view()` di RLS; UI tak gate.
- **Impersonation:** tidak ada. **Invitation/Team management:** stub. **Audit
  log:** hanya `gmvmax_action_log` (aksi optimasi), bukan audit keamanan.

**Jawaban audit:**
1. **Sudah aman dipakai banyak user?** **Sebagian ya.** Data tiap user/workspace
   terisolasi kuat oleh RLS (bukan sekadar frontend). Namun kolaborasi tim dalam
   satu workspace belum ada, dan beberapa gap non-kritikal (token plaintext,
   proxy terbuka, reset password tak ada). **INFERRED/VERIFIED**.
2. **Data tiap tenant benar-benar terisolasi?** **Ya untuk semua tabel bisnis**
   (RLS owner-based). **Pengecualian:** `gmvmax_video_meta` sengaja global (data
   publik). **VERIFIED**.
3. **Risiko user mengakses data user lain?** Lewat aplikasi: **tidak**, kecuali
   admin atas user yang **opt-in** (baca-saja) — dan itu pun tak ada UI-nya.
   `gmvmax_video_meta` bisa ditulis semua user (poisoning ringan, bukan
   kebocoran privat). **VERIFIED**.
4. **Global/shared state?** Pointer workspace + identitas + brand di localStorage
   (per-device, bukan lintas-user); cache `gmvmax_video_meta` global. **VERIFIED**.
5. **Blocker terbesar menuju produksi multi-user penuh:** (a) kolaborasi
   multi-user per workspace (Team) belum ada; (b) identitas/brand belum di DB;
   (c) reset password; (d) enkripsi/rotasi token TikTok; (e) hardening proxy.
   **INFERRED**.

---

## 12. Technical Architecture

- **Frontend:** React 19 + Vite 8 + Tailwind 3.4 + Recharts + lucide-react +
  motion + SheetJS(`xlsx`). **VERIFIED** (`package.json`).
- **Backend:** **serverless** — Supabase (auth/DB/storage) + 2 fungsi Vercel
  (`api/tiktok/*`). Tak ada server aplikasi tersendiri. **VERIFIED**.
- **Runtime:** browser (SPA) + Node.js (worker `src/gmvmax/*`, ESM `.mjs`).
- **Database:** Postgres (Supabase) dengan RLS + 1 RPC atomik. **VERIFIED**.
- **Hosting/Deploy:** **Vercel** (static `dist/` + `api/`), rewrite SPA di
  `vercel.json`. Ada **juga** workflow **GitHub Pages** (`.github/workflows/`)
  yang **tak kompatibel** dengan `api/` — kemungkinan usang (§16). `vite.config.js`
  `base:'./'`. **VERIFIED**.
- **API architecture:** PostgREST (auto) + 2 endpoint proxy REST. **VERIFIED**.
- **Folder structure:** `src/{pages,components,contexts,data,utils,lib,gmvmax}` +
  `api/` + `supabase/migrations/` + `scripts/` + `deploy/`. **VERIFIED**.
- **State management:** React Context API (tanpa Redux). **VERIFIED**.
- **Styling:** Tailwind + token tema (dark/light, glassmorphism). **VERIFIED**
  (`Layout.jsx`, `index.css`).
- **Testing:** `node:test`-style `*.test.mjs` (26 file) **hanya untuk worker
  `src/gmvmax/`**; tak ada test untuk parser/kalkulator/UI. Tak ada script
  `test` di `package.json`. **VERIFIED**.
- **Logging/Monitoring:** `console.*` + file log worker (`logs/`, redaksi rahasia
  via `runtime/redact.mjs`). Tak ada APM/Sentry. **VERIFIED**.
- **Error handling:** try/catch + state `error` per context; fallback placeholder
  Supabase agar tak crash tanpa env. **VERIFIED**.
- **Environment management:** `.env.local` (browser), `.env.sync.local` (worker),
  env VPS. **VERIFIED**.

**Diagram alur:**
```
User (browser)
  → Frontend SPA (React/Vite, Context, state-routing)
      → Supabase (Auth + Postgres RLS + Storage)          [jalur utama data]
      → Vercel Functions api/tiktok/* (proxy CORS)
            → TikTok MCP/OAuth (token, advertiser list)
      → oEmbed TikTok publik (enrich username)
  ── di luar browser ──
VPS/launchd (terjadwal)
  → Worker src/gmvmax (Node, service_role)
      → TikTok MCP (report GMV Max, self-refresh token dari tiktok_connections)
      → shadow files (default)  |  (gated) Supabase via RPC atomik
```
**VERIFIED** (komposit dari file di atas).

---

## 13. UI and Design System

- **Layout utama:** shell tinggi-viewport (sidebar tetap + topbar sticky + main
  scroll). Panel "glass" (backdrop-filter). **VERIFIED** (`Layout.jsx:353-441`).
- **Reusable components:** `Modal`, `ui/Dropdown`, `FileUpload`, `ProductTable`,
  `QuadrantChart/Summary/TableView`, `HeaderControls`, `WorkspaceSwitcher`,
  `PlatformIcon`, komponen `gmvmax/ui.jsx`,`modals.jsx`,`VideoTable`,
  `DateRangePicker`, dll. **VERIFIED** (tree `src/components`).
- **Design tokens:** kelas token tema (`bg-app`,`text-ink*`,`bg-surface`,
  `border-line`,`glass-panel`, aksen biru `#2563eb`/`blue-600`). **VERIFIED**
  (`index.css`, `tailwind.config.js`, pemakaian di komponen).
- **Typography/Color:** skala teks kecil (`text-[11px]…text-lg`), aksen biru,
  status warna (green/amber/red). **VERIFIED**.
- **Form/Table/Modal/Dropdown:** ada (input class util di SettingsPage; tabel
  sortable; `Modal.jsx`; `ui/Dropdown.jsx`). **VERIFIED**.
- **Loading/Empty/Error state:** spinner gate (App.jsx), `creativesLoading`,
  empty "belum ada data", banner error. **VERIFIED**.
- **Responsive:** breakpoint `lg` untuk sidebar; overlay mobile; scroll horizontal
  edge-aware via wheel handler. **VERIFIED** (`App.jsx:79-101`, `Layout.jsx`).
- **Dark mode:** ThemeContext (dark/light). **VERIFIED**.
- **Accessibility:** ada `aria-label`,`role="switch"`,`aria-checked`,`aria-disabled`
  sebagian; belum audit menyeluruh. **INFERRED**.
- **Konsistensi:** relatif konsisten (satu bahasa token, gaya "Praise"). **Titik
  fragmentasi:** dua "generasi" halaman (marketplace lama vs gmvmax baru) dengan
  pola kartu berbeda; util format (`quadrantUtils` fmtIDR) dipakai lintas modul.
  **INFERRED**.

---

## 14. Reporting and Analytics

- **Dashboard:** Overview (command center), GMV Max Dashboard, Performa Toko,
  Kuadran. **VERIFIED**.
- **KPI/Metric utama (GMV Max):** cost, gross_revenue, orders, **ROAS**,
  impressions, clicks, CTR, CVR, video-view rates (2s/6s/25/50/75/100),
  cost_per_order. **VERIFIED** (migrasi 0011; `apiGmvMax.js`).
- **Chart:** Recharts (scatter kuadran, bar, tren harian stacked channel).
  **VERIFIED**.
- **Filter:** bulan + window (Hari ini/3/7 hari/Bulan) + date-range picker +
  preset; filter status/kandidat scale di Video. **VERIFIED** (`GmvMaxContext.jsx:71-190`).
- **Comparison period:** kuadran = bandingkan 2 periode; GMV Max = window vs blok
  sebelumnya / bulan lalu (`prev`). **VERIFIED**.
- **Export/Report generation:** export/import sesi `.json` (Riwayat Periode);
  **tidak ada** export PDF/Excel laporan. Halaman "Reports" = stub. **VERIFIED**.
- **Attribution:** baris `item_id="-1"` (product-card/system delivery) masuk total
  tapi keluar ROAS per-video. **VERIFIED** (`apiGmvMax.js` header).

| Metric | Sumber | Formula | Refresh | Live/Imported/Scraped/Mock/Manual | Risiko akurasi |
|---|---|---|---|---|---|
| ROAS video | creatives | revenue/cost (cost>0) | saat upload/rollup | **Imported (xlsx manual)** atau API (worker) | Bergantung kelengkapan upload harian |
| Profit kalkulator | input + fee table | harga − modal − fee − ongkir … | real-time | **Manual + fee hardcoded** | Fee usang bila TikTok/Shopee ubah skema |
| Kuadran | products | traffic × CR vs threshold | saat import | **Imported** | Model Shopee-centric |
| Username kreator | oEmbed | — | background | **Scraped (publik)** | Bisa `notfound`/`error` |
| Tren harian | totals per snapshot | angka hari langsung (bukan selisih) | per upload | **Imported** | Hari bolong bila tak upload |
| Setting campaign | MCP campaign info | diff antar 2 hari | via worker | **Worker (belum cutover)** | Kosong bila worker mati |

**Risiko ketidakakuratan umum:** GMV Max mengandalkan disiplin **upload harian**
(model snapshot); hari yang terlewat = lubang tren; fee statis; enrichment
best-effort. **INFERRED**.

---

## 15. Settings and Configuration

| Konfigurasi | UI ada? | Lokasi | Simpan di | Status |
|---|---|---|---|---|
| Profil (nama, telepon, foto) | Ya | Settings→Profil | **localStorage** | Working (per-device) |
| Brand (nama, logo) per workspace | Ya | Settings→Brand | **localStorage** | Working (per-device) |
| Consent `share_with_admin` | Ya | Settings→Profil | Supabase `profiles` | Working |
| Integrasi TikTok (connect/disconnect/renew/pilih advertiser) | Ya | Settings→Integrasi | Supabase `tiktok_connections` | Working |
| Team/undang anggota | Stub | Settings→Team | — | Belum |
| Threshold ROAS (good/bad/great/spend_floor/kill_floor) | Ya (modul GMV Max) | `gmvmaxSettings` | Supabase `gmvmax_settings` | Working |
| Workspace (buat/hapus/warna) | Ya | Sidebar switcher | Supabase `workspaces` | Working |
| Bahasa (ID/EN) & Tema (dark/light) | Ya | Header | (context; persist theme via storage) | Working |
| Sidebar collapse | Ya (implisit) | Sidebar | localStorage | Working |
| Tabel fee Shopee/TikTok/ongkir | **Hardcoded** | — | `src/utils/feeData.js`, `tiktokFeeData.js`, `ongkirFeeData.js` | Manual |
| `client_id` OAuth TikTok, endpoint MCP | **Hardcoded** | — | `lib/tiktokOAuth.js` | Manual |
| Feature flags | Sebagian (`soon:true` di NAV) | Layout.jsx | kode | Manual |
| Env (Supabase/proxy/worker) | — | `.env*` | env | Manual |

**Hardcoded (butuh edit kode):** tabel fee, client_id/endpoint TikTok, threshold
default, advertiser default worker (`DEFAULT_ADVERTISER` di `worker.mjs:24`),
TZ Jakarta offset. **VERIFIED**.

---

## 16. Code Quality and Technical Debt

### Critical (potensi kehilangan/salah data / bypass)

1. **Client `saveImport` non-atomik (potensi kehilangan snapshot).**
   - Masalah: `gmvmaxImports.js:210-238` melakukan `delete` snapshot tanggal
     sama **lalu** `insert` import + creatives **tanpa transaksi**. Bila insert
     gagal setelah delete (jaringan/quota/validasi), snapshot lama **hilang**.
   - Dampak: kehilangan data hari itu pada re-upload yang gagal.
   - Bukti: `src/data/gmvmaxImports.js:210-238`. (Jalur worker sudah aman via RPC
     atomik `gmvmax_replace_snapshot` — hanya jalur browser yang belum.)
   - Arah perbaikan: pakai RPC atomik yang sama untuk jalur upload browser.
   - **VERIFIED (kode); dampak = INFERRED.**

2. **Seluruh modul `src/gmvmax/`, migrasi 0017–0020, dan banyak skrip = UNTRACKED
   di git.**
   - Masalah: `git status` menunjukkan `src/gmvmax/`, `supabase/migrations/0017–0018`,
     `deploy/vps-shadow/`, dan skrip belum di-commit; migrasi 0019/0020 juga di
     luar snapshot commit.
   - Dampak: risiko kehilangan kerja/worker & ketidaksesuaian antara repo remote
     dan realita produksi; sulit reproduksi.
   - Bukti: output `git status --short` saat audit.
   - Arah: commit terkontrol (di luar cakupan tugas ini — **tidak dilakukan**).
   - **VERIFIED.**

### High (menghambat scale/multi-user/reliability/deploy)

3. **Token TikTok (access+refresh) disimpan plaintext di DB.**
   - RLS owner-only melindungi baca antar-user, tapi tak ada enkripsi kolom/
     rotasi. Bocornya service_role/backup = bocornya semua token.
   - Bukti: migrasi 0019 (`access_token text not null`); `tiktokConnection.js`.
   - Arah: enkripsi at-rest / vault / pgsodium. **VERIFIED (kondisi).**

4. **Proxy Vercel terbuka tanpa auth/rate-limit.**
   - `api/tiktok/token.js` & `advertisers.js` menerima POST dari siapa saja
     (relay). `token` = public PKCE (mitigasi), tapi `advertisers` memakai
     access_token pemanggil; keduanya bisa jadi vektor abuse/SSRF-relay ringan.
   - Bukti: kedua file (tak ada cek sesi/origin/rate-limit).
   - Arah: batasi origin + rate-limit + verifikasi sesi Supabase. **VERIFIED.**

5. **Konflik target deploy (Vercel vs GitHub Pages).**
   - `vercel.json` + folder `api/` mengharuskan Vercel; namun ada
     `.github/workflows/*` GitHub Pages yang **tak bisa** menjalankan `api/`.
   - Dampak: bila Pages ter-deploy, fitur Connect TikTok mati (proxy hilang).
   - Bukti: `vercel.json`, `.github/workflows/deploy.yml`, `vite.config.js`.
   - Arah: pilih Vercel, hapus/arsipkan workflow Pages. **VERIFIED.**

6. **Identitas & brand user hanya di localStorage.**
   - Tak sinkron antar device; hilang bila cache dibersihkan.
   - Bukti: `localIdentity.js:1-5`. Arah: pindah ke kolom `profiles`/`workspaces`.
   - **VERIFIED.**

### Medium (maintainability/type-safety/coverage/konsistensi)

7. **Test coverage timpang.** 26 test hanya untuk worker `src/gmvmax/`; **parser
   & kalkulator (logika uang)** tak ada test. Bukti: tree test; `package.json`
   tanpa `test`. **VERIFIED.**
8. **Tanpa TypeScript** di kode aplikasi (JS + JSX). Type-safety lemah pada
   transformasi data numerik lintas platform. **VERIFIED.**
9. **Dua model data produk** (Shopee-centric `compactProduct` vs skema
   ternormalisasi). Bukti: `storage.js`; migrasi 0001. **VERIFIED.**
10. **Wiring mati**: `importDataset`/`gmvmaxApiService`/`gmvmaxApiPoller` tak
    dipanggil UI (dead-ish path). **VERIFIED.**
11. **Routing via state** — deep-link/back-button terbatas; `App.jsx` gemuk
    (state + handler + efek). **VERIFIED.**

### Low (polish)

12. Fallback placeholder Supabase bisa menyembunyikan misconfig di prod (hanya
    `console.error`). **VERIFIED.**
13. Ikon notifikasi header tanpa fungsi jelas (perlu verifikasi). **INFERRED.**
14. Banyak `soon:true` stub di NAV. **VERIFIED.**

---

## 17. Product Gaps

- **Missing foundation:**
  - Identitas/brand di DB (bukan localStorage); reset password; canonical data
    model marketplace (rekonsiliasi 2 model). **Dibutuhkan.**
- **Missing user workflow:**
  - Kolaborasi tim dalam satu workspace (undang anggota, peran). **Dibutuhkan
    bila mau dipakai >1 orang per toko.**
  - Panel admin (memakai akses consent yang sudah ada di RLS). **Nice-to-have.**
- **Missing automation:**
  - Cutover worker sync otomatis (hilangkan upload manual harian). **Dibutuhkan
    (ini value inti GMV Max).**
- **Missing reporting:**
  - Export laporan (PDF/Excel), Reports page nyata, time-series N-periode.
    **Nice-to-have → Dibutuhkan untuk decision-tool.**
- **Missing collaboration:** komentar/assignment aksi, decision/outcome log
  terstruktur (fondasi AI). **Nice-to-have sekarang, strategis nanti.**
- **Missing security:** enkripsi token, hardening proxy, reset password, audit
  log keamanan. **Dibutuhkan menuju SaaS.**
- **Missing monetization:** billing/pricing/kredit AI — **tak ada di kode**
  (rencana di memori, milik roadmap SaaS). **Nice-to-have (belum fokus).**
- **Missing scale infrastructure:** queue terkelola, monitoring/APM, CI test.
  **Nice-to-have (internal tool).**
- **Missing AI capability:** LLM/AI Recommendation Engine (Phase 4) — belum ada.
  **Ide berpotensi menambah kompleksitas; validasi kebutuhan dulu.**

> Catatan: banyak "gap" **wajar tidak ada** karena posisi = internal tool. Yang
> benar-benar menambah value inti: **cutover sync otomatis**, **atomicity upload
> browser**, **time-series & decision log**. Billing/SaaS-scale = tunda.

---

## 18. Production Readiness Score (0–10)

| Dimensi | Skor | Alasan konkret |
|---|---|---|
| Product completeness | **7** | Marketplace + GMV Max manual matang & dipakai; worker auto & Reports/Team belum. |
| UI completeness | **8** | Sebagian besar halaman lengkap, konsisten, responsif, dark mode; ada stub. |
| Backend completeness | **6** | Supabase + RLS + RPC solid; proxy minimal; worker belum cutover; identitas belum di DB. |
| Data reliability | **5** | Model snapshot rapi & atomik di worker, tapi **upload browser non-atomik**; fee hardcoded; ketergantungan disiplin upload. |
| Security | **6** | RLS kuat & anti-eskalasi role; **tapi** token plaintext, proxy terbuka, tanpa reset password. |
| Multi-user readiness | **6** | Isolasi per-user via RLS kuat; kolaborasi per-workspace & admin UI belum ada. |
| Scalability | **6** | Serverless + Postgres cukup untuk skala agency; belum queue/monitoring; paginasi PostgREST sudah ditangani. |
| Observability | **4** | Log worker + redaksi bagus; app hampir tanpa monitoring/error tracking. |
| Testing | **4** | Worker teruji (26 test); parser/kalkulator/UI tanpa test; tak ada CI test. |
| Deployment readiness | **6** | Vercel siap (`vercel.json`+`api/`), **tapi** workflow Pages usang & banyak file untracked. |
| Documentation | **5** | README/HANDOFF ada tapi **usang** (pra-GMV Max); DESIGN.md worker bagus; dokumen ini menutup sebagian. |

---

## 19. Current-State Summary (maks 20 poin)

1. SellerOS = **internal tool Praise Agency** untuk analitik marketplace + iklan
   GMV Max TikTok; **belum SaaS publik**. **VERIFIED.**
2. Stack: React 19 + Vite + Tailwind + Supabase + Recharts + xlsx; SPA routing
   berbasis state. **VERIFIED.**
3. **Bisa:** login (email/Google), multi-workspace, analisis kuadran, kalkulator
   fee/profit, performa toko, campaign/voucher — semua tersimpan di Supabase.
4. **Bisa:** modul GMV Max lengkap via **upload xlsx manual harian**
   (dashboard/video/produk/creator/insight/boost/log/campaign-ads).
5. **Bisa:** Connect TikTok Ads (OAuth PKCE) per workspace, token auto-refresh.
6. **Belum bisa (dari UI):** sync GMV Max otomatis (worker masih **shadow**, belum
   cutover); import via API browser tak diwiring; Reports & AI Tools stub; Team.
7. **Production-ready:** auth + RLS multi-tenant; marketplace & GMV Max manual;
   deploy Vercel. **VERIFIED/INFERRED.**
8. **Masih prototype/gated:** worker commit VPS, setting campaign via worker,
   Phase 3/4. **VERIFIED.**
9. **"AI Insight" bukan AI** — heuristik rule-based; **tak ada LLM** di produk.
   **VERIFIED.**
10. **Isolasi data kuat**: RLS owner-based di semua tabel bisnis + anti-eskalasi
    role. **VERIFIED.**
11. **Pengecualian isolasi**: `gmvmax_video_meta` global (data publik, writable
    semua user) — risiko rendah. **VERIFIED.**
12. **Risiko data #1**: upload GMV Max browser **non-atomik** (delete-then-insert)
    → potensi kehilangan snapshot saat gagal. **VERIFIED (kode).**
13. **Risiko keamanan**: token TikTok plaintext di DB; proxy Vercel terbuka;
    tanpa reset password. **VERIFIED.**
14. **Identitas & brand hanya localStorage** (tak sinkron antar device).
    **VERIFIED.**
15. **Kualitas**: worker teruji (26 test) tapi parser/kalkulator (jalur uang) &
    UI tanpa test; tanpa TypeScript. **VERIFIED.**
16. **Deploy**: Vercel benar (butuh `api/`); workflow **GitHub Pages usang &
    tidak kompatibel**. **VERIFIED.**
17. **Git**: seluruh `src/gmvmax/` + migrasi 0017–0020 + skrip **belum
    di-commit** (untracked). **VERIFIED.**
18. **Dokumentasi resmi (README/HANDOFF) usang** — mendeskripsikan data bisnis
    masih di localStorage, padahal sudah pindah ke Supabase. **VERIFIED.**
19. **Blocker scale terbesar**: cutover sync otomatis + atomicity upload +
    hardening keamanan (token/proxy). **INFERRED.**
20. **Siap dipakai banyak user?** Ya untuk **banyak user terpisah** (tiap orang
    tenant sendiri, terisolasi RLS); **belum** untuk **kolaborasi tim dalam satu
    workspace**. **INFERRED/VERIFIED.**

---

## 20. Evidence Appendix

| Area | File/Folder | Kenapa penting |
|---|---|---|
| Entry & routing | `src/main.jsx`, `src/App.jsx` | Provider nesting + auth gate + state-router |
| Auth | `src/contexts/AuthContext.jsx`, `src/lib/supabase.js` | Sesi, role, isAdmin, guard env |
| Navigasi | `src/components/Layout.jsx` | Struktur NAV, stub `soon`, breadcrumb |
| Skema & RLS | `supabase/migrations/0001_init.sql` … `0020_*.sql` | Sumber kebenaran data + isolasi tenant |
| RPC atomik | `supabase/migrations/0017_gmvmax_atomic.sql` | Kontrak zero-data + tenant isolation |
| Data layer | `src/data/*` (`gmvmaxImports.js`, `workspaces.js`, `tiktokConnection.js`, `localIdentity.js`) | Cara baca/tulis + lokasi localStorage |
| GMV Max state | `src/contexts/GmvMaxContext.jsx` | Model snapshot, window, rollup, aksi |
| Insight engine | `src/utils/gmvmaxInsights.js`, `gmvmaxClassify.js` | Bukti rule-based (bukan AI) |
| API mapper | `src/utils/apiGmvMax.js`, `gmvmaxApiPoller.js`, `gmvmaxApiService.js` | Jalur API (tak diwiring UI) |
| OAuth | `src/lib/tiktokOAuth.js`, `src/components/TiktokCallback.jsx` | PKCE flow, redirect, proxy |
| Proxy | `api/tiktok/token.js`, `api/tiktok/advertisers.js` | Relay CORS, permukaan risiko |
| Worker | `src/gmvmax/worker.mjs`, `vpsCommit.mjs`, `writer.mjs`, `providers/supabaseTokenStore.mjs`, `engine.mjs` | Sync deterministik, shadow vs commit |
| Deploy | `vercel.json`, `.github/workflows/deploy.yml`, `vite.config.js` | Konflik target deploy |
| Settings/UI | `src/pages/SettingsPage.jsx` | Profil/Brand/Integrasi/Team, consent |

**File yang kemungkinan usang / menyesatkan:**
- `README.md`, `HANDOFF.md` — **usang** (2026-06-18, pra-GMV Max); klaim "data
  bisnis di localStorage" **salah** untuk kondisi sekarang (sudah Supabase).
  **VERIFIED.**
- `.github/workflows/deploy.yml` (GitHub Pages) — bertentangan dengan Vercel/`api/`.
  **VERIFIED.**
- `src/gmvmax/providers/tokenStore.mjs` (Keychain) — sebagian digantikan
  `supabaseTokenStore.mjs`. **VERIFIED.**
- `src/utils/gmvmaxApiService.js` + `gmvmaxApiPoller.js` — ada tapi tak dipanggil
  UI (nama menyiratkan fitur aktif, padahal jalur worker/script). **VERIFIED.**
- `auto-dm-affiliate.zip`, `asterixsty-video-sync*.zip`, `dist/`, `dist-vps/`,
  `logs/` — artefak/build/arsip, bukan sumber. **VERIFIED.**

**Disebut di dokumentasi tapi tak ada di kode:**
- Halaman `/admin` (HANDOFF "pending") — **tidak ada**. **VERIFIED.**
- "AI Recommendation Engine" (Phase 4) — **konsep saja**. **VERIFIED.**
- Sistem billing/kredit AI (memori proyek) — **tak ada di repo**. **VERIFIED.**

**Tidak dapat diverifikasi dari kode (UNKNOWN):**
- Apakah worker VPS benar-benar **sedang berjalan** & status cutover terkini di
  server produksi (hanya artefak/skrip yang terlihat).
- Apakah runbook LLM lama masih penulis produksi aktif saat ini.
- Konfigurasi env produksi aktual (nilai), provider Google aktif/tidak di Supabase.
- Perilaku runtime UI (tak dijalankan): akurasi rollup, empty/error state nyata.
- Isi & kebaruan migrasi yang sudah **di-apply** ke DB produksi (kode migrasi ada;
  status apply = di luar repo).
