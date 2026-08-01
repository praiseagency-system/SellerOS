import { useRef, useState } from 'react'
import {
  Download, CheckCircle2, Plus,
  BookOpen, AlertCircle
} from 'lucide-react'
import { useQuadrant } from '../contexts/QuadrantContext'
import ImportPreviewModal from '../components/ImportPreviewModal'
import { previewImportFile } from '../utils/importPreview'
import { useLang } from '../contexts/LanguageContext'
import { PlatformIcon } from '../components/PlatformIcon'
import MonthPicker from '../components/MonthPicker'

const PLATFORMS = [
  { id: 'shopee', label: 'Shopee', color: 'bg-blue-600' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-600' },
]

const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

// Impor Kuadran hanya per BULAN (opsi mingguan dihapus). value "2026-05".
function buildPeriod(value) {
  if (!value) return null
  const [y, m] = value.split('-')
  return { label: `${MONTHS_ID[+m - 1]} ${y}`, periodValue: value, periodDays: 30 }
}

export default function ImportPage({ onImported, embedded = false }) {
  const { handleUpload, isLoading, error, sessions } = useQuadrant()
  const { t } = useLang()

  const [platform, setPlatform] = useState('shopee')
  const periodType = 'bulanan'   // Impor Kuadran hanya per bulan
  const [periodInput, setPeriodInput] = useState('')
  const [perf, setPerf] = useState(null)
  const [iklan, setIklan] = useState(null)
  const [iklanFiles, setIklanFiles] = useState([])
  const [localErr, setLocalErr] = useState(null)
  const [previewData, setPreviewData] = useState(null)   // hasil parse, belum disimpan

  const fileRef = useRef(null)
  const adRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const isTikTok = platform === 'tiktok'
  const period = buildPeriod(periodInput)
  const ready = !!perf && !!period
  const steps = [1, 2, 3, 4, 5].map(n => t(`import.${isTikTok ? 'tiktok' : 'shopee'}.s${n}`))

  function addAdFiles(list) {
    const arr = Array.from(list)
    setIklanFiles(prev => {
      const seen = new Set(prev.map(f => f.name))
      return [...prev, ...arr.filter(f => !seen.has(f.name))]
    })
  }

  // Tahap 1: parse & tampilkan preview. TIDAK menyimpan.
  async function submit() {
    setLocalErr(null)
    if (!perf) { setLocalErr(t('import.errNoFile')); return }
    if (!period) { setLocalErr(t('import.errNoPeriod')); return }
    try {
      const data = await previewImportFile(perf, platform)
      setPreviewData(data)
    } catch (e) {
      setLocalErr(e?.message || 'Gagal membaca file.')
    }
  }

  // Tahap 2: user menekan Konfirmasi Import — baru data disimpan.
  async function confirmImport() {
    const ok = await handleUpload({
      platform,
      perf,
      iklan: isTikTok ? null : iklan,
      iklanFiles: isTikTok ? iklanFiles : [],
      periodLabel: period.label,
      periodValue: period.periodValue,
      periodDays: period.periodDays,
      periodType,
    })
    setPreviewData(null)
    if (ok) onImported?.()
  }

  const replacing = !!(period && sessions?.some(s =>
    s.platform === platform && s.periodValue === period.periodValue))

  return (
    <div className={embedded ? 'p-5' : 'p-6 max-w-3xl'}>
      {previewData && (
        <ImportPreviewModal data={previewData} replacing={replacing}
          onConfirm={confirmImport}
          onBack={() => setPreviewData(null)}
          onCancel={() => setPreviewData(null)} />
      )}
      {/* Form card */}
      <div className={embedded
        ? 'space-y-6'
        : 'bg-surface border border-line/8 rounded-2xl p-6 space-y-6'}>

        {/* Platform */}
        <div>
          <p className="text-sm font-semibold text-ink mb-2">{t('import.platform')}</p>
          <div className="flex gap-2">
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => { setPlatform(p.id); setPerf(null); setIklan(null); setIklanFiles([]) }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  platform === p.id ? `${p.color} text-white border-transparent` : 'border-line/10 text-ink-muted hover:border-line/20'
                }`}>
                <PlatformIcon id={p.id} />{p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Periode Bulan */}
        <div>
          <p className="text-sm font-semibold text-ink mb-2">{t('import.periodMonth')}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-64">
              <MonthPicker
                value={{ mode: 'month', month: periodInput || null }}
                onChange={v => setPeriodInput(v.month || '')}
                align="left"
                placeholder="Pilih bulan"
              />
            </div>
            {period && (
              <span className="text-xs text-ink-muted">→ {t('import.savedAs')} <span className="text-ink font-medium">{period.label}</span></span>
            )}
          </div>
        </div>

        {/* File Data */}
        <div>
          <p className="text-sm font-semibold text-ink mb-2">
            {isTikTok ? t('import.fileTikTok') : t('import.filePerf')}
            <span className="text-blue-500 ml-1.5 text-xs font-normal">{t('import.required')}</span>
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); setPerf(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${perf ? 'border-green-500/40 bg-green-500/5'
                : drag ? 'border-blue-600/50 bg-blue-600/5'
                : 'border-line/10 hover:border-blue-600/40 hover:bg-fill/3'}`}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden"
              onChange={e => setPerf(e.target.files[0])} />
            {perf ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-300 font-medium">{perf.name}</span>
                <button onClick={e => { e.stopPropagation(); setPerf(null) }}
                  className="text-ink-muted hover:text-ink ml-2">×</button>
              </div>
            ) : (
              <>
                <Download className="w-7 h-7 text-ink-faint mx-auto mb-2" />
                <p className="text-sm text-ink-muted">{t('import.dragDrop')} <span className="text-blue-400 font-medium">{t('import.chooseFile')}</span></p>
                <p className="text-xs text-ink-faint mt-1">{t('import.format')}</p>
              </>
            )}
          </div>
        </div>

        {/* Ads (optional) */}
        <div>
          <p className="text-sm font-semibold text-ink mb-2">
            {isTikTok ? t('import.adTikTok') : t('import.adShopee')}
            <span className="text-ink-muted ml-1.5 text-xs font-normal">{t('import.optionalRoas')}</span>
          </p>
          {isTikTok ? (
            <div>
              {iklanFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {iklanFiles.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded px-2 py-1 text-xs text-green-300">
                      <span className="truncate max-w-[160px]">{f.name.replace(/\.xlsx?$/i, '')}</span>
                      <button onClick={() => setIklanFiles(prev => prev.filter((_, j) => j !== i))}
                        className="text-ink-muted hover:text-ink">×</button>
                    </span>
                  ))}
                </div>
              )}
              <button onClick={() => adRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-dashed border-line/15 text-ink-muted hover:border-blue-600/40 hover:text-ink transition-colors">
                <Plus className="w-3.5 h-3.5" />{iklanFiles.length ? t('import.addCampaign') : t('import.addCampaignFirst')}
              </button>
              <input ref={adRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
                onChange={e => { addAdFiles(e.target.files); e.target.value = '' }} />
            </div>
          ) : (
            <div onClick={() => adRef.current?.click()}
              className={`border border-dashed rounded-xl px-4 py-3 cursor-pointer text-xs transition-all ${
                iklan ? 'border-green-500/30 bg-green-500/5' : 'border-line/10 hover:border-blue-600/40'
              }`}>
              <input ref={adRef} type="file" accept=".csv" className="hidden"
                onChange={e => setIklan(e.target.files[0])} />
              {iklan ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-green-300 truncate flex-1">{iklan.name}</span>
                  <button onClick={e => { e.stopPropagation(); setIklan(null) }} className="text-ink-muted hover:text-ink">×</button>
                </div>
              ) : (
                <span className="text-ink-muted">{t('import.pickAdCsv')}</span>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {(localErr || error) && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{localErr || error}</p>
          </div>
        )}

        {/* Submit */}
        <button onClick={submit} disabled={!ready || isLoading}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
            ready && !isLoading
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-fill/5 text-ink-faint cursor-not-allowed'
          }`}>
          {isLoading
            ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />{t('import.processing')}</>
            : <><Download className="w-4 h-4" />{t('import.submit')}</>}
        </button>
      </div>

      {/* Instructions card */}
      <div className="mt-5 bg-blue-600/8 border border-blue-600/15 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-blue-300 text-sm">{t('import.howTitle')}</h3>
        </div>
        <ol className="space-y-1.5 text-sm text-blue-200/80 list-decimal list-inside">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <p className="text-xs text-blue-300/60 mt-3 pt-3 border-t border-blue-600/15">
          {t('import.footer')}
        </p>
      </div>
    </div>
  )
}
