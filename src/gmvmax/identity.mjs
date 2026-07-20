// Canonical identity & dedup untuk baris creative GMV Max.
//
// FAKTA (dibuktikan read-only 2026-07-10): `item_id` TIDAK unik. Video yang sama
// tayang di beberapa (campaign, item_group_id) dengan spend spesifik-konteks —
// mis. item_id 7639337838043008264 muncul di campaign 1836106675381377 DAN
// 1836106520532993/SPU 1732987062949872817, masing-masing dengan cost berbeda.
// Karena report ditarik PER (campaign, item_group_id), tiap tarikan pun punya
// baris -1 (non-attributed) sendiri. Maka:
//
//   Canonical row identity = (campaign_id, item_group_id, item_id)
//
// - Menjumlahkan cost antar-baris dengan item_id sama tapi (campaign,SPU) beda =
//   BENAR (spend berbeda konteks), BUKAN double-count.
// - Duplikat sejati = (campaign_id, item_group_id, item_id) yang sama muncul >1×
//   dalam satu hasil tarikan → indikasi paginasi/merge cacat → HARUS gagalkan run.

export function rowIdentity(row) {
  return `${row.campaignId ?? ''}|${row.productId ?? ''}|${row.videoId ?? ''}`
}

// Deteksi duplikat sejati (identity kanonik yang sama muncul >1×). Mengembalikan
// daftar { key, count } untuk key dengan count>1. Non-empty = data cacat.
export function findDuplicateIdentities(rows) {
  const seen = new Map()
  for (const r of rows) {
    const k = rowIdentity(r)
    seen.set(k, (seen.get(k) || 0) + 1)
  }
  const dups = []
  for (const [key, count] of seen) if (count > 1) dups.push({ key, count })
  return dups
}

// Kunci rollup per kreator/video untuk downstream (video_id lintas campaign/SPU
// SENGAJA dijumlahkan → pakai videoId sebagai grup, bukan identity kanonik).
export function creatorRollupKey(row) {
  return row.tiktokAccount ?? '(non-attributed)'
}
export function videoRollupKey(row) {
  return row.videoId ?? '(non-attributed)'
}
