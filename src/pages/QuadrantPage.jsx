import { useState } from 'react'
import QuadrantChart from '../components/QuadrantChart'
import QuadrantTableView from '../components/QuadrantTableView'
import ProductTable from '../components/ProductTable'
import QuadrantSummary from '../components/QuadrantSummary'
import MovementView from '../components/MovementView'
import FunnelView from '../components/FunnelView'
import TrendView from '../components/TrendView'
import ActionView from '../components/ActionView'
import Modal from '../components/Modal'
import ImportPage from './ImportPage'
import { useQuadrant } from '../contexts/QuadrantContext'
import { useLang } from '../contexts/LanguageContext'
import { CONVERSION_BENCHMARKS, fmtNum } from '../utils/quadrantUtils'
import {
  LayoutGrid, ScatterChart, List, Settings2, X,
  GitCompare, TrendingUp, Download, Filter, History, ListChecks, Layers
} from 'lucide-react'

function EmptyState({ onGoImport }) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
      <div className="w-20 h-20 rounded-3xl bg-fill/3 border border-line/8 flex items-center justify-center mb-5">
        <TrendingUp className="w-9 h-9 text-ink-faint" />
      </div>
      <h3 className="text-lg font-semibold text-ink-muted mb-2">{t('quadrant.empty.title')}</h3>
      <p className="text-sm text-ink-faint max-w-xs leading-relaxed">
        {t('quadrant.empty.desc')}
      </p>
      <button onClick={onGoImport}
        className="mt-6 flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
        <Download className="w-4 h-4" />{t('nav.import.label')}
      </button>
    </div>
  )
}

