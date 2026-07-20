# GMV Max — Phase 2: Multi-Tenant Read-Only Shadow Worker (Design)

> **Status: PREPARATION + SHADOW VALIDATION. OFF BY DEFAULT. Belum cutover.**
> Read-only terhadap TikTok (0 endpoint mutasi). Worker lama tetap shadow-only &
> tak berubah. Tanggal: **2026-07-20**. Tidak commit/push sampai review.
>
> Modul baru (semua ADITIF, tak menyentuh worker.mjs/vpsShadow.mjs/vpsCommit.mjs):
> `src/gmvmax/multiTenant.mjs` (orkestrator), `multiTenantShadow.mjs` (entrypoint,
> di-gate flag), `multiTenantParity.mjs` (parity tooling), `multiTenant.test.mjs`
> (20 skenario), migrasi `0023_gmvmax_sync_runs_shadow.sql` (aditif, **belum di-apply**).

## 1. Current Worker Architecture (audit)

| Aspek | Kondisi sekarang | Bukti |
|---|---|---|
| Discovery tenant | **Hardcode** `DEFAULT_ADVERTISER='7313…090'` + registry `advertisers.mjs` (3 entri). Ada jalur data-driven `connections.mjs` (`loadEligibleConnections`) tapi baru dipakai commit via `GMVMAX_TENANT_SOURCE=connections`. | `worker.mjs:24,74`, `vpsCommit.mjs`, `connections.mjs` |
| Token per-workspace | `loadMcpTokenFromSupabase({workspaceId})` baca `tiktok_connections`, self-refresh + writeback. service_role (bypass RLS). | `providers/supabaseTokenStore.mjs` |
| service_role | Dipakai worker (read + write kanonik). Env `SUPABASE_SECRET_KEY`/`SERVICE_ROLE`. | `vpsCommit.mjs`, `runtime/env.mjs` |
| store_id | Dari registry (`advertisers.mjs`) atau `tiktok_connections.store_id` (migrasi 0021). | `advertisers.mjs`, `0021` |
| Observability | `gmvmax_sync_runs` (0021) via `recordSyncRun` (commit) / `shadowStore` disk (shadow). | `vpsCommit.mjs`, `shadowStore.mjs` |
| Isolasi kegagalan | **Sudah ada** di commit: `processWorkspace` tak pernah throw → `{ok,...}`; 1 workspace gagal ≠ batch batal. Shadow single-tenant. | `vpsCommit.mjs`, `vpsShadow.mjs` |
| Normalisasi | Deterministik: `engine.runSync` (full pagination, fail-explicit) + `reconcile.mjs` + `apiGmvMax.js`. | `engine.mjs` |
| Persistensi | Kanonik via RPC atomik `gmvmax_replace_snapshot` (0017). Registry via `persistRegistry` (Phase 1). | `writer.mjs`, `featureRegistryWriter.mjs` |
| Yang mencegah multi-tenant shadow | (a) `vpsShadow.mjs` masih single-tenant (`DEFAULT_ADVERTISER`); (b) tak ada penjadwalan registry di shadow; (c) registry (Phase 1) belum diintegrasikan ke worker. | — |
| Bisa 1 tenant menjatuhkan semua? | Commit: **tidak** (isolasi). Shadow single-tenant: N/A. | `vpsCommit.mjs` |

**Kesimpulan audit:** fondasi (token per-tenant, isolasi, engine, registry) sudah ada & matang. Yang
kurang: **orkestrator SHADOW multi-tenant yang menyatukan registry + snapshot shadow + observability,
data-driven, off-by-default** — itulah Phase 2 ini.

## 2. Target Multi-Tenant Architecture

