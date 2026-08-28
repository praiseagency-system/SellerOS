// GMV Max — CANONICAL CONTENT SIGNATURE, bagian MURNI (tanpa hash / tanpa Node API).
// Dipisah dari provenance.mjs agar BROWSER bisa memakai kanonikalisasi yang SAMA
// PERSIS (provenance.mjs meng-import `node:crypto`, tak bisa dibundel Vite).
//   - Node/worker  → provenance.mjs      (hash via node:crypto)
//   - Browser/UI   → utils/contentSignature.js (hash via Web Crypto)
// Keduanya meng-hash STRING yang dihasilkan canonicalString() di bawah, sehingga
// konten identik menghasilkan signature identik di kedua runtime.
//
// JANGAN ubah bentuk kanonik/urutan sort tanpa sadar: mengubahnya membuat SEMUA
// signature lama tak cocok → run berikutnya dianggap "konten berubah" dan
// membuat versi baru (tidak merusak data, tapi mengotori lineage).

const pick = (r, ...keys) => { for (const k of keys) if (r?.[k] != null) return r[k]; return null }
// IDR tak punya satuan minor → normalisasi ke bilangan bulat (normalisasi desimal,
// BUKAN toleransi bisnis). Nilai null tetap null (missing ≠ 0).
const roundIdr = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)))

// Sidik jari satu baris kanonik: identitas (campaign, product, video) + nilai
// numerik ternormalisasi. Toleran camelCase (hasil loader) & snake_case (row DB).
export function rowFingerprint(r) {
  return {
    c: pick(r, 'campaignId', 'campaign_id'),
    p: pick(r, 'productId', 'product_id'),
    v: pick(r, 'videoId', 'video_id'),
    cost: roundIdr(pick(r, 'cost')),
    rev: roundIdr(pick(r, 'grossRevenue', 'gross_revenue')),
    ord: roundIdr(pick(r, 'skuOrders', 'sku_orders')),
  }
}

// String kanonik yang di-hash. Invarian terhadap urutan baris.
export function canonicalString({ workspaceId, date, rows = [], totals = {} }) {
  const norm = (rows || []).map(rowFingerprint).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const t = { cost: roundIdr(totals.cost), revenue: roundIdr(totals.revenue), orders: roundIdr(totals.orders) }
  return JSON.stringify({ ws: workspaceId, date, rows: norm, totals: t })
}
