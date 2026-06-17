import { useState, useMemo } from 'react'
import {
  Package, Search, Copy, Trash2, Pencil, X, BarChart3, Plus, GitCompare,
} from 'lucide-react'
import { getProducts, deleteProduct, duplicateProduct } from '../utils/products'
import { computeCalc, productStatus } from '../utils/calc'

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
const STATUS_CLS = {
  red:    { dot: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/25' },
  yellow: { dot: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25' },
  green:  { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25' },
}
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }

// Lampirkan metrik terhitung ke tiap produk
function withMetrics(p) {
  const calc = computeCalc(p.state || {})
  const margin = calc ? calc.marginNoAd : null
  const status = productStatus(margin)
  return { ...p, calc, status }
}

export default function ProductsPage({ onOpenProduct, onNewProduct }) {
  const [refresh, setRefresh] = useState(0)
  const products = useMemo(() => {
    refresh
    return getProducts().map(withMetrics)
  }, [refresh])

  const [search, setSearch]   = useState('')
  const [fMarket, setFMarket] = useState('all')
  const [fCat, setFCat]       = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fMargin, setFMargin] = useState('')   // margin minimal
  const [fRoas, setFRoas]     = useState('')   // ROAS BEP maksimal
  const [selected, setSelected] = useState([]) // ids untuk compare
  const [showCompare, setShowCompare] = useState(false)

  const categories = useMemo(
    () => [...new Set(products.map(p => p.categoryLabel).filter(Boolean))],
    [products]
  )

  const filtered = useMemo(() => products.filter(p => {
    const q = search.trim().toLowerCase()
    if (q && !(`${p.name} ${p.sku || ''}`.toLowerCase().includes(q))) return false
    if (fMarket !== 'all' && p.platform !== fMarket) return false
    if (fCat !== 'all' && p.categoryLabel !== fCat) return false
    if (fStatus !== 'all' && p.status.key !== fStatus) return false
    if (fMargin !== '' && (p.calc == null || p.calc.marginNoAd < +fMargin)) return false
    if (fRoas !== '' && (p.calc?.roasBep == null || p.calc.roasBep > +fRoas)) return false
    return true
  }), [products, search, fMarket, fCat, fStatus, fMargin, fRoas])

  // Dashboard — realtime atas SELURUH database produk
  const dash = useMemo(() => {
    const withCalc = products.filter(p => p.calc)
    const sehat = products.filter(p => p.status.key === 'sehat').length
    const margins = withCalc.map(p => p.calc.marginNoAd)
    const roass = withCalc.map(p => p.calc.roasBep).filter(r => r != null)
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
    return {
      total: products.length,
      sehat,
      tidakSehat: products.length - sehat,
      marginAvg: avg(margins),
      roasAvg: avg(roass),
    }
  }, [products])

  function refreshNow() { setRefresh(k => k + 1); setSelected(s => s.filter(id => getProducts().some(p => p.id === id))) }
  function handleDelete(id) { deleteProduct(id); refreshNow() }
  function handleDuplicate(id) { duplicateProduct(id); refreshNow() }
  function toggleSelect(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const compareProducts = products.filter(p => selected.includes(p.id))

  return (
    <div className="p-6 max-w-6xl">
      {/* Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Produk" value={dash.total} icon={Package} accent="blue" />
        <StatCard label="Produk Sehat" value={dash.sehat} accent="green" />
        <StatCard label="Tidak Sehat" value={dash.tidakSehat} accent="red" />
        <StatCard label="Margin Rata-rata" value={dash.marginAvg != null ? `${dash.marginAvg.toFixed(1)}%` : '—'} accent="ink" />
        <StatCard label="ROAS BEP Rata-rata" value={dash.roasAvg != null ? `${dash.roasAvg.toFixed(1)}×` : '—'} accent="ink" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / SKU..."
            className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        </div>
        <Select value={fMarket} onChange={setFMarket} options={[['all', 'Semua Marketplace'], ['shopee', 'Shopee'], ['tiktok', 'TikTok']]} />
        <Select value={fCat} onChange={setFCat} options={[['all', 'Semua Kategori'], ...categories.map(c => [c, c])]} />
        <Select value={fStatus} onChange={setFStatus} options={[['all', 'Semua Status'], ['sehat', 'Sehat'], ['optimasi', 'Perlu Optimasi'], ['tidak-layak', 'Tidak Layak']]} />
        <input type="number" value={fMargin} onChange={e => setFMargin(e.target.value)} placeholder="Margin ≥ %"
          className="w-28 bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        <input type="number" value={fRoas} onChange={e => setFRoas(e.target.value)} placeholder="ROAS ≤ ×"
          className="w-28 bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        <button onClick={onNewProduct}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Produk Baru
        </button>
      </div>

      {/* Compare bar */}
      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-600/20">
          <span className="text-sm text-ink-muted">{selected.length} produk dipilih untuk dibandingkan</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected([])} className="text-xs text-ink-faint hover:text-ink">Batal</button>
            <button onClick={() => setShowCompare(true)} disabled={selected.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <GitCompare className="w-3.5 h-3.5" /> Bandingkan
            </button>
          </div>
        </div>
      )}

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-line/8 rounded-2xl flex flex-col items-center justify-center text-center p-12 min-h-[240px]">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3">
            <Package className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-ink">{products.length === 0 ? 'Belum ada produk tersimpan' : 'Tidak ada produk yang cocok'}</p>
          <p className="text-xs text-ink-faint mt-1 max-w-[260px]">
            {products.length === 0 ? 'Buka Kalkulator, hitung sebuah produk, lalu klik "Simpan Produk".' : 'Coba ubah filter atau kata kunci pencarian.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => (
            <ProductCard key={p.id} p={p}
              selected={selected.includes(p.id)}
              onSelect={() => toggleSelect(p.id)}
              onOpen={() => onOpenProduct(p)}
              onDuplicate={() => handleDuplicate(p.id)}
              onDelete={() => handleDelete(p.id)} />
          ))}
        </div>
      )}

      {showCompare && (
        <CompareModal products={compareProducts} onClose={() => setShowCompare(false)} />
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, accent }) {
  const color = accent === 'green' ? 'text-green-400' : accent === 'red' ? 'text-red-400' : accent === 'blue' ? 'text-blue-400' : 'text-ink-strong'
  return (
    <div className="bg-surface border border-line/8 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-faint" />}
        <p className="text-[11px] text-ink-faint">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="bg-fill/5 border border-line/10 rounded-xl px-3 py-2 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-blue-600/40 max-w-[180px]">
      {options.map(([v, l]) => <option key={v} value={v} className="bg-surface">{l}</option>)}
    </select>
  )
}

