// Penjaga refactor provenanceCore: signature yang dihitung BROWSER (Web Crypto)
// harus IDENTIK dengan yang dihitung WORKER (node:crypto). Kalau keduanya
// berbeda, unggah manual atas konten yang sama dengan hasil sync akan dianggap
// "konten berubah" → versi baru sia-sia & lineage kotor.
import { describe, it, expect } from 'vitest'
import { contentSignature as browserSignature } from '../contentSignature'
import { contentSignature as nodeSignature } from '../../gmvmax/provenance.mjs'

const sample = {
  workspaceId: '11111111-2222-3333-4444-555555555555',
  date: '2026-08-28',
  rows: [
    { campaignId: 'c2', productId: 'p9', videoId: 'v3', cost: 1500.4, grossRevenue: 9000, skuOrders: 4 },
    { campaignId: 'c1', productId: null, videoId: null, cost: 0, grossRevenue: null, skuOrders: 0 },
  ],
  totals: { cost: 1500.4, revenue: 9000, orders: 4 },
}

describe('contentSignature browser ⇄ node', () => {
  it('menghasilkan signature yang sama persis', async () => {
    expect(await browserSignature(sample)).toBe(nodeSignature(sample))
  })

  it('invarian terhadap urutan baris (sama seperti worker)', async () => {
    const reversed = { ...sample, rows: [...sample.rows].reverse() }
    expect(await browserSignature(reversed)).toBe(await browserSignature(sample))
  })

  it('beda konten → beda signature', async () => {
    const changed = {
      ...sample,
      rows: [{ ...sample.rows[0], cost: 1501 }, sample.rows[1]],
    }
    expect(await browserSignature(changed)).not.toBe(await browserSignature(sample))
  })

  it('camelCase (parser) dan snake_case (row DB) dianggap sama', async () => {
    const snake = {
      ...sample,
      rows: [
        { campaign_id: 'c2', product_id: 'p9', video_id: 'v3', cost: 1500.4, gross_revenue: 9000, sku_orders: 4 },
        { campaign_id: 'c1', product_id: null, video_id: null, cost: 0, gross_revenue: null, sku_orders: 0 },
      ],
    }
    expect(await browserSignature(snake)).toBe(await browserSignature(sample))
  })
})
