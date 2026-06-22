import { useState } from 'react'
import {
  LayoutGrid, Calculator, TrendingUp,
  ChevronRight, ChevronDown,
  BarChart3, Sparkles, Info, Menu, Package, Megaphone
} from 'lucide-react'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import HeaderControls from './HeaderControls'
import HistoryPanel from './HistoryPanel'
import { useLang } from '../contexts/LanguageContext'
import { useQuadrant } from '../contexts/QuadrantContext'

const NAV = [
  {
    section: 'KUADRAN TRAFFIC',
    items: [
      { id: 'quadrant', icon: LayoutGrid, hasSub: true },
    ],
  },
  {
    section: 'ANALISIS CERDAS',
    items: [
      { id: 'calculator',  icon: Calculator },
      { id: 'products',    icon: Package },
      { id: 'performance', icon: TrendingUp },
      { id: 'campaign',    icon: Megaphone },
      { id: 'reports',     icon: BarChart3,  soon: true },
    ],
  },
  {
    section: 'AI TOOLS',
    items: [
      { id: 'ai', icon: Sparkles, soon: true },
    ],
  },
]

function NavItem({ item, active, onClick, t }) {
  return (
    <button
      onClick={() => !item.soon && onClick(item.id)}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group
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
        <p className={`text-sm font-medium truncate ${active ? 'text-blue-500' : ''}`}>
          {t(`nav.${item.id}.label`)}
        </p>
        {item.hasSub && (
          <p className="text-xs text-ink-faint truncate">{t(`nav.${item.id}.sub`)}</p>
        )}
      </div>
      {item.soon && (
        <span className="text-xs bg-gray-700 text-ink-muted px-1.5 py-0.5 rounded-md flex-shrink-0">
          {t('nav.soon')}
        </span>
      )}
      {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
    </button>
  )
}

function SidebarContent({
  sidebarOpen, setSidebarOpen, openSections, toggleSection, currentPage, onNavigate,
  workspaces, currentWorkspace, onSwitchWorkspace, onWorkspaceChange, setMobileOpen, t,
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Workspace switcher */}
      <div className="px-3 py-3 border-b border-line/5">
        <WorkspaceSwitcher
          workspaces={workspaces}
          current={currentWorkspace}
          onSwitch={onSwitchWorkspace}
          onChange={onWorkspaceChange}
          collapsed={!sidebarOpen}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV.map(group => {
          const isOpen = openSections[group.section] ?? true
          return (
            <div key={group.section}>
              {sidebarOpen ? (
                <button
                  onClick={() => toggleSection(group.section)}
                  className="w-full flex items-center justify-between px-3 mb-1.5 group"
                >
                  <p className="text-xs font-semibold text-ink-faint tracking-wider group-hover:text-ink-muted transition-colors">
                    {t(`nav.${group.section}`)}
                  </p>
                  <ChevronDown className={`w-3 h-3 text-ink-faint group-hover:text-ink-muted transition-all duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                </button>
              ) : null}
              {(isOpen || !sidebarOpen) && (
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <NavItem
                      key={item.id}
                      item={item}
                      t={t}
                      active={currentPage === item.id}
                      onClick={id => { onNavigate(id); setMobileOpen(false) }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-line/5 space-y-0.5">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-ink-muted hover:bg-fill/5 hover:text-ink transition-all">
          <Info className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && <span className="text-sm font-medium">{t('nav.info')}</span>}
        </button>
      </div>

      {/* Collapse toggle (desktop) */}
      <button
        onClick={() => setSidebarOpen(s => !s)}
        className="hidden lg:flex items-center justify-center py-3 border-t border-line/5 text-ink-faint hover:text-ink-muted transition-colors"
      >
        {sidebarOpen
          ? <ChevronRight className="w-4 h-4 rotate-180" />
          : <ChevronRight className="w-4 h-4" />
        }
      </button>
    </div>
  )
}

export default function Layout({
  currentPage, onNavigate,
  children, pageTitle, pageSubtitle,
  workspaces, currentWorkspace, onSwitchWorkspace, onWorkspaceChange,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState(() =>
    NAV.reduce((acc, g) => ({ ...acc, [g.section]: true }), {})
  )
  const { t } = useLang()

  function toggleSection(section) {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }
  const { sessions, showHistory, setShowHistory, refreshSessions, loadSession } = useQuadrant()

  function handleLoadSession(session) {
    loadSession(session)
    setShowHistory(false)
    onNavigate('quadrant')
  }

  return (
    <div className="flex min-h-screen bg-app text-ink">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-app border-r border-line/5 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-16'
        } flex-shrink-0`}
      >
        <SidebarContent
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          openSections={openSections}
          toggleSection={toggleSection}
          currentPage={currentPage}
          onNavigate={onNavigate}
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSwitchWorkspace={onSwitchWorkspace}
          onWorkspaceChange={onWorkspaceChange}
          setMobileOpen={setMobileOpen}
          t={t}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-app border-r border-line/5 flex flex-col">
            <SidebarContent
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              openSections={openSections}
              toggleSection={toggleSection}
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-line/5 bg-app/50 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-ink-muted hover:text-ink"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-ink-strong truncate">{pageTitle}</h1>
            {pageSubtitle && (
              <p className="text-xs text-ink-muted truncate">{pageSubtitle}</p>
            )}
          </div>
          <HeaderControls
            onNavigate={onNavigate}
            showPeriod={!['import', 'calculator', 'products', 'performance', 'settings'].includes(currentPage)} />
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
