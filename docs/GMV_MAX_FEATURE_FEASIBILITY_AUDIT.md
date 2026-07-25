# GMV Max Feature Feasibility Audit — SellerOS

> **Audit read-only.** Tidak ada perubahan kode/DB/migrasi/config. Tanggal: **2026-07-20**.
> Repo: `tools/shopee-quadrant` (deploy: `seller-os-*.vercel.app`, push ke `praiseagency-system/SellerOS`).
> Pertanyaan inti: *"Bisakah sistem ini menjadi GMV Max Operating System yang memahami seluruh
> fitur GMV Max, memonitor status, menganalisis dampak, dan memberi rekomendasi tindakan?"*
>
> **Status keterangan:** **VERIFIED** (dari kode/migrasi/skema MCP) · **INFERRED** (kesimpulan struktur) ·
> **UNKNOWN / DATA_UNAVAILABLE** (tak dapat dipastikan tanpa runtime/tenant).
>
> **Basis bukti utama:**
> 1. Audit kode existing `docs/PRODUCT_CONTEXT.md` (2026-07-18, HEAD `5590dbc`).
> 2. Skema tabel: migrasi `0011`–`0021` di `supabase/migrations/`.
> 3. Kontrak MCP nyata: server `tiktok-ads` (grup `gmv_max`) diinspeksi via `tool_list` + `tool_get`
>    pada sesi ini. **Ini kontrak API (schema), belum dieksekusi runtime** untuk tenant manapun.

---

## 1. Executive Summary

**Ya — sistem ini dapat dikembangkan menjadi GMV Max OS**, tetapi dengan pembatasan yang jelas antara
**yang bisa dieksekusi**, **yang hanya bisa dimonitor**, dan **yang harus manual di Seller Center**.

Temuan kunci yang mengubah asumsi awal:

- **MCP `tiktok-ads` yang tersambung mengekspos grup `gmv_max` lengkap** (bukan sekadar Smart+):
  `gmv_max_report_get`, `gmv_max_campaign_get`, `campaign_gmv_max_info_get`, `gmv_max_bid_recommend_get`,
  `campaign_gmv_max_create/update`, `gmv_max_creative_update`, `campaign_gmv_max_session_*`,
  `gmv_max_video_get`, `gmv_max_identity_get`, `gmv_max_store_list_get`,
  `gmv_max_exclusive_authorization_*`. **VERIFIED** (`tool_list`).
  → Banyak fitur ternyata **executable via API**, bukan monitor-only: Target ROI, Budget,
  Auto Budget Increase, Promotion Days, Max Delivery, Manual Creative Boost, Creative Exclusion,
  Campaign create/pause. Ini lebih kuat dari perkiraan.
- **Arsitektur yang diinginkan sudah 70% ada bentuknya:** worker (service_role) menarik MCP →
  menulis Supabase → dashboard baca DB. Token disimpan per-workspace di `tiktok_connections`
  (RLS owner-only), **tidak di browser, tidak global**. **VERIFIED** (`worker.mjs`, `tiktok_connections`,
  migrasi 0019). Prinsip "dashboard tak live-call MCP" sudah terpenuhi by design.
- **Tapi lapisan eksekusi + registry + experiment tracker + approval belum ada sama sekali**, dan
  **worker sync belum cutover** (masih shadow-only).

### Angka (estimasi, berbasis 56 fitur A–F)

| Bucket | Perkiraan | Catatan |
|---|---|---|
| **Bisa dibangun sekarang** (READ/MONITOR/RECOMMEND, data sudah tersedia via MCP + infra ada) | **~55%** | Reporting campaign/product/creative/LIVE, status kreatif, budget/ROI monitoring, root-cause, rule-based rekomendasi, action plan |
| **Butuh kerja internal** (schema/worker/UI/rule engine tambahan, data ADA) | **~25%** | Feature registry, creative experiment tracker, optimization-mode history, approval workflow, decision-status enum |
| **Butuh manual input / file import** (tak ada di API) | **~8%** | Commission Savings, ROI Protection *eligibility*, sebagian metadata offer/PDP |
| **Terblokir / tergantung Seller Center / tidak disarankan** | **~12%** | Viewer Boost, LIVE Creative Boost, Preferred Video, Video-to-LIVE, Mega LIVE, AI-Generated Images, Shop Creative Hub, Accelerate Testing (tak ada endpoint) |

**Bergantung API/MCP TikTok:** hampir semua jalur data (reporting + eksekusi). Bila MCP-layer token
suatu tenant tak punya scope GMV Max, **seluruh jalur otomatis mati** untuk tenant itu → jadikan
`gmv_max_store_list_get` sebagai gerbang deteksi kapabilitas per-tenant.

**Yang TIDAK sebaiknya dibangun sekarang:** eksekusi otomatis tanpa approval untuk aksi berisiko;
scraping Seller Center sebagai default; fitur LIVE-boost yang tak ada endpoint-nya (bikin ilusi kontrol).

**VERDICT ringkas: `PARTIALLY_BUILDABLE` — kuat di READ/MONITOR/RECOMMEND, terbatas & bertahap di EXECUTE.**

---

## 2. Current State Audit (keadaan nyata codebase)

Berbasis `PRODUCT_CONTEXT.md` + migrasi + pembacaan kode langsung.

