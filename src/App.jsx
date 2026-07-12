import { useState, useEffect, useRef } from 'react'
import Layout from './components/Layout'
import OverviewPage from './pages/OverviewPage'
import QuadrantPage from './pages/QuadrantPage'
import CalculatorPage from './pages/CalculatorPage'
import ProductsPage from './pages/ProductsPage'
import StorePerformancePage from './pages/StorePerformancePage'
import CampaignPage from './pages/CampaignPage'
import SettingsPage from './pages/SettingsPage'
import GmvMaxModule from './pages/gmvmax/GmvMaxModule'
import { GmvMaxProvider } from './contexts/GmvMaxContext'
import { QuadrantProvider } from './contexts/QuadrantContext'
import { useLang } from './contexts/LanguageContext'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import { listWorkspaces, createWorkspace } from './data/workspaces'
import { getCurrentWorkspaceId, setCurrentWorkspace, PRESET_COLORS } from './utils/workspace'

const PAGE_KEYS = ['overview', 'quadrant', 'calculator', 'products', 'performance', 'campaign', 'reports', 'ai']
// Halaman tanpa key i18n — judul ditetapkan manual.
const PAGE_META = {
  settings: { title: 'Pengaturan', subtitle: 'Akun & privasi data' },
  gmv_dashboard: { title: 'GMV Max Ads', subtitle: 'Ringkasan performa GMV MAX' },
  gmv_overview:  { title: 'Performa Video', subtitle: 'Semua video: filter status/kandidat scale + rekomendasi aksi' },
  gmv_creator:   { title: 'Creator', subtitle: 'Leaderboard kreator per performa' },
  gmv_product:   { title: 'Performa Produk', subtitle: 'Rollup GMV Max per produk (nama dari menu Produk)' },
  gmv_insight:   { title: 'AI Insight', subtitle: 'Rekomendasi otomatis berbasis data' },
  gmv_boost:     { title: 'Boost Center', subtitle: 'Rekomendasi & pipeline kode boost video jempolan' },
  gmv_log:       { title: 'Log Optimasi', subtitle: 'Jurnal tindakan optimasi ber-timestamp' },
  gmv_input:     { title: 'Import Data', subtitle: 'Upload, tabel mentah & riwayat upload GMV Max' },
}

// Gate auth: cek sesi dulu, tampilkan login bila belum masuk.
export default function App() {
  const { loading, user } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <LoginPage />
  return <MainApp />
}

