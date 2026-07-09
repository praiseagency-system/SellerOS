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

export default function GmvMaxModule({ page }) {
  const { months, period, setPeriod, windowDays, setWindowDays, windows, hasData, loading } = useGmvMax()
  const [showUpload, setShowUpload] = useState(false)
  const Page = PAGES[page] || DashboardPage

  if (loading) {
    return <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  }

  const selectValue = period == null ? (months[0]?.key || 'all') : period

  return (
    <div>
      {hasData && page !== 'gmv_input' && (
        <div className="flex items-center justify-between gap-3 px-6 pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={selectValue} onChange={e => setPeriod(e.target.value)}
              title="Pilih bulan"
              className="px-3 py-1.5 rounded-lg bg-surface border border-line/10 text-sm text-ink max-w-[14rem]">
              <option value="all">Semua bulan</option>
              {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            {selectValue !== 'all' && (
              <div className="inline-flex items-center rounded-lg bg-surface border border-line/10 p-0.5"
                title="Rentang data yang diagregasi (berapa hari terakhir)">
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
