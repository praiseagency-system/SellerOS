// Pembungkus modul GMV Max: top-strip (pilih periode + Upload) lalu render
// sub-halaman sesuai `page`. Dipakai App.jsx untuk semua route gmv_*.
import { useState } from 'react'
import { UploadCloud, Loader2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { UploadModal } from '../../components/gmvmax/modals'
import DashboardPage from './DashboardPage'
import OverviewPage from './OverviewPage'
import CheckPage from './CheckPage'
import CreatorPage from './CreatorPage'
import InsightPage from './InsightPage'
import InputPage from './InputPage'
import HistoryPage from './HistoryPage'

const PAGES = {
  gmv_dashboard: DashboardPage,
  gmv_overview: OverviewPage,
  gmv_check: CheckPage,
  gmv_creator: CreatorPage,
  gmv_insight: InsightPage,
  gmv_input: InputPage,
  gmv_history: HistoryPage,
}

export default function GmvMaxModule({ page }) {
  const { imports, period, setPeriod, hasData, loading } = useGmvMax()
  const [showUpload, setShowUpload] = useState(false)
  const Page = PAGES[page] || DashboardPage

  if (loading) {
    return <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  }

  return (
    <div>
      {hasData && (
        <div className="flex items-center justify-between gap-3 px-6 pt-4">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface border border-line/10 text-sm text-ink">
            <option value="all">Semua periode</option>
            {imports.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
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
