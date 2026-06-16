import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { FEE_DATA } from '../utils/feeData'

export default function CategoryPicker({ onSelect, onClose }) {
  const [activeMain, setActiveMain] = useState(FEE_DATA[0].id)
  const [activeSub,  setActiveSub]  = useState(FEE_DATA[0].subs[0].label)
  const [search, setSearch] = useState('')

  const mainCat = FEE_DATA.find(c => c.id === activeMain)
  const subCat  = mainCat?.subs.find(s => s.label === activeSub)
  const isSearching = search.trim().length > 0

  // Global search across ALL categories/sub-categories
  const globalResults = useMemo(() => {
    if (!isSearching) return null
    const q = search.toLowerCase()
    const results = []
    for (const main of FEE_DATA) {
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
    const cat = FEE_DATA.find(c => c.id === id)
    setActiveSub(cat?.subs[0]?.label || '')
    setSearch('')
  }

  function switchSub(label) {
    setActiveSub(label)
    setSearch('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-2xl border border-line/10 shadow-2xl flex flex-col max-h-[82vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <h2 className="font-semibold text-ink-strong">Pilih Fee Kategori Produk</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar — global, selalu tampil di atas */}
        <div className="px-4 py-3 border-b border-line/8 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari produk di semua kategori..."
              className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40"
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
          /* Global search results — flat list */
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {globalResults.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-10">Tidak ada hasil</p>
            )}
            {globalResults.length > 0 && (
              <p className="text-xs text-ink-faint mb-2">{globalResults.length} hasil ditemukan</p>
            )}
            {globalResults.map((item, i) => (
              <div key={i} className="rounded-xl border border-line/8 p-3 hover:border-blue-600/30 hover:bg-blue-600/5 transition-all">
                <p className="text-[11px] text-ink-faint mb-1.5">{item._mainLabel} › {item._subLabel}</p>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-ink leading-snug">{item.label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${item.special ? 'text-amber-400' : 'text-blue-400'}`}>
                      {item.fee.toFixed(2)}%
                    </span>
                    <button
                      onClick={() => { onSelect(item); onClose() }}
                      className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Pilih
                    </button>
                  </div>
                </div>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 6).map((tag, j) => (
                      <span key={j} className="text-[11px] bg-fill/8 text-ink-faint px-2 py-0.5 rounded-md">{tag}</span>
                    ))}
                    {item.tags.length > 6 && (
                      <span className="text-[11px] text-ink-faint">+{item.tags.length - 6} lainnya</span>
                    )}
                  </div>
                )}
                {item.special && (
                  <p className="text-[11px] text-amber-400/70 mt-1.5">* Ada ketentuan tambahan yang berlaku</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* 3-column browse layout */
          <div className="flex flex-1 min-h-0">

            {/* Col 1 — Kategori utama */}
            <div className="w-28 flex-shrink-0 border-r border-line/8 overflow-y-auto">
              {FEE_DATA.map(cat => (
                <button key={cat.id} onClick={() => switchMain(cat.id)}
                  className={`w-full text-left px-4 py-3.5 text-sm font-medium transition-colors border-b border-line/5 ${
                    activeMain === cat.id
                      ? 'bg-blue-600/15 text-blue-400 font-semibold'
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
                      ? 'bg-blue-600/15 text-blue-400 font-semibold'
                      : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
                  }`}>
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Col 3 — Item + fee */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-4 py-3 space-y-2.5">
              {filteredItems.length === 0 && (
                <p className="text-sm text-ink-faint text-center py-10">Tidak ada hasil</p>
              )}
              {filteredItems.map((item, i) => (
                <div key={i} className="rounded-xl border border-line/8 p-3 hover:border-blue-600/30 hover:bg-blue-600/5 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-ink leading-snug">{item.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-bold tabular-nums ${item.special ? 'text-amber-400' : 'text-blue-400'}`}>
                        {item.fee.toFixed(2)}%
                      </span>
                      <button
                        onClick={() => { onSelect(item); onClose() }}
                        className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        Pilih
                      </button>
                    </div>
                  </div>
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.slice(0, 7).map((tag, j) => (
                        <span key={j} className="text-[11px] bg-fill/8 text-ink-faint px-2 py-0.5 rounded-md">{tag}</span>
                      ))}
                      {item.tags.length > 7 && (
                        <span className="text-[11px] text-ink-faint">+{item.tags.length - 7} lainnya</span>
                      )}
                    </div>
                  )}
                  {item.special && (
                    <p className="text-[11px] text-amber-400/70 mt-1.5">* Ada ketentuan tambahan yang berlaku</p>
                  )}
                </div>
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
