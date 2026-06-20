import * as XLSX from 'xlsx'

// ── Number & date parsing (toleran format ID & EN) ──────────────────
export function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0
  if (typeof val === 'number') return val
  const s = val.toString().replace(/[^\d.,-]/g, '').trim()
  if (!s) return 0
  const hasComma = s.includes(','), dots = (s.match(/\./g) || []).length
  let cleaned
  if (hasComma && dots > 0) cleaned = s.replace(/\./g, '').replace(',', '.')   // 1.234,56
  else if (hasComma) cleaned = s.replace(',', '.')                              // 1,82
  else if (dots > 1) cleaned = s.replace(/\./g, '')                             // 1.234.567
  else if (dots === 1) {
    // satu titik: "19.000" → 19000 (ribuan ID), tapi "3.05" → 3.05 (desimal EN)
    const after = s.split('.')[1]
    cleaned = after && after.length === 3 ? s.replace('.', '') : s
  } else cleaned = s
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

export function parseDT(val) {
  if (val == null || val === '') return null
  if (val instanceof Date) return isNaN(val) ? null : val
  const s = val.toString().trim()
  let d = new Date(s.replace(' ', 'T'))
  if (!isNaN(d)) return d
  const m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})[ ,T]*(\d{1,2})?:?(\d{2})?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0))
  d = new Date(s)
  return isNaN(d) ? null : d
}

// ── Header matching ─────────────────────────────────────────────────
function col(headers, name, { exact = false } = {}) {
  const lower = headers.map(h => (h ?? '').toString().trim().toLowerCase())
  const target = name.toLowerCase()
  let i = lower.indexOf(target)
  if (i !== -1 || exact) return i
  return lower.findIndex(h => h.includes(target))
}

// ── Source detection by column signature (BUKAN nama file) ──────────
const SIGNATURES = {
  shopee: ['no. pesanan', 'diskon dari shopee', 'cashback koin', 'voucher ditanggung shopee'],
  tiktok: ['order id', 'sku id', 'tokopedia invoice number', 'purchase channel', 'seller sku'],
}
export function detectSource(headers) {
  const lower = headers.map(h => (h ?? '').toString().trim().toLowerCase())
  const score = sig => sig.reduce((n, k) => n + (lower.some(h => h === k || h.includes(k)) ? 1 : 0), 0)
  const s = score(SIGNATURES.shopee), t = score(SIGNATURES.tiktok)
  if (s === 0 && t === 0) return null
  return s >= t ? 'shopee' : 'tiktok'
}

function isCancelled(status) {
  return /batal|cancel|dibatalkan/i.test((status ?? '').toString())
}

