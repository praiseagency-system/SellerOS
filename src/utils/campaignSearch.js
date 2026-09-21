// Pencarian daftar campaign. Yang dicocokkan: nama campaign, judul campaign
// induk, nama produk, nama varian, dan kode SKU. Semua kata harus ketemu
// (urutan bebas), jadi "voucher tokopedia" menemukan
// "Co-funded Voucher - TikTok Shop by Tokopedia".

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

export function searchTokens(q) {
  const s = norm(q)
  return s ? s.split(' ') : []
}

export function campaignHaystack(c, productMap = {}) {
  const parts = [c?.name, c?.parentCampaign]
  const seen = new Set()
  for (const it of c?.items || []) {
    if (it.productId && !seen.has(it.productId)) {
      seen.add(it.productId)
      parts.push(productMap[it.productId]?.name)
    }
    parts.push(it.name, it.sku)
  }
  return norm(parts.filter(Boolean).join(' '))
}

export function matchesCampaign(c, tokens, productMap) {
  if (!tokens.length) return true
  const hay = campaignHaystack(c, productMap)
  return tokens.every(t => hay.includes(t))
}
