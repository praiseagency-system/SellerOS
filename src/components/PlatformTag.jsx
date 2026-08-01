// Penanda marketplace pada baris produk. Untuk baris hasil penggabungan
// lintas platform, tampilkan semuanya + tanda bahwa rupiah-nya dijumlah.
const CLS = {
  tiktok: 'bg-gray-700/60 text-gray-300',
  shopee: 'bg-orange-500/15 text-orange-300',
}
const NAME = { tiktok: 'TikTok', shopee: 'Shopee' }
const STATUS_BADGE = {
  verified:     { label: 'digabung · terverifikasi', cls: 'bg-green-500/12 text-green-300' },
  auto_matched: { label: 'digabung · otomatis',      cls: 'bg-blue-600/15 text-blue-300' },
  needs_review: { label: 'perlu review',             cls: 'bg-amber-500/12 text-amber-300' },
}

export default function PlatformTag({ product }) {
  const list = product?.platforms
  if (!Array.isArray(list) || !list.length) return null
  // Satu platform: cukup tampil kalau tampilan sedang menggabungkan (merged
  // false + satu platform tetap berguna di mode "Semua").
  return (
    <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
      {list.map(m => (
        <span key={m.platform} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${CLS[m.platform] || CLS.tiktok}`}>
          {NAME[m.platform] || m.platform}
        </span>
      ))}
      {product.merged && (() => {
        const st = STATUS_BADGE[product.mappingStatus] || STATUS_BADGE.auto_matched
        return (
          <span title={`Semua metrik dihitung ulang dari cacah kedua marketplace. Dasar: ${(product.mappingReasons || []).join(' · ') || 'mapping tersimpan'}`}
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${st.cls}`}>
            {st.label}
          </span>
        )
      })()}
      {!product.merged && Array.isArray(product.platforms) && product.platforms.length === 1 && product.mappingStatus === 'unmatched' && (
        <span title="Produk ini hanya ditemukan di satu marketplace" className="text-[9px] text-ink-faint px-1">hanya 1 marketplace</span>
      )}
    </span>
  )
}