function MainApp() {
  const { t } = useLang()
  // Landing default: Overview (command center). Data periode tetap di-restore
  // otomatis oleh QuadrantContext di latar belakang, terlepas halaman awal.
  const [currentPage, setCurrentPage] = useState('overview')

  // Produk yang sedang dibuka di kalkulator (null = produk baru/kosong).
  // calcKey membump-remount CalculatorPage agar field ter-reset/terisi sesuai produk.
  const [editingProduct, setEditingProduct] = useState(null)
  const [calcKey, setCalcKey] = useState(0)
  const [settingsTab, setSettingsTab] = useState('profil')

  function openProduct(product) {
    setEditingProduct(product)
    setCalcKey(k => k + 1)
    setCurrentPage('calculator')
  }
  function newProduct() {
    setEditingProduct(null)
    setCalcKey(k => k + 1)
    setCurrentPage('calculator')
  }

  // Navigasi sidebar: buka kalkulator selalu sebagai produk BARU. Tanpa ini,
  // editingProduct yang basi (dari edit/duplikat sebelumnya) ikut terbawa,
  // sehingga "Simpan" malah menimpa produk lama, bukan membuat yang baru.
  function handleNavigate(target, opts) {
    if (target === 'calculator') { newProduct(); return }
    if (target === 'settings' && opts?.tab) setSettingsTab(opts.tab)
    setCurrentPage(target)
  }

  // Workspaces dari Supabase (async). Pointer workspace aktif disimpan
  // per-device di localStorage. wsKey membump-remount QuadrantProvider saat
  // ganti workspace agar data workspace lama tidak nyangkut.
  const [workspaces, setWorkspaces] = useState([])
  const [currentId, setCurrentId] = useState(() => getCurrentWorkspaceId())
  const [wsLoading, setWsLoading] = useState(true)
  const [wsKey, setWsKey] = useState(0)

  // Muat daftar workspace saat mount; buat default "Toko Utama" bila kosong.
  // didInit menjamin bootstrap jalan SEKALI — mencegah StrictMode (dev) /
  // double-invoke membuat workspace default ganda.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    ;(async () => {
      try {
        let list = await listWorkspaces()
        if (list.length === 0) {
          list = [await createWorkspace({ name: 'Toko Utama', color: PRESET_COLORS[0] })]
        }
        const stored = getCurrentWorkspaceId()
        const cur = list.some(w => w.id === stored) ? stored : list[0].id
        setCurrentWorkspace(cur)
        setWorkspaces(list)
        setCurrentId(cur)
      } catch (e) {
        console.error('Gagal memuat workspace:', e)
      } finally {
        setWsLoading(false)
      }
    })()
  }, [])

  const currentWorkspace = workspaces.find(w => w.id === currentId) || null

  const page = (PAGE_KEYS.includes(currentPage) || PAGE_META[currentPage]) ? currentPage : 'quadrant'
  const meta = PAGE_META[page] ?? { title: t(`page.${page}.title`), subtitle: t(`page.${page}.subtitle`) }

  // Re-fetch daftar workspace dari Supabase (mis. setelah buat/hapus), lalu
  // rekonsiliasi pointer aktif & remount provider.
  async function refreshWorkspaces() {
    const list = await listWorkspaces()
    const stored = getCurrentWorkspaceId()
    const cur = list.some(w => w.id === stored) ? stored : (list[0]?.id ?? null)
    setCurrentWorkspace(cur)
    setWorkspaces(list)
    setCurrentId(cur)
    setWsKey(k => k + 1)
  }

  function handleSwitchWorkspace(id) {
    setCurrentWorkspace(id)
    setCurrentId(id)
    setWsKey(k => k + 1)
  }

  if (wsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <QuadrantProvider key={wsKey}>
      <Layout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        pageTitle={meta.title}
        pageSubtitle={meta.subtitle}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onSwitchWorkspace={handleSwitchWorkspace}
        onWorkspaceChange={refreshWorkspaces}
      >
        {currentPage === 'quadrant' && <QuadrantPage />}
        {currentPage === 'calculator' && (
          <CalculatorPage
            key={calcKey}
            initialProduct={editingProduct}
            onAfterSave={() => setCurrentPage('products')}
          />
        )}
        {currentPage === 'products' && (
          <ProductsPage onOpenProduct={openProduct} onNewProduct={newProduct} />
        )}
        {currentPage === 'performance' && <StorePerformancePage />}
        {currentPage === 'campaign' && <CampaignPage />}
        {currentPage === 'settings' && (
          <SettingsPage initialTab={settingsTab} currentWorkspace={currentWorkspace} />
        )}
        {/* Overview ikut provider GMV Max (baca-saja) supaya data tidak
            dimuat ulang saat berpindah Overview ↔ halaman gmv_*. */}
        {(currentPage === 'overview' || currentPage.startsWith('gmv_')) && (
          <GmvMaxProvider key="gmv">
            {currentPage === 'overview'
              ? <OverviewPage onNavigate={handleNavigate} />
              : <GmvMaxModule page={currentPage} />}
          </GmvMaxProvider>
        )}
        {currentPage !== 'overview' && !currentPage.startsWith('gmv_') &&
          !['overview', 'quadrant', 'calculator', 'products', 'performance', 'campaign', 'settings'].includes(currentPage) && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-ink-faint text-sm">{t('page.wip')}</p>
          </div>
        )}
      </Layout>
    </QuadrantProvider>
  )
}
