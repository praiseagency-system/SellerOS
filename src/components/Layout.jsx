import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  LayoutGrid, Calculator, TrendingUp,
  ChevronsLeft, ChevronsRight, ChevronDown,
  BarChart3, Menu, Package, Megaphone, Home, Activity, Settings, Sparkles,
  LayoutDashboard, PlaySquare, Users, Upload, LineChart, ClipboardList, Rocket
} from 'lucide-react'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import HeaderControls from './HeaderControls'
import HistoryPanel from './HistoryPanel'
import { useLang } from '../contexts/LanguageContext'
import { useQuadrant } from '../contexts/QuadrantContext'

const NAV = [
  {
    section: 'MAIN',
    items: [
      { id: 'overview', icon: Home },
    ],
  },
  {
    section: 'GMV MAX ADS',
    items: [
      { id: 'gmv_dashboard', icon: LayoutDashboard },
      { id: 'gmv_monitoring', icon: LineChart, children: [
        { id: 'gmv_input',    icon: Upload },
        { id: 'gmv_overview', icon: PlaySquare },
        { id: 'gmv_product',  icon: Package },
        { id: 'gmv_creator',  icon: Users },
      ] },
      { id: 'gmv_insight',   icon: Sparkles },
      { id: 'gmv_boost',     icon: Rocket },
      { id: 'gmv_log',       icon: ClipboardList },
      // Stub display-only — belum ada route; TIDAK terhubung ke worker/sync.
      { id: 'ads',           icon: Activity, soon: true },
    ],
  },
  {
    section: 'MARKETPLACE',
    items: [
      { id: 'calculator',  icon: Calculator },
      { id: 'products',    icon: Package },
      { id: 'campaign',    icon: Megaphone },
      { id: 'reports',     icon: BarChart3,  soon: true },
    ],
  },
  {
    section: 'AFFILIATE MONITORING',
    items: [
      { id: 'quadrant',    icon: LayoutGrid, hasSub: true },
      { id: 'performance', icon: TrendingUp },
    ],
  },
]

// Jejak lokasi utk breadcrumb topbar: [label seksi, id induk | null].
// null → halaman di luar NAV (mis. settings), breadcrumb tak dirender.
function findCrumb(page) {
  for (const g of NAV) {
    for (const it of g.items) {
      if (it.id === page) return { section: g.section, parent: null }
      if (it.children?.some(c => c.id === page)) return { section: g.section, parent: it.id }
    }
  }
  return null
}