| Dimensi | Status sekarang | Bukti |
|---|---|---|
| **UI mock?** | Tidak. UI GMV Max nyata & terhubung Supabase. Stub hanya `ads`/`reports` (`soon`). | `Layout.jsx:37,51`; `PRODUCT_CONTEXT §2.4` |
| **localStorage?** | Hanya untuk profil/brand/pointer workspace. **Data bisnis GMV Max di Postgres.** | `localIdentity.js`; migrasi 0011–0020 |
| **Terhubung DB?** | Ya — Supabase Postgres, 21 migrasi. Snapshot harian model. | `supabase/migrations/*` |
| **Multi-tenant isolation?** | **Ya, kuat.** RLS owner-based (`user_id = auth.uid()`) di semua tabel bisnis + admin consent-based. | migrasi 0001, 0011–0021 |
| **Background sync?** | **Ada tapi belum cutover.** Worker deterministik (`src/gmvmax/*`, 26 test) = **shadow-only**; commit digerbang `GMVMAX_RUNTIME=vps`+`GMVMAX_COMMIT=1`. | `worker.mjs:1-3`, `vpsCommit.mjs` |
| **Data ingestion?** | Dua jalur: (a) **upload xlsx manual** (aktif), (b) **worker API** (gated). Jalur API di browser (`gmvmaxApiService/Poller`) **tidak diwiring**. | `PRODUCT_CONTEXT §2.3`; `GmvMaxContext.jsx` |
| **Recommendation engine?** | **Ada, rule-based (bukan LLM).** Scale/Watch/Kill/Boost + Action Plan + Winning Framework, threshold per-workspace. | `gmvmaxInsights.js`, `gmvmaxClassify.js`, `gmvmax_settings` |
| **Execution layer (tulis ke TikTok)?** | **Tidak ada.** Boost = pipeline manual (`gmvmax_boost`: diminta→ada_kode→terpasang), eksekusi manusia di TikTok. | migrasi 0015/0018; `PRODUCT_CONTEXT §6 Workflow D` |
| **Audit log?** | **Sebagian.** `gmvmax_action_log` = jurnal aksi manusia (bukan audit eksekusi API). `gmvmax_sync_runs` (0021) = audit per-run worker (belum tentu applied). | migrasi 0014, 0021 |
| **Approval workflow?** | **Tidak ada.** Tak ada status keputusan, gate, atau reviewer. | grep: tak ada |
| **Feature registry GMV Max?** | **Tidak ada** sebagai entitas normalized. `gmvmax_campaign_settings` menyimpan sebagian flag campaign harian (budget, roas_bid, auto_budget, roi_protection_enabled). | migrasi 0020 |
| **Token handling** | Per-workspace di `tiktok_connections` (RLS owner-only), **plaintext** (belum enkripsi). Worker pakai service_role. Dashboard tak pernah pegang token. | migrasi 0019; `PRODUCT_CONTEXT §16.3` |

**Kesimpulan current state:** fondasi data + tenancy + rule-engine **matang**; jalur otomatis **ada tapi
belum hidup**; lapisan eksekusi/registry/experiment/approval **kosong**. Sistem hari ini = **READ + MONITOR
(manual) + RECOMMEND**. Belum **MONITOR (otomatis)** penuh, belum **EXECUTE**.

---

## 3. Kapabilitas MCP GMV Max (fondasi seluruh matriks)

**VERIFIED via `tool_get`** — inti dari feasibility. Empat level: **R**ead · **M**onitor · **RE**commend · **EX**ecute.

### 3.1 Endpoint READ/MONITOR yang ADA
| Tool MCP | Menyediakan | Relevansi |
|---|---|---|
| `gmv_max_report_get` | metrik campaign/product(SPU)/creative(item_id)/**LIVE(room_id)**/hour/day; filter `creative_delivery_statuses` (IN_QUEUE, LEARNING, DELIVERING, NOT_DELIVERYING, AUTHORIZATION_NEEDED, EXCLUDED, UNAVAILABLE, REJECTED, NOT_ACTIVE), `gmv_max_promotion_types` (PRODUCT/LIVE) | Reporting semua level + **status kreatif** + LIVE |
| `gmv_max_campaign_get` | daftar campaign PRODUCT/LIVE, status, waktu | Inventaris campaign |
| `campaign_gmv_max_info_get` | `budget`, `roas_bid`, `auto_budget{...}`, `promotion_days`, `roi_protection_enabled`, `deep_bid_type`, `schedule`, `item_group_ids`, `operation_status` | **Snapshot setting campaign** (budget/ROI/auto-budget/promo/ROI-protection READ) |
| `gmv_max_bid_recommend_get` | `roas_bid` + `budget` **rekomendasi TikTok** (Recommended ROI) | Sumber "Recommended ROI" resmi |
| `campaign_gmv_max_session_list_get` / `_get` | sesi **Max Delivery** (`bid_type=NO_BID`) & **Manual Creative Boost** (`CREATIVE_NO_BID`): budget, jadwal | **Optimization-mode + boost history** |
| `gmv_max_store_list_get` | `is_gmv_max_available`, `exclusive_authorized_advertiser_info` | **Gerbang kapabilitas per-tenant** |
| `gmv_max_identity_get` | identity `product_gmv_max_available` / `live_gmv_max_available` | Sumber kreatif akun resmi/BC |
| `gmv_max_video_get` | post tersedia + sort `GMV/POST_TIME/VIEWS/LIKES/CTR/PRODUCT_CLICKS` | Supply video afiliasi/authorized |
| `gmv_max_exclusive_authorization_get` | status otorisasi GMV Max toko↔ad account | Affiliate/store authorization monitor |
| `store_product_get` (grup `store`) | produk `ad_creation_eligible=GMV_MAX`, `gmv_max_ads_status` | Katalog produk eligible |

### 3.2 Endpoint EXECUTE yang ADA (dengan syarat)
| Tool MCP | Fitur GMV Max | Catatan risiko |
|---|---|---|
| `campaign_gmv_max_create` | Buat Product/LIVE GMV Max (roas_bid, budget, auto_budget, promotion_days, affiliate_posts_enabled, product/video selection) | Aksi berat; wajib approval |
| `campaign_gmv_max_update` | Ubah budget, **Target ROI** (`roas_bid`), auto_budget, promotion_days (+`roas_bid_multiplier` *allowlist*), affiliate posts, item/produk, schedule | Perubahan besar → REQUIRE_APPROVAL |
| `campaign/status/update` | Pause/Enable campaign | REQUIRE_APPROVAL |
| `gmv_max_creative_update` | **Creative Exclusion** (REMOVE/ADD post; syarat `AUTO_SELECTION`) | Sedang; reversible |
| `campaign_gmv_max_session_create/_update/_delete` | **Max Delivery** + **Manual Creative Boost** (budget & jadwal terpisah) | Max Delivery = REQUIRE_APPROVAL; boost budget besar → REQUIRE_APPROVAL |
| `gmv_max_exclusive_authorization_create` | Grant otorisasi GMV Max toko | Sensitif; REQUIRE_APPROVAL |