```
tiktok_connections (service_role read)  ── discoverConnections ──► classify per-koneksi
        │                                                          (CANDIDATE | *_MISSING | TOKEN_* …)
        ▼ (untuk tiap CANDIDATE, konkurensi 1 + jeda antar-tenant)
providerFactory(conn) → TikTokMcpProvider(token per-workspace, self-refresh)   [READ-ONLY]
        ▼
runTenantShadow(conn, deps):
   1) fetchRegistryInputs → GATE store_list → buildRegistry (Phase 1, read-only)
   2) persistRegistry (idempoten, tenant-scoped)                 [registry: write]
   3) jika tak eligible → STOP (status khusus), NOL panggilan hilir
   4) (opsional --with-canonical) engine.runSync → snapshot NEW + parity vs OLD (SELECT), TANPA tulis kanonik
   5) (opsional --with-settings) fetchCampaignSettings → persist (tabel non-kanonik)
   6) recordShadowRun → gmvmax_sync_runs (mode=SHADOW)           [audit: write]
        ▼
batch summary (isolasi: 1 tenant gagal ≠ tenant lain)
```

Semua konteks (`workspace_id, connection_id, advertiser_id, store_id`) dialirkan **eksplisit per-argumen**.
**Tidak ada state advertiser global mutable** (berbeda dari `DEFAULT_ADVERTISER`).

## 3. Connection Discovery (`multiTenant.mjs`)

`discoverConnections(rows)` mengklasifikasi tiap baris `tiktok_connections` (Part 2):
`CANDIDATE` · `CONNECTION_MISSING` · `CONNECTION_INACTIVE` · `ADVERTISER_MISSING` · `STORE_MISSING` ·
`TOKEN_MISSING` · `TOKEN_EXPIRED` (expired + tanpa refresh_token) · `PERMISSION_DENIED` · `UNKNOWN`.
Hanya `CANDIDATE` yang lanjut ke gate. Yang ditolak tetap direkam (skip, **tanpa** panggilan MCP).
**Token tak pernah muncul di return/log** (hanya boolean presence dipakai).

## 4. Eligibility Gate (Part 3)

Untuk tiap CANDIDATE, panggilan MCP **pertama** = `gmv_max_store_list_get` (via `fetchRegistryInputs`
Phase 1). Semantik identik Phase 1: `ELIGIBLE` · `NOT_AVAILABLE` · `AUTHORIZATION_MISMATCH` ·
`PERMISSION_DENIED` · `STORE_NOT_FOUND` · `CONNECTION_MISSING` · `UNKNOWN` · `DATA_UNAVAILABLE`.
- **Eligible** → lanjut pipeline penuh.
- **Tak eligible** → `persistRegistry` menulis **hanya** record tenant (mis. 4 record AUTHORIZATION_MISMATCH),
  lalu **STOP** — **NOL** panggilan campaign/report/session/identity/product (dibuktikan test #6: call
  trace `["gmv_max_store_list_get"]`).
- **store_list gagal transport** → `DATA_UNAVAILABLE`/`PERMISSION_DENIED` → status hasil `API_ERROR`/`PERMISSION_DENIED`.
Ekspektasi saat ini (Phase 0): TENANT-A → ELIGIBLE; TENANT-B → AUTHORIZATION_MISMATCH.

## 5. Tenant Context Propagation

Tak ada singleton/global. `runTenantShadow(conn, {provider, sb, date, authorizedAdvertiserIds, deps})`
menerima konteks per-argumen; `persistRegistry` men-`stamp` `workspace_id`/`user_id`/`connection_id` ke
tiap record + `assertWorkspaceScope` (guard selain RLS). `authorizedAdvertiserIds` di-resolve **per-tenant**
(`auth_advertiser_get` atas provider tenant itu) karena bersifat per-token. Dibuktikan test #7/#8: baris
WS-A hanya ber-store STORE-A, tak ada kebocoran lintas-workspace.

## 6. Failure Isolation (Part 5)

