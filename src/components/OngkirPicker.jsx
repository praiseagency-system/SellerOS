import { useState, useMemo } from 'react'
import { Search, X, Package, Truck } from 'lucide-react'
import { ONGKIR_FEE_DATA } from '../utils/ongkirFeeData'

export default function OngkirPicker({ onSelect, onClose }) {
  const [activeMain, setActiveMain] = useState(ONGKIR_FEE_DATA[0].id)
  const [activeSub,  setActiveSub]  = useState(ONGKIR_FEE_DATA[0].subs[0].label)
  const [search, setSearch] = useState('')

  const mainCat = ONGKIR_FEE_DATA.find(c => c.id === activeMain)
  const subCat  = mainCat?.subs.find(s => s.label === activeSub)
  const isSearching = search.trim().length > 0

  const globalResults = useMemo(() => {
    if (!isSearching) return null
    const q = search.toLowerCase()
    const results = []
    for (const main of ONGKIR_FEE_DATA) {
      for (const sub of main.subs) {
        for (const item of sub.items) {
          if (
            item.label.toLowerCase().includes(q) ||
            item.tags.some(t => t.toLowerCase().includes(q))
          ) {
            results.push({ ...item, _mainLabel: main.label, _subLabel: sub.label })
          }
        }
      }
    }
    return results
  }, [search, isSearching])

  const filteredItems = isSearching ? [] : (subCat?.items || [])

  function switchMain(id) {
    setActiveMain(id)
    const cat = ONGKIR_FEE_DATA.find(c => c.id === id)
    setActiveSub(cat?.subs[0]?.label || '')
    setSearch('')
  }

  function switchSub(label) {
    setActiveSub(label)
    setSearch('')
  }

  function pick(item, size) {
    onSelect({
      label: `${item.label} — Ukuran ${size === 'biasa' ? 'Biasa' : 'Khusus'}`,
      fee:   size === 'biasa' ? item.feeBiasa : item.feeKhusus,
      size,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-2xl border border-line/10 shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-ink-strong">Pilih Fee Kategori Ongkir</h2>
            <p className="text-xs text-ink-faint mt-0.5">Biaya Layanan GO XTRA — berlaku mulai 2 Mei 2026</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-4 mt-3 px-4 py-2.5 bg-surface2 border border-line/8 rounded-xl flex-shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              <span><span className="font-semibold text-blue-400">Ukuran Biasa</span> — berat &lt; 5kg &amp; dimensi &lt; 60cm / 20.000cm³  (maks. Rp40.000/produk)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-orange-400" />
              <span><span className="font-semibold text-orange-400">Ukuran Khusus</span> — berat ≥ 5kg atau dimensi ≥ 60cm / 20.000cm³  (maks. Rp60.000/produk)</span>
            </span>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-line/8 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari produk di semua kategori..."
              className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              autoFocus
            />
            {isSearching && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {isSearching ? (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {globalResults.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-10">Tidak ada hasil</p>
            )}
            {globalResults.length > 0 && (
              <p className="text-xs text-ink-faint mb-2">{globalResults.length} hasil ditemukan</p>
            )}
            {globalResults.map((item, i) => (
              <ItemCard key={i} item={item} onPick={pick} showBreadcrumb />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">

            {/* Col 1 — Kategori utama */}
            <div className="w-28 flex-shrink-0 border-r border-line/8 overflow-y-auto">
              {ONGKIR_FEE_DATA.map(cat => (
                <button key={cat.id} onClick={() => switchMain(cat.id)}
                  className={`w-full text-left px-4 py-3.5 text-sm font-medium transition-colors border-b border-line/5 ${
                    activeMain === cat.id
                      ? 'bg-orange-500/12 text-orange-400 font-semibold'
                      : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Col 2 — Sub-kategori */}
            <div className="w-44 flex-shrink-0 border-r border-line/8 overflow-y-auto">
              {mainCat?.subs.map(sub => (
                <button key={sub.label} onClick={() => switchSub(sub.label)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-line/5 ${
                    activeSub === sub.label
                      ? 'bg-orange-500/12 text-orange-400 font-semibold'
                      : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
                  }`}>
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Col 3 — Items */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-4 py-3 space-y-2.5">
              {filteredItems.length === 0 && (
                <p className="text-sm text-ink-faint text-center py-10">Tidak ada hasil</p>
              )}
              {filteredItems.map((item, i) => (
                <ItemCard key={i} item={item} onPick={pick} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-line/8 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink transition-colors">
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

function ItemCard({ item, onPick, showBreadcrumb = false }) {
  const [expanded, setExpanded] = useState(false)
  const visibleTags = expanded ? item.tags : item.tags.slice(0, 6)
  return (
    <div className="rounded-xl border border-line/8 p-3 hover:border-orange-500/20 hover:bg-orange-500/3 transition-all">
      {showBreadcrumb && (
        <p className="text-[11px] text-ink-faint mb-1.5">{item._mainLabel} › {item._subLabel}</p>
      )}

      <p className="text-sm font-medium text-ink leading-snug mb-2.5">{item.label}</p>

      {/* Fee + buttons row */}
      <div className="flex items-center justify-between gap-2">
        {/* Biasa */}
        <div className="flex items-center gap-2 flex-1">
          <div className="text-center min-w-[3.5rem]">
            <p className="text-[10px] text-ink-faint leading-none mb-0.5">Biasa</p>
            <p className="text-sm font-bold tabular-nums text-blue-400">{item.feeBiasa.toFixed(1)}%</p>
          </div>
          <button
            onClick={() => onPick(item, 'biasa')}
            className="flex-1 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Pilih Biasa
          </button>
        </div>

        <div className="w-px h-8 bg-line/10 flex-shrink-0" />

        {/* Khusus */}
        <div className="flex items-center gap-2 flex-1">
          <div className="text-center min-w-[3.5rem]">
            <p className="text-[10px] text-ink-faint leading-none mb-0.5">Khusus</p>
            <p className="text-sm font-bold tabular-nums text-orange-400">{item.feeKhusus.toFixed(1)}%</p>
          </div>
          <button
            onClick={() => onPick(item, 'khusus')}
            className="flex-1 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
            Pilih Khusus
          </button>
        </div>
      </div>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {visibleTags.map((tag, j) => (
            <span key={j} className="text-[11px] bg-fill/8 text-ink-faint px-2 py-0.5 rounded-md">{tag}</span>
          ))}
          {!expanded && item.tags.length > 6 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[11px] text-blue-400 hover:text-blue-300 px-1 transition-colors">
              +{item.tags.length - 6} lainnya
            </button>
          )}
          {expanded && item.tags.length > 6 && (
            <button
              onClick={() => setExpanded(false)}
              className="text-[11px] text-ink-faint hover:text-ink-muted px-1 transition-colors">
              Sembunyikan
            </button>
          )}
        </div>
      )}
    </div>
  )
}