### 3.3 Yang TIDAK ditemukan di API (→ Seller Center / Ads Manager only)
**VERIFIED (absen di `tool_list` + skema create/update):**
- **ROI Protection**: hanya `roi_protection_enabled` READ; **tak ada toggle** create/update → MONITOR_ONLY.
- **Commission Savings**: tak ada endpoint → butuh Seller Center / file / manual.
- **Viewer Boost, LIVE Creative Boost, Preferred Video, Video-to-LIVE / LIVE-to-LIVE, Mega LIVE**:
  session tool bersifat **Product-only** (Max Delivery + Creative Boost). Tak ada endpoint LIVE-boost →
  Ads Manager only. LIVE GMV Max **campaign** bisa dibuat & **di-report** (room_id), tapi kontrol
  boost LIVE-nya tidak.
- **Accelerate Testing for New Videos, Automatically Generated Images, Shop Creative Hub,
  Creative Source selection granular**: tak ada sebagai field API terpisah (AUTO_SELECTION memilih
  otomatis; "auto images" tersirat saat `identity_list` kosong) → deteksi terbatas/tak reliable.

> **Asumsi eksplisit:** kontrak di atas dari server MCP sesi ini. **Ketersediaan aktual per-tenant
> (scope token + fitur allowlist seperti Auto Budget Increase / `roas_bid_multiplier`)** = **UNKNOWN**
> sampai diverifikasi runtime per advertiser (lihat §11).

---

## 4. Feature Feasibility Matrix

Legend: ✅ penuh · ⚠️ sebagian/bersyarat · ❌ tidak. Klasifikasi memakai taksonomi permintaan
(BUILDABLE_NOW, BUILDABLE_WITH_INTERNAL_WORK, …, MONITOR_ONLY, RECOMMENDATION_ONLY, NOT_RECOMMENDED).