`runTenantShadow` **tak pernah throw** → selalu kembalikan objek hasil. `runAllTenantsShadow` juga
membungkus `providerFactory` (token gagal → `TOKEN_FAILED`) dan menaruh jaring pengaman terakhir.
Status per-tenant: `SUCCESS` · `PARTIAL_SUCCESS` · `SKIPPED_NOT_ELIGIBLE` · `AUTHORIZATION_MISMATCH` ·
`PERMISSION_DENIED` · `API_ERROR` · `NORMALIZATION_ERROR` · `PERSISTENCE_ERROR` · `DATA_INCOMPLETE` ·
`TOKEN_FAILED` · `SKIPPED_INVALID_CONNECTION`. Tiap hasil membawa: workspace_id, connection_id,
advertiser_id/store_id (**diredaksi di log** via `maskId`), started/finished/duration, callsAttempted,
pagesFetched, campaigns/creatives/registry counts, errors, warnings, confidence. **Token tak pernah di-log.**

## 7. Pagination and Retry (Part 6)

- **Full pagination + fail-explicit** diwarisi dari `engine.runSync` (`fetchAllPages`: `pages < total_page`
  → `INCOMPLETE_PAGINATION` throw → status `DATA_INCOMPLETE`; **tak ada silent partial success**).
- **Retry transient + exponential backoff** diwarisi `TikTokMcpProvider` (retry berbatas, cooldown
  rate-limit); error permanen (mis. `RECONCILE_INVARIANT`, `DUPLICATE_ROWS`) → **tidak** di-retry →
  `NORMALIZATION_ERROR`.
- **Konkurensi = 1** + `interTenantDelayMs` (default 3000) → ember rate-limit tt-ads-mcp-layer (dibagi
  semua workspace) tidak ditembak beruntun.
- **Per-tenant timeout** (`GMVMAX_TENANT_TIMEOUT_MS`, default 180000) membungkus fetch/runSync → mencegah
  satu tenant menggantung batch. **Global**: process-level (systemd/cron timeout).
- **Max-page cap eksplisit**: belum ditambahkan di `engine.mjs` (agar tak mengubah jalur commit). Sementara
  dibatasi oleh per-tenant timeout. **Rekomendasi follow-up**: parameter `MAX_PAGES` di `fetchAllPages`
  (aditif, default besar) — lihat §13.

## 8. Feature Registry Integration (Part 7)

