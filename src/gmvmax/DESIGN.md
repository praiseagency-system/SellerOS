# GMV Max Deterministic Sync Engine — Design (Phase 2)

Status: **DESIGN + kontrak terkunci**. Belum ada production worker, belum cutover,
worker lama tetap jalan. Business rule di-REUSE dari kode existing (Root Cause Rule),
bukan reinterpretasi baru.

## Prinsip
- AI **di luar** pipeline data. Collection→normalize→reconcile→persist = deterministik.
- **Satu** business rule kanonik (Architecture Rule). Normalizer & Reconciler tunggal.
- Reliability > throughput; correctness > speed; idempotent; **fail-explicit**.

## Komponen (ikuti konvensi repo: `src/gmvmax/`, `src/utils/`, `src/data/`)

```
TikTokAdsProvider (infrastructure)   ← MCP now; TikTokOfficialApiProvider nanti
   │  fetchCampaignTotals(date) · fetchCampaignNames() · fetchSpus(cid,date)
   │  fetchCreativePairPaged(cid,spu,date)   ← WAJIB lengkap atau throw
   ▼
GMVMaxSyncEngine (application)        ← orkestrasi deterministik (ganti runbook LLM)
   │  discover → enumerate SPU → fetch pairs (paginasi lengkap) → normalize → reconcile
   ▼
Normalizer  = src/utils/apiGmvMax.js  ← REUSE (parseGmvMaxApiRows) — terkunci normalize.test
Reconciler  = src/gmvmax/reconcile.mjs ← CANONICAL (diekstrak) — terkunci reconcile.test
Identity    = src/gmvmax/identity.mjs  ← canonical key — terkunci identity.test
   ▼
SnapshotWriter (persistence)          ← idempotent + ATOMIC (lihat bawah)
   ▼
Supabase (gmvmax_imports/creatives) → SellerOS dashboard (kontrak UI TIDAK berubah)
```

### Provider contract (memungkinkan swap tanpa rewrite core)
```
interface TikTokAdsProvider {
  auth(): { state: 'AUTH_VALID'|'AUTH_EXPIRING'|'AUTH_EXPIRED'|'AUTH_REFRESH_REQUIRED', expiresAt }
  fetchCampaignTotals(date): { [cid]: { cost, gross_revenue, orders } }        // dims [campaign_id]
  fetchCampaignNames(): { [cid]: { name, type } }   // PRODUCT_GMV_MAX + LIVE_GMV_MAX (keduanya!)
  fetchSpus(cid, date): string[]                     // dims [item_group_id], cost>0
  fetchCreativePairPaged(cid, spu, date): { list, pageCount, complete }  // paginasi PENUH
}
```
`TikTokMcpProvider` (sekarang, via token MCP) dan `TikTokOfficialApiProvider` (nanti,
Marketing API) mengimplementasikan interface yang sama; engine tak berubah.

## Kontrak bisnis kanonik (terbukti, terkunci test)

| Aturan | Sumber tunggal | Test |
|---|---|---|
| Normalisasi (parseNum, rate=persen, "0"→kosong, active filter, roas=API roi) | `src/utils/apiGmvMax.js` | normalize.test |
| Identity `(campaign_id, item_group_id, item_id)`; item_id tak unik | `src/gmvmax/identity.mjs` | identity.test |
| Rekonsiliasi: buang -1; residual=total−Σattributed; residual≥0 | `src/gmvmax/reconcile.mjs` | reconcile.test |
| Rollup: total campaign = kebenaran; -1/residual = sisa; jangan double-count | reconcile + identity | reconcile.test |

**Unifikasi (Architecture Rule)** — langkah TERKENDALI (belum dilakukan, agar tak
mengganggu backfill lama yang jalan): `scripts/syncGmvMax.mjs` akan di-rewire agar
memanggil `reconcile.mjs` (menghapus salinan inline-nya). Dilindungi reconcile.test.
Dieksekusi saat backfill idle.

## Fail-explicit (Reliability Rule) — WAJIB

Engine **menggagalkan run** (tidak menulis snapshot final) bila:
1. Paginasi tak lengkap: `pages_fetched < total_page` untuk pair mana pun → `INCOMPLETE_PAGINATION`.
2. Respons MCP `code != 0` setelah retry berbatas habis → `MCP_ERROR`.
3. `auth.state ∈ {AUTH_EXPIRED, AUTH_REFRESH_REQUIRED}` → `AUTH_EXPIRED` (tanpa fake success).
4. `reconcile().report.negativeResidual === true` (over-count/data cacat) → `RECONCILE_INVARIANT`.
5. `findDuplicateIdentities(rows).length > 0` (paginasi/merge dobel) → `DUPLICATE_ROWS`.
6. `campaignTotals` kosong padahal discovery cost>0 → `MISSING_TOTALS`.

Tidak ada silent fallback yang mengubah semantik. Tidak ada snapshot "sukses" dari data parsial.

## Persistence atomik (perbaikan R1 — non-atomik saat ini)

Masalah lama: `DELETE → INSERT import → INSERT creatives (chunk)` non-transaksional.
Desain baru (salah satu, ditetapkan Phase 3, **butuh audit migrasi** dulu):
- **Opsi A (disarankan)**: RPC Postgres `gmvmax_replace_snapshot(workspace, date, import, rows[])`
  yang `DELETE+INSERT` dalam **satu transaksi** (SECURITY DEFINER). Atomik, idempoten.
  Perlu migration baru — di-audit dampaknya, TIDAK mengubah kolom/skema kontrak UI.
- **Opsi B**: tulis ke `import` baru dulu (rows lengkap) → baru `DELETE` import lama →
  `UPDATE` pointer. Tanpa migration tapi butuh kolom status.
Idempotency identitas snapshot tetap `(workspace_id, snapshot_date)`.

## Timezone (perbaikan R4)

`stat_time_day`/single-day report memakai **TZ akun = Asia/Jakarta (UTC+7)**.
`--date`/"yesterday" **wajib** dihitung di TZ akun eksplisit (mis. `TZ=Asia/Jakarta`),
BUKAN TZ mesin. Di VPS-UTC, `date -v-1d` lama akan salah tanggal di sekitar tengah malam.

## RunReporter (observability deterministik)
Ringkasan per run: `run_id, advertiser_id, date, campaign_count, page_count,
raw_row_count, normalized_row_count, deduplicated_row_count, attributed_count,
non_attributed_count, inserted_count, reconciliation_delta, duration_ms, status,
auth_state`. Log terstruktur, exit code non-nol saat gagal.

## Late-arriving data (UNKNOWN — belum tuntas)
`cost` = spend (immutable). `gross_revenue`/`orders` bisa bertambah dalam attribution
window untuk hari-hari baru. Bukti baru: intraday 8 Jul stabil 00:00→02:13. Belum ada
bukti magnitudo drift multi-hari. **Implikasi parity (Phase 4)**: bandingkan OLD vs NEW
dari **tarikan waktu-sama**, atau bekukan snapshot & terima drift terdokumentasi.

## Yang TIDAK dibangun sekarang
Production transport nyata, penulisan Supabase oleh engine baru, CLI produksi, cutover,
penghentian worker lama, perubahan skema/UI. Itu Phase 3+ setelah gate parity.