| # | Feature (A–F) | R | M | RE | EX | Data Source | Current Support | Required Work | Feasibility | Risk | Conf | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Product GMV Max | ✅ | ✅ | ✅ | ✅ | MCP report/campaign/create | Report creative-level tersimpan | Registry + create UI | BUILDABLE_NOW (R/M/RE); EXEC = INTERNAL_WORK | Low | High | `gmv_max_report_get`, `campaign_gmv_max_create` |
| A2 | LIVE GMV Max | ✅ | ✅ | ⚠️ | ⚠️ | MCP report(room_id)/create | Belum dipisah dari product | Dimensi room_id + UI LIVE | BUILDABLE_WITH_INTERNAL_WORK | Med | Med | report dim `room_id`, `shopping_ads_type=LIVE` |
| A3 | Full Shop / All Products | ✅ | ✅ | ✅ | ✅ | MCP create `product_specific_type=ALL` | — | Cek `shop_ad_usage_check` | BUILDABLE_WITH_INTERNAL_WORK | Med | High | `campaign_gmv_max_create` |
| A4 | Selected Products | ✅ | ✅ | ✅ | ✅ | `item_group_ids` (create/update) | SPU sudah dikenal di data | UI pemilihan produk | BUILDABLE_WITH_INTERNAL_WORK | Med | High | create/update schema |
| A5 | **Target ROI** | ✅ | ✅ | ✅ | ✅ | `roas_bid` (info/update) + `bid_recommend` | roas_bid disnapshot (worker) | History + set UI + approval | BUILDABLE_NOW (R/M/RE) | Med | High | `campaign_gmv_max_info_get`, `_update` |
| A6 | Recommended ROI | ✅ | ✅ | ✅ | n/a | `gmv_max_bid_recommend_get` | Belum ditarik | Panggil + tampil banding | BUILDABLE_WITH_INTERNAL_WORK | Low | High | `gmv_max_bid_recommend_get` |
| A7 | **Max Delivery** | ✅ | ✅ | ✅ | ⚠️ | `session_*` (`NO_BID`) | — | History + create session + **approval wajib** | BUILDABLE_WITH_INTERNAL_WORK; EXEC = REQUIRE_APPROVAL | **High** | High | `campaign_gmv_max_session_create` |
| A8 | Promotion Days | ✅ | ✅ | ✅ | ⚠️ | `promotion_days` (info/update; multiplier *allowlist*) | Belum disnapshot | Registry + set UI | BUILDABLE_WITH_INTERNAL_WORK | Med | Med | create/update `promotion_days` |
| A9 | Mega LIVE | ❌ | ❌ | ❌ | ❌ | — | — | — | NOT_RELIABLY_BUILDABLE (tak ada endpoint) | — | Med | absen `tool_list` |
| A10 | **Auto Budget Increase** | ✅ | ✅ | ✅ | ⚠️ | `auto_budget{...}` (info/update; *allowlist*) | `auto_budget` disnapshot jsonb | Registry + approval | BUILDABLE_WITH_INTERNAL_WORK; EXEC = REQUIRE_APPROVAL | **High** | Med | `0020`, `campaign_gmv_max_update` |
| A11 | Daily budget | ✅ | ✅ | ✅ | ✅ | `budget` (info/update) | budget disnapshot | History + set + approval | BUILDABLE_NOW (R/M) | High | High | `0020`, `_update` |
| A12 | Campaign scheduling | ✅ | ✅ | ⚠️ | ✅ | `schedule_*` | disnapshot | — | BUILDABLE_WITH_INTERNAL_WORK | Med | High | `_info_get`, `_update` |
| A13 | Optimization-mode history | ✅ | ✅ | ✅ | n/a | `session_list` + campaign diff | diff harian setting ada | Time-series mode + session poll | BUILDABLE_WITH_INTERNAL_WORK | Low | Med | `campaignSettings.mjs`, `session_list_get` |
| B14 | ROI Protection | ✅ | ✅ | ⚠️ | ❌ | `roi_protection_enabled` (READ only) | disnapshot | Monitor + rekomendasi | **MONITOR_ONLY** (eksekusi di Seller Center) | Low | High | `0020`, info schema |
| B15 | Commission Savings | ❌ | ❌ | ⚠️ | ❌ | Seller Center / file | — | Import/manual | BUILDABLE_WITH_FILE_IMPORT / RECOMMENDATION_ONLY | Low | Med | absen API |
| B16 | ROI Protection eligibility | ❌ | ❌ | ❌ | ❌ | — | — | — | DATA_UNAVAILABLE | — | Med | absen API |
| B17 | ROI Protection credit history | ❌ | ⚠️ | ❌ | ❌ | Seller Center | — | Manual/import | BUILDABLE_WITH_MANUAL_INPUT | Low | Low | absen API |
| C18 | Creative source selection | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `product_video_specific_type`, `identity_list` | — | UI sumber kreatif | BUILDABLE_WITH_INTERNAL_WORK | Med | Med | create schema |
| C19–21 | Official/Marketing/Affiliate videos | ✅ | ✅ | ✅ | ⚠️ | `gmv_max_video_get`, `identity_get`, report | akun kreator via report | Supply monitor | BUILDABLE_WITH_INTERNAL_WORK | Med | High | `gmv_max_video_get` |
| C22 | Affiliate authorization | ✅ | ✅ | ✅ | ⚠️ | report `creative_delivery_status=AUTHORIZATION_NEEDED`; `exclusive_authorization` | status ada di report | Alert authorization | BUILDABLE_NOW (M) | Med | High | report filter |
| C23 | Spark Ads / video code | ⚠️ | ⚠️ | ⚠️ | ⚠️ | pipeline manual `gmvmax_boost` | pipeline kode ada (manual) | — | BUILDABLE_WITH_MANUAL_INPUT | Med | High | migrasi 0015 |
| C24 | Custom posts | ✅ | ✅ | ⚠️ | ✅ | `item_list` + `custom_anchor_video_list` | — | UI pilih post | BUILDABLE_WITH_INTERNAL_WORK | Med | Med | create/update schema |
| C25 | Auto-select creative | ✅ | ✅ | ✅ | ✅ | `AUTO_SELECTION` | tersirat | — | BUILDABLE_WITH_INTERNAL_WORK | Low | High | create schema |
| C26 | Accelerate Testing (new videos) | ❌ | ⚠️ | ⚠️ | ❌ | — (derivable dari status LEARNING?) | — | Deteksi via status + waktu | NOT_RELIABLY_BUILDABLE (as feature); MONITOR via status | Med | Low | absen field khusus |
| C27 | **Manual Creative Boost** | ✅ | ✅ | ✅ | ⚠️ | `session_*` (`CREATIVE_NO_BID`) | pipeline manual terpisah | Tracker + create + approval budget besar | BUILDABLE_WITH_INTERNAL_WORK; EXEC = REQUIRE_APPROVAL | Med/High | High | `session_create` |
| C28 | Automatically Generated Images | ⚠️ | ❌ | ❌ | ⚠️ | tersirat (`identity_list` kosong) | — | — | NOT_RELIABLY_BUILDABLE (tak ada status/report) | Low | Low | create schema |
| C29 | **Creative Exclusion** | ✅ | ✅ | ✅ | ✅ | `gmv_max_creative_update` (REMOVE/ADD) + status `EXCLUDED` | — | UI + approval ringan | BUILDABLE_WITH_INTERNAL_WORK | Med | High | `gmv_max_creative_update` |
| C30 | Shop Creative Hub | ❌ | ❌ | ❌ | ❌ | Seller Center | — | — | NOT_RECOMMENDED (Seller Center only) | — | Low | absen API |
| C31 | **Creative status** (In Queue…Unavailable) | ✅ | ✅ | ✅ | n/a | report `creative_delivery_statuses` (9 enum) | status disimpan `gmvmax_creatives.status` | **Status history table** | BUILDABLE_NOW (R/M) | Low | High | report filter enum |
| D32–37 | Video-to-LIVE, LIVE-to-LIVE, Preferred Video, LIVE Creative Boost, Viewer Boost, direct upload | ❌ | ⚠️ | ⚠️ | ❌ | — (report LIVE ada; kontrol tidak) | — | Rekomendasi saja | RECOMMENDATION_ONLY / REQUIRES_OFFICIAL_API | Med | Med | absen endpoint LIVE-boost |
| D38 | LIVE session reporting | ✅ | ✅ | ✅ | n/a | report dim `room_id`,`duration` | — | UI LIVE report | BUILDABLE_WITH_INTERNAL_WORK | Low | High | report dim |
| E39 | One-click GMV Max creation | ✅ | n/a | ✅ | ✅ | `campaign_gmv_max_create` | — | Wizard + approval | BUILDABLE_WITH_INTERNAL_WORK; REQUIRE_APPROVAL | High | High | create schema |
| E40 | Open Collaboration integration | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `affiliate_posts_enabled` + video_get | — | — | BUILDABLE_WITH_INTERNAL_WORK | Med | Low | create schema |
| E41 | Affiliate creative supply monitoring | ✅ | ✅ | ✅ | n/a | `gmv_max_video_get` + report | akun kreator via report | Supply dashboard | BUILDABLE_WITH_INTERNAL_WORK | Low | High | `gmv_max_video_get` |
| E42 | Affiliate authorization monitoring | ✅ | ✅ | ✅ | n/a | report status | ada | Alert | BUILDABLE_NOW (M) | Low | High | report filter |
| F43–46 | Campaign/Product/Creative/LIVE reporting | ✅ | ✅ | ✅ | n/a | `gmv_max_report_get` (semua dim) | creative-level tersimpan | Tambah campaign/LIVE view | BUILDABLE_NOW | Low | High | report dims |
| F47 | Target ROI vs Max Delivery reporting | ✅ | ✅ | ✅ | n/a | session + report join | — | Join mode↔performa | BUILDABLE_WITH_INTERNAL_WORK | Low | Med | `session_*`+report |
| F48 | Budget change history | ✅ | ✅ | ✅ | n/a | diff `campaign_gmv_max_info_get` harian | diff antar-hari ada | — | BUILDABLE_NOW | Low | High | `campaignSettings.mjs` |
| F49 | Feature activation history | ✅ | ✅ | ✅ | n/a | Feature Registry (baru) | sebagian di `0020` | **Registry** (§7) | BUILDABLE_WITH_INTERNAL_WORK | Low | High | migrasi 0020 |
| F50 | Creative status history | ✅ | ✅ | ✅ | n/a | report status per hari | snapshot harian status | Tabel history | BUILDABLE_WITH_INTERNAL_WORK | Low | High | `gmvmax_creatives` |
| F51 | Attribution analysis | ⚠️ | ⚠️ | ⚠️ | n/a | report roi + residual `-1` | rekonsiliasi -1 ada | — | BUILDABLE_WITH_INTERNAL_WORK (batas §8) | Med | Med | `apiGmvMax.js`, `reconcile.mjs` |
| F52 | Incremental GMV estimation | ❌ | ❌ | ⚠️ | n/a | — (tak ada holdout) | — | Butuh eksperimen | DATA_UNAVAILABLE (§8) | High | Med | tak ada baseline paid/organik |
| F53 | Contribution profit estimation | ⚠️ | ⚠️ | ✅ | n/a | report revenue + HPP `calc_products` | harga jual/modal ada | Mapping SPU↔kode | BUILDABLE_WITH_MANUAL_INPUT | Med | Med | `calc_products`, matching |
| F54 | Creative experiment tracking | ⚠️ | ⚠️ | ✅ | n/a | report per-hari + session | pipeline boost manual | **Experiment tracker** (§6) | BUILDABLE_WITH_INTERNAL_WORK | Med | Med | §6 |
| F55 | Manual Boost performance tracking | ✅ | ✅ | ✅ | n/a | `session_*` + report | boost dates ada (0018) | Join boost↔performa | BUILDABLE_WITH_INTERNAL_WORK | Low | High | migrasi 0018, `session_get` |
| F56 | H+1/H+3/H+7 post-boost eval | ✅ | ✅ | ✅ | n/a | snapshot harian + boost_start | snapshot harian ADA | Window evaluator | BUILDABLE_NOW (data cukup) | Low | High | `gmvmax_imports.snapshot_date`, `boost_start` |