// Shopee mengirim nama provinsi/kota dalam ALL CAPS — ubah ke Title Case
// agar tampil rapi di chart & tabel. Singkatan umum (DKI, NTB, NAD, dll)
// dipertahankan huruf besar.
const KEEP_UPPER = new Set(['DKI','NTB','NAD','DIY','DI','KAB','KOTA'])
function toTitleCase(str) {
  if (!str) return str
  return str.replace(/\S+/g, w => {
    const clean = w.replace(/[^A-Za-z]/g, '')
    return KEEP_UPPER.has(clean.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  })
}
function weekOfMonth(d) {
  // W1=1-7, W2=8-14, W3=15-21, W4=22-akhir bulan.
  // Tgl 29-31 digabung ke W4 agar tidak ada "minggu semu" 2-3 hari
  // yang membuat tren drop palsu di akhir bulan.
  return Math.min(4, Math.ceil(d.getDate() / 7))
}

// ── Normalisasi (pure: terima array-of-arrays termasuk baris header) ─
// Mengembalikan { source, lines[], skipped, months[] }
export function normalizeSheet(aoa, sourceHint) {
  if (!aoa || aoa.length < 2) return { source: null, lines: [], skipped: 0, months: [] }
  const headers = (aoa[0] || []).map(h => (h ?? '').toString())
  const source = sourceHint || detectSource(headers)
  if (!source) return { source: null, lines: [], skipped: 0, months: [] }

  const C = source === 'shopee' ? {
    orderId: col(headers, 'No. Pesanan'), status: col(headers, 'Status Pesanan'),
    created: col(headers, 'Waktu Pesanan Dibuat'), payment: col(headers, 'Metode Pembayaran'),
    product: col(headers, 'Nama Produk'), sku: col(headers, 'Nomor Referensi SKU'),
    variant: col(headers, 'Nama Variasi'), qty: col(headers, 'Jumlah', { exact: true }),
    unit: col(headers, 'Harga Setelah Diskon'),
    province: col(headers, 'Provinsi'), city: col(headers, 'Kota/Kabupaten'),
    buyer: col(headers, 'Username (Pembeli)'), category: -1, channel: -1, lineTotal: -1,
    voucherSeller: col(headers, 'Voucher Ditanggung Penjual'),
    voucherShopee: col(headers, 'Voucher Ditanggung Shopee'),
    diskonShopee:  col(headers, 'Diskon dari Shopee'),
  } : {
    orderId: col(headers, 'Order ID'), status: col(headers, 'Order Status'),
    created: col(headers, 'Created Time'), payment: col(headers, 'Payment Method'),
    product: col(headers, 'Product Name'), sku: col(headers, 'Seller SKU'),
    skuId: col(headers, 'SKU ID'),
    variant: col(headers, 'Variation'), qty: col(headers, 'Quantity', { exact: true }),
    lineTotal: col(headers, 'SKU Subtotal After Discount'), unit: col(headers, 'SKU Unit Original Price'),
    province: col(headers, 'Province'), city: col(headers, 'Regency and City'),
    buyer: col(headers, 'Buyer Username'), category: col(headers, 'Product Category'),
    channel: col(headers, 'Purchase Channel'),
    voucherSeller: -1, voucherShopee: -1, diskonShopee: -1,
  }

  const get = (r, i) => (i >= 0 ? r[i] : '')
  const lines = []
  let skipped = 0
  const months = new Set()

  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r || !r.length) continue
    const dt = parseDT(get(r, C.created))
    const orderId = (get(r, C.orderId) ?? '').toString().trim()
    if (!dt || !orderId) { skipped++; continue }   // buang baris deskripsi / tak valid

    const qty = parseNum(get(r, C.qty)) || 1
    const revenue = C.lineTotal >= 0
      ? parseNum(get(r, C.lineTotal))
      : parseNum(get(r, C.unit)) * qty
    const status = (get(r, C.status) ?? '').toString().trim()
    const marketplace = source === 'shopee'
      ? 'Shopee'
      : ((get(r, C.channel) ?? '').toString().trim() || 'TikTok')

    months.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
    lines.push({
      o: orderId,
      m: marketplace,
      t: dt.getTime(),
      w: weekOfMonth(dt),
      day: dt.getDay(),       // 0=Min
      hr: dt.getHours(),
      p: (get(r, C.product) ?? '').toString().trim() || '(Tanpa nama)',
      k: (get(r, C.sku) ?? '').toString().trim(),
      kid: (get(r, C.skuId) ?? '').toString().trim(),  // TikTok: platform SKU ID (matches variationId from catalog)
      v: (get(r, C.variant) ?? '').toString().trim(),
      c: C.category >= 0 ? ((get(r, C.category) ?? '').toString().trim() || null) : null,
      q: qty,
      r: revenue,
      ok: !isCancelled(status),
      pay: (get(r, C.payment) ?? '').toString().trim() || '(Lainnya)',
      pr: toTitleCase((get(r, C.province) ?? '').toString().trim()) || '(Tidak diketahui)',
      ci: toTitleCase((get(r, C.city) ?? '').toString().trim()) || '(Tidak diketahui)',
      b: (get(r, C.buyer) ?? '').toString().trim(),
      vs:  parseNum(get(r, C.voucherSeller)),
      vsp: parseNum(get(r, C.voucherShopee)),
      ds:  parseNum(get(r, C.diskonShopee)),
    })
  }
  return { source, lines, skipped, months: [...months] }
}

// ── Browser wrapper: File → normalized lines ────────────────────────
export async function ingestFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  let all = []
  let source = null, skipped = 0
  const months = new Set()
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    const res = normalizeSheet(aoa)
    if (res.source) {
      source = res.source
      all = all.concat(res.lines)
      skipped += res.skipped
      res.months.forEach(m => months.add(m))
    }
  }
  if (!source) throw new Error('Format file tidak dikenali. Upload laporan Pesanan dari Shopee atau TikTok/Tokopedia.')
  return { source, lines: all, skipped, months: [...months], fileName: file.name }
}
