import * as XLSX from 'xlsx'

function parseNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return null
  const s = val.toString().replace('%', '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// Parse angka format Indonesia: "Rp93.581.721" / "1.234,56" / "6.42%"
function parseIDNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return null
  const s = val.toString().replace(/Rp/g, '').replace('%', '').trim()
  if (!s) return null
  const dots = (s.match(/\./g) || []).length
  const hasComma = s.includes(',')
  let cleaned
  if (hasComma && dots > 0) cleaned = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) cleaned = s.replace(',', '.')
  else if (dots > 1) cleaned = s.replace(/\./g, '')
  else if (dots === 1) {
    const after = s.split('.')[1]
    cleaned = after && after.length === 3 ? s.replace('.', '') : s
  } else cleaned = s
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function findCol(headers, keyword) {
  const exact = headers.findIndex(h => h.trim().toLowerCase() === keyword.toLowerCase())
  if (exact !== -1) return exact
  return headers.findIndex(h => h.toLowerCase().includes(keyword.toLowerCase()))
}

// Parse multiple TikTok campaign files → aggregate ROAS per Product ID
export async function parseTikTokAdData(files) {
  const aggregated = new Map() // product_id → { gmv, cost }

  for (const file of files) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', raw: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    const hi = rows.findIndex(row => row.some(c => c?.toString().trim() === 'Product ID'))
    if (hi === -1) continue

    const headers = rows[hi].map(h => h?.toString().trim() || '')
    const idCol  = headers.findIndex(h => h === 'Product ID')
    const gmvCol = headers.findIndex(h => h === 'Gross revenue')
    const costCol = headers.findIndex(h => h === 'Cost')

    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i]
      const id = row[idCol]?.toString().trim()
      if (!id) continue
      const gmv  = parseFloat(row[gmvCol])  || 0
      const cost = parseFloat(row[costCol]) || 0
      if (!aggregated.has(id)) aggregated.set(id, { gmv: 0, cost: 0 })
      const entry = aggregated.get(id)
      entry.gmv  += gmv
      entry.cost += cost
    }
  }

  const roasMap = new Map()
  for (const [id, { gmv, cost }] of aggregated) {
    if (cost > 0) roasMap.set(id, Math.round((gmv / cost) * 100) / 100)
  }
  return roasMap
}

// ── Format 1: TikTok "Kartu Produk" (Product Cards) ─────────────────────────
// Kolom: ID Produk, Nama produk, Klik Unik, Tingkat Klik hingga Pembayaran, ...
function parseProductCards(rows, hi) {
  const headers = rows[hi].map(h => h?.toString().trim() || '')
  const cols = {
    id:       findCol(headers, 'ID Produk'),
    nama:     findCol(headers, 'Nama produk'),
    klik:     findCol(headers, 'Klik Unik'),
    cr:       findCol(headers, 'Tingkat Klik hingga Pembayaran'),
    atc_rate: findCol(headers, 'Tingkat Klik hingga Menambahkan Produk ke Keranjang'),
    gmv:      findCol(headers, 'GMV (Rp)'),
    pesanan:  findCol(headers, 'Pesanan SKU'),
    pembeli:  findCol(headers, 'Pembeli'),
    penonton: findCol(headers, 'Penonton'),
    tayangan: findCol(headers, 'Tayangan'),
  }
  const products = []
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]
    const id = row[cols.id]?.toString().trim()
    if (!id) continue
    const klik = parseNum(row[cols.klik])
    const cr   = parseNum(row[cols.cr])
    if (klik === null || cr === null) continue
    products.push({
      kode_produk:    id,
      nama_produk:    row[cols.nama]?.toString() || id,
      pengunjung:     klik,
      conversion_rate: cr,
      atc_rate:       parseNum(row[cols.atc_rate]),
      total_penjualan: parseNum(row[cols.gmv]),
      pesanan:        parseNum(row[cols.pesanan]),
      pembeli:        parseNum(row[cols.pembeli]),
      penonton:       parseNum(row[cols.penonton]),
      tayangan:       parseNum(row[cols.tayangan]),
      roas: null, stok: null,
    })
  }
  return products
}

