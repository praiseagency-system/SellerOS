# GMV Max — Phase 2 Controlled Shadow: First Run Result

> **Read-only terhadap TikTok (0 endpoint mutasi). Tidak menulis snapshot kanonik.
> Tidak scheduling. Tidak commit/push.** Tanggal: **2026-07-20**.
> Alias/redaksi: TENANT-A = AsterixSty (ws `…e2018b`, adv `…9090`, store `…2081`);
> TENANT-B = Dasfelix (ws `…b575d7`, adv `…9480`, store `…8328`). Token tak pernah di-log.

## 1. Executive Summary

Multi-tenant shadow worker dijalankan terkontrol dalam 3 level beban (registry → +settings →
+canonical) untuk **2 tenant nyata**, memakai **token per-workspace** dari `tiktok_connections`.
**Semua run: 2/2 SUCCESS, 0 gagal, 0 kontaminasi lintas-tenant, 0 mutasi TikTok, 0 tulisan kanonik.**

**Temuan besar:** memakai token milik masing-masing tenant, **TENANT-B (Dasfelix) ternyata `ELIGIBLE`**,
bukan `AUTHORIZATION_MISMATCH`. `AUTHORIZATION_MISMATCH` di Phase 0 adalah **artefak token CLI saya**
(yang hanya bisa akses advertiser lama `…817`); koneksi Dasfelix menyimpan advertiser `…9480` (pemegang
exclusive auth) beserta tokennya, sehingga gate lolos. Token Dasfelix yang kedaluwarsa **berhasil
self-refresh**. → Hard-blocker multi-tenant Phase 0 **teratasi oleh desain per-tenant token**.

**Parity (07-19):** totals **MATCH sempurna** (cost/revenue/orders/ROI identik dengan import manual),
tetapi **row-level MISMATCH** (perbedaan per-creative) — perlu dikarakterisasi selama periode gate 7–14 hari.

## 2. Migration 0023 Result

- Direview: **aditif, non-destruktif, idempoten** (hanya `add column if not exists` + 1 index; tak ada
  DROP/TRUNCATE/DELETE/rewrite; tak melemahkan RLS; tak ada grant publik). **Aman.**
- **APPLIED_AND_VERIFIED** (user Run di SQL Editor): `gmvmax_sync_runs` kini **32 kolom** (17 dasar + 15 baru).
  Diverifikasi via service_role: select kolom baru OK; **3 baris lama tetap ada**; **anon → 401**; service_role
  bisa tulis; kolom kaya terisi di run (worker_version, eligibility_status, registry_rows, pages_fetched, details).

## 3. Import Resolution Fix

- **Sebelum:** `src/utils/apiGmvMax.js:32` = `import { parseNum, deriveHook } from './parseGmvMax'`
  (extensionless) → resolve di Vite/bundle VPS tetapi **gagal di raw `node --test`** (ERR_MODULE_NOT_FOUND) →
  `engine.test.mjs` + `normalize.test.mjs` merah di raw Node.
- **Sesudah:** `from './parseGmvMax.js'` (1 baris; satu-satunya import extensionless di rantai). Tak ada
  refactor lain.
- **Hasil:** `engine.test`+`normalize.test` **8/8 PASS** di raw Node; **`vite build` tetap sukses** (jalur
  Vite/VPS-bundle tak terpengaruh — mereka resolve dengan/atau tanpa ekstensi).

## 4. Pagination Cap

- `engine.fetchAllPages` kini menerima cap eksplisit (`resolveMaxPages`, env `GMVMAX_MAX_PAGES_PER_REQUEST`,
  default **200**). Di bawah cap → paginasi penuh seperti biasa. `total_page` > cap → throw typed
  **`MAX_PAGES_EXCEEDED`** (tak truncate diam-diam) → orkestrator → **`DATA_INCOMPLETE`** (bukan SUCCESS,
  tak tulis kanonik). Env tak valid → **`INVALID_MAX_PAGES`** (fail-fast di entrypoint). Retry transient
  tetap di `TikTokMcpProvider`. Perilaku commit worker terjaga (default 200 tak pernah terpicu di data nyata).
- **Tes** (`pagination.test.mjs`): below-cap, tepat-di-cap, di-atas-cap, env-invalid, runaway/total_page
  patologis (dibatasi cap, berhenti tepat di N), propagasi `DATA_INCOMPLETE`. **6/6 PASS.**

## 5. Test Results (gate sebelum run live)

| Suite | Hasil |
|---|---|
| Lint (file baru/ubah) | **exit 0** |
| featureRegistry + multiTenant + pagination + engine + normalize + reconcile | **57/57 PASS** |
| **Full `src/gmvmax/**/*.test.mjs`** | **127/127 PASS, 0 fail** (2 kegagalan lama hilang setelah §3) |
| `vite build` | **PASS** |
| Referensi tool mutasi di kode Phase 2 | hanya di `FORBIDDEN_MUTATION_TOOLS`/negative-assert (bukan panggilan) |
| Worker shadow-only | ya (worker.mjs/vpsShadow/vpsCommit tak diubah, tak diimpor) |