**Reuse** (bukan detektor duplikat): `featureRegistryFetch.fetchRegistryInputs` (gate + kumpul input) →
`featureRegistry.buildRegistry` (normalizer) → `featureRegistryWriter.persistRegistry` (idempoten).
Dijalankan **hanya setelah** gate. `last_detected_at` diperbarui tiap run; history hanya saat state
material berubah; tak ada duplikat (unique NULL-safe). Fitur schema-only tetap schema-only;
**`EXECUTE_RUNTIME_VERIFIED` tetap 0** (test #15). Idempotensi lintas-run dibuktikan test #14.

## 9. Observability — `gmvmax_sync_runs` (Part 8)

`recordShadowRun` menulis 1 baris/tenant, `mode='SHADOW'`. **Graceful**: coba kolom kaya (butuh migrasi
0023: `eligibility_status, campaigns_found/processed, creative_rows, live_rows, product_rows, registry_rows,
pages_fetched, warnings, error_code, provider, worker_version, started_at, completed_at, details jsonb`);
bila 0023 **belum di-apply** → fallback kolom dasar 0021 (tak error, test #19b). Membedakan jelas:
eligibility-skip vs API-failure vs incomplete-pagination vs normalization-failure vs persistence-failure
lewat `status` + `error_code`. **Tak menyimpan token/PII/payload API mentah** (hanya ringkasan + counts).

## 10. Shadow Flag (Part 9)

Gate: `GMVMAX_MULTI_TENANT_SHADOW=1` (env). **Berbeda & terpisah dari `GMVMAX_COMMIT`.**
- **Tidak di-set / ≠1** → entrypoint no-op (`MT_SHADOW_DISABLED`, exit 0). Perilaku worker lama tak berubah.
- **=1** → discovery data-driven + pipeline read-only shadow. Menolak jalan bila `GMVMAX_COMMIT=1`
  terdeteksi (sabuk pengaman). Tak menonaktifkan upload manual, tak menyentuh `DEFAULT_ADVERTISER`,
  tak memanggil endpoint tulis TikTok.
Opsi: `--with-canonical` (snapshot shadow + parity, lebih berat), `--with-settings` (setting campaign).

## 11. Parity Methodology (Part 10) — `multiTenantParity.mjs`

Bandingkan A (snapshot kanonik: upload manual/import) vs B (snapshot shadow MCP), per
workspace/tanggal/campaign, **read-only** (tak menimpa kanonik). `classifyMetric(field, old, new)` →
`MATCH` · `ACCEPTABLE_DRIFT` · `LATE_ATTRIBUTION_DRIFT` · `MISSING_IN_API` · `MISSING_IN_IMPORT` ·
`PAGINATION_INCOMPLETE` · `MAPPING_MISMATCH` · `HARD_MISMATCH`. Aturan: `cost`/`net_cost` **immutable**
(beda = HARD_MISMATCH); `gross_revenue`/`orders`/`roi` boleh naik dalam attribution window (B≥A =
LATE_ATTRIBUTION_DRIFT); setting (budget/target ROI/auto-budget/promotion/accelerate) = current-state
(beda = MAPPING_MISMATCH). `buildParityDataset` → distribusi + `matchRate` + `hardMismatchCount`.
Field dibandingkan: cost, net_cost, gross_revenue, orders, ROI, creativeCount, spendingCreativeCount,
product_impressions, product_clicks, CTR, CVR, status distribution, budget, target ROI, auto-budget,
promotion days, accelerate testing. **Status: READY sebagai tooling** (diberi makan snapshot shadow saat
run terkontrol; belum dijalankan atas data live di prep ini).

## 12. Security (Part 12)

| Kontrol | Status |
|---|---|
| Token tak masuk browser | ✅ (jalur worker server-only; browser tak pernah pegang token) |
| Token tak masuk log klien/worker | ✅ `registerSecret` + `safeLog` redaksi; `maskId` untuk advertiser/store |
| service_role server-only | ✅ (env worker; tak ada di bundle browser) |
| Query difilter workspace_id | ✅ `persistRegistry`/`resolveWorkspaceOwner` per workspace; RLS tetap aktif |
| Provider tak reuse lintas tenant | ✅ `providerFactory(conn)` bikin provider baru per-tenant; tak ada global |
| Tak simpan MCP response mentah | ✅ hanya ringkasan/counts ke `sync_runs.details` |
| Ownership koneksi divalidasi | ✅ eligibility gate (exclusive advertiser ∈ authorized) + RLS |
| **Risiko sisa: token plaintext di `tiktok_connections`** | **DIDOKUMENTASIKAN, TIDAK diubah di fase ini** (redesign kredensial di luar scope Phase 2; lihat `PRODUCT_CONTEXT §16.3`). |

## 13. Known Limitations

1. **LIVE room-level reporting** belum ditarik oleh `engine.runSync` (fokus creative/product). Registri
   menangkap ketersediaan LIVE; report room-level = follow-up.
2. **Max-page cap eksplisit** belum di `engine.fetchAllPages` (dibatasi per-tenant timeout). Follow-up aditif.
3. **Parity** = tooling READY, belum dijalankan atas data live (butuh run terkontrol).
4. **Pre-existing**: `apiGmvMax.js` memakai import extensionless (`./parseGmvMax`) → resolve di Vite/bundle
   VPS, **gagal di raw `node --test`** (2 test lama `engine`/`normalize` merah di raw Node). Di luar scope;
   entrypoint shadow **lazy-import** engine agar jalur no-op/registry bebas dari isu ini.
5. **Migrasi 0023 belum di-apply** → audit shadow kaya belum aktif (fallback kolom dasar).
6. Token OAuth website di `tiktok_connections` mungkin belum tervalidasi untuk semua tenant (Connect masih
   diselesaikan) → run live bisa hasilkan `TOKEN_FAILED` (isolasi menangani).

## 14. Cutover Criteria (belum boleh cutover)

Cutover Phase 2 hanya boleh dipertimbangkan setelah SEMUA: (1) 7–14 hari shadow berturut sukses; (2) nol
kontaminasi lintas-tenant; (3) gate eligibility benar untuk tiap koneksi; (4) kelengkapan paginasi terbukti;
(5) parity metrik ≥98% atau drift atribusi terjelaskan; (6) nol hard-mismatch tak terjelaskan; (7) registry
tetap idempoten; (8) observability sync andal; (9) rollback teruji; (10) security review lulus; (11)
**persetujuan eksplisit**.

## 15. Rollback Strategy

- **Instan**: unset `GMVMAX_MULTI_TENANT_SHADOW` (atau ≠1) → entrypoint no-op; worker lama tak tersentuh.
- **Kode**: modul baru aditif & terisolasi → hapus/abaikan file `multiTenant*.mjs` tak berdampak ke worker.
- **DB**: jalur shadow **tak menulis kanonik** → tak ada yang perlu di-rollback pada `gmvmax_imports/creatives`.
  `gmvmax_feature_registry` idempoten (re-detect menimpa state, history append-only — bisa di-`delete`
  per-workspace bila perlu). `gmvmax_sync_runs` = append-log (bisa di-prune per mode='SHADOW').
- **Migrasi 0023**: aditif; rollback = `alter table … drop column` (opsional) — tak wajib.
- **Penjadwalan**: belum dijadwalkan (tak ada cron/systemd unit untuk entrypoint ini) → tak ada yang perlu
  dimatikan selain flag.

---

## 16. Controlled Shadow Readiness and First Run Result (2026-07-20)

Detail penuh: **`docs/GMV_MAX_PHASE_2_FIRST_SHADOW_RUN.md`**. Ringkas:

- **Hardening selesai:** migrasi 0023 APPLIED_AND_VERIFIED (32 kolom); import extensionless
  `apiGmvMax.js` DIPERBAIKI (`./parseGmvMax.js`) → full suite **127/127 PASS**; **cap paginasi**
  `GMVMAX_MAX_PAGES_PER_REQUEST` (default 200, throw `MAX_PAGES_EXCEEDED`→`DATA_INCOMPLETE`, `INVALID_MAX_PAGES`
  fail-fast) + 6 tes.
- **3 run terkontrol (2 tenant nyata, token per-workspace), semua 2/2 SUCCESS:**
  registry-only → +settings (idempoten, changes 0) → +canonical (42 halaman/403 creative AsterixSty; tanpa
  timeout/cap; **tanpa tulis kanonik**).
- **Temuan:** dengan token milik masing-masing tenant, **Dasfelix `ELIGIBLE`** (Phase-0 `AUTHORIZATION_MISMATCH`
  = artefak token CLI). Token expired Dasfelix **self-refresh** sukses.
- **Parity (07-19, AsterixSty):** totals **MATCH** penuh (cost/rev/orders/ROI); row-level MISMATCH (perlu
  karakterisasi selama gate). **0 HARD_MISMATCH uang agregat.**
- **Isolasi & keamanan:** 0 cross-tenant contamination, 0 EXECUTE_RUNTIME_VERIFIED, tak ada token di
  log/DB, sync_runs kaya terisi. **0 mutasi TikTok, 0 tulisan kanonik, worker default OFF, scheduler NOT_CREATED.**
- **READY untuk periode shadow 7–14 hari.** Belum cutover, belum commit/push.