---

## 5. Mapping ke 9 Skills

Skill **9 = satu-satunya penghasil final action** (REQUIRE_APPROVAL / SAFE_TO_EXECUTE / DO_NOT_EXECUTE).
Skill 1–8 hanya keluarkan **Facts / Findings / Diagnosis / Risks / Recommendations / Confidence / Missing data**.

| Skill | Fitur yang dipetakan | Sumber data | Output |
|---|---|---|---|
| **1. Business & Data Blueprint** | Store/campaign/product inventory (A1–4), store eligibility, feature registry (F49) | `gmv_max_store_list_get`, `campaign_get`, `store_product_get` | Facts: peta tenant→store→campaign→SPU |
| **2. Attribution & Incrementality Audit** | F51, F52, F53, residual `-1` | report roi, reconcile, `calc_products` | Findings + **confidence** (incremental = LOW/DATA_UNAVAILABLE) |
| **3. Daily GMV Max Control Tower** | F43–50, A11, C31, status kreatif | snapshot harian + campaign settings | Facts harian + drift/anomali |
| **4. Root Cause Diagnosis** | F51, C31, trend, kill/watch | rollup + status + diff | Diagnosis (why ROAS turun) |
| **5. Target ROI & Optimization-Mode Engine** | A5, A6, A7, A13, F47 | `bid_recommend`, session, info | Recommendation Target ROI/mode + risiko |
| **6. Capital Allocation Engine** | A8, A10, A11, budget history F48 | budget/auto_budget/promotion_days | Recommendation realokasi budget |
| **7. Creative & Affiliate Supply Engine** | C18–29, C31, E40–42, F54–56 | `gmv_max_video_get`, report status, session | Recommendation boost/exclusion/supply |
| **8. LIVE GMV Max Growth Engine** | A2, D32–38 | report(room_id); *kontrol LIVE terbatas* | Recommendation LIVE (banyak RECOMMENDATION_ONLY) |
| **9. Daily Action Plan Orchestrator** | Konsolidasi 1–8 → aksi | semua di atas | **Final action** + status keputusan |

**Status keputusan (enum wajib) yang dikeluarkan hanya oleh Skill 9:**
`OBSERVE` · `RECOMMEND` · `REQUIRE_APPROVAL` · `SAFE_TO_EXECUTE` · `DO_NOT_EXECUTE`.

**Aturan risiko (default `REQUIRE_APPROVAL`, tak boleh auto):** Max Delivery (A7), Auto Budget Increase (A10),
perubahan Target ROI besar (A5), Viewer Boost (D36), Creative Boost budget besar (C27), perubahan budget besar
(A11), perubahan produk campaign (A4), pause/terminate campaign (A1/A12).

---

## 6. Data Availability Matrix (field kritis)

| Field | Needed by | Available now | Source | Reliability | Refresh | Fallback | Block? |
|---|---|---|---|---|---|---|---|
| cost / gross_revenue / orders / roi (roas) | Skill 2,3,4 | ✅ | MCP report | High | Harian (worker) | xlsx manual | Non-block |
| impressions/clicks/CTR/CVR/view-rate | Skill 4,7 | ✅ | MCP report creative | High | Harian | xlsx | Non-block |
| creative_delivery_status (9 enum) | Skill 3,4,7 | ✅ (kolom `status`) | MCP report filter | High | Harian | — | Non-block |
| budget / roas_bid / auto_budget / promotion_days / roi_protection_enabled | Skill 5,6 | ✅ (`0020`, sebagian) | `campaign_gmv_max_info_get` | High | Harian (worker) | manual | Non-block (worker cutover) |
| recommended roas_bid + budget | Skill 5,6 | ❌ belum ditarik | `gmv_max_bid_recommend_get` | High | On-demand | — | Non-block |
| Max Delivery / Creative Boost session (budget, jadwal) | Skill 5,7, F55 | ❌ belum ditarik | `session_list_get` | High | Harian | — | Non-block |
| room_id / LIVE metrics | Skill 8 | ❌ belum dipisah | report dim `room_id` | Med | Harian | — | Non-block |
| SPU↔nama produk / HPP (COGS) | Skill 2,6 (profit) | ⚠️ (`calc_products`, matching lemah) | internal + manual | Med | Manual | input manual | **Blocking utk profit** |
| Paid vs organik/affiliate revenue split | Skill 2 (incremental) | ❌ | — | **DATA_UNAVAILABLE** | — | eksperimen holdout | **Blocking utk incremental** |
| Commission Savings / ROI-protection credit | Skill 6 | ❌ | Seller Center | Low | Manual | file import | Non-block (nice-to-have) |
| store_id per koneksi | semua (filter campaign) | ⚠️ (`0021`, mungkin belum applied) | `tiktok_connections.store_id` | High | — | `gmv_max_store_list_get` | **Blocking utk multi-tenant sync** |

