import { useState, useEffect, useCallback } from 'react'
import { Megaphone, CalendarRange } from 'lucide-react'
import { listProducts } from '../data/calcProducts'
import { productSummary, productVariations, productFees } from '../utils/product'
import { computeCalc } from '../utils/calc'
import CampaignPanel from '../components/CampaignPanel'
import CampaignByProductPanel from '../components/CampaignByProductPanel'

function withMetrics(p) {
  const summary = productSummary(p)
  const fees = productFees(p)
  const rep = summary.rep || {}
  const state = {
    ...fees,
    hpp: rep.hpp ?? '', hargaCoret: rep.hargaCoret ?? '', jual: rep.jual ?? '',
    jualCampaign: rep.jualCampaign ?? '', jualFlash: rep.jualFlash ?? '',
  }
  const calc = rep.calc || computeCalc(state)
  return { ...p, summary, state, calc, status: summary.status, variations: productVariations(p) }
}

const TABS = [
  { id: 'list', label: 'Daftar Campaign', icon: Megaphone },
  { id: 'product', label: 'Campaign per Produk', icon: CalendarRange },
]

export default function CampaignPage({ onOpenProduct }) {
  const [products, setProducts] = useState([])
  const [tab, setTab] = useState('list') // list | product

  const reload = useCallback(async () => {
    const list = await listProducts()
    setProducts(list.map(withMetrics))
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])

  return (
    <div className="p-6">
      <div className="flex items-center gap-1 mb-6 border-b border-line/8">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-blue-500 text-ink-strong' : 'border-transparent text-ink-faint hover:text-ink-muted'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === 'list'
        ? <CampaignPanel products={products} />
        : <CampaignByProductPanel products={products} onOpenProduct={onOpenProduct} onOpenCampaigns={() => setTab('list')} />}
    </div>
  )
}
