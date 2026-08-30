// Pembungkus modul GMV Max: top-strip (pilih periode + Upload) lalu render
// sub-halaman sesuai `page`. Dipakai App.jsx untuk semua route gmv_*.
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { UploadModal } from '../../components/gmvmax/modals'
import DateRangePicker from '../../components/gmvmax/DateRangePicker'
import DashboardPage from './DashboardPage'
import OverviewPage from './OverviewPage'
import CampaignAdsPage from './CampaignAdsPage'
import CreatorPage from './CreatorPage'
import ProductPage from './ProductPage'
import InsightPage from './InsightPage'
import BoostPage from './BoostPage'
import InputPage from './InputPage'
import LogPage from './LogPage'
import FeatureRegistryPage from './FeatureRegistryPage'

const PAGES = {
  gmv_dashboard: DashboardPage,
  gmv_overview: OverviewPage,
  gmv_campaign: CampaignAdsPage,
  gmv_creator: CreatorPage,
  gmv_product: ProductPage,
  gmv_insight: InsightPage,
  gmv_boost: BoostPage,
  gmv_log: LogPage,
  gmv_input: InputPage,
  gmv_features: FeatureRegistryPage,
}

export default function GmvMaxModule({ page, onNavigate }) {
  const { hasData, loading, creativesLoading, freshness } = useGmvMax()
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
          {freshness && (
            <span
              className={freshness.stale
                ? 'ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500'
                : 'ml-auto inline-flex items-center gap-1.5 text-xs text-ink-faint'}
              title="Snapshot harian ditulis worker ±07:30 WIB — data hari N muncul keesokan paginya. Daftar disegarkan otomatis saat tab kembali dibuka."
            >
              <span className={`w-1.5 h-1.5 rounded-full ${freshness.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {freshness.stale
                ? `Data tertinggal ${freshness.behind} hari · terakhir ${freshness.label}`
                : `Data per ${freshness.label}${freshness.writtenLabel ? ` · ditulis ${freshness.writtenLabel}` : ''}`}
            </span>
          )}
        </div>
      )}
      <Page onOpenUpload={() => setShowUpload(true)} onNavigate={onNavigate} />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