// Tab yang sumbunya terikat satu marketplace tak bisa menampilkan gabungan —
// minta pilih satu, sekalian jelaskan kenapa.
function PickOneMarketplace({ onPick, platforms, labels, why }) {
  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
      <Layers className="w-7 h-7 text-ink-faint mx-auto mb-2" />
      <p className="text-sm text-ink-muted">Pilih satu marketplace untuk tampilan ini.</p>
      <p className="text-xs text-ink-faint mt-1 max-w-md mx-auto leading-relaxed">{why}</p>
      <div className="flex gap-2 justify-center mt-4">
        {platforms.map(id => (
          <button key={id} onClick={() => onPick(id)}
            className="px-3.5 py-2 rounded-xl text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            {labels[id]?.name || id}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function QuadrantPage() {
  const {
    hasData, platform, platformLabels,
    productsWithQuadrant, filteredProducts,
    settings, effectiveSettings, trafficThreshold, updateSetting,
    activeTab, setActiveTab, activeQuadrant, setActiveQuadrant,
    isCompareMode, sessions,
    effMarketplace, setMarketplace, availablePlatforms, derivedMeta,
  } = useQuadrant()
  const { t } = useLang()

  const [showBenchmark, setShowBenchmark] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const TABS = [
    { id: 'kuadran',   label: t('quadrant.tab.kuadran'),   icon: LayoutGrid },
    ...(isCompareMode ? [{ id: 'perubahan', label: t('quadrant.tab.perubahan'), icon: GitCompare }] : []),
    { id: 'chart',     label: t('quadrant.tab.chart'),     icon: ScatterChart },
    { id: 'tabel',     label: t('quadrant.tab.tabel'),     icon: List },
    { id: 'funnel',    label: 'Funnel',                    icon: Filter },
    { id: 'tren',      label: 'Tren',                      icon: History },
    { id: 'aksi',      label: 'Aksi',                      icon: ListChecks },
  ]

  const trafficName = platformLabels[platform]?.traffic

  return (
    // Frame disamakan dgn section GMV Max (2026-07-12): kontainer p-6 max-w-7xl,
    // panel jadi kartu rounded — bukan workbench edge-to-edge lagi.
    <div className="p-6 space-y-4 max-w-7xl mx-auto">

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasData ? (
          <>
            <div className="flex items-center gap-0.5 bg-fill/5 rounded-lg p-0.5">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    activeTab === id ? 'bg-surface text-ink-strong shadow-sm' : 'text-ink-muted hover:text-ink'
                  }`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium">
                <Download className="w-3 h-3" /><span>{t('nav.import.label')}</span>
              </button>
              <button onClick={() => setShowBenchmark(s => !s)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showBenchmark ? 'bg-fill/10 border-line/20 text-ink-strong' : 'border-line/10 text-ink-muted hover:text-ink'
                }`}>
                <Settings2 className="w-3 h-3" /><span>{t('quadrant.benchmark')}</span>
              </button>
            </div>
          </>
        ) : (
          <span className="text-xs text-ink-faint">{t('quadrant.noData')}</span>
        )}
      </div>

      {/* Benchmark panel */}
      {showBenchmark && hasData && (
        <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
          <div className="flex flex-wrap gap-8 items-start">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Traffic</p>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Periode</label>
                  <div className="flex gap-1">
                    {[7, 14, 30].map(d => (
                      <button key={d} onClick={() => updateSetting('periodDays', d)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          settings.periodDays === d ? 'bg-blue-600 text-white' : 'bg-fill/5 text-ink-muted hover:bg-fill/10'
                        }`}>{d}h</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Target Harian</label>
                  <input type="number" value={settings.targetHarian}
                    onChange={e => updateSetting('targetHarian', Math.max(1, Number(e.target.value)))}
                    className="bg-fill/5 border border-line/10 rounded px-2 py-1 text-xs w-20 text-ink-strong focus:outline-none focus:ring-1 focus:ring-blue-600"
                    min={1} step={5} />
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Threshold</p>
                  <p className="font-bold text-ink-strong">{fmtNum(trafficThreshold)}
                    <span className="text-xs font-normal text-ink-muted ml-1">{trafficName}/{settings.periodDays}h</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Konversi</p>
              <div className="flex items-start gap-4">
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Batas CR</label>
                  <div className="flex items-center gap-1.5">
                    <input type="number" value={settings.conversionThreshold}
                      onChange={e => updateSetting('conversionThreshold', Number(e.target.value))}
                      className="bg-fill/5 border border-line/10 rounded px-2 py-1 text-xs w-20 text-ink-strong focus:outline-none focus:ring-1 focus:ring-blue-600"
                      min={0} step={0.25} />
                    <span className="text-xs text-ink-muted">%</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-ink-faint mb-1">Referensi harga</p>
                  <table className="text-xs">
                    <tbody>
                      {CONVERSION_BENCHMARKS.map(b => (
                        <tr key={b.label} className={settings.conversionThreshold === b.cr ? 'text-blue-500 font-semibold' : 'text-ink-faint'}>
                          <td className="pr-4">{b.label}</td>
                          <td>≥ {b.cr}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <button onClick={() => setShowBenchmark(false)} className="ml-auto self-start text-ink-faint hover:text-ink-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pemilih marketplace — "Semua" menggabungkan produk lintas platform
          lewat pencocokan nama (rupiah & pesanan dijumlah, rasio tidak). */}
      {availablePlatforms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-faint">Marketplace:</span>
          <div className="flex gap-1.5">
            {[
              ...(availablePlatforms.length > 1 ? [{ id: 'all', label: 'Semua' }] : []),
              ...availablePlatforms.map(id => ({ id, label: platformLabels[id]?.name || id })),
            ].map(m => (
              <button key={m.id} type="button" onClick={() => setMarketplace(m.id)}
                className={`px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-colors ${
                  effMarketplace === m.id ? 'bg-blue-600 text-white' : 'bg-fill/5 text-ink-muted hover:text-ink hover:bg-fill/10'
                }`}>{m.label}</button>
            ))}
          </div>
          {derivedMeta && effMarketplace === 'all' && (
            <span className="text-[11px] text-ink-faint">
              {derivedMeta.matched} produk cocok di 2 marketplace · {derivedMeta.single} hanya di satu
            </span>
          )}
        </div>
      )}

      {/* Summary bar */}
      {hasData && (
        <div>
          <QuadrantSummary
            products={productsWithQuadrant}
            activeQuadrant={activeQuadrant}
            onQuadrantClick={q => setActiveQuadrant(prev => prev === q ? null : q)}
            compact dark
          />
        </div>
      )}

      {/* Content */}
      <div>
        {!hasData ? (
          <EmptyState onGoImport={() => setShowImport(true)} />
        ) : (
          <>
            {activeTab === 'kuadran' && (
              <QuadrantTableView products={productsWithQuadrant} isCompare={isCompareMode}
                trafficLabel={trafficName} dark />
            )}
            {activeTab === 'perubahan' && <MovementView products={productsWithQuadrant} dark />}
            {activeTab === 'chart' && (
              effMarketplace === 'all'
                ? <PickOneMarketplace onPick={setMarketplace} platforms={availablePlatforms} labels={platformLabels}
                    why="Sumbu traffic memakai satuan berbeda tiap marketplace — impresi TikTok bukan kunjungan Shopee, jadi titiknya tak bisa disandingkan." />
                : (
                  <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
                    <QuadrantChart products={productsWithQuadrant} settings={effectiveSettings} dark />
                  </div>
                )
            )}
            {activeTab === 'tabel' && (
              <ProductTable products={filteredProducts} activeQuadrant={activeQuadrant} dark />
            )}
            {activeTab === 'funnel' && (
              effMarketplace === 'all'
                ? <PickOneMarketplace onPick={setMarketplace} platforms={availablePlatforms} labels={platformLabels}
                    why="Tahap corong tiap marketplace berbeda — TikTok punya impresi & klik, Shopee mulai dari pengunjung. Menggabungnya menghasilkan corong yang tak mewakili keduanya." />
                : <FunnelView products={filteredProducts} trafficLabel={trafficName} />
            )}
            {activeTab === 'tren' && (
              <TrendView sessions={sessions} platform={platform} settings={effectiveSettings} />
            )}
            {activeTab === 'aksi' && <ActionView products={filteredProducts} />}
          </>
        )}
      </div>

      {showImport && (
        <Modal title={t('nav.import.label')} subtitle={t('nav.import.sub')}
          onClose={() => setShowImport(false)} maxWidth="max-w-2xl">
          <ImportPage embedded onImported={() => setShowImport(false)} />
        </Modal>
      )}
    </div>
  )
}
