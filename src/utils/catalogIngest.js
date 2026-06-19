// Parser file "Kelola Harga/Stok" (mass update) dari Shopee/TikTok → daftar
// produk untuk Importer Katalog. Baris machine-key (row 0) menentukan kolom;
// baris data dikenali dari harga > 0 & nama terisi (otomatis lewati baris
// header/instruksi/Wajib). Tiap baris = 1 varian = 1 produk (per-SKU).
import * as XLSX from 'xlsx'
import { parseNum } from './storeIngest'

const SHOPEE_MAP = {
  productCode: 'et_title_product_id',
  name: 'et_title_product_name',
  variationId: 'et_title_variation_id',
  variationName: 'et_title_variation_name',
  parentSku: 'et_title_parent_sku',
  sku: 'et_title_variation_sku',
  price: 'et_title_variation_price',
}
const TIKTOK_MAP = {
  productCode: 'product_id',
  name: 'product_name',
  variationId: 'sku_id',
  variationName: 'variation_value',
  sku: 'seller_sku',
  price: 'price',
}

function detect(header) {
  const set = new Set(header.map(h => (h ?? '').toString().trim()))
  if (set.has('et_title_variation_sku') || set.has('et_title_product_id')) return 'shopee'
  if (set.has('seller_sku') && set.has('sku_id')) return 'tiktok'
  return null
}

export function parseCatalogSheet(aoa) {
  if (!aoa || aoa.length < 2) return { source: null, products: [], skipped: 0 }
  const header = (aoa[0] || []).map(h => (h ?? '').toString().trim())
  const source = detect(header)
  if (!source) return { source: null, products: [], skipped: 0 }

  const MAP = source === 'shopee' ? SHOPEE_MAP : TIKTOK_MAP
  const idx = {}
  for (const k in MAP) idx[k] = header.indexOf(MAP[k])
  const get = (r, k) => (idx[k] >= 0 ? (r[idx[k]] ?? '') : '')

  const products = []
  let skipped = 0
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r || !r.length) continue
    const price = parseNum(get(r, 'price'))
    const baseName = get(r, 'name').toString().trim()
    if (!(price > 0) || !baseName) { skipped++; continue } // buang header/instruksi/kosong
    const variationName = get(r, 'variationName').toString().trim()
    const sku = get(r, 'sku').toString().trim()
    const parentSku = get(r, 'parentSku').toString().trim()
    products.push({
      platform: source,
      name: variationName ? `${baseName} - ${variationName}` : baseName,
      sku: sku || parentSku || '',
      productCode: get(r, 'productCode').toString().trim(),
      variationId: get(r, 'variationId').toString().trim(),
      parentSku,
      price,
    })
  }
  return { source, products, skipped }
}

export async function ingestCatalogFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]] // Shopee: Sheet1; TikTok: Template
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const res = parseCatalogSheet(aoa)
  if (!res.source) {
    throw new Error('Format tidak dikenali. Upload file "Kelola Harga & Stok" (mass update / batch edit) dari Shopee atau TikTok.')
  }
  return res
}
