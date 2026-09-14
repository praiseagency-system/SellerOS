// GMV Max — CANONICAL CONTENT SIGNATURE (provenance hardening, STAGED slice).
// PURE & deterministic. Basis untuk "no-op idempotency": bila konten kanonik untuk
// (workspace, date) IDENTIK dengan yang sudah tersimpan, penulis TIDAK perlu
// delete+insert — pertahankan import id + provenance. Modul ini TIDAK menyentuh
// writer produksi; hanya fungsi murni yang akan diintegrasikan NANTI setelah
// disetujui. Tidak ada TikTok call, tidak ada DB, tidak ada mutasi, tidak ada LLM.
//
// Kanonikalisasi kini tinggal di provenanceCore.mjs agar bisa dipakai bersama
// jalur BROWSER (Web Crypto) — perilaku & bentuk hash TIDAK berubah.
import { createHash } from 'node:crypto'
import { canonicalString, rowFingerprint } from './provenanceCore.mjs'

export { rowFingerprint }

// Signature konten deterministik & INVARIAN terhadap urutan baris, untuk
// (workspace, date). Konten sama → signature sama; beda satu nilai/total → beda.
// `products` (laporan tingkat produk, 0061) ikut dihitung HANYA bila ada isinya:
// snapshot tanpa produk menghasilkan signature persis seperti sebelum 0061,
// jadi no-op idempotency utk data lama tak terganggu.
export function contentSignature({ workspaceId, date, rows = [], totals = {}, products = [] }) {
  const input = products && products.length
    ? { workspaceId, date, rows, totals, products }
    : { workspaceId, date, rows, totals }
  return 'sha256:' + createHash('sha256')
    .update(canonicalString(input))
    .digest('hex')
}
