import { Moon, Sun, Bell, Calendar, CalendarDays, ChevronDown } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useLang } from '../contexts/LanguageContext'
import { useQuadrant } from '../contexts/QuadrantContext'

export default function HeaderControls({ notifCount = '8+', showPeriod = true }) {
  const { theme, setTheme } = useTheme()
  const { lang, setLang, t } = useLang()
  const { periodType, periodLabel, prevLabel, isCompareMode, hasData, setShowHistory } = useQuadrant()

  const typeLabel = periodType ? t(`period.${periodType}`) : t('period.none')
  const mainLabel = hasData && periodLabel ? periodLabel : t('period.empty')
  const PeriodIcon = periodType === 'mingguan' ? CalendarDays : Calendar

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      {/* Toggle tema */}
      <div className="hidden sm:flex items-center bg-fill/5 border border-line/10 rounded-full p-0.5">
        <button
          onClick={() => setTheme('dark')}
          aria-label={t('header.themeDark')}
          className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
            theme === 'dark' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Moon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setTheme('light')}
          aria-label={t('header.themeLight')}
          className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
            theme === 'light' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Switch bahasa */}
      <div className="hidden sm:flex items-center bg-fill/5 border border-line/10 rounded-full p-0.5 text-xs font-semibold">
        <button
          onClick={() => setLang('en')}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            lang === 'en' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => setLang('id')}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            lang === 'id' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          ID
        </button>
      </div>

      {/* Notifikasi */}
      <button
        aria-label={t('header.notifications')}
        className="relative flex items-center justify-center w-9 h-9 rounded-full bg-fill/5 border border-line/10 text-ink-muted hover:text-ink hover:bg-fill/10 transition-colors"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-emerald-500 rounded-full border-2 border-app">
          {notifCount}
        </span>
      </button>

      {/* Pemilih periode — chevron membuka panel Riwayat Periode.
          Disembunyikan di halaman Import (belum relevan di sana). */}
      {showPeriod && (
      <div className="flex flex-col items-end">
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2 bg-fill/5 border border-line/10 rounded-xl pl-3 pr-2.5 py-1.5 hover:border-blue-600/40 hover:bg-fill/10 transition-colors"
        >
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] font-semibold tracking-wider text-ink-muted">
              {typeLabel}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-strong">
              <PeriodIcon className="w-3.5 h-3.5 text-blue-500" />
              {mainLabel}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-ink-muted" />
        </button>
        {isCompareMode && prevLabel && (
          <span className="mt-1 text-xs italic text-blue-400">
            {t('header.compareVs')} {prevLabel}
          </span>
        )}
      </div>
      )}
    </div>
  )
}