function NavItem({ item, active, onClick, t, collapsed }) {
  const label = t(`nav.${item.id}.label`)
  // Mode ciut (rail ikon, gaya Praise): ikon 44px terpusat + tooltip title.
  if (collapsed) {
    return (
      <button
        onClick={() => !item.soon && onClick(item.id)}
        aria-disabled={item.soon || undefined}
        aria-label={label}
        title={item.soon ? `${label} — ${t('nav.soonHint')}` : label}
        className={`flex items-center justify-center w-11 h-11 mx-auto rounded-xl transition-all ${
          active
            ? 'bg-blue-600/15 text-blue-500'
            : item.soon
              ? 'text-ink-faint cursor-not-allowed'
              : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
        }`}
      >
        <item.icon className="w-4 h-4" />
      </button>
    )
  }
  return (
    <button
      onClick={() => !item.soon && onClick(item.id)}
      aria-disabled={item.soon || undefined}
      title={item.soon ? t('nav.soonHint') : undefined}
      className={`
        w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all group
        ${active
          ? 'bg-blue-600/15 text-blue-500'
          : item.soon
            ? 'text-ink-faint cursor-not-allowed'
            : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
        }
      `}
    >
      <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-500' : ''}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium truncate ${active ? 'text-blue-500' : ''}`}>
          {t(`nav.${item.id}.label`)}
        </p>
        {item.hasSub && (
          <p className="text-[11px] text-ink-faint truncate">{t(`nav.${item.id}.sub`)}</p>
        )}
      </div>
      {item.soon && (
        <span className="text-[10px] bg-gray-700 text-ink-muted px-1.5 py-0.5 rounded-md flex-shrink-0">
          {t('nav.soon')}
        </span>
      )}
      {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
    </button>
  )
}

// Item induk yang punya anak (submenu collapsible), mis. Monitoring. Saat
// sidebar diciutkan: ikon grup + flyout anak saat hover (meniru Praise) —
// flyout dirender via portal + position:fixed karena backdrop-filter panel
// kaca membuat containing block & nav punya overflow yang akan memotongnya.
function NavParent({ item, t, currentPage, collapsed, open, onToggle, onNavigate,
  fly, openFly, closeFlySoon, cancelFlyClose, closeFlyNow }) {
  const childActive = item.children.some(c => c.id === currentPage)
  const btnRef = useRef(null)
  if (collapsed) {
    const label = t(`nav.${item.id}.label`)
    const openThis = () => {
      const r = btnRef.current?.getBoundingClientRect()
      openFly(item.id, r ? r.top : 0)
    }
    return (
      <div className="relative" onMouseEnter={openThis} onMouseLeave={closeFlySoon}>
        <button ref={btnRef} aria-label={label} title={label}
          className={`flex items-center justify-center w-11 h-11 mx-auto rounded-xl transition-colors ${
            childActive ? 'bg-blue-600/15 text-blue-500' : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
          }`}
        >
          <item.icon className="w-4 h-4" />
        </button>
        {fly?.id === item.id && createPortal(
          <div
            style={{ position: 'fixed', top: fly.top, left: 64, zIndex: 100 }}
            onMouseEnter={cancelFlyClose}
            onMouseLeave={closeFlySoon}
            className="min-w-[200px] bg-surface border border-line/10 rounded-xl shadow-lg py-1.5 px-1.5"
          >
            <p className="px-2.5 pt-0.5 pb-1.5 text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{label}</p>
            <div className="space-y-0.5">
              {item.children.map(c => (
                <NavItem key={c.id} item={c} t={t} active={currentPage === c.id}
                  onClick={id => { closeFlyNow(); onNavigate(id) }} />
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>
    )
  }
  const expanded = open || childActive
  return (
    <div>
      <button onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all
          ${childActive ? 'text-blue-500' : 'text-ink-muted hover:bg-fill/5 hover:text-ink'}`}
      >
        <item.icon className={`w-4 h-4 flex-shrink-0 ${childActive ? 'text-blue-500' : ''}`} />
        <span className="flex-1 text-[13px] font-medium truncate">{t(`nav.${item.id}.label`)}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-faint transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
      </button>
      {expanded && (
        <div className="ml-3.5 pl-2.5 border-l border-line/10 space-y-0.5 mt-0.5">
          {item.children.map(c => (
            <NavItem key={c.id} item={c} t={t} active={currentPage === c.id} onClick={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarContent({
  collapsed, toggleSidebar, openSections, toggleSection, openSubs, toggleSub,
  currentPage, onNavigate,
  workspaces, currentWorkspace, onSwitchWorkspace, onWorkspaceChange, setMobileOpen, t,
  fly, openFly, closeFlySoon, cancelFlyClose, closeFlyNow,
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand header (gaya Praise): tile logo + nama agency/sistem + toggle */}
      <div className={`border-b border-line/5 flex ${collapsed
        ? 'flex-col items-center gap-2 px-2 py-3'
        : 'items-center gap-2.5 px-4 py-4'}`}
      >
        <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-surface2 border border-line/10 flex items-center justify-center">
          <img src="/favicon.svg" alt="SellerOS" className="w-full h-full object-contain p-1.5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-ink-faint uppercase tracking-[0.15em] truncate">Praise Agency</p>
            <p className="text-[13px] font-bold text-ink-strong leading-tight tracking-tight truncate">SellerOS</p>
          </div>
        )}
        {toggleSidebar && (
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
            title={collapsed ? 'Lebarkan' : 'Ciutkan'}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-fill/5 transition-colors flex-shrink-0"
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Workspace switcher */}
      <div className={`border-b border-line/5 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        <WorkspaceSwitcher
          workspaces={workspaces}
          current={currentWorkspace}
          onSwitch={onSwitchWorkspace}
          onChange={onWorkspaceChange}
          collapsed={collapsed}
        />
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-3 space-y-3.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-2.5'}`}>
        {NAV.map(group => {
          const isOpen = openSections[group.section] ?? true
          return (
            <div key={group.section}>
              {!collapsed ? (
                <button
                  onClick={() => toggleSection(group.section)}
                  className="w-full flex items-center justify-between px-2.5 mb-1 group"
                >
                  <p className="text-[10px] font-semibold text-ink-faint tracking-wider group-hover:text-ink-muted transition-colors">
                    {t(`nav.${group.section}`)}
                  </p>
                  <ChevronDown className={`w-3 h-3 text-ink-faint group-hover:text-ink-muted transition-all duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                </button>
              ) : null}
              {(isOpen || collapsed) && (
                <div className="space-y-0.5">
                  {group.items.map(item => item.children
                    ? <NavParent
                        key={item.id}
                        item={item}
                        t={t}
                        currentPage={currentPage}
                        collapsed={collapsed}
                        open={openSubs[item.id] ?? true}
                        onToggle={() => toggleSub(item.id)}
                        onNavigate={id => { onNavigate(id); setMobileOpen(false) }}
                        fly={fly}
                        openFly={openFly}
                        closeFlySoon={closeFlySoon}
                        cancelFlyClose={cancelFlyClose}
                        closeFlyNow={closeFlyNow}
                      />
                    : <NavItem
                        key={item.id}
                        item={item}
                        t={t}
                        collapsed={collapsed}
                        active={currentPage === item.id}
                        onClick={id => { onNavigate(id); setMobileOpen(false) }}
                      />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom — Pengaturan (dulu tombol "Informasi" yang mati/tanpa aksi) */}
      <div className={`border-t border-line/5 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'} space-y-0.5`}>
        <button
          onClick={() => { onNavigate('settings'); setMobileOpen(false) }}
          aria-label={t('nav.settings.label')}
          title={collapsed ? t('nav.settings.label') : undefined}
          className={`${collapsed
            ? 'flex items-center justify-center w-11 h-11 mx-auto'
            : 'w-full flex items-center gap-2.5 px-2.5 py-1.5'} rounded-lg transition-all ${
            currentPage === 'settings'
              ? 'bg-blue-600/15 text-blue-500'
              : 'text-ink-muted hover:bg-fill/5 hover:text-ink'
          }`}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">{t('nav.settings.label')}</span>}
        </button>
      </div>
    </div>
  )
}

export default function Layout({
  currentPage, onNavigate,
  children, pageTitle, pageSubtitle,
  workspaces, currentWorkspace, onSwitchWorkspace, onWorkspaceChange,
}) {
  // Lebar/ciut sidebar persist per-device (gaya Praise: localStorage).
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('sq_sidebar_collapsed') !== '1' } catch { return true }
  })
  function toggleSidebar() {
    setSidebarOpen(v => {
      const next = !v
      try { localStorage.setItem('sq_sidebar_collapsed', next ? '0' : '1') } catch { /* ignore */ }
      return next
    })
  }
  // Flyout submenu saat sidebar ciut — satu yang terbuka, close ditunda 160ms
  // supaya kursor sempat menyeberang dari ikon ke panel flyout.
  const [fly, setFly] = useState(null)
  const flyTimer = useRef(null)
  const openFly = (id, top) => { clearTimeout(flyTimer.current); setFly({ id, top }) }
  const closeFlySoon = () => { clearTimeout(flyTimer.current); flyTimer.current = setTimeout(() => setFly(null), 160) }
  const cancelFlyClose = () => clearTimeout(flyTimer.current)
  const closeFlyNow = () => { clearTimeout(flyTimer.current); setFly(null) }
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState(() =>
    NAV.reduce((acc, g) => ({ ...acc, [g.section]: true }), {})
  )
  const [openSubs, setOpenSubs] = useState({ gmv_monitoring: true })
  const { t } = useLang()

  function toggleSection(section) {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }
  function toggleSub(id) {
    setOpenSubs(prev => ({ ...prev, [id]: !(prev[id] ?? true) }))
  }
  const { sessions, showHistory, setShowHistory, refreshSessions, loadSession } = useQuadrant()
  const crumb = findCrumb(currentPage)

  function handleLoadSession(session) {
    loadSession(session)
    setShowHistory(false)
    onNavigate('quadrant')
  }

  return (
    <div className="app-glow flex min-h-screen bg-app text-ink">
      {/* Desktop sidebar — panel kaca (full glass chrome) */}
      <aside
        className={`hidden lg:flex flex-col glass-panel border-r border-line/10 relative z-10 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-16'
        } flex-shrink-0`}
      >
        <SidebarContent
          collapsed={!sidebarOpen}
          toggleSidebar={toggleSidebar}
          openSections={openSections}
          toggleSection={toggleSection}
          openSubs={openSubs}
          toggleSub={toggleSub}
          currentPage={currentPage}
          onNavigate={onNavigate}
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSwitchWorkspace={onSwitchWorkspace}
          onWorkspaceChange={onWorkspaceChange}
          setMobileOpen={setMobileOpen}
          t={t}
          fly={fly}
          openFly={openFly}
          closeFlySoon={closeFlySoon}
          cancelFlyClose={cancelFlyClose}
          closeFlyNow={closeFlyNow}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 glass-panel bg-app/85 border-r border-line/10 flex flex-col">
            <SidebarContent
              collapsed={false}
              toggleSidebar={null}
              openSections={openSections}
              toggleSection={toggleSection}
              openSubs={openSubs}
              toggleSub={toggleSub}
              currentPage={currentPage}
              onNavigate={onNavigate}
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              onSwitchWorkspace={onSwitchWorkspace}
              onWorkspaceChange={onWorkspaceChange}
              setMobileOpen={setMobileOpen}
              t={t}
            />
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top bar — panel kaca (full glass chrome) */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-line/10 glass-panel sticky top-0 z-10 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-ink-muted hover:text-ink"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            {crumb && (
              <p className="text-[11px] text-ink-faint truncate leading-tight">
                {t(`nav.${crumb.section}`)}
                {crumb.parent && <> <span className="opacity-60">›</span> {t(`nav.${crumb.parent}.label`)}</>}
              </p>
            )}
            <h1 className="text-lg font-bold text-ink-strong truncate">{pageTitle}</h1>
            {pageSubtitle && (
              <p className="text-xs text-ink-muted truncate">{pageSubtitle}</p>
            )}
          </div>
          <HeaderControls
            onNavigate={onNavigate}
            showPeriod={!currentPage.startsWith('gmv_') && !['overview', 'import', 'calculator', 'products', 'performance', 'settings'].includes(currentPage)} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Riwayat Periode — global, dibuka dari header atau tombol Riwayat */}
      {showHistory && (
        <HistoryPanel
          sessions={sessions}
          onClose={() => setShowHistory(false)}
          onSessionsChange={refreshSessions}
          onLoad={handleLoadSession}
        />
      )}
    </div>
  )
}
