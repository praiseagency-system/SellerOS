import { fmtNum, fmtIDR } from '../utils/quadrantUtils'
import { FLAG_LABEL } from '../utils/metricLabels'

// Rincian satu canonical product: angka gabungan di atas, angka asli tiap
// marketplace di bawahnya. Dipakai sebagai baris yang bisa dibuka di Tabel.
const PLAT = { shopee: 'Shopee', tiktok: 'TikTok Shop' }

const num = v => v == null ? '—' : fmtNum(v)
const pct = v => v == null ? '—' : `${v.toFixed(2)}%`
const rp = v => v == null ? '—' : fmtIDR(v)
const x = v => v == null ? '—' : v.toFixed(2)

function Row({ label, blended, parts, render }) {
  return (
    <div className="py-2 border-b border-line/8 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-muted">{label}</span>
        <span className="text-[13px] font-semibold text-ink-strong tabular-nums">{render(blended)}</span>
      </div>
      <div className="mt-1 space-y-0.5">
        {parts.map(p => (
          <div key={p.platform} className="flex items-center justify-between pl-3">
            <span className="text-[11px] text-ink-faint">{PLAT[p.platform] || p.platform}</span>
            <span className="text-[11px] text-ink-muted tabular-nums">{render(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ProductBreakdown({ product }) {
  const bd = product?.breakdown || []
  if (!bd.length) return null
  const part = key => bd.map(b => ({ platform: b.platform, value: b[key] }))

  return (
    <div className="rounded-xl border border-line/10 bg-fill/5 px-3 py-1.5">
      <Row label="Qualified traffic" blended={product.qualifiedTraffic} parts={part('qualifiedTraffic')} render={num} />
      <Row label="Conversion rate" blended={product.conversionRate} parts={part('conversionRate')} render={pct} />
      <Row label="ATC rate" blended={product.atcRate} parts={part('atcRate')} render={pct} />
      <Row label="GMV" blended={product.gmv} parts={part('gmv')} render={rp} />
      <Row label="ROAS" blended={product.roasBlended} parts={part('roas')} render={x} />

      {(product.flags || []).length > 0 && (
        <div className="pt-2 pb-1 space-y-1">
          {product.flags.map(f => (
            <p key={f} className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
              {FLAG_LABEL[f] || f}
            </p>
          ))}
        </div>
      )}
      {product.merged && (product.mappingReasons || []).length > 0 && (
        <p className="text-[10px] text-ink-faint pb-1.5">
          Dasar penggabungan: {product.mappingReasons.join(' · ')}
          {product.mappingConfidence != null && ` · keyakinan ${Math.round(product.mappingConfidence * 100)}%`}
        </p>
      )}
    </div>
  )
}
