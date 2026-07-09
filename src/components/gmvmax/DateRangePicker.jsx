// Date range picker GMV Max (Opsi B): tombol rentang + popover berisi preset
// (Terbaru/7 hari/30 hari/Bulan ini/Semua) & kalender untuk rentang custom.
// Menggerakkan `range` di GmvMaxContext (lapisan customRange). Menggantikan
// dropdown-bulan + toggle window lama.
import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const DOW = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'] // pekan mulai Senin

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
// Offset kolom (0=Senin .. 6=Minggu) untuk tanggal 1 bulan tsb.
const mondayOffset = (y, m) => (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export default function DateRangePicker() {
  const { range, setRange, rangePresets, dateBounds, periodName } = useGmvMax()
  const [open, setOpen] = useState(false)
  const [viewOverride, setViewOverride] = useState(null) // navigasi manual bulan
  const [pending, setPending] = useState(null) // ISO awal saat memilih rentang custom
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPending(null) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const monthFromRange = range?.end
    ? { y: +range.end.split('-')[0], m: +range.end.split('-')[1] - 1 }
    : null
  const view = viewOverride || monthFromRange

  if (!dateBounds || !range || !view) return null

  const activeKey = range.key
  const pickPreset = p => { setRange({ start: p.start, end: p.end, key: p.key }); setPending(null); setOpen(false) }
  const pickDay = d => {
    if (!pending) { setPending(d); return }
    const [a, b] = d < pending ? [d, pending] : [pending, d]
    setRange({ start: a, end: b, key: 'custom' }); setPending(null); setOpen(false)
  }
  const shiftMonth = delta => setViewOverride(() => {
    const dt = new Date(Date.UTC(view.y, view.m + delta, 1)); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() }
  })

  const off = mondayOffset(view.y, view.m)
  const total = daysInMonth(view.y, view.m)
  const cells = [...Array(off).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { if (!open) setViewOverride(null); setOpen(o => !o) }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-line/10 text-sm text-ink hover:border-accent/40">
        <Calendar className="w-4 h-4 text-ink-muted" />
        <span className="max-w-[16rem] truncate">{periodName || 'Pilih rentang'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 left-0 flex gap-0 rounded-xl bg-surface border border-line/15 shadow-lg overflow-hidden">
          <div className="flex flex-col py-2 pr-2 pl-2 border-r border-line/10 min-w-[9.5rem]">
            {rangePresets.map(p => (
              <button key={p.key} onClick={() => pickPreset(p)}
                className={`text-left text-sm px-2.5 py-1.5 rounded-md transition-colors
                  ${activeKey === p.key ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:text-ink hover:bg-fill/5'}`}>
                {p.label}
              </button>
            ))}
            <div className={`text-left text-sm px-2.5 py-1.5 rounded-md ${activeKey === 'custom' ? 'bg-accent/10 text-accent font-medium' : 'text-ink-faint'}`}>
              Custom {pending ? '· pilih akhir' : '· klik kalender'}
            </div>
          </div>

          <div className="p-3 w-[16rem]">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => shiftMonth(-1)} className="p-1 rounded hover:bg-fill/5" aria-label="Bulan sebelumnya">
                <ChevronLeft className="w-4 h-4 text-ink-muted" />
              </button>
              <span className="text-sm font-medium text-ink">{MONTHS_ID[view.m]} {view.y}</span>
              <button onClick={() => shiftMonth(1)} className="p-1 rounded hover:bg-fill/5" aria-label="Bulan berikutnya">
                <ChevronRight className="w-4 h-4 text-ink-muted" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {DOW.map(d => <div key={d} className="text-[11px] text-ink-faint text-center py-1">{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />
                const day = iso(view.y, view.m, d)
                const inRange = day >= range.start && day <= range.end
                const isEdge = day === range.start || day === range.end
                const isPending = day === pending
                return (
                  <button key={day} onClick={() => pickDay(day)}
                    className={`text-xs text-center py-1.5 rounded-md transition-colors
                      ${isEdge || isPending ? 'bg-accent text-white font-medium'
                        : inRange ? 'bg-accent/10 text-accent'
                        : 'text-ink-muted hover:bg-fill/10'}`}>
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
