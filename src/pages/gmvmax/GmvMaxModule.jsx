// Pembungkus modul GMV Max: top-strip (pilih periode + Upload) lalu render
// sub-halaman sesuai `page`. Dipakai App.jsx untuk semua route gmv_*.
import { useState } from 'react'
import { UploadCloud, Loader2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { UploadModal } from '../../components/gmvmax/modals'
import DashboardPage from './DashboardPage'
import OverviewPage from './OverviewPage'
import CreatorPage from './CreatorPage'
import ProductPage from './ProductPage'
import InsightPage from './InsightPage'
import BoostPage from './BoostPage'
import InputPage from './InputPage'
import LogPage from './LogPage'

const PAGES = {
  gmv_dashboard: DashboardPage,
  gmv_overview: OverviewPage,
  gmv_creator: CreatorPage,
  gmv_product: ProductPage,
  gmv_insight: InsightPage,
  gmv_boost: BoostPage,
  gmv_log: LogPage,
  gmv_input: InputPage,
}

// Kelompokkan snapshot per bulan untuk optgroup (mis. "Juli 2026").
const MONTHS_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
function monthLabel(imp) {
  const s = imp.period_month || imp.snapshot_date
  const m = s && s.match(/^(\d{4})-(\d{2})/)
  return m ? `${MONTHS_FULL[(+m[2]) - 1]} ${m[1]}` : 'Lainnya'
}

export default function GmvMaxModule({ page }) {
  const { imports, period, setPeriod, windowDays, setWindowDays, windows, hasData, loading } = useGmvMax()
  const [showUpload, setShowUpload] = useState(false)
  const Page = PAGES[page] || DashboardPage

  if (loading) {
    return <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  }

  // Susun optgroup per bulan (imports sudah urut snapshot terbaru dulu).
  const groups = []
  for (const imp of imports) {
    const label = monthLabel(imp)
    let g = groups.find(x => x.label === label)
    if (!g) { g = { label, items: [] }; groups.push(g) }
    g.items.push(imp)
  }
  const selectValue = period == null ? (imports[0]?.id || 'all') : period

  return (
    <div>
      {hasData && (
        <div className="flex items-center justify-between gap-3 px-6 pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={selectValue} onChange={e => setPeriod(e.target.value)}
              title="Pilih snapshot harian (kumulatif s/d tanggal itu)"
              className="px-3 py-1.5 rounded-lg bg-surface border border-line/10 text-sm text-ink max-w-[16rem]">
              <option value="all">Semua (per bulan)</option>
              {groups.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((i, idx) => (
                    <option key={i.id} value={i.id}>
                      {i.name}{idx === 0 && g === groups[0] ? ' — terbaru' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectValue !== 'all' && (
              <div className="inline-flex items-center rounded-lg bg-surface border border-line/10 p-0.5"
                title="Jendela perbandingan performa">
                {windows.map(w => (
                  <button key={w.d} onClick={() => setWindowDays(w.d)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                      ${windowDays === w.d ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}>
                    {w.short}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium">
            <UploadCloud className="w-4 h-4" /> Upload
          </button>
        </div>
      )}
      <Page onOpenUpload={() => setShowUpload(true)} />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
