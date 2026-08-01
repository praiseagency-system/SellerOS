// Canonical product — satu produk nyata yang bisa punya listing berbeda di
// tiap marketplace. Penggabungan TIDAK boleh lagi bersandar pada kemiripan
// nama begitu saja.
//
// Urutan prioritas pencocokan (yang di atas tak boleh ditimpa yang di bawah):
//   1. manual        — sudah diverifikasi orang
//   2. sku           — SKU / seller SKU sama
//   3. product_id    — pasangan ID yang pernah disimpan sebelumnya
//   4. normalized_name — nama identik setelah dinormalisasi DAN atribut cocok
//   5. fuzzy         — hanya usulan, tak pernah menggabung sendiri
//
// Perbedaan ukuran, varian, bundling, jumlah isi, atau penanda edisi terbatas
// selalu memblokir penggabungan otomatis — sekalipun namanya mirip 95%.

export const MAPPING_STATUS = {
  VERIFIED: 'verified',
  AUTO: 'auto_matched',
  REVIEW: 'needs_review',
  UNMATCHED: 'unmatched',
}
export const MAPPING_SOURCE = {
  MANUAL: 'manual',
  PRODUCT_ID: 'product_id',
  SKU: 'sku',
  NAME: 'normalized_name',
  HISTORICAL: 'historical_mapping',
  FUZZY: 'fuzzy',
}
const SOURCE_RANK = {
  [MAPPING_SOURCE.MANUAL]: 5,
  [MAPPING_SOURCE.SKU]: 4,
  [MAPPING_SOURCE.PRODUCT_ID]: 3,
  [MAPPING_SOURCE.HISTORICAL]: 3,
  [MAPPING_SOURCE.NAME]: 2,
  [MAPPING_SOURCE.FUZZY]: 1,
}
export const sourceRank = s => SOURCE_RANK[s] ?? 0

// ── Pembacaan atribut dari judul listing ────────────────────────────────────
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s?(ml|l|gr|g|kg|pcs|pc)\b/gi
const QTY_RE = /\b(?:isi|pack|paket|bundle|bundling)\s*(\d+)\b|\b(\d+)\s*(?:pcs|pc|botol|pack)\b/i
const BUNDLE_RE = /\b(bundling|bundle|paket|combo|set|twin\s?pack|buy\s?\d\s?get)\b/i
// "Exclusive"/"Eksklusif" sendirian TIDAK dihitung sebagai edisi terbatas —
// di judul marketplace kata itu hampir selalu tag promo ("[Exclusive Bunding]"),
// bukan atribut produk. Yang memblokir hanyalah penanda edisi yang eksplisit.
const LIMITED_RE = /\b(limited(\s?edition)?|special\s?edition|exclusive\s?edition|edisi\s?terbatas)\b/i

export function extractAttributes(rawName) {
  const name = (rawName || '').toString()
  const lower = name.toLowerCase()

  const sizes = []
  let mm
  SIZE_RE.lastIndex = 0
  while ((mm = SIZE_RE.exec(lower)) !== null) {
    const val = parseFloat(mm[1].replace(',', '.'))
    let unit = mm[2].toLowerCase()
    let v = val
    if (unit === 'l') { v = val * 1000; unit = 'ml' }
    if (unit === 'kg') { v = val * 1000; unit = 'g' }
    if (unit === 'gr') unit = 'g'
    if (unit === 'pc') unit = 'pcs'
    sizes.push(`${v}${unit}`)
  }
  const qtyMatch = lower.match(QTY_RE)
  const qty = qtyMatch ? parseInt(qtyMatch[1] || qtyMatch[2], 10) : null

  return {
    sizes: [...new Set(sizes)].sort(),
    quantity: Number.isFinite(qty) ? qty : null,
    isBundle: BUNDLE_RE.test(lower),
    isLimited: LIMITED_RE.test(lower),
  }
}

