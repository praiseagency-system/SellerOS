// Penanda marketplace pada baris produk. Untuk baris hasil penggabungan
// lintas platform, tampilkan semuanya + tanda bahwa rupiah-nya dijumlah.
const CLS = {
  tiktok: 'bg-gray-700/60 text-gray-300',
  shopee: 'bg-orange-500/15 text-orange-300',
}
const NAME = { tiktok: 'TikTok', shopee: 'Shopee' }

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
      {product.merged && (
        <span title="Sales & pesanan dijumlah dari dua marketplace; traffic, CTR, dan CR memakai angka marketplace dengan omzet terbesar"
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-600/15 text-blue-300">
          digabung
        </span>
      )}
    </span>
  )
}
