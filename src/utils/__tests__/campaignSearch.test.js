import { describe, it, expect } from 'vitest'
import { searchTokens, matchesCampaign } from '../campaignSearch'

const productMap = { p1: { name: 'Avalon Parfum 50ml' } }
const c = {
  name: '[BASIC- XBP] Co-funded Voucher - TikTok Shop by Tokopedia',
  parentCampaign: 'Gajian Sale Agustus & 9.9',
  items: [{ productId: 'p1', name: 'Mag 100ml', sku: 'AVL-100' }],
}
const hit = q => matchesCampaign(c, searchTokens(q), productMap)

describe('matchesCampaign', () => {
  it('kueri kosong → semua lolos', () => {
    expect(hit('')).toBe(true); expect(hit('   ')).toBe(true)
  })
  it('nama campaign, tak peduli huruf besar & spasi ganda', () => {
    expect(hit('co-funded  VOUCHER')).toBe(true)
  })
  it('semua kata harus ada, urutan bebas', () => {
    expect(hit('tokopedia voucher')).toBe(true)
    expect(hit('tokopedia shopee')).toBe(false)
  })
  it('judul campaign induk ikut dicari', () => {
    expect(hit('gajian 9.9')).toBe(true)
  })
  it('nama produk, nama varian, dan kode SKU ikut dicari', () => {
    expect(hit('avalon')).toBe(true)
    expect(hit('mag 100')).toBe(true)
    expect(hit('avl-100')).toBe(true)
  })
  it('campaign tanpa items tak melempar', () => {
    expect(matchesCampaign({ name: 'Flash' }, searchTokens('flash'), {})).toBe(true)
  })
})
