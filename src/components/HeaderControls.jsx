import { Moon, Sun, ChevronDown, LogOut, User, Palette, Users, Globe, History } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useLang } from '../contexts/LanguageContext'
import { useQuadrant } from '../contexts/QuadrantContext'
import { useAuth } from '../contexts/AuthContext'
import { useIdentity } from '../contexts/IdentityContext'
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from './ui/Dropdown'
import MonthPicker from './MonthPicker'

const isMonth = (v) => /^\d{4}-\d{2}$/.test(v || '')

export default function HeaderControls({ showPeriod = true, onNavigate }) {
  const { theme, setTheme } = useTheme()
  const { lang, setLang, t } = useLang()
  const { periodValue, prevLabel, isCompareMode, setShowHistory, sessions, platform, loadSession,
    effRange, setRange, derivedMeta } = useQuadrant()
  const { user, signOut } = useAuth()
  const { profile } = useIdentity()

  // Bulan yang punya sesi tersimpan (periode mingguan lama diabaikan di picker;
  // tetap bisa dibuka via panel Riwayat).
  const monthOptions = [...new Set((sessions || []).map(s => s.periodValue).filter(isMonth))].sort()
  // Pilih bulan → muat sesi bulan itu (utamakan platform aktif, kalau tidak yang terbaru).
  function pickMonth(month) {
    const inMonth = (sessions || []).filter(s => s.periodValue === month)
    if (!inMonth.length) return
    loadSession(inMonth.find(s => s.platform === platform) || inMonth[0], sessions)
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* Toggle tema & bahasa dipindah ke dropdown profil (hemat area header). */}

      {/* Lonceng notifikasi lama (dummy, badge hardcode '8+', tanpa onClick)
          DIHAPUS — digantikan ApprovalBell (🔔 Persetujuan) di Layout. */}

      {/* Pemilih periode — MonthPicker (lompat langsung ke bulan tersimpan) +
          tombol Riwayat (buka panel lengkap). Disembunyikan di halaman Import. */}
      {showPeriod && (
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1.5">
          <MonthPicker
            enabledMonths={monthOptions}
            allowLifetime allowCustom
            value={effRange?.mode === 'month'
              ? { mode: isMonth(periodValue) ? 'month' : null, month: isMonth(periodValue) ? periodValue : null }
              : effRange}
            onChange={v => {
              // Per bulan tetap memuat sesi (jalur lama); lifetime & custom
              // hanya mengubah rentang tampilan — data digabung dari sesi tersimpan.
              if (v.mode === 'month' && v.month) { setRange(null); pickMonth(v.month) }
              else setRange(v)
            }}
            placeholder={t('period.empty')}
            align="right"
          />
          <button
            onClick={() => setShowHistory(true)}
            title="Riwayat Periode"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-fill/5 border border-line/10 text-ink-muted hover:text-ink hover:border-blue-600/40 hover:bg-fill/10 transition-colors"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
        {derivedMeta ? (
          <span className="mt-1 text-xs italic text-blue-400">
            {derivedMeta.periods} periode digabung{derivedMeta.hasPrev ? ' · vs rentang sebelumnya' : ''}
          </span>
        ) : isCompareMode && prevLabel && (
          <span className="mt-1 text-xs italic text-blue-400">
            {t('header.compareVs')} {prevLabel}
          </span>
        )}
      </div>
      )}

      {/* Akun: avatar (foto profil) → dropdown Profil / Brand / Team + Keluar */}
      {user && (
        <Dropdown>
          <DropdownTrigger>
            <button
              title={profile.name || user.email}
              className="flex items-center gap-0.5 bg-fill/5 border border-line/10 rounded-full pl-0.5 pr-1.5 py-0.5 text-ink-muted hover:text-ink hover:bg-fill/10 transition-colors"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full overflow-hidden bg-blue-600 text-white text-[10px] font-bold uppercase">
                {profile.avatar
                  ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                  : (user.email?.[0] || '?')}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownTrigger>
          <DropdownContent side="right" align="start" className="w-56">
            <div className="flex items-center gap-2.5 px-2 pt-2 pb-2">
              <span className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden bg-blue-600 text-white text-sm font-bold uppercase flex-shrink-0">
                {profile.avatar
                  ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                  : (user.email?.[0] || '?')}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink truncate">{profile.name || 'Akun SellerOS'}</p>
                <p className="text-[10px] text-ink-faint truncate">{user.email}</p>
              </div>
            </div>
            <DropdownSeparator />

            {/* Tema — tak menutup dropdown (bukan DropdownItem) */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-sm text-ink-muted flex items-center gap-2"><Palette className="w-4 h-4" /> Tema</span>
              <div className="flex items-center bg-fill/5 border border-line/10 rounded-full p-0.5">
                <button onClick={() => setTheme('dark')} aria-label={t('header.themeDark')}
                  className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'}`}>
                  <Moon className="w-3 h-3" />
                </button>
                <button onClick={() => setTheme('light')} aria-label={t('header.themeLight')}
                  className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${theme === 'light' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'}`}>
                  <Sun className="w-3 h-3" />
                </button>
              </div>
            </div>
            {/* Bahasa */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-sm text-ink-muted flex items-center gap-2"><Globe className="w-4 h-4" /> Bahasa</span>
              <div className="flex items-center bg-fill/5 border border-line/10 rounded-full p-0.5 text-[11px] font-semibold">
                <button onClick={() => setLang('en')}
                  className={`px-2 py-0.5 rounded-full transition-colors ${lang === 'en' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'}`}>EN</button>
                <button onClick={() => setLang('id')}
                  className={`px-2 py-0.5 rounded-full transition-colors ${lang === 'id' ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'}`}>ID</button>
              </div>
            </div>
            <DropdownSeparator />

            <DropdownItem onClick={() => onNavigate?.('settings', { tab: 'profil' })}>
              <User className="w-4 h-4 mr-2" /> Profil
            </DropdownItem>
            <DropdownItem onClick={() => onNavigate?.('settings', { tab: 'brand' })}>
              <Palette className="w-4 h-4 mr-2" /> Brand
            </DropdownItem>
            <DropdownItem onClick={() => onNavigate?.('settings', { tab: 'team' })}>
              <Users className="w-4 h-4 mr-2" /> Team
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem destructive onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-2" /> Keluar
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      )}
    </div>
  )
}