// Nama inti: buang penanda promo & ekor SEO, sisakan identitas produk.
export function normalizeProductName(rawName) {
  return (rawName || '')
    .toString()
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\|.*$/, ' ')
    .replace(/\b(free|gratis|promo|termurah|terlaris|best\s?seller|ready\s?stock|original|bpom)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Atribut yang berbeda = produk berbeda. Dipakai sebagai penghalang keras.
export function attributesConflict(a, b) {
  const reasons = []
  const sa = a.sizes.join('+'), sb = b.sizes.join('+')
  if (sa && sb && sa !== sb) reasons.push('ukuran berbeda')
  if (a.quantity != null && b.quantity != null && a.quantity !== b.quantity) reasons.push('jumlah isi berbeda')
  if (a.isBundle !== b.isBundle) reasons.push('satuan vs bundling')
  if (a.isLimited !== b.isLimited) reasons.push('edisi terbatas vs reguler')
  return reasons
}

// Kemiripan token (Jaccard) — hanya untuk skor usulan, tak pernah menggabung.
export function nameSimilarity(a, b) {
  const ta = new Set(normalizeProductName(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeProductName(b).split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

const skuKey = p => (p.sku || p.seller_sku || '').toString().trim().toLowerCase()

// Kunci pencocokan satu listing, dipakai untuk mengelompokkan lintas platform.
export function listingKey(p) {
  return `${p.platform}:${p.kode_produk}`
}

// ── Mesin pencocokan ────────────────────────────────────────────────────────
// listings : [{ platform, kode_produk, nama_produk, sku?, ... }]
// mappings : baris mapping tersimpan (lihat data/productMappings.js)
// Mengembalikan { groups, suggestions } — groups siap dihitung metriknya,
// suggestions untuk halaman review (tak pernah otomatis dipakai).
export function buildCanonicalGroups(listings, mappings = []) {
  const byKey = new Map()
  for (const l of listings || []) byKey.set(listingKey(l), l)

  // 1) Mapping tersimpan (manual & hasil auto sebelumnya). Manual menang.
  const assigned = new Map()   // listingKey → canonicalId
  const canonical = new Map()  // canonicalId → { id, name, members[], status, source, confidence }
  const sorted = [...(mappings || [])].sort((a, b) => sourceRank(b.mappingSource) - sourceRank(a.mappingSource))
  for (const map of sorted) {
    const keys = []
    if (map.shopeeProductId) keys.push(`shopee:${map.shopeeProductId}`)
    if (map.tiktokProductId) keys.push(`tiktok:${map.tiktokProductId}`)
    const present = keys.filter(k => byKey.has(k) && !assigned.has(k))
    if (!present.length) continue
    const id = map.canonicalProductId
    if (!canonical.has(id)) {
      canonical.set(id, {
        id,
        name: map.canonicalProductName || byKey.get(present[0]).nama_produk,
        members: [],
        status: map.mappingStatus || MAPPING_STATUS.VERIFIED,
        source: map.mappingSource || MAPPING_SOURCE.MANUAL,
        confidence: map.mappingConfidence ?? 1,
        reasons: ['mapping tersimpan'],
      })
    }
    for (const k of present) { assigned.set(k, id); canonical.get(id).members.push(byKey.get(k)) }
  }

  // 2) SKU sama → gabung otomatis (kunci paling tepercaya setelah manual).
  const bySku = new Map()
  for (const [k, l] of byKey) {
    if (assigned.has(k)) continue
    const s = skuKey(l)
    if (!s) continue
    if (!bySku.has(s)) bySku.set(s, [])
    bySku.get(s).push(l)
  }
  for (const [s, group] of bySku) {
    if (group.length < 2) continue
    const platforms = new Set(group.map(g => g.platform))
    if (platforms.size < 2) continue
    const id = `sku:${s}`
    canonical.set(id, {
      id, name: group[0].nama_produk, members: group,
      status: MAPPING_STATUS.AUTO, source: MAPPING_SOURCE.SKU, confidence: 0.95,
      reasons: [`SKU sama (${s})`],
    })
    for (const g of group) assigned.set(listingKey(g), id)
  }

  // 3) Nama ternormalisasi identik DAN atribut tak bertabrakan.
  const byName = new Map()
  for (const [k, l] of byKey) {
    if (assigned.has(k)) continue
    const n = normalizeProductName(l.nama_produk)
    if (!n) continue
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(l)
  }
  for (const [n, group] of byName) {
    if (group.length < 2) continue
    const platforms = new Set(group.map(g => g.platform))
    if (platforms.size < 2) continue
    const attrs = group.map(g => extractAttributes(g.nama_produk))
    let conflict = []
    for (let i = 1; i < attrs.length; i++) conflict = conflict.concat(attributesConflict(attrs[0], attrs[i]))
    if (conflict.length) continue   // biar jadi usulan saja, jangan digabung
    const id = `name:${n}`
    canonical.set(id, {
      id, name: group[0].nama_produk, members: group,
      status: MAPPING_STATUS.AUTO, source: MAPPING_SOURCE.NAME, confidence: 0.8,
      reasons: ['nama identik setelah normalisasi', 'ukuran, varian & bundling cocok'],
    })
    for (const g of group) assigned.set(listingKey(g), id)
  }

  // 4) Sisanya berdiri sendiri.
  for (const [k, l] of byKey) {
    if (assigned.has(k)) continue
    const id = k
    canonical.set(id, {
      id, name: l.nama_produk, members: [l],
      status: MAPPING_STATUS.UNMATCHED, source: null, confidence: null, reasons: [],
    })
    assigned.set(k, id)
  }

  // 5) Usulan untuk halaman review: produk sendirian yang mirip produk
  //    sendirian di platform lain. Alasan penolakan ikut disertakan.
  const singles = [...canonical.values()].filter(c => c.members.length === 1)
  const suggestions = []
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const A = singles[i].members[0], B = singles[j].members[0]
      if (A.platform === B.platform) continue
      const score = nameSimilarity(A.nama_produk, B.nama_produk)
      if (score < 0.4) continue
      const conflict = attributesConflict(extractAttributes(A.nama_produk), extractAttributes(B.nama_produk))
      suggestions.push({
        a: A, b: B,
        confidence: Math.round(score * 100) / 100,
        blocked: conflict.length > 0,
        reasons: conflict.length ? conflict : [`kemiripan nama ${Math.round(score * 100)}%`],
        status: conflict.length ? MAPPING_STATUS.REVIEW : MAPPING_STATUS.REVIEW,
      })
    }
  }
  suggestions.sort((a, b) => b.confidence - a.confidence)

  return { groups: [...canonical.values()], suggestions }
}

// ── Nama ringkas untuk tabel ────────────────────────────────────────────────
// Judul listing marketplace panjang dan memenuhi tabel. Nama ringkas dibentuk
// dari data, BUKAN dari daftar nama yang di-hardcode:
//   1. ambil bagian sebelum pemisah pertama (" - ", " | ")
//   2. buang token awal yang muncul di mayoritas produk (itu nama brand)
//   3. tempelkan kembali penanda yang TAK BOLEH hilang: ukuran, jumlah isi,
//      bundling, edisi terbatas
export function buildShortNames(products) {
  const bases = (products || []).map(p => {
    const cleaned = (p.nama_produk || '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .split(/\s+[-|–]\s+/)[0]
      .replace(/\s+/g, ' ')
      .trim()
    return cleaned || (p.nama_produk || '').trim()
  })

  // Token pembuka yang dipakai mayoritas = brand → boleh dibuang.
  const firstTokens = bases.map(b => b.split(' ')[0]?.toLowerCase()).filter(Boolean)
  const freq = {}
  for (const tkn of firstTokens) freq[tkn] = (freq[tkn] || 0) + 1
  const [topToken, topCount] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || []
  const dropBrand = bases.length >= 3 && topCount / bases.length >= 0.6 ? topToken : null

  return (products || []).map((p, i) => {
    let core = bases[i]
    if (dropBrand && core.split(' ')[0]?.toLowerCase() === dropBrand) {
      core = core.split(' ').slice(1).join(' ').trim() || core
    }
    const a = extractAttributes(p.nama_produk)
    const bits = []
    if (a.isBundle && !/bundl|paket|combo|set/i.test(core)) bits.push('Bundling')
    const sizes = a.sizes.map(s => s.replace(/(\d+)(ml|g|pcs)/, '$1 $2'))
    for (const s of sizes) if (!core.toLowerCase().includes(s.replace(' ', ''))) bits.push(s)
    if (a.quantity != null && !/isi\s*\d/i.test(core)) bits.push(`isi ${a.quantity}`)
    if (a.isLimited && !/limited|edisi/i.test(core)) bits.push('Limited')
    const short = [bits.includes('Bundling') ? 'Bundling' : null, core, ...bits.filter(b => b !== 'Bundling')]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    return short || p.nama_produk
  })
}
