import { useState } from 'react'
import Layout from './components/Layout'
import ImportPage from './pages/ImportPage'
import QuadrantPage from './pages/QuadrantPage'
import CalculatorPage from './pages/CalculatorPage'
import ProductsPage from './pages/ProductsPage'
import StorePerformancePage from './pages/StorePerformancePage'
import { QuadrantProvider } from './contexts/QuadrantContext'
import { useLang } from './contexts/LanguageContext'
import {
  getWorkspaces, getCurrentWorkspace, setCurrentWorkspace,
} from './utils/workspace'
import { getSessions } from './utils/storage'

const PAGE_KEYS = ['import', 'quadrant', 'calculator', 'products', 'performance', 'reports', 'ai']

export default function App() {
  const { t } = useLang()
  // Kalau workspace ini sudah punya periode tersimpan, langsung buka Kuadran
  // (data di-restore otomatis di QuadrantContext). Kalau kosong, mulai di Import.
  const [currentPage, setCurrentPage] = useState(() =>
    getSessions().length > 0 ? 'quadrant' : 'import'
  )

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

  const [workspaces, setWorkspaces] = useState(() => getWorkspaces())
  const [currentWorkspace, setCurrentWs] = useState(() => getCurrentWorkspace())
  // Bumping this remounts the provider → resets loaded data when workspace changes
  const [wsKey, setWsKey] = useState(0)

  const page = PAGE_KEYS.includes(currentPage) ? currentPage : 'quadrant'
  const meta = { title: t(`page.${page}.title`), subtitle: t(`page.${page}.subtitle`) }

  function refreshWorkspaces() {
    setWorkspaces(getWorkspaces())
    setCurrentWs(getCurrentWorkspace())
    setWsKey(k => k + 1)
  }

  function handleSwitchWorkspace(id) {
    setCurrentWorkspace(id)
    refreshWorkspaces()
  }

  return (
    <QuadrantProvider key={wsKey}>
      <Layout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
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
        {!['import', 'quadrant', 'calculator', 'products', 'performance'].includes(currentPage) && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-ink-faint text-sm">{t('page.wip')}</p>
          </div>
        )}
      </Layout>
    </QuadrantProvider>
  )
}
