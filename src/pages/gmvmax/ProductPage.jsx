// Performa Produk — rollup GMV Max per produk (semua creative). Nama produk
// diambil dari menu Produk lewat kunci product_id = kode_produk.
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, fmtRp } from '../../components/gmvmax/ui'

export default function ProductPage({ onOpenUpload }) {
  const { products, thresholds, hasData } = useGmvMax()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    let l = products.filter(p => p.productId && (p.cost > 0 || p.revenue > 0))
    if (q.trim()) {
      const s = q.toLowerCase()
      l = l.filter(p => (p.name || '').toLowerCase().includes(s) || (p.productId || '').includes(s))
    }
    return l
  }, [products, q])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const matched = list.filter(p => p.name).length
  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
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