function ProductCard({ p, selected, onSelect, onOpen, onDuplicate, onDelete }) {
  const s = STATUS_CLS[p.status.color] || STATUS_CLS.green
  const calc = p.calc
  return (
    <div className={`bg-surface border rounded-2xl p-4 transition-all ${selected ? 'border-blue-600/50 ring-1 ring-blue-600/30' : 'border-line/8 hover:border-line/20'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-strong truncate">{p.name}</p>
          <p className="text-[11px] text-ink-faint truncate">
            {p.sku ? `${p.sku} · ` : ''}{PLATFORM_LABEL[p.platform] || p.platform}{p.categoryLabel ? ` · ${p.categoryLabel}` : ''}
          </p>
        </div>
        <label className="flex-shrink-0 cursor-pointer mt-0.5">
          <input type="checkbox" checked={selected} onChange={onSelect} className="accent-blue-600 w-4 h-4" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-3 mb-3">
        <Metric label="Harga Jual" value={calc ? fmt(calc.h) : '—'} />
        <Metric label="Profit Bersih" value={calc ? fmt(calc.profit) : '—'} cls={calc && calc.profit >= 0 ? 'text-green-400' : 'text-red-400'} />
        <Metric label="Margin Bersih" value={calc ? `${calc.marginNoAd.toFixed(1)}%` : '—'} />
        <Metric label="ROAS BEP" value={calc?.roasBep != null ? `${calc.roasBep.toFixed(1)}×` : '—'} />
      </div>

      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{p.status.label}
        </span>
        <div className="flex items-center gap-1">
          <IconBtn title="Buka di kalkulator" onClick={onOpen}><Pencil className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Duplikat" onClick={onDuplicate}><Copy className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Hapus" onClick={onDelete} danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, cls = 'text-ink-strong' }) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}

function IconBtn({ children, onClick, title, danger }) {
  return (
    <button title={title} onClick={onClick}
      className={`p-1.5 rounded-lg transition-colors ${danger ? 'text-ink-faint hover:text-red-400 hover:bg-red-500/10' : 'text-ink-faint hover:text-ink hover:bg-fill/8'}`}>
      {children}
    </button>
  )
}

function CompareModal({ products, onClose }) {
  const rows = [
    ['Harga Jual',     p => p.calc ? fmt(p.calc.h) : '—'],
    ['Profit Bersih',  p => p.calc ? fmt(p.calc.profit) : '—'],
    ['Margin Bersih',  p => p.calc ? `${p.calc.marginNoAd.toFixed(1)}%` : '—'],
    ['ROAS BEP',       p => p.calc?.roasBep != null ? `${p.calc.roasBep.toFixed(1)}×` : '—'],
    ['Health Score',   p => p.status.label],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-2xl border border-line/10 shadow-2xl flex flex-col max-h-[82vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <h2 className="font-semibold text-ink-strong flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" /> Perbandingan Produk</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-auto p-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>{[
                <th key="__h" className="text-left text-xs font-medium text-ink-faint p-2 sticky left-0 bg-surface">Metrik</th>,
                ...products.map(p => (
                  <th key={p.id} className="text-right text-xs font-semibold text-ink-strong p-2 min-w-[120px]">{p.name}</th>
                )),
              ]}</tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label} className="border-t border-line/8">{[
                  <td key="__l" className="text-left text-ink-muted p-2 sticky left-0 bg-surface">{label}</td>,
                  ...products.map(p => (
                    <td key={p.id} className="text-right tabular-nums text-ink p-2">{fn(p)}</td>
                  )),
                ]}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
