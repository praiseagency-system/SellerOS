// Performa Produk — rollup GMV Max per produk (semua creative). Nama produk
// diambil dari menu Produk lewat kunci product_id = kode_produk.
import { useState, useMemo } from 'react'
import { Search, Package, Wallet, TrendingUp, Target, ShoppingCart, PlayCircle, Info } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, StatCard, DeltaBadge, fmtRp, fmtRpC, fmtRoasX, DeliveryPills, useSortableRows, SortTh } from '../../components/gmvmax/ui'
import ProductDetailModal from '../../components/gmvmax/ProductDetailModal'

const PRODUCT_SORT = {
  videoCount: (p) => p.videoCount,
  delivering: (p) => p.statusCounts?.delivering || 0,
  cost: (p) => p.cost,
  revenue: (p) => p.revenue,
  roas: (p) => p.roas,
  orders: (p) => p.orders,
}

const n = (v) => v.toLocaleString('id-ID')
const productBase = (arr) => arr.filter(p => p.productId && (p.cost > 0 || p.revenue > 0))

// Ringkasan agregat untuk kartu di atas tabel (delta bulan-lalu pakai fungsi
// yang sama pada produk periode sebelumnya).
function sumProducts(arr) {
  const s = { produk: arr.length, video: 0, cost: 0, revenue: 0, orders: 0, delivering: 0, in_queue: 0, learning: 0, roas: null }
  for (const p of arr) {
    s.video += p.videoCount || 0
    s.cost += p.cost || 0
    s.revenue += p.revenue || 0
    s.orders += p.orders || 0
    s.delivering += p.statusCounts?.delivering || 0
    s.in_queue += p.statusCounts?.in_queue || 0
    s.learning += p.statusCounts?.learning || 0
  }
  s.roas = s.cost > 0 ? s.revenue / s.cost : null
  return s
}

