import * as XLSX from 'xlsx'

function parseNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return null
  const s = val.toString().replace('%', '').trim()
  const n = parseFloat(s)
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

    // Find header row (contains 'Product ID')
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

  // ROAS = total GMV / total Cost per product
  const roasMap = new Map()
  for (const [id, { gmv, cost }] of aggregated) {
    if (cost > 0) roasMap.set(id, Math.round((gmv / cost) * 100) / 100)
  }
  return roasMap
}

export async function parseTikTokData(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row (contains 'ID Produk')
  let hi = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(c => c?.toString().includes('ID Produk'))) {
      hi = i; break
    }
  }
  if (hi === -1) throw new Error(
    'Format file TikTok tidak dikenali. Gunakan file "Products Card List" dari TikTok Seller Center → Analitik Produk → Kartu Produk.'
  )

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
      pengunjung:     klik,           // Klik Unik → setara "pengunjung aktif"
      conversion_rate: cr,
      atc_rate:       parseNum(row[cols.atc_rate]),
      total_penjualan: parseNum(row[cols.gmv]),
      pesanan:        parseNum(row[cols.pesanan]),
      pembeli:        parseNum(row[cols.pembeli]),
      penonton:       parseNum(row[cols.penonton]),
      tayangan:       parseNum(row[cols.tayangan]),
      roas:           null,
      stok:           null,
    })
  }

  if (products.length === 0)
    throw new Error('Tidak ada data produk ditemukan di file TikTok.')

  return products
}
