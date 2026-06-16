import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { TIKTOK_FEE_DATA, tiktokPlatformRate } from '../utils/tiktokFeeData'

// Picker kategori Komisi Dinamis TikTok — gaya Shopee (klaster → kategori + pencarian global).
// Menampilkan rate live sesuai tipe penjual & skenario yang sedang aktif.
export default function TikTokPicker({ isMall, gmvMax, gxp, onSelect, onClose }) {
  const [activeMain, setActiveMain] = useState(TIKTOK_FEE_DATA[0].id)
  const [search, setSearch] = useState('')

  const mainCat = TIKTOK_FEE_DATA.find(c => c.id === activeMain)
  const isSearching = search.trim().length > 0
  const scenLabel = gmvMax && gxp ? 'GMV Max + GXP' : gxp ? 'Growth Xtra' : gmvMax ? 'GMV Max ≥3%' : 'Standar'

  const globalResults = useMemo(() => {
    if (!isSearching) return null
    const q = search.toLowerCase()
    const res = []
    for (const main of TIKTOK_FEE_DATA)
      for (const sub of main.subs)
        if (sub.label.toLowerCase().includes(q) || main.label.toLowerCase().includes(q))
          res.push({ ...sub, _main: main })
    return res
  }, [search, isSearching])

  function pick(main, sub) {
    onSelect({
      label: `${sub.label} · ${main.label}`,
      gxpFee: main.gxpFee,
      dinamis: sub.dinamis,
      mkt: sub.mkt,
      mall: sub.mall,
    })
    onClose()
  }

  function Card({ main, sub, breadcrumb }) {
    const platform = tiktokPlatformRate(sub, isMall, gmvMax, gxp)
    const std = (isMall ? sub.mall : sub.mkt)[0]
    const saving = std - platform
    const total = platform + sub.dinamis
    return (
      <button onClick={() => pick(main, sub)}
        className="w-full text-left rounded-xl border border-line/8 p-3 hover:border-blue-600/30 hover:bg-blue-600/5 transition-all">
        {breadcrumb && <p className="text-[11px] text-ink-faint mb-1">{main.label}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink leading-snug">{sub.label}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving > 0.01 && <span className="text-[11px] text-green-400 tabular-nums">−{saving.toFixed(2)}%</span>}
            <span className="text-sm font-bold tabular-nums text-blue-400">{total.toFixed(2)}%</span>
          </div>
        </div>
        <p className="text-[11px] text-ink-faint mt-1 tabular-nums">
          Platform {platform.toFixed(2)}% + Dinamis {sub.dinamis.toFixed(2)}%
        </p>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-2xl border border-line/10 shadow-2xl flex flex-col max-h-[82vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-ink-strong">Pilih Kategori Komisi Dinamis</h2>
            <p className="text-xs text-ink-faint mt-0.5">
              {isMall ? 'Mall' : 'Marketplace'} · skenario: <span className="text-blue-400">{scenLabel}</span> · berlaku 18 Mei 2026
            </p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-line/8 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kategori di semua klaster..."
              className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" autoFocus />
            {isSearching && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </div>

        {/* Body */}
        {isSearching ? (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {globalResults.length === 0 && <p className="text-sm text-ink-faint text-center py-10">Tidak ada hasil</p>}
            {globalResults.length > 0 && <p className="text-xs text-ink-faint mb-1">{globalResults.length} hasil ditemukan</p>}
            {globalResults.map((r, i) => <Card key={i} main={r._main} sub={r} breadcrumb />)}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className="w-36 flex-shrink-0 border-r border-line/8 overflow-y-auto">
              {TIKTOK_FEE_DATA.map(cat => (
                <button key={cat.id} onClick={() => setActiveMain(cat.id)}
                  className={`w-full text-left px-4 py-3.5 text-sm font-medium transition-colors border-b border-line/5 ${
                    activeMain === cat.id ? 'bg-blue-600/15 text-blue-400 font-semibold' : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0 overflow-y-auto px-4 py-3 space-y-2.5">
              {mainCat?.subs.map((sub, i) => <Card key={i} main={mainCat} sub={sub} />)}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-line/8 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink transition-colors">Tutup</button>
        </div>
      </div>
    </div>
  )
}
