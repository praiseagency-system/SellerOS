import { useState } from 'react'
import QuadrantChart from '../components/QuadrantChart'
import QuadrantTableView from '../components/QuadrantTableView'
import ProductTable from '../components/ProductTable'
import QuadrantSummary from '../components/QuadrantSummary'
import FunnelView from '../components/FunnelView'
import TrendView from '../components/TrendView'
import PriorityView from '../components/PriorityView'
// MovementView & ActionView TIDAK dihapus: keduanya masih dipakai jalur lama
// (sesi tunggal tanpa agregasi) dan dipertahankan sampai jalur itu ikut pindah.
import MovementView from '../components/MovementView'
import Modal from '../components/Modal'
import MappingManager from '../components/MappingManager'
import ImportPage from './ImportPage'
import { useQuadrant } from '../contexts/QuadrantContext'
import { useLang } from '../contexts/LanguageContext'
import { CONVERSION_BENCHMARKS, fmtNum } from '../utils/quadrantUtils'
import {
  LayoutGrid, Settings2, X,
  TrendingUp, Download, Filter, History, ListChecks
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

export default function QuadrantPage() {
  const {
    hasData, platform, platformLabels,
    productsWithQuadrant, filteredProducts,
    settings, effectiveSettings, trafficThreshold, updateSetting,
    activeTab, setActiveTab, activeQuadrant, setActiveQuadrant,
    isCompareMode,
    effMarketplace, setMarketplace, availablePlatforms, derivedMeta,
    refreshMappings, setManualBenchmark, manualBenchmarks,
    trendViews, periodValue, priorities, createPriorityFor, updatePriorityStatus,
    isLegacyMapping,
  } = useQuadrant()
  const { t } = useLang()

  const [showBenchmark, setShowBenchmark] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  // View di dalam tab Kuadran + mode perbandingan. Keduanya TIDAK menyentuh
  // filter marketplace/periode, jadi berpindah view tak mereset apa pun.
  const [quadrantView, setQuadrantView] = useState('visual')   // visual | tabel
  const [compareOn, setCompareOn] = useState(true)

  // Empat tab. Chart & Tabel turun jadi view di dalam Kuadran; Perubahan
  // melebur ke Tren; Aksi berganti nama jadi Prioritas.
  const TABS = [
    { id: 'kuadran',   label: t('quadrant.tab.kuadran'), icon: LayoutGrid },
    { id: 'funnel',    label: 'Funnel',                  icon: Filter },
    { id: 'tren',      label: 'Tren',                    icon: History },
    { id: 'prioritas', label: 'Prioritas',               icon: ListChecks },
  ]
  // Tab lama tetap bisa dibuka (mis. state tersimpan) dan dipetakan ke yang baru.
  const LEGACY_TAB = { chart: 'kuadran', tabel: 'kuadran', perubahan: 'tren', aksi: 'prioritas' }
  const currentTab = LEGACY_TAB[activeTab] || activeTab
  const currentView = activeTab === 'tabel' ? 'tabel' : (activeTab === 'chart' ? 'visual' : quadrantView)

  // Mode gabungan memakai definisi yang sebanding antar-marketplace, jadi
  // labelnya bukan "Impresi" atau "Pengunjung" milik salah satu platform.
  const trafficName = effMarketplace === 'all'
    ? 'Qualified Traffic'
    : (platformLabels[effMarketplace]?.traffic || platformLabels[platform]?.traffic)

  return (
    // Frame disamakan dgn section GMV Max (2026-07-12): kontainer p-6 max-w-7xl,
    // panel jadi kartu rounded — bukan workbench edge-to-edge lagi.
    <div className="p-6 space-y-4">

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasData ? (
          <>
            <div className="flex items-center gap-0.5 bg-fill/5 rounded-lg p-0.5">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    currentTab === id ? 'bg-surface text-ink-strong shadow-sm' : 'text-ink-muted hover:text-ink'
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

      {/* Sesi aktif memakai mapping lama (< v3): metrik bisa memakai fallback.
          Data lama TIDAK diubah — user diarahkan import ulang. */}
      {hasData && isLegacyMapping && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 flex-wrap">
          <p className="text-xs text-amber-200 flex-1 min-w-[260px]">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-200 mr-1.5">Mapping Lama</span>
            Data periode ini menggunakan mapping lama. Beberapa metrik seperti Traffic Produk, Pengguna Tambah Keranjang,
            Pembeli, dan Rasio Konversi mungkin menggunakan fallback. Import ulang periode ini untuk mendapatkan perhitungan terbaru.
          </p>
          <button onClick={() => setShowImport(true)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-500/30 text-amber-200 hover:bg-amber-500/15 transition-colors flex-shrink-0">
            Import Ulang Periode Ini
          </button>
        </div>
      )}

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
            {/* Ambang manual per mode marketplace — menang atas median otomatis. */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Ambang mode {effMarketplace === 'all' ? 'Semua' : (platformLabels[effMarketplace]?.name || effMarketplace)}
              </p>
              <p className="text-[11px] text-ink-faint max-w-xs leading-relaxed">
                Kosongkan untuk kembali ke {effMarketplace === 'all' ? 'median otomatis' : 'target harian'}.
                Ambang disimpan terpisah per marketplace.
              </p>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Traffic ≥</label>
                  <input type="number" min={0} defaultValue={manualBenchmarks?.[effMarketplace]?.trafficThreshold ?? ''}
                    id="mb-traffic"
                    className="bg-fill/5 border border-line/10 rounded px-2 py-1 text-xs w-24 text-ink-strong focus:outline-none focus:ring-1 focus:ring-blue-600" />
                </div>
                <div>
                  <label className="block text-xs text-ink-faint mb-1">CR ≥ (%)</label>
                  <input type="number" min={0} step={0.25} defaultValue={manualBenchmarks?.[effMarketplace]?.conversionThreshold ?? ''}
                    id="mb-cr"
                    className="bg-fill/5 border border-line/10 rounded px-2 py-1 text-xs w-24 text-ink-strong focus:outline-none focus:ring-1 focus:ring-blue-600" />
                </div>
                <button
                  onClick={() => {
                    const tv = document.getElementById('mb-traffic')?.value
                    const cv = document.getElementById('mb-cr')?.value
                    const ok = tv !== '' && cv !== '' && tv != null && cv != null
                    setManualBenchmark(effMarketplace, ok ? { trafficThreshold: Number(tv), conversionThreshold: Number(cv) } : null)
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  Terapkan
                </button>
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
            <>
              <span className="text-[11px] text-ink-faint">
                {derivedMeta.matched} produk cocok di 2 marketplace · {derivedMeta.single} hanya di satu
              </span>
              <button onClick={() => setShowMapping(true)}
                className="text-[11px] font-semibold text-blue-400 hover:underline">
                Atur mapping{derivedMeta.suggestions?.length ? ` (${derivedMeta.suggestions.length} usulan)` : ''}
              </button>
            </>
          )}
          {derivedMeta?.benchmark && (
            <span className="ml-auto text-[11px] text-ink-faint" title="Ambang penentu High/Low pada mode ini">
              Ambang: {derivedMeta.benchmark.source === 'manual' ? 'manual'
                : derivedMeta.benchmark.source === 'auto_median' ? `median ${derivedMeta.benchmark.pool ?? 0} produk` : 'target harian'}
              {' · '}traffic {fmtNum(derivedMeta.benchmark.trafficThreshold)}
              {' · '}CR {derivedMeta.benchmark.conversionThreshold != null ? `${derivedMeta.benchmark.conversionThreshold.toFixed(2)}%` : '—'}
            </span>
          )}
          {derivedMeta?.coverage && !derivedMeta.coverage.isAligned && (
            <span className="text-[11px] text-amber-300" title={`Periode tak sama di: ${derivedMeta.coverage.partial.join(', ')}`}>
              periode antar-marketplace tak sama
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
            {currentTab === 'kuadran' && (
              <div className="space-y-3">
                {/* View toggle + mode perbandingan. Filter marketplace & periode
                    berada di luar sini, jadi tak ikut ter-reset. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1">
                    {[['visual', 'Visual'], ['tabel', 'Tabel']].map(([id, label]) => (
                      <button key={id} onClick={() => setQuadrantView(id)}
                        className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                          currentView === id ? 'bg-blue-600 text-white' : 'bg-fill/5 text-ink-muted hover:text-ink hover:bg-fill/10'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {isCompareMode && (
                    <div className="flex gap-1 ml-2">
                      {[[false, 'Periode ini'], [true, 'Bandingkan periode sebelumnya']].map(([v, label]) => (
                        <button key={String(v)} onClick={() => setCompareOn(v)}
                          className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                            compareOn === v ? 'bg-fill/15 text-ink' : 'text-ink-muted hover:text-ink hover:bg-fill/8'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {currentView === 'visual' ? (
                  <>
                    <QuadrantTableView products={productsWithQuadrant} isCompare={isCompareMode && compareOn}
                      trafficLabel={trafficName} dark />
                    {effMarketplace !== 'all' && (
                      <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
                        <QuadrantChart products={productsWithQuadrant} settings={effectiveSettings} dark />
                      </div>
                    )}
                  </>
                ) : (
                  <ProductTable products={filteredProducts} activeQuadrant={activeQuadrant}
                    trafficLabel={trafficName} dark />
                )}
              </div>
            )}
            {currentTab === 'funnel' && (
              effMarketplace === 'all' && availablePlatforms.length > 1
                ? <FunnelView products={filteredProducts} benchmark={derivedMeta?.benchmark || effectiveSettings} />
                : <FunnelView products={filteredProducts} benchmark={derivedMeta?.benchmark || effectiveSettings} />
            )}
            {currentTab === 'tren' && (
              <>
                <TrendView views={trendViews} manualBenchmark={manualBenchmarks?.[effMarketplace] || null} />
                {isCompareMode && compareOn && (
                  <div className="mt-3"><MovementView products={productsWithQuadrant} dark /></div>
                )}
              </>
            )}
            {currentTab === 'prioritas' && (
              <PriorityView
                products={filteredProducts}
                benchmark={derivedMeta?.benchmark || effectiveSettings}
                marketplaceMode={effMarketplace}
                periodValue={periodValue}
                savedItems={priorities}
                onCreateLog={createPriorityFor}
                onUpdate={updatePriorityStatus}
              />
            )}
          </>
        )}
      </div>

      {showMapping && (
        <MappingManager
          suggestions={derivedMeta?.suggestions || []}
          merged={productsWithQuadrant.filter(p => p.merged)}
          onClose={() => setShowMapping(false)}
          onChanged={refreshMappings}
        />
      )}

      {showImport && (
        <Modal title={t('nav.import.label')} subtitle={t('nav.import.sub')}
          onClose={() => setShowImport(false)} maxWidth="max-w-2xl">
          <ImportPage embedded onImported={() => setShowImport(false)} />
        </Modal>
      )}
    </div>
  )
}