## 6. Connection Discovery

`tiktok_connections` → **2 baris, 0 ditolak**. Keduanya `CANDIDATE` (advertiser+store+access+refresh+client_id lengkap).
- TENANT-A adv `…9090`, token valid (exp 2026-07-21).
- TENANT-B adv `…9480`, token **kedaluwarsa** (exp 08:12Z) → self-refresh sukses + writeback token baru.
Kolom `store_authorized_bc_id` **tak ada** di `tiktok_connections` (bc_id diambil dari respons `store_list`).

## 7. Registry-only Run (Part 6)

`GMVMAX_MULTI_TENANT_SHADOW=1` (tanpa flag lain). **2/2 SUCCESS.**
| Tenant | eligibility | status | registry_records | changes | durasi |
|---|---|---|---|---|---|
| TENANT-A | ELIGIBLE | SUCCESS | 68 | 1 (drift budget intraday) | 19.8s |
| TENANT-B | ELIGIBLE | SUCCESS | 65 | 65 (deteksi pertama ws ini) | 8.7s |
Call trace hilir hanya untuk tenant eligible; discovery→2, rejected→0. Token diredaksi di semua log.

## 8. Settings Run (Part 7)

`--with-settings`. **2/2 SUCCESS, changes 0 (idempoten di DB nyata).** Setting campaign ter-capture:
`gmvmax_campaign_settings` (2026-07-20) = **AsterixSty 13 baris, Dasfelix 4 baris** — memuat budget, roas_bid
(Target ROI), auto_budget (Auto Budget Increase), promotion_days, accelerate_testing, session, dsb.
TENANT-B tetap tenant-scoped; tak ada tulisan kanonik.

## 9. Full Shadow Run (Part 8)

`--with-canonical --with-settings` (date 2026-07-19). **2/2 SUCCESS** (canonical selesai penuh, tanpa timeout,
tanpa MAX_PAGES).
| Tenant | pages | creatives | cost | revenue | orders | parity(row) | status | durasi |
|---|---|---|---|---|---|---|---|---|
| TENANT-A | 42 | 403 | 578.112 | 5.567.938 | 48 | MISMATCH | SUCCESS | 67.7s |
| TENANT-B | (small) | — | — | — | — | MISMATCH | SUCCESS | 92.6s |
Snapshot shadow dihitung `engine.runSync` (full pagination, fail-explicit) dan **TIDAK ditulis ke tabel
kanonik**; parity vs OLD (import manual) = **SELECT read-only**.

## 10. Pagination Results

AsterixSty canonical menarik **42 halaman total** (discovery + per-SPU + per-(campaign,SPU) creative) — jauh
di bawah cap 200. **Tidak ada MAX_PAGES_EXCEEDED, tidak ada INCOMPLETE_PAGINATION.** Paginasi lengkap
terbukti (semua report `pages == total_page`). Runaway dicegah oleh cap (diuji).

## 11. Parity Results (07-19, TENANT-A)

**Totals (agregat) — via `multiTenantParity.classifyMetric`:**
| Field | Import (A) | Shadow (B) | Kelas |
|---|---|---|---|
| cost | 578.112 | 578.112 | **MATCH** |
| gross_revenue | 5.567.938 | 5.567.938 | **MATCH** |
| orders | 48 | 48 | **MATCH** |
| ROI | 9.63 | 9.63 | **MATCH** |

**Row-level (per-creative) — via `compareParity`:** **MISMATCH** (ada `valueDiffs`/`missingIn*` per identity
kreatif). Interpretasi: **agregat rekonsiliasi sempurna**, perbedaan hanya di distribusi per-creative
(kemungkinan late-attribution redistribution atau perbedaan granularitas import xlsx). Diklasifikasikan
sebagai **LATE_ATTRIBUTION_DRIFT / ACCEPTABLE** di level agregat; row-level perlu dikarakterisasi selama
gate 7–14 hari (belum ada HARD_MISMATCH pada uang agregat). **Nilai nol/baris hilang tidak disembunyikan.**

## 12. Tenant Isolation (Part 9)

| Cek | Hasil |
|---|---|
| 1 sync-run/tenant/run | ✅ (5+ baris SHADOW, per tenant/run) |
| workspace_id benar | ✅ |
| advertiser/store scoped benar | ✅ (registry: 0 baris store salah) |
| baris TENANT-A muncul di TENANT-B? | **0** |
| TENANT-B punya campaign/creative snapshot? | tidak (registry saja; canonical TENANT-B ada namun tenant-scoped) |
| registry idempoten | ✅ (run ulang changes 0) |
| EXECUTE_RUNTIME_VERIFIED | **0** |
| token mentah di details/errors/warnings | **tidak ada** (leak scan = false) |
| full MCP response disimpan | tidak (hanya ringkasan/counts) |
| **cross-tenant contamination** | **0** |