---

## 7. Architecture Gap Analysis

| Area | Ada? | Gap | Prioritas |
|---|---|---|---|
| **Database** | ✅ kuat | Belum ada: feature registry, creative status history, experiment tracker, decision/approval | High |
| **Multi-tenant isolation** | ✅ RLS | `store_id` per koneksi (0021 mungkin belum applied); worker single-tenant hardcode `DEFAULT_ADVERTISER` | High |
| **Background sync** | ⚠️ shadow | Belum cutover; belum data-driven multi-workspace (`worker.mjs:24` hardcode) | **Critical** |
| **MCP gateway** | ✅ provider deterministik | Read-only path saja; belum ada write-gateway ber-approval | High (utk EXEC) |
| **Feature registry** | ❌ | Bangun (§ berikut) | High |
| **Creative history** | ⚠️ (status per snapshot) | Belum tabel history khusus + transisi | Med |
| **Optimization-mode history** | ⚠️ (diff setting) | Belum poll `session_list` | Med |
| **Recommendation engine** | ✅ rule-based | Belum ada enum status keputusan, confidence, missing-data, 9-skill separation | High |
| **Approval workflow** | ❌ | Bangun (Phase 5) | High (blocker EXEC) |
| **Audit log** | ⚠️ (`action_log` manusia, `sync_runs` worker) | Belum audit eksekusi API (siapa/kapan/payload/hasil) | High (blocker EXEC) |
| **Security** | ⚠️ | Token plaintext; proxy Vercel terbuka; belum reset password | High (menuju SaaS/EXEC) |
| **Observability** | ⚠️ | Log worker bagus; app tanpa APM; `sync_runs` dasar bagus | Med |
| **UI** | ✅ konsisten | Belum: registry view, sync status, approval inbox, experiment board, LIVE view | Med |

---

## 8. Recommended Architecture (realistis, tidak over-engineered)

Pertahankan pola yang sudah ada (worker→DB→dashboard) dan **tambah lapisan tipis**, bukan menulis ulang.

```
Per-tenant koneksi (tiktok_connections: token per-workspace, store_id)   [RLS owner]
        │  service_role, per-workspace, data-driven (bukan hardcode)
        ▼
Worker sync (src/gmvmax, deterministik)  ── READ MCP gmv_max/* ──►  TikTok
        │   • report (campaign/product/creative/LIVE/status)
        │   • campaign info + session_list (mode/boost)
        │   • bid_recommend (on-demand)
        ▼  tulis via RPC atomik (kontrak zero-data existing)
Supabase Postgres
   ├─ snapshot kanonik (gmvmax_imports/creatives)         [ADA]
   ├─ gmvmax_campaign_settings (budget/roi/auto/promo)    [ADA, perluas]
   ├─ gmvmax_feature_registry   (§ registry)              [BARU]
   ├─ gmvmax_creative_status_history                      [BARU]
   ├─ gmvmax_experiments (H+1/H+3/H+7)                    [BARU]
   ├─ gmvmax_sync_runs (observability)                    [ADA 0021]
   ├─ gmvmax_recommendations (facts+diagnosis+confidence) [BARU]
   └─ gmvmax_action_queue + gmvmax_action_audit (approval)[BARU, Phase 5]
        ▲                                   │
        │ dashboard baca DB (TAK live-call) │ approval UI → write-gateway
        ▼                                   ▼
   9 Skills (1–8 baca; 9 orchestrate)   Write-Gateway (service_role, ber-approval)
                                             └─ EXEC MCP: update/session/creative_update/status
```

**Prinsip yang dikunci:** dashboard tak pernah live-call MCP; token tak pernah ke browser; token per-tenant;
setiap tulis-ke-TikTok wajib lewat write-gateway ber-approval + audit; eksekusi berisiko `REQUIRE_APPROVAL`.

**Feature Registry (rekomendasi struktur — sesuai usulan, dengan penyesuaian):**
Struktur usulan **tepat**; tambahkan `advertiser_id` dan pertahankan `raw`/`metadata` jsonb.
```
workspace_id, brand_id?, store_id, campaign_id, feature_code,
availability_status (AVAILABLE|ENABLED|ACTIVE|INACTIVE|NOT_AVAILABLE|ROLLOUT_LIMITED|UNKNOWN|DATA_UNAVAILABLE),
enabled bool, active bool,
source (MCP|OFFICIAL_API|SELLER_CENTER|FILE_IMPORT|BROWSER_EXTENSION|MANUAL_INPUT|DERIVED),
confidence (HIGH|MEDIUM|LOW|DATA_UNAVAILABLE),
first_detected_at, last_detected_at, metadata jsonb
```
`feature_code`: TARGET_ROI, MAX_DELIVERY, AUTO_BUDGET_INCREASE, PROMOTION_DAYS, ROI_PROTECTION,
COMMISSION_SAVINGS, ACCELERATE_NEW_VIDEO_TESTING, CREATIVE_BOOST, AUTO_GENERATED_IMAGES,
CREATIVE_EXCLUSION, PREFERRED_VIDEO, LIVE_CREATIVE_BOOST, VIEWER_BOOST.
**Sumber per feature_code** ditentukan §3 (mis. ROI_PROTECTION source=MCP tapi hanya READ →
availability_status bisa ENABLED, tapi tak ada jalur EXECUTE). Registry **belum ada** di codebase; `0020`
menutup sebagian (campaign settings) tapi bukan per-feature. → **Bangun registry (tepat, tidak duplikatif).**

**Creative Experiment Tracker (F54):** struktur field yang diusulkan **layak**, dengan catatan sumber:
- Dari MCP report + session: `creative_id(item_id)`, `campaign_id`, `product_id(SPU)`, `budget`,
  `actual_cost`, `status_before/after`, `paid_impressions`, `paid_product_clicks`, `paid_ctr`,
  `ad_conversion_rate`, `orders`, `gross_revenue`, `target_roi`. → **tersedia**.
