# GMV Max fixtures — ditangkap dari respons MCP `gmv_max_report_get` NYATA (2026-07-09/10)

Sanitasi: `advertiser_id`/`store_id`/`request_id` → placeholder. `item_id` (ID video
publik TikTok) & `tt_account_name` (handle publik) DIPERTAHANKAN — bukan PII rahasia,
dan diperlukan agar karakterisasi mapper (penanganan atribut/`"0"`/rate) setia.
TIDAK ada token/secret di fixture ini.

| File | Kasus | Sumber (sanitasi) |
|---|---|---|
| `creative_product_attr.json` | creative-level PRODUCT + baris `-1` + atribut + rate | campaign 1836106675381377 / SPU 1731519207014237361, 2026-07-02..08 |
| `creative_live_rollup.json` | LIVE → HANYA `-1` (tak ada breakdown video) | campaign 1865076209548305 / SPU 1731519207014237361, 2026-07-08 |
| `dedup_pair_A.json` / `_B.json` | item_id sama lintas SPU beda (identity kanonik) | campaign 1836106520532993 / dua SPU, 2026-07-08 |
| `discovery_campaign_level.json` | discovery campaign-level (cost>0 + baris nol) | 2026-07-08 |
| `zero_and_null.json` | baris cost 0 (dibuang filter active) + metric hilang | disarikan dari respons nyata |

BELUM tertangkap (UNKNOWN / TODO fixture, jangan diarang-arang): partial MCP response,
retryable error (code≠0), auth expired, pagination-boundary tengah malam, multi-advertiser.
