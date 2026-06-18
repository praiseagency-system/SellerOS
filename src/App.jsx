import { useState, useEffect, useRef } from 'react'
import Layout from './components/Layout'
import ImportPage from './pages/ImportPage'
import QuadrantPage from './pages/QuadrantPage'
import CalculatorPage from './pages/CalculatorPage'
import ProductsPage from './pages/ProductsPage'
import StorePerformancePage from './pages/StorePerformancePage'
import SettingsPage from './pages/SettingsPage'
import { QuadrantProvider } from './contexts/QuadrantContext'
import { useLang } from './contexts/LanguageContext'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import { listWorkspaces, createWorkspace } from './data/workspaces'
import { getCurrentWorkspaceId, setCurrentWorkspace, PRESET_COLORS } from './utils/workspace'
import { listSessions } from './data/periods'

const PAGE_KEYS = ['import', 'quadrant', 'calculator', 'products', 'performance', 'reports', 'ai']
// Halaman tanpa key i18n — judul ditetapkan manual.
const PAGE_META = {
  settings: { title: 'Pengaturan', subtitle: 'Akun & privasi data' },
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
  // Kalau workspace ini sudah punya periode tersimpan, langsung buka Kuadran
  // (data di-restore otomatis di QuadrantContext). Kalau kosong, mulai di Import.
  const [currentPage, setCurrentPage] = useState('import')

  // Produk yang sedang dibuka di kalkulator (null = produk baru/kosong).
  // calcKey membump-remount CalculatorPage agar field ter-reset/terisi sesuai produk.
  const [editingProduct, setEditingProduct] = useState(null)
  const [calcKey, setCalcKey] = useState(0)

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
  function handleNavigate(target) {
    if (target === 'calculator') { newProduct(); return }
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
        const saved = await listSessions()
        if (saved.length > 0) setCurrentPage('quadrant')
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
        {currentPage === 'import' && <ImportPage onImported={() => setCurrentPage('quadrant')} />}
        {currentPage === 'quadrant' && <QuadrantPage onNavigate={setCurrentPage} />}
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
        {currentPage === 'settings' && <SettingsPage />}
        {!['import', 'quadrant', 'calculator', 'products', 'performance', 'settings'].includes(currentPage) && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-ink-faint text-sm">{t('page.wip')}</p>
          </div>
        )}
      </Layout>
    </QuadrantProvider>
  )
}