// ── Format 2: TikTok "Daftar Produk" (Product List) ─────────────────────────
// Kolom: Nama, ID Produk, GMV, Impresi produk, CTOR (pesanan SKU), ...
// Baris 0 = metadata tanggal, baris 1 = kosong, baris 2 = filter, baris 3 = header.
// Metrik = total lintas semua sumber (LIVE + video + kreator + kartu toko).
function parseProductList(rows, hi) {
  const headers = rows[hi].map(h => h?.toString().trim() || '')
  const cols = {
    nama:     findCol(headers, 'Nama'),
    id:       findCol(headers, 'ID Produk'),
    status:   findCol(headers, 'Status daftar produk'),
    gmv:      findCol(headers, 'GMV'),
    pesanan:  findCol(headers, 'Pesanan SKU'),
    terjual:  findCol(headers, 'Produk terjual'),
    pembeli:  findCol(headers, 'Est. pembeli'),
    aov:      findCol(headers, 'AOV (pesanan SKU)'),
    impresi:  findCol(headers, 'Impresi produk'),
    klik:     findCol(headers, 'Klik produk'),
    ctr:      findCol(headers, 'CTR'),
    atc:      findCol(headers, 'Jumlah tambahkan ke keranjang'),
    atc_rate: findCol(headers, 'Persentase tambahkan ke keranjang'),
    ctor:     findCol(headers, 'CTOR (pesanan SKU)'),
    refund:   findCol(headers, 'Pengembalian dana'),
  }
  const products = []
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]
    const id = row[cols.id]?.toString().trim()
    if (!id) continue

    // Lewati produk non-aktif jika kolom status ada
    if (cols.status >= 0) {
      const st = (row[cols.status] ?? '').toString().toLowerCase()
      if (st && !st.includes('aktif')) continue
    }

    const impresi = parseIDNum(row[cols.impresi])
    const ctor    = parseNum(row[cols.ctor])    // sudah dalam persen, e.g. 2.16
    if (impresi === null && ctor === null) continue

    products.push({
      kode_produk:     id,
      nama_produk:     (row[cols.nama] ?? '').toString().trim() || id,
      pengunjung:      impresi,                             // total impresi semua sumber
      conversion_rate: ctor,                               // CTOR overall (klik → order)
      atc_rate:        parseNum(row[cols.atc_rate]),
      total_penjualan: parseIDNum(row[cols.gmv]),           // "Rp93.581.721"
      pesanan:         parseIDNum(row[cols.pesanan]),
      pembeli:         parseIDNum(row[cols.pembeli]),
      aov:             parseIDNum(row[cols.aov]),
      terjual:         parseIDNum(row[cols.terjual]),
      klik_produk:     parseIDNum(row[cols.klik]),
      ctr:             parseNum(row[cols.ctr]),
      refund:          parseIDNum(row[cols.refund]),
      roas: null, stok: null,
    })
  }
  return products
}

export async function parseTikTokData(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Cari baris header — berisi 'ID Produk' (ada di kedua format)
  let hi = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(c => c?.toString().includes('ID Produk'))) {
      hi = i; break
    }
  }
  if (hi === -1) throw new Error(
    'Format file TikTok tidak dikenali. Gunakan file "Daftar Produk" atau "Kartu Produk" dari TikTok Seller Center → Analitik Produk.'
  )

  const headers = rows[hi].map(h => h?.toString().trim() || '')

  // Deteksi format berdasarkan kolom kunci
  const isProductList = headers.some(h => h === 'CTOR (pesanan SKU)' || h === 'Impresi produk')
  const products = isProductList
    ? parseProductList(rows, hi)
    : parseProductCards(rows, hi)

  if (products.length === 0)
    throw new Error('Tidak ada data produk ditemukan di file TikTok.')

  return products
}