## 13. Sync Observability

`gmvmax_sync_runs` mode='SHADOW' terisi per-tenant dengan **kolom kaya** (worker_version=`mt-shadow-0.1.0`,
eligibility_status, registry_rows, pages_fetched, creative_rows, cost/revenue/orders, parity, error_code,
details jsonb). Membedakan jelas: eligibility-skip vs API-failure vs incomplete-pagination vs
normalization vs persistence. **Tidak ada token/PII/payload mentah** tersimpan.

## 14. Security Review

Token tak masuk log (registerSecret + redaksi; advertiser/store di-`maskId`). service_role server-only.
Query difilter `workspace_id` + RLS aktif (anon→401 terverifikasi). Provider dibuat **per-tenant**
(`providerFactory(conn)`) → tak ada reuse lintas-tenant. **Catatan:** self-refresh menulis token baru ke
`tiktok_connections` (rotasi normal, bukan kanonik/upload). **Risiko sisa:** token plaintext di
`tiktok_connections` — **didokumentasikan, tak diubah** (redesign kredensial di luar scope).

## 15. Defects Found

1. **Pre-existing extensionless import** (`apiGmvMax.js`) — **DIPERBAIKI** (§3), non-invasif.
2. **`gmvmax_sync_runs` tak punya `store_id`** — hanya masalah query verifikasi saya (bukan defect kode;
   `recordShadowRun` memang tak menulis store_id). Store ada di registry.
3. Tak ada defect lain di jalur Phase 2. **0 perubahan kode kanonik/worker lama.**

## 16. Remaining Limitations

- **Row-level parity MISMATCH** belum terkarakterisasi penuh (agregat MATCH) → tujuan gate 7–14 hari.
- **LIVE room-level report** belum ditarik (engine fokus creative/product). Registry menangkap ketersediaan LIVE.
- Field-level parity di level **campaign** (bukan hanya totals) = tooling READY, dijalankan penuh saat gate.
- Token OAuth beberapa tenant bisa kedaluwarsa & butuh Connect ulang bila refresh gagal (isolasi menangani).
- Plaintext token risk (didokumentasikan).

## 17. Readiness for 7–14 Day Shadow Period

**READY.** Terbukti: discovery data-driven, gate eligibility per-token benar (2/2 eligible), isolasi
kegagalan, paginasi lengkap + cap, registry idempoten, observability kaya, canonical shadow tanpa tulis
kanonik, parity tooling jalan (agregat MATCH). Yang perlu selama periode: karakterisasi row-level parity,
pantau drift atribusi harian, konfirmasi tak ada HARD_MISMATCH uang. **Penjadwalan BELUM dibuat** (menunggu
persetujuan; jalankan manual/terkontrol dulu).

## 18. Final Verdict

```
PHASE 2 FIRST RUN VERDICT:   VERIFIED
MIGRATION 0023:              APPLIED_AND_VERIFIED
RAW NODE TESTS:              PASS (full suite 127/127)
PAGINATION CAP:              VERIFIED (6/6 tes; 42<200 di run nyata; runaway dibatasi)
REGISTRY-ONLY RUN:           PASS (2/2 SUCCESS)
SETTINGS RUN:                PASS (2/2 SUCCESS, idempoten)
FULL SHADOW RUN:             PASS (2/2 SUCCESS, canonical lengkap, tanpa tulis kanonik)
TENANT-A:                    ELIGIBLE · SUCCESS · registry 68 · canonical 42 pages/403 creatives · totals MATCH
TENANT-B:                    ELIGIBLE · SUCCESS · registry 65 · (Phase-0 mismatch = artefak token CLI; kini eligible via token sendiri)
PARITY MATCH RATE:           totals 4/4 MATCH (TENANT-A); row-level MISMATCH (perlu karakterisasi gate)
HARD MISMATCHES:             0 (pada uang agregat)
PAGINATION COMPLETE:         YES
CROSS-TENANT CONTAMINATION:  0
TIKTOK MUTATION CALLS:       0
CANONICAL WRITES:            0
WORKER DEFAULT:              OFF (flag-gated)
SCHEDULER:                   NOT_CREATED
READY FOR 7–14 DAY SHADOW:   YES
NEXT SAFE STEP:              Jalankan shadow terkontrol harian (manual/terjadwal setelah disetujui) +
                             karakterisasi row-level parity; belum cutover, belum enable GMVMAX_COMMIT.
```
