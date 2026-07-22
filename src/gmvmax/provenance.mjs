// GMV Max — CANONICAL CONTENT SIGNATURE (provenance hardening, STAGED slice).
// PURE & deterministic. Basis untuk "no-op idempotency": bila konten kanonik untuk
// (workspace, date) IDENTIK dengan yang sudah tersimpan, penulis TIDAK perlu
// delete+insert — pertahankan import id + provenance. Modul ini TIDAK menyentuh
// writer produksi; hanya fungsi murni yang akan diintegrasikan NANTI setelah
// disetujui. Tidak ada TikTok call, tidak ada DB, tidak ada mutasi, tidak ada LLM.
import { createHash } from 'node:crypto'

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

// Signature konten deterministik & INVARIAN terhadap urutan baris, untuk
// (workspace, date). Konten sama → signature sama; beda satu nilai/total → beda.
export function contentSignature({ workspaceId, date, rows = [], totals = {} }) {
  const norm = (rows || []).map(rowFingerprint).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const t = { cost: roundIdr(totals.cost), revenue: roundIdr(totals.revenue), orders: roundIdr(totals.orders) }
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ ws: workspaceId, date, rows: norm, totals: t })).digest('hex')
}
