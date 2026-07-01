// AI Insight — rule-based (bukan model AI eksternal). 3 sub-tab:
// Insight (kartu Scale/Watch/Kill), Action Plan, Winning Framework.
import { useState } from 'react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, fmtRpC, fmtRoasX } from '../../components/gmvmax/ui'

const TABS = [
  { id: 'insight', label: 'Insight' },
  { id: 'plan', label: 'Action Plan' },
  { id: 'framework', label: 'Winning Framework' },
]

const ACTION_BADGE = {
  scale: { text: '★ SCALE', cls: 'text-emerald-500 border-emerald-500/40' },
  boost: { text: '↗ BOOST', cls: 'text-blue-500 border-blue-500/40' },
  refresh: { text: '↻ REFRESH', cls: 'text-amber-500 border-amber-500/40' },
  kill: { text: '✕ KILL', cls: 'text-red-500 border-red-500/40' },
}

export default function InsightPage({ onOpenUpload }) {
  const { insights, hasData } = useGmvMax()
  const [tab, setTab] = useState('insight')

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <p className="text-sm text-ink-faint -mt-2">Analisis pola data GMV MAX — bukan model AI eksternal.</p>
      <div className="flex gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-fill/5'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'insight' && <InsightCards cards={insights.cards} />}
      {tab === 'plan' && <ActionPlan steps={insights.plan} />}
      {tab === 'framework' && <Framework items={insights.framework} />}
    </div>
  )
}

function InsightCards({ cards }) {
  const groups = [
    { key: 'scale', title: 'SCALE — ROAS Tinggi', tone: 'text-emerald-500' },
    { key: 'watch', title: 'WATCH — ROAS 1x–3x', tone: 'text-amber-500' },
    { key: 'kill', title: 'KILL — Rugi', tone: 'text-red-500' },
  ]
  const total = cards.scale.length + cards.watch.length + cards.kill.length
  if (!total) return <p className="text-sm text-ink-faint py-10 text-center">Belum ada rekomendasi — data spend masih tipis.</p>
  return (
    <div className="space-y-6">
      {groups.map(g => cards[g.key].length > 0 && (
        <div key={g.key}>
          <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${g.tone}`}>{g.title} · {cards[g.key].length}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cards[g.key].map(c => <Card key={c.videoId} c={c} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function Card({ c }) {
  const badge = ACTION_BADGE[c.action] || ACTION_BADGE.scale
  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm flex flex-col gap-2 hover-lift">
      <span className={`self-start text-xs font-bold px-2 py-0.5 rounded-md border ${badge.cls}`}>{badge.text}</span>
      <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{c.title}</p>
      <p className="text-xs text-ink-faint">{c.account}</p>
      <div className="flex items-end justify-between mt-1">
        <span className="text-2xl font-bold text-ink-strong">{fmtRoasX(c.roas)}</span>
        <div className="text-right text-xs text-ink-faint">
          <p>COST {fmtRpC(c.cost)}</p>
          <p>REV {fmtRpC(c.revenue)}</p>
        </div>
      </div>
      <p className="text-xs text-ink-muted border-t border-line/10 pt-2 mt-1">{c.detail}</p>
    </div>
  )
}

function ActionPlan({ steps }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {steps.map(s => (
        <div key={s.step} className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
          <p className="text-xs font-bold text-accent tracking-wider">STEP {String(s.step).padStart(2, '0')}</p>
          <p className="font-semibold text-ink-strong mt-1 mb-2">{s.title}</p>
          <p className="text-xs text-ink-muted leading-relaxed">{s.detail}</p>
        </div>
      ))}
    </div>
  )
}

function Framework({ items }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <div key={i} className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
          <p className="text-xs font-bold text-violet-500 tracking-wider">INSIGHT {String(i + 1).padStart(2, '0')}</p>
          <p className="font-semibold text-ink-strong mt-1 mb-2">{it.title}</p>
          <p className="text-xs text-ink-muted leading-relaxed">{it.detail}</p>
        </div>
      ))}
    </div>
  )
}
