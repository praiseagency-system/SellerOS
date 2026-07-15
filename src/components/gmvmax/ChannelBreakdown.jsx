// Perbandingan channel GMV Max (Video · Product card · Live) — dipakai langsung
// di Dashboard (digabung, tanpa halaman terpisah). Share bar + 3 kartu + tren
// harian stacked + tabel rincian. Channel dari rollupChannels (Live dipisah dari
// Card via sinyal campaign LIVE).
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { PlayCircle, LayoutGrid, Radio, Info } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { fmtRp, fmtRpC, fmtRoasX, DeltaBadge } from './ui'

const n = (v) => (v || 0).toLocaleString('id-ID')
const CH = [
  { key: 'video', label: 'Video', icon: PlayCircle, hex: '#3b82f6', chip: 'bg-blue-500/15 text-blue-400', bar: 'bg-blue-500', note: 'per-video · per-produk' },
  { key: 'card', label: 'Product card', icon: LayoutGrid, hex: '#22c55e', chip: 'bg-emerald-500/15 text-emerald-400', bar: 'bg-emerald-500', note: 'level-campaign · tanpa produk' },
  { key: 'live', label: 'Live', icon: Radio, hex: '#f97316', chip: 'bg-orange-500/15 text-orange-400', bar: 'bg-orange-500', note: 'agregat live · tanpa breakdown' },
]

export default function ChannelBreakdown() {
  const { channels: ch, channelTrend, prev } = useGmvMax()
  const total = ch?.total || 0
  if (!total) return null
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0)
  const trend = channelTrend.map(d => ({ ...d, name: d.date.slice(8) }))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink-strong">Channel · Video / Product card / Live</h3>
        <span className="text-xs text-ink-faint">total {fmtRp(total)}</span>
      </div>

      {/* Share bar */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex h-3.5 rounded-full overflow-hidden mb-2">
          {CH.map(c => <div key={c.key} className={c.bar} style={{ width: `${pct(ch[c.key].revenue)}%` }} />)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {CH.map(c => (
            <span key={c.key} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-sm ${c.bar}`} /> {c.label} {pct(ch[c.key].revenue).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      {/* 3 kartu channel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CH.map(c => {
          const d = ch[c.key]
          return (
            <div key={c.key} className="glass-card rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.chip}`}><c.icon className="w-4 h-4" /></span>
                <span className="text-sm font-semibold text-ink-strong">{c.label}</span>
                <span className="ml-auto"><DeltaBadge cur={d.revenue} prev={prev?.channels?.[c.key]?.revenue} fmt={fmtRpC} /></span>
              </div>
              <p className="text-xl font-bold text-ink-strong tabular-nums">{fmtRpC(d.revenue)}</p>
              <p className="text-[11px] text-ink-faint mb-2.5">{pct(d.revenue).toFixed(1)}% dari total · {fmtRp(d.revenue)}</p>
              <div className="grid grid-cols-3 gap-1 text-center border-t border-line/10 pt-2.5">
                <div><p className="text-[10px] text-ink-faint">ROAS</p><p className="text-xs font-semibold text-ink">{fmtRoasX(d.roas)}</p></div>
                <div><p className="text-[10px] text-ink-faint">Orders</p><p className="text-xs font-semibold text-ink">{n(d.orders)}</p></div>
                <div><p className="text-[10px] text-ink-faint">Cost</p><p className="text-xs font-semibold text-ink">{fmtRpC(d.cost)}</p></div>
              </div>
              <p className="text-[10px] text-ink-faint mt-2">{c.note}</p>
            </div>
          )
        })}
      </div>

      {/* Tren harian stacked */}
      {trend.length > 1 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-strong">Tren revenue harian per channel</h3>
            <div className="flex items-center gap-3 text-xs text-ink-faint">
              {CH.map(c => <span key={c.key} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${c.bar}`} />{c.label}</span>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend} margin={{ left: 5, right: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis tickFormatter={fmtRpC} tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip formatter={(v, key) => [fmtRp(v), CH.find(c => c.key === key)?.label || key]}
                labelFormatter={l => `Tgl ${l}`} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
              {CH.map(c => <Bar key={c.key} dataKey={c.key} stackId="ch" fill={c.hex} radius={c.key === 'live' ? [3, 3, 0, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabel rincian */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">Rincian per channel</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint border-b border-line/8">
              <th className="py-2 pr-3 font-medium">Channel</th>
              <th className="py-2 px-3 font-medium text-right">Revenue</th>
              <th className="py-2 px-3 font-medium text-right">Cost</th>
              <th className="py-2 px-3 font-medium text-right">ROAS</th>
              <th className="py-2 px-3 font-medium text-right">Orders</th>
              <th className="py-2 px-3 font-medium text-right">CPO</th>
              <th className="py-2 pl-3 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {CH.map(c => {
              const d = ch[c.key]
              return (
                <tr key={c.key} className="border-b border-line/5">
                  <td className="py-2.5 pr-3 font-medium text-ink flex items-center gap-2"><span className={`w-2 h-2 rounded-sm ${c.bar}`} />{c.label}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-ink-strong">{fmtRp(d.revenue)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-ink-muted">{fmtRp(d.cost)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{fmtRoasX(d.roas)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{n(d.orders)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-ink-muted">{fmtRp(d.cpo)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-blue-400 font-semibold">{pct(d.revenue).toFixed(1)}%</td>
                </tr>
              )
            })}
            <tr className="font-semibold">
              <td className="py-2.5 pr-3 text-ink-strong">Total</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-ink-strong">{fmtRp(total)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-ink-muted">{fmtRp(ch.video.cost + ch.card.cost + ch.live.cost)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums" colSpan={4}></td>
            </tr>
          </tbody>
        </table>
        <p className="text-[11px] text-ink-faint mt-3 flex items-start gap-1.5 leading-relaxed">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Live dipisah dari Card via sinyal campaign LIVE. Product card &amp; Live level-campaign (tanpa product_id) → tak muncul di Performa Produk; hanya Video yang ter-atribusi per-produk.
        </p>
      </div>
    </div>
  )
}
