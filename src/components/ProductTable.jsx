import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
import { QUADRANT_CONFIG, fmtNum, fmtIDR } from '../utils/quadrantUtils'

const COLUMNS = [
  { key: 'nama_produk', label: 'Produk', sortable: true },
  { key: 'quadrant', label: 'Kuadran', sortable: true },
  { key: 'pengunjung', label: 'Pengunjung', sortable: true },
  { key: 'conversion_rate', label: 'Konversi', sortable: true },
  { key: 'atc_rate', label: 'ATC Rate', sortable: true },
  { key: 'pesanan', label: 'Pesanan', sortable: true },
  { key: 'total_penjualan', label: 'Total Penjualan', sortable: true },
]

export default function ProductTable({ products, activeQuadrant, onReset }) {
  const [sort, setSort] = useState({ key: 'pengunjung', dir: 'desc' })
  const [search, setSearch] = useState('')

  function toggleSort(key) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    )
  }

  const filtered = useMemo(() => {
    let list = products
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.nama_produk.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const aVal = a[sort.key] ?? -Infinity
      const bVal = b[sort.key] ?? -Infinity
      if (typeof aVal === 'string') {
        return sort.dir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      return sort.dir === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [products, sort, search])

  function SortIcon({ col }) {
    if (sort.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />
    return sort.dir === 'asc'
      ? <ArrowUp className="w-3 h-3" />
      : <ArrowDown className="w-3 h-3" />
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-800 text-sm">
            Daftar Produk
            {activeQuadrant && (
              <span
                className="ml-2 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: QUADRANT_CONFIG[activeQuadrant].color + '22',
                  color: QUADRANT_CONFIG[activeQuadrant].color,
                }}
              >
                Q{activeQuadrant} · {QUADRANT_CONFIG[activeQuadrant].short}
              </span>
            )}
          </h3>
          <span className="text-xs text-ink-muted">{filtered.length} produk</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Cari produk..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Ganti File
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`
                    px-4 py-3 text-left text-xs font-medium text-ink-muted whitespace-nowrap
                    ${col.sortable ? 'cursor-pointer hover:text-gray-800 select-none' : ''}
                    ${col.key === 'nama_produk' ? 'min-w-56' : ''}
                  `}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && <SortIcon col={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((p, i) => {
              const cfg = QUADRANT_CONFIG[p.quadrant]
              return (
                <tr key={p.kode_produk + i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="max-w-xs">
                      <p className="text-gray-800 text-xs font-medium leading-snug line-clamp-2">
                        {p.nama_produk}
                      </p>
                      <p className="text-ink-muted text-xs mt-0.5">{p.kode_produk}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: cfg.color + '22', color: cfg.color }}
                    >
                      Q{p.quadrant} · {cfg.short}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-faint font-mono text-xs whitespace-nowrap">
                    {fmtNum(p.pengunjung)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold ${
                      p.conversion_rate >= 2 ? 'text-green-600' :
                      p.conversion_rate >= 1 ? 'text-yellow-600' : 'text-red-500'
                    }`}>
                      {p.conversion_rate?.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-faint text-xs whitespace-nowrap">
                    {p.atc_rate !== null ? `${p.atc_rate?.toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-ink-faint font-mono text-xs whitespace-nowrap">
                    {fmtNum(p.pesanan)}
                  </td>
                  <td className="px-4 py-3 text-ink-faint text-xs whitespace-nowrap">
                    {fmtIDR(p.total_penjualan)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-ink-muted text-sm">
            Tidak ada produk ditemukan
          </div>
        )}
      </div>
    </div>
  )
}