- `experiment_type` (Accelerated/Manual Boost/AI Images/LIVE Boost) → sebagian **DERIVED/manual**
  (Accelerated & AI Images tak punya sinyal API bersih).
- `organic_orders_before` → **DATA_UNAVAILABLE** (tak ada split paid/organik). Isi manual atau kosongkan.
- `result_h1/h3/h7`, `final_classification` → **DERIVED** dari snapshot harian (data ADA).
- `target_cpo` → derivable (budget/target orders) → OK.
→ Klasifikasi: **BUILDABLE_WITH_INTERNAL_WORK**; sebagian field **BUILDABLE_WITH_MANUAL_INPUT**.

### Attribution & Financial Logic (jujur, dengan confidence)
| Metrik | Bisa dihitung? | Confidence | Catatan |
|---|---|---|---|
| Dashboard ROI (roas) | Ya | **HIGH** | `roi` API = revenue/cost |
| Estimated Paid ROI | Tidak murni | **DATA_UNAVAILABLE** | GMV Max mencampur paid+organik+affiliate; residual `-1` ~52% cost/57% omzet di sampel |
| Incremental GMV | Tidak | **DATA_UNAVAILABLE** | Butuh holdout/eksperimen; tak ada baseline |
| Incremental MER | Tidak | **DATA_UNAVAILABLE** | idem |
| Contribution Profit | Ya, bersyarat | **MEDIUM** | Perlu HPP/COGS (`calc_products`) + mapping SPU↔kode (lemah) |
| Break-even ROI / Target CPO | Ya | **MEDIUM** | Dari COGS + fee (fee hardcoded) |
| Max budget exposure | Ya | **HIGH** | budget × increase_limit × pct (dari `auto_budget`) |
| ROI Protection eligibility | Tidak | **DATA_UNAVAILABLE** | Tak ada di API |
| Creative Boost / Max Delivery cost | Ya | **HIGH** | session budget + report actual_cost |
| Viewer Boost cost | Tidak | **DATA_UNAVAILABLE** | Tak ada endpoint |

> **Aturan tegas:** jangan pernah menampilkan "Estimated Paid ROI" seolah pasti. Paid tidak dapat
> dipisahkan bersih dari organik+affiliate dalam data GMV Max. Tandai `DATA_UNAVAILABLE`/`LOW`.

---

## 9. Build Phases

| Phase | Scope | Dependencies | Deliverables | Risks | Exit criteria |
|---|---|---|---|---|---|
| **0 — Feasibility & contracts** | Verifikasi per-tenant scope MCP; capture sampel respons; sepakati enum status keputusan & aturan risiko | MCP token per-tenant | Verification report (§11) + kontrak field terkunci | Scope token tenant beda | `gmv_max_store_list_get` OK ≥2 tenant; sampel report/info/session tersimpan |
| **1 — Feature registry** | Tabel + worker isi registry dari campaign_info/store_list/report | Phase 0 | `gmvmax_feature_registry` + writer + UI | Allowlist per tenant | Registry terisi untuk 13 feature_code, confidence benar |
| **2 — Read-only monitoring (cutover)** | **Cutover worker sync** multi-tenant data-driven; tambah campaign/LIVE/status view; budget & status history | store_id per koneksi; RPC atomik (ada) | Sync harian hidup + Control Tower + `sync_runs` | Cutover lama vs baru | 7–14 hari parity MATCH; upload manual jadi fallback |
| **3 — Creative experiment tracker** | H+1/H+3/H+7 evaluator; join boost/session↔performa | Phase 2 | `gmvmax_experiments` + board | Field manual (organic_before) | Experiment auto-klasifikasi dari snapshot |
| **4 — Recommendation engine (9 skills)** | Pisahkan rule-engine jadi Skill 1–8 (facts/diagnosis/confidence/missing-data); Skill 9 orchestrate | Phase 2–3 | `gmvmax_recommendations` + status keputusan | Over-recommend | Setiap rekomendasi punya confidence + missing-data |
| **5 — Approval workflow** | Action queue + approval inbox + audit; write-gateway (masih kosong) | Phase 4 | `gmvmax_action_queue/_audit` + UI approve | Salah aksi | Aksi berisiko wajib approve; audit lengkap |
| **6 — Limited execution** | Aktifkan write-gateway utk aksi reversibel dulu: Creative Exclusion, budget kecil, set Target ROI (via approval) | Phase 5 + security hardening | EXEC terbatas + rollback | Akun/uang | Dry-run→approve→execute→verify loop terbukti |
| **7 — Advanced automation** | SAFE_TO_EXECUTE utk aksi rendah-risiko dgn guardrail; auto-realokasi budget kecil | Phase 6 stabil | Automation ber-guardrail | Runaway budget | Circuit breaker + batas harian terbukti |

---

## 10. MVP Recommendation

**Masuk MVP (nilai operasional tertinggi, data sudah ada, risiko rendah):**
1. **Cutover read-only sync multi-tenant** (Phase 2) — menghapus upload manual harian = value inti.
2. **Target ROI monitoring** + **Recommended ROI** (`bid_recommend`) + **Budget monitoring** + history.
3. **Max Delivery tracking** + **Promotion Days** status (dari `session_list` + campaign info).
4. **Creative status** (9 enum) + **status history** + alert `AUTHORIZATION_NEEDED`.
5. **Manual Boost tracker** + **H+1/H+3/H+7 post-boost eval** (snapshot harian sudah ada).
6. **Root Cause Diagnosis** + **Daily Action Plan** (perluas rule-engine existing → enum status keputusan).
7. **Feature Registry** (fondasi semua skill).

**Ditunda (pasca-MVP):**
- Semua **EXECUTE** (Phase 5–7): tunggu approval workflow + security hardening.
- **LIVE control** (Viewer Boost/Creative Boost/Preferred/Video-to-LIVE) → RECOMMENDATION_ONLY.
- **Incremental GMV/MER**, **Estimated Paid ROI** → DATA_UNAVAILABLE, jangan dipaksakan.
- **Commission Savings / ROI-protection credit** → file import nanti.
- **Contribution profit** → tunggu mapping SPU↔HPP dirapikan.

---

