import { useState, useEffect, useRef, useMemo } from 'react'
import { Calendar, Layers, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

// Pemilih bulan grid bertema gelap (dipakai Performa Toko + Import Kuadran).
// value  : { mode:'month'|'lifetime', month:'YYYY-MM'|null }
// onChange(value)
// enabledMonths : array 'YYYY-MM' yang boleh dipilih. null = SEMUA bulan boleh
//                 (mode import — data belum ada, bebas pilih periode).
// allowLifetime : tampilkan opsi Lifetime (mode filter tampilan).
// years         : daftar tahun untuk navigasi (default: dari enabledMonths / tahun ini ±1).
// align         : 'left' | 'right' — arah munculnya dropdown.
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS_ID[+m - 1]} ${y}` }

export default function MonthPicker({
  value, onChange, enabledMonths = null, allowLifetime = false,
  years: yearsProp = null, align = 'right', placeholder = 'Pilih bulan',
  lifetimeLabel = 'Lifetime',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const thisYear = new Date().getFullYear()

  const years = useMemo(() => {
    if (yearsProp?.length) return [...new Set(yearsProp.map(String))].sort()
    if (enabledMonths?.length) return [...new Set(enabledMonths.map(m => m.slice(0, 4)))].sort()
    return [thisYear - 1, thisYear, thisYear + 1].map(String)
  }, [yearsProp, enabledMonths, thisYear])

  const [viewYear, setViewYear] = useState(
    () => (value?.month ? value.month.slice(0, 4) : years[years.length - 1]) || String(thisYear))

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [])

  const yi = years.indexOf(viewYear)
  const label = value?.mode === 'month' && value.month ? monthLabel(value.month) : (allowLifetime ? lifetimeLabel : placeholder)
  // enabledMonths null → semua bulan aktif (mode import).
  const has = (mm) => enabledMonths == null || enabledMonths.includes(`${viewYear}-${mm}`)

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-fill/5 border border-line/15 text-ink hover:border-blue-600/40 transition-colors w-full justify-between">
        <span className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          {label}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-2 z-50 flex glass-modal rounded-2xl overflow-hidden min-w-[320px]`}>
          {allowLifetime && (
            <div className="w-28 flex-shrink-0 border-r border-line/10 p-1.5 space-y-0.5">
              <button
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                  value?.mode === 'month' ? 'bg-blue-600/15 text-blue-500' : 'text-ink-muted hover:bg-fill/5'}`}>
                <Calendar className="w-3.5 h-3.5" /> Per Bulan
              </button>
              <button onClick={() => { onChange({ mode: 'lifetime', month: null }); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                  value?.mode === 'lifetime' ? 'bg-blue-600/15 text-blue-500' : 'text-ink-muted hover:bg-fill/5'}`}>
                <Layers className="w-3.5 h-3.5" /> {lifetimeLabel}
              </button>
            </div>
          )}
          <div className="p-3 flex-1">
            <div className="flex items-center justify-between mb-2.5">
              <button disabled={yi <= 0} onClick={() => setViewYear(years[yi - 1])}
                className="text-ink-faint hover:text-ink disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-bold text-ink-strong">{viewYear}</span>
              <button disabled={yi >= years.length - 1} onClick={() => setViewYear(years[yi + 1])}
                className="text-ink-faint hover:text-ink disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS_ID.map((m, i) => {
                const mm = String(i + 1).padStart(2, '0')
                const ym = `${viewYear}-${mm}`
                const enabled = has(mm)
                const active = value?.mode === 'month' && value.month === ym
                return (
                  <button key={mm} disabled={!enabled}
                    onClick={() => { onChange({ mode: 'month', month: ym }); setOpen(false) }}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                      active ? 'bg-blue-600 text-white'
                        : enabled ? 'bg-fill/5 text-ink hover:bg-fill/10'
                        : 'text-ink-faint/40 cursor-not-allowed'}`}>
                    {m}
                  </button>
                )
              })}
            </div>
            {enabledMonths != null && (
              <p className="text-[10px] text-ink-faint mt-2.5">Bulan terang = ada datanya.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
