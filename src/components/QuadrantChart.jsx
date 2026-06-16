import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer, Label,
} from 'recharts'
import { QUADRANT_CONFIG, fmtNum } from '../utils/quadrantUtils'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  const cfg = QUADRANT_CONFIG[p.quadrant]
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 max-w-xs">
      <p className="text-xs font-semibold text-gray-800 leading-snug mb-2 line-clamp-2">
        {p.nama_produk}
      </p>
      <div className="space-y-1 text-xs text-ink-faint">
        <div className="flex justify-between gap-4">
          <span>Pengunjung</span>
          <span className="font-medium text-gray-800">{fmtNum(p.pengunjung)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Konversi</span>
          <span className="font-medium text-gray-800">{p.conversion_rate?.toFixed(2)}%</span>
        </div>
        {p.atc_rate !== null && (
          <div className="flex justify-between gap-4">
            <span>ATC Rate</span>
            <span className="font-medium text-gray-800">{p.atc_rate?.toFixed(2)}%</span>
          </div>
        )}
        {p.pesanan !== null && (
          <div className="flex justify-between gap-4">
            <span>Pesanan</span>
            <span className="font-medium text-gray-800">{fmtNum(p.pesanan)}</span>
          </div>
        )}
      </div>
      <div
        className="mt-2 pt-2 border-t border-gray-100 text-xs font-medium"
        style={{ color: cfg.color }}
      >
        Q{p.quadrant} · {cfg.short}
      </div>
    </div>
  )
}

function CustomDot(props) {
  const { cx, cy, payload } = props
  const cfg = QUADRANT_CONFIG[payload?.quadrant] || QUADRANT_CONFIG[4]
  return (
    <circle
      cx={cx} cy={cy} r={5}
      fill={cfg.color}
      fillOpacity={0.75}
      stroke="white"
      strokeWidth={1.5}
    />
  )
}

export default function QuadrantChart({ products, settings }) {
  const { trafficThreshold: tx, conversionThreshold: cy } = settings

  const { data, maxX, maxY } = useMemo(() => {
    const data = products.map(p => ({
      x: p.pengunjung,
      y: p.conversion_rate,
      ...p,
    }))
    const rawMaxX = Math.max(...data.map(d => d.x), tx * 2, 100)
    const maxX = Math.ceil(rawMaxX * 1.15 / 1000) * 1000
    const rawMaxY = Math.max(...data.map(d => d.y), cy * 2, 5)
    const maxY = Math.ceil(rawMaxY * 1.2)
    return { data, maxX, maxY }
  }, [products, tx, cy])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-800 mb-4 text-sm">Peta Kuadran Produk</h3>
      <ResponsiveContainer width="100%" height={460}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />

          {/* Quadrant backgrounds */}
          <ReferenceArea x1={0} x2={tx} y1={cy} y2={maxY}
            fill={QUADRANT_CONFIG[2].fill} />
          <ReferenceArea x1={tx} x2={maxX} y1={cy} y2={maxY}
            fill={QUADRANT_CONFIG[1].fill} />
          <ReferenceArea x1={0} x2={tx} y1={0} y2={cy}
            fill={QUADRANT_CONFIG[4].fill} />
          <ReferenceArea x1={tx} x2={maxX} y1={0} y2={cy}
            fill={QUADRANT_CONFIG[3].fill} />

          {/* Threshold lines */}
          <ReferenceLine x={tx} stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={1.5}>
            <Label
              value={`${fmtNum(tx)} pengunjung`}
              position="insideTopRight"
              style={{ fontSize: 10, fill: '#94a3b8' }}
              offset={6}
            />
          </ReferenceLine>
          <ReferenceLine y={cy} stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={1.5}>
            <Label
              value={`${cy}% konversi`}
              position="insideTopRight"
              style={{ fontSize: 10, fill: '#94a3b8' }}
              offset={6}
            />
          </ReferenceLine>

          <XAxis
            type="number" dataKey="x"
            domain={[0, maxX]}
            tickCount={6}
            tickFormatter={v => fmtNum(v)}
          >
            <Label
              value="Pengunjung (Traffic)"
              position="insideBottom"
              offset={-25}
              style={{ fontSize: 12, fill: '#64748b' }}
            />
          </XAxis>
          <YAxis
            type="number" dataKey="y"
            domain={[0, maxY]}
            tickFormatter={v => `${v}%`}
            width={55}
          >
            <Label
              value="Conversion Rate (%)"
              angle={-90}
              position="insideLeft"
              offset={15}
              style={{ fontSize: 12, fill: '#64748b' }}
            />
          </YAxis>

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

          <Scatter data={data} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 justify-center">
        {[1, 2, 3, 4].map(q => (
          <div key={q} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: QUADRANT_CONFIG[q].color }} />
            <span className="text-xs text-ink-muted">Q{q} · {QUADRANT_CONFIG[q].short}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
