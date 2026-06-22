import { useState, useEffect, useCallback } from 'react'
import { listProducts } from '../data/calcProducts'
import { productSummary, productVariations, productFees } from '../utils/product'
import { computeCalc } from '../utils/calc'
import CampaignPanel from '../components/CampaignPanel'

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

export default function CampaignPage() {
  const [products, setProducts] = useState([])

  const reload = useCallback(async () => {
    const list = await listProducts()
    setProducts(list.map(withMetrics))
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="p-6 max-w-4xl">
      <CampaignPanel products={products} />
    </div>
  )
}