## 11. Hard Blockers

1. **Worker sync belum cutover** — jantung "OS" (data segar harian). Tanpa ini semua monitoring
   bergantung upload manual. **VERIFIED** (`worker.mjs:1-3`).
2. **Multi-tenant sync belum data-driven** — `DEFAULT_ADVERTISER` hardcode; `store_id` per koneksi (0021)
   mungkin belum applied. Tanpa store_id, `gmv_max_report_get` tak bisa difilter. **VERIFIED/UNKNOWN**.
3. **Scope MCP per-tenant = UNKNOWN** — bila token tenant tak punya GMV Max scope / bukan exclusive-authorized,
   seluruh jalur mati untuk tenant itu. Harus dicek `gmv_max_store_list_get` per tenant.
4. **Tak ada approval workflow + audit eksekusi** — blocker mutlak sebelum EXEC apa pun.
5. **Security**: token plaintext + proxy Vercel terbuka + tanpa reset password — blocker menuju EXEC/SaaS.
   **VERIFIED** (`PRODUCT_CONTEXT §16.3–16.4`).
6. **Fitur allowlist-only** (Auto Budget Increase di sebagian jalur, `promotion_days.roas_bid_multiplier`) —
   ketersediaan per advertiser tak dijamin. **VERIFIED** (schema create/update).
7. **Incremental/Paid-ROI**: tak ada data pemisah paid/organik → tak reliable. **VERIFIED** (schema report).

---

## 12. Unknowns & Verification Plan

| Unknown | Cara verifikasi | Metode |
|---|---|---|
| Scope GMV Max token tiap tenant | `gmv_max_store_list_get(advertiser_id)` per koneksi | **MCP inspection** (read-only, live call) |
| Metrik pasti tiap report level (nama field) | 1 call `gmv_max_report_get` per level, simpan JSON | **API response capture** |
| Auto Budget Increase / roas_bid_multiplier allowlisted? | `campaign_gmv_max_info_get` (baca auto_budget); coba update dry (jangan commit) | **MCP inspection** |
| `session_list` benar berisi Max Delivery + Creative Boost aktif | `campaign_gmv_max_session_list_get` per campaign aktif | **API capture** |
| `store_id` sudah tersimpan di `tiktok_connections`? (0021 applied?) | Query tabel di Supabase | **Manual test (SQL)** |
| Late-arriving data drift (attribution window) | Bandingkan snapshot hari-sama beberapa waktu | **Controlled experiment** (sudah sebagian, DESIGN.md) |
| Commission Savings / ROI-protection credit lokasi | Cek export Seller Center | **Seller Center export** |
| Creative status transisi (LEARNING→DELIVERING) untuk "Accelerate Testing" | Amati status harian video baru | **Controlled experiment** |
| Paid vs organik dapat dipisah? | Inspeksi seluruh metric enum report | **API capture** (diperkirakan tidak) |

> Semua verifikasi live-call bersifat **read-only** dan butuh `advertiser_id` tenant nyata + izin.
> **Tidak dilakukan di audit ini** (read-only, tanpa memicu panggilan berbayar/tenant).

---

## Final Verdict

```
VERDICT: PARTIALLY_BUILDABLE
(Kuat di READ/MONITOR/RECOMMEND; EXECUTE terbatas & bertahap dengan approval.)

BUILDABLE NOW (data + infra tersedia):
- Reporting campaign/product/creative/LIVE + status kreatif (9 enum)   [gmv_max_report_get]
- Target ROI / Budget / Auto-budget / Promotion-days monitoring + history [campaign_gmv_max_info_get]
- Recommended ROI                                                       [gmv_max_bid_recommend_get]
- Max Delivery & Manual Boost tracking + optimization-mode history      [session_list_get]
- H+1/H+3/H+7 post-boost evaluation (snapshot harian sudah ada)
- Root-cause diagnosis + rule-based recommendation + daily action plan  [existing engine]
- Feature registry + budget/status change history

REQUIRES MANUAL INPUT / FILE IMPORT:
- Contribution profit (HPP/COGS + mapping SPU↔kode)
- Commission Savings, ROI Protection credit history
- experiment_type & organic_orders_before pada experiment tracker

REQUIRES MCP / OFFICIAL API (bergantung scope + allowlist per tenant):
- Semua reporting & seluruh EXECUTE (create/update/session/creative_update/status)
- Auto Budget Increase & promotion_days multiplier (allowlist-only)

MONITOR-ONLY (baca via API, eksekusi hanya di Seller Center/Ads Manager):
- ROI Protection (roi_protection_enabled READ), affiliate authorization status

NOT RECOMMENDED / NOT RELIABLY BUILDABLE:
- Viewer Boost, LIVE Creative Boost, Preferred Video, Video-to-LIVE/LIVE-to-LIVE, Mega LIVE (tak ada endpoint)
- Automatically Generated Images, Shop Creative Hub, Accelerate Testing sebagai fitur (tak ada sinyal API)
- Incremental GMV / Estimated Paid ROI (DATA_UNAVAILABLE — paid tak terpisah dari organik/affiliate)
- Eksekusi otomatis tanpa approval untuk aksi berisiko; scraping Seller Center sebagai default

FIRST IMPLEMENTATION STEP (paling aman, read-only):
Phase 0 — jalankan `gmv_max_store_list_get` + 1 sampel `gmv_max_report_get` & `campaign_gmv_max_info_get`
& `campaign_gmv_max_session_list_get` per tenant nyata untuk MEMBUKTIKAN scope + bentuk field,
lalu bangun Feature Registry (Phase 1) dan cutover worker read-only multi-tenant (Phase 2).
Belum menyentuh satu pun endpoint tulis.
```

---

### Aturan yang dipatuhi audit ini
Tidak mengarang endpoint/field/capability MCP (semua dari `tool_list`/`tool_get`). Membedakan Seller Center vs
Ads Manager vs MCP vs derived. Menyertakan path file & nama tool untuk klaim penting. Asumsi dinyatakan eksplisit.
Memakai `UNKNOWN`/`DATA_UNAVAILABLE` saat tak pasti. Tidak menjadikan scraping jawaban default. Tidak mengubah
kode/DB/migrasi/config. Tidak commit. Tidak push.