export default function ProductPage({ onOpenUpload }) {
  const { productsCard, videos, boost, thresholds, hasData, prev, periodName, requestBoost, updateBoost } = useGmvMax()
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState(null)   // produk yang dibuka modal detailnya

  // Kartu meringkas seluruh produk periode ini (tak terpengaruh pencarian);
  // kotak cari hanya menyaring tabel di bawahnya — seperti Monitoring Praise.
  // Revenue = channel PRODUCT CARD (dialokasikan per-produk); Video & Live tak dihitung.
  const base = useMemo(() => productBase(productsCard), [productsCard])
  const list = useMemo(() => {
    if (!q.trim()) return base
    const s = q.toLowerCase()
    return base.filter(p => (p.name || '').toLowerCase().includes(s) || (p.productId || '').includes(s))
  }, [base, q])

  const sum = useMemo(() => sumProducts(base), [base])
  const prevSum = useMemo(() => (prev ? sumProducts(productBase(prev.productsCard || [])) : null), [prev])
  const { sorted, sort, toggle } = useSortableRows(list, PRODUCT_SORT)

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const matched = list.filter(p => p.name).length
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {periodName && prev && (
        <p className="text-sm text-ink-muted -mb-1">{periodName} <span className="text-ink-faint">· vs {prev.name}</span></p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Package} tone="violet" label="Total Produk" value={n(sum.produk)} sub={`${n(sum.video)} video`}
          delta={<DeltaBadge cur={sum.produk} prev={prevSum?.produk} />} />
        <StatCard icon={Wallet} tone="amber" label="Total Cost" value={fmtRpC(sum.cost)}
          delta={<DeltaBadge cur={sum.cost} prev={prevSum?.cost} fmt={fmtRpC} goodDown />} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue (GMV)" value={fmtRpC(sum.revenue)}
          delta={<DeltaBadge cur={sum.revenue} prev={prevSum?.revenue} fmt={fmtRpC} />} />
        <StatCard icon={Target} tone="blue" label="ROAS" value={fmtRoasX(sum.roas)}
          delta={<DeltaBadge cur={sum.roas} prev={prevSum?.roas} fmt={(v) => v.toFixed(1) + 'x'} />} />
        <StatCard icon={ShoppingCart} tone="blue" label="Total Orders" value={n(sum.orders)}
          delta={<DeltaBadge cur={sum.orders} prev={prevSum?.orders} />} />
        <StatCard icon={PlayCircle} tone="green" label="Delivering" value={n(sum.delivering)} sub={`${n(sum.in_queue)} antre · ${n(sum.learning)} belajar`}
          delta={<DeltaBadge cur={sum.delivering} prev={prevSum?.delivering} />} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{list.length} produk · <span className="text-emerald-500">{matched}</span> ketemu nama di menu Produk</p>
      </div>

      <p className="text-[11px] text-ink-faint flex items-start gap-1.5 leading-relaxed -mt-1">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        Revenue di sini = channel <span className="text-ink-muted">Product card</span> saja (Video &amp; Live tak dihitung). Baris Product card bersifat level-campaign (tanpa product_id) → dialokasikan ke produk berdasarkan porsi revenue video tiap produk dalam campaign-nya; untuk campaign multi-produk angka bersifat <span className="text-ink-muted">estimasi</span>. Produk tanpa iklan Product card tak muncul.
      </p>

      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama produk atau Product ID…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-line/10 text-sm text-ink" />
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint border-b border-line/10">
              <th className="py-2.5 pr-3 font-medium">PRODUK</th>
              <SortTh label="#VIDEO" sortKey="videoCount" sort={sort} onSort={toggle} />
              <SortTh label="DELIVERY" sortKey="delivering" sort={sort} onSort={toggle} />
              <SortTh label="COST" sortKey="cost" sort={sort} onSort={toggle} />
              <SortTh label="REVENUE" sortKey="revenue" sort={sort} onSort={toggle} />
              <SortTh label="ROAS" sortKey="roas" sort={sort} onSort={toggle} />
              <SortTh label="ORDERS" sortKey="orders" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.productId} onClick={() => setDetail(p)} title="Lihat detail creative"
                className="border-b border-line/5 hover:bg-fill/5 cursor-pointer">
                <td className="py-2.5 pr-3 max-w-sm">
                  {p.name
                    ? <><p className="font-medium text-ink truncate">{p.name}</p>
                        <p className="text-xs text-ink-faint font-mono">{p.productId}</p></>
                    : <><p className="font-mono text-ink truncate">{p.productId}</p>
                        <p className="text-xs text-ink-faint">belum ada di menu Produk</p></>}
                </td>
                <td className="py-2.5 px-3 text-right text-ink-muted">{p.videoCount}</td>
                <td className="py-2.5 px-3 text-right"><DeliveryPills counts={p.statusCounts} /></td>
                <td className="py-2.5 px-3 text-right text-ink-muted whitespace-nowrap">{fmtRp(p.cost)}</td>
                <td className="py-2.5 px-3 text-right text-ink whitespace-nowrap">{fmtRp(p.revenue)}</td>
                <td className="py-2.5 px-3 text-right"><RoasBadge roas={p.roas} thresholds={thresholds} showLabel={false} /></td>
                <td className="py-2.5 pl-3 text-right text-ink-muted">{p.orders || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="text-sm text-ink-faint py-8 text-center">Tidak ada produk.</p>}
      </div>

      {detail && (
        <ProductDetailModal
          product={detail}
          videos={videos}
          boost={boost}
          periodName={periodName}
          onClose={() => setDetail(null)}
          onTrackBoost={async (v) => {
            // Video terdeteksi video code di TikTok → masuk pipeline sbg Terpasang.
            await requestBoost({ videoId: v.videoId, title: v.title, account: v.account, lifetime: v.lifetime })
            await updateBoost(v.videoId, { status: 'terpasang' })
          }}
        />
      )}
    </div>
  )
}
