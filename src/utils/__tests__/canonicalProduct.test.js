import { describe, it, expect } from 'vitest'
import {
  buildCanonicalGroups, extractAttributes, attributesConflict,
  normalizeProductName, MAPPING_STATUS, MAPPING_SOURCE,
} from '../canonicalProduct'

const L = (platform, id, nama, extra = {}) => ({ platform, kode_produk: id, nama_produk: nama, metrics: {}, ...extra })

describe('atribut produk dibaca dari judul listing', () => {
  it('membaca ukuran, jumlah isi, bundling, dan edisi terbatas', () => {
    const a = extractAttributes('Parfum Moscow Ice 50 ML')
    expect(a.sizes).toEqual(['50ml'])
    expect(a.isBundle).toBe(false)

    const b = extractAttributes('Bundling Parfum Moscow Ice isi 3 30ml Limited Edition')
    expect(b.isBundle).toBe(true)
    expect(b.quantity).toBe(3)
    expect(b.isLimited).toBe(true)
    expect(b.sizes).toEqual(['30ml'])
  })

  it('menyamakan satuan (1 L = 1000 ml)', () => {
    expect(extractAttributes('Refill 1 L').sizes).toEqual(['1000ml'])
  })
})

describe('penghalang penggabungan otomatis', () => {
  const cases = [
    ['ukuran berbeda', 'Moscow Ice 50 ML', 'Moscow Ice 100 ML'],
    ['satuan vs bundling', 'Moscow Ice 50 ML', 'Bundling Moscow Ice 50 ML'],
    ['edisi terbatas vs reguler', 'Moscow Ice 50 ML', 'Moscow Ice 50 ML Limited Edition'],
  ]
  for (const [label, a, b] of cases) {
    it(`menolak: ${label}`, () => {
      const conflict = attributesConflict(extractAttributes(a), extractAttributes(b))
      expect(conflict.length).toBeGreaterThan(0)
    })
  }

  it('jumlah isi berbeda menghalangi', () => {
    const conflict = attributesConflict(
      extractAttributes('Paket Moscow Ice isi 2'),
      extractAttributes('Paket Moscow Ice isi 3'),
    )
    expect(conflict).toContain('jumlah isi berbeda')
  })

  it('nama mirip tapi ukuran beda TIDAK digabung otomatis', () => {
    const { groups, suggestions } = buildCanonicalGroups([
      L('shopee', 'S1', 'Dasfelix Moscow Ice - Extrait de Parfum 50 ML'),
      L('tiktok', 'T1', 'Dasfelix Moscow Ice - Extrait de Parfum 100 ML'),
    ])
    expect(groups.every(g => g.members.length === 1)).toBe(true)
    const s = suggestions.find(x => x.a.kode_produk === 'S1' || x.b.kode_produk === 'S1')
    expect(s.blocked).toBe(true)
    expect(s.reasons).toContain('ukuran berbeda')
  })
})

describe('urutan prioritas pencocokan', () => {
  it('SKU sama menggabungkan lintas marketplace', () => {
    const { groups } = buildCanonicalGroups([
      L('shopee', 'S1', 'Judul Shopee Beda Total', { sku: 'MI-50' }),
      L('tiktok', 'T1', 'Judul TikTok Beda Total', { sku: 'mi-50' }),
    ])
    const merged = groups.find(g => g.members.length === 2)
    expect(merged).toBeTruthy()
    expect(merged.source).toBe(MAPPING_SOURCE.SKU)
    expect(merged.status).toBe(MAPPING_STATUS.AUTO)
  })

  it('nama identik setelah normalisasi digabung bila atribut cocok', () => {
    const { groups } = buildCanonicalGroups([
      L('shopee', 'S1', '[Promo] Dasfelix Moscow Ice 50 ML (free pouch)'),
      L('tiktok', 'T1', 'Dasfelix Moscow Ice 50 ML | Parfum Pria Tahan Lama'),
    ])
    const merged = groups.find(g => g.members.length === 2)
    expect(merged.source).toBe(MAPPING_SOURCE.NAME)
  })

  it('mapping manual tidak ditimpa auto-match', () => {
    // Nama & SKU-nya mengarah ke pasangan lain, tapi mapping manual menang.
    const mappings = [
      { canonicalProductId: 'canon-1', canonicalProductName: 'Moscow Ice', shopeeProductId: 'S1', mappingStatus: 'verified', mappingSource: 'manual', mappingConfidence: 1 },
      { canonicalProductId: 'canon-1', canonicalProductName: 'Moscow Ice', tiktokProductId: 'T2', mappingStatus: 'verified', mappingSource: 'manual', mappingConfidence: 1 },
    ]
    const { groups } = buildCanonicalGroups([
      L('shopee', 'S1', 'Dasfelix Moscow Ice 50 ML', { sku: 'MI-50' }),
      L('tiktok', 'T1', 'Dasfelix Moscow Ice 50 ML', { sku: 'MI-50' }),
      L('tiktok', 'T2', 'Judul TikTok Lain Sama Sekali'),
    ], mappings)

    const canon = groups.find(g => g.id === 'canon-1')
    expect(canon.members.map(m => m.kode_produk).sort()).toEqual(['S1', 'T2'])
    expect(canon.source).toBe(MAPPING_SOURCE.MANUAL)
    // T1 tak boleh ikut tersedot walau SKU-nya sama dengan S1.
    const t1 = groups.find(g => g.members.some(m => m.kode_produk === 'T1'))
    expect(t1.members).toHaveLength(1)
  })
})

describe('produk satu marketplace', () => {
  it('tetap tampil dan tidak berstatus digabung', () => {
    const { groups } = buildCanonicalGroups([
      L('shopee', 'S1', 'Hanya Ada di Shopee 50 ML'),
      L('tiktok', 'T9', 'Hanya Ada di TikTok 75 ML'),
    ])
    expect(groups).toHaveLength(2)
    for (const g of groups) {
      expect(g.members).toHaveLength(1)
      expect(g.status).toBe(MAPPING_STATUS.UNMATCHED)
    }
  })
})

describe('normalisasi nama', () => {
  it('membuang penanda promo & ekor SEO, mempertahankan ukuran', () => {
    expect(normalizeProductName('[Exclusive Bunding] Moscow Ice 50 ML | Parfum Pria'))
      .toBe('moscow ice 50 ml')
  })

  it('nama Indonesia vs Inggris untuk produk sama tidak otomatis digabung', () => {
    // Bukan tugas normalisasi menerjemahkan bahasa — harus lewat mapping manual.
    const { groups, suggestions } = buildCanonicalGroups([
      L('shopee', 'S1', 'Parfum Pria Moscow Ice 50 ML'),
      L('tiktok', 'T1', "Men's Perfume Moscow Ice 50 ML"),
    ])
    expect(groups.every(g => g.members.length === 1)).toBe(true)
    expect(suggestions.length).toBeGreaterThan(0)      // muncul sebagai usulan
    expect(suggestions[0].blocked).toBe(false)         // tak ada konflik atribut
  })

  it('nama serupa tapi produk berbeda tidak digabung diam-diam', () => {
    const { groups } = buildCanonicalGroups([
      L('shopee', 'S1', 'Moscow Ice 50 ML'),
      L('tiktok', 'T1', 'Moscow Ice Bundling 50 ML'),
    ])
    expect(groups.every(g => g.members.length === 1)).toBe(true)
  })
})
