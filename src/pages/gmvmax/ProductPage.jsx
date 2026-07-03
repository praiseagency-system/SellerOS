// Performa Produk — rollup GMV Max per produk (semua creative). Nama produk
// diambil dari menu Produk lewat kunci product_id = kode_produk.
import { useState, useMemo } from 'react'
import { Search, Package, Wallet, TrendingUp, Target, ShoppingCart, PlayCircle } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, StatCard, DeltaBadge, fmtRp, fmtRpC, fmtRoasX, DeliveryPills } from '../../components/gmvmax/ui'

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
  const { products, thresholds, hasData, prev, periodName } = useGmvMax()
  const [q, setQ] = useState('')

  // Kartu meringkas seluruh produk periode ini (tak terpengaruh pencarian);
  // kotak cari hanya menyaring tabel di bawahnya — seperti Monitoring Praise.
  const base = useMemo(() => productBase(products), [products])
  const list = useMemo(() => {
    if (!q.trim()) return base
    const s = q.toLowerCase()
    return base.filter(p => (p.name || '').toLowerCase().includes(s) || (p.productId || '').includes(s))
  }, [base, q])

  const sum = useMemo(() => sumProducts(base), [base])
  const prevSum = useMemo(() => (prev ? sumProducts(productBase(prev.products)) : null), [prev])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const matched = list.filter(p => p.name).length
  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
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
              <th className="py-2.5 px-3 font-medium text-right">#VIDEO</th>
              <th className="py-2.5 px-3 font-medium text-right" title="Video yang sedang Delivering / In queue / Learning">DELIVERY</th>
              <th className="py-2.5 px-3 font-medium text-right">COST</th>
              <th className="py-2.5 px-3 font-medium text-right">REVENUE</th>
              <th className="py-2.5 px-3 font-medium text-right">ROAS</th>
              <th className="py-2.5 pl-3 font-medium text-right">ORDERS</th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p.productId} className="border-b border-line/5 hover:bg-fill/5">
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
    </div>
  )
}
