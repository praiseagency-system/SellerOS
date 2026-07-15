// Pembungkus modul GMV Max: top-strip (pilih periode + Upload) lalu render
// sub-halaman sesuai `page`. Dipakai App.jsx untuk semua route gmv_*.
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { UploadModal } from '../../components/gmvmax/modals'
import DateRangePicker from '../../components/gmvmax/DateRangePicker'
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

export default function GmvMaxModule({ page, onNavigate }) {
  const { hasData, loading, creativesLoading } = useGmvMax()
  const [showUpload, setShowUpload] = useState(false)
  const Page = PAGES[page] || DashboardPage

  if (loading) {
    return <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  }

  return (
    <div>
      {/* Tombol Upload dihapus (2026-07-12) — upload cukup lewat menu Import
          Data. Modal upload tetap ada utk CTA empty-state halaman. */}
      {hasData && page !== 'gmv_input' && (
        <div className="flex items-center gap-3 px-6 pt-4">
          <DateRangePicker />
          {creativesLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> memuat data periode…
            </span>
          )}
        </div>
      )}
      <Page onOpenUpload={() => setShowUpload(true)} onNavigate={onNavigate} />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
