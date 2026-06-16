import { useState } from 'react'
import { Megaphone, Target, HeartPulse, Info } from 'lucide-react'

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
const r1 = n => Math.round(n * 10) / 10

// Palet warna eksplisit (agar tidak ter-purge Tailwind)
const C = {
  red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     soft: 'bg-red-500/5',     border: 'border-red-500/30',     dot: 'bg-red-500',     glow: 'shadow-red-500/20' },
  yellow:  { text: 'text-yellow-400',  bg: 'bg-yellow-500/10',  soft: 'bg-yellow-500/5',  border: 'border-yellow-500/30',  dot: 'bg-yellow-500',  glow: 'shadow-yellow-500/20' },
  orange:  { text: 'text-orange-400',  bg: 'bg-orange-500/10',  soft: 'bg-orange-500/5',  border: 'border-orange-500/30',  dot: 'bg-orange-500',  glow: 'shadow-orange-500/20' },
  green:   { text: 'text-green-400',   bg: 'bg-green-500/10',   soft: 'bg-green-500/5',   border: 'border-green-500/30',   dot: 'bg-green-500',   glow: 'shadow-green-500/20' },
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', soft: 'bg-emerald-500/8', border: 'border-emerald-500/40', dot: 'bg-emerald-500', glow: 'shadow-emerald-500/30' },
}

const LEVELS = [
  { key: 'rugi',       label: 'Rugi',       mult: 1.0, color: 'red',     desc: 'Break Even Point — di bawah ini iklan bikin rugi.' },
  { key: 'aman',       label: 'Aman',       mult: 1.3, color: 'yellow',  desc: 'Masih menghasilkan profit meskipun performa iklan fluktuatif.' },
  { key: 'kompetitif', label: 'Kompetitif', mult: 1.7, color: 'orange',  desc: 'Ideal untuk bersaing di market.' },
  { key: 'scale',      label: 'Scale',      mult: 2.5, color: 'green',   desc: 'Profit cukup besar untuk melakukan scaling.' },
  { key: 'dominasi',   label: 'Dominasi',   mult: 4.0, color: 'emerald', desc: 'Profit sangat sehat dan ruang scale masih besar.' },
]

function healthScore(margin) {
  if (margin < 20) return { status: 'Tidak Layak Iklan', color: 'red',     note: 'Margin terlalu tipis untuk menanggung biaya iklan.' }
  if (margin < 30) return { status: 'Tipis',             color: 'orange',  note: 'Bisa diiklankan, tapi ruang profit sempit.' }
  if (margin < 45) return { status: 'Sehat',             color: 'green',   note: 'Margin sehat — aman untuk diiklankan.' }
  return                  { status: 'Sangat Sehat',      color: 'emerald', note: 'Margin sangat besar — ruang scaling luas.' }
}

function Tip({ text }) {
  return (
    <span className="group/tip relative inline-flex items-center align-middle">
      <Info className="w-3 h-3 text-ink-faint hover:text-ink-muted cursor-help ml-1" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 z-20
        rounded-lg bg-app border border-line/20 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-muted
        opacity-0 group-hover/tip:opacity-100 transition-opacity shadow-xl">
        {text}
      </span>
    </span>
  )
}

function AnimNum({ children }) {
  // re-mount tiap nilai berubah → animasi pop ringan
  return <span key={String(children)} className="inline-block roas-pop">{children}</span>
}

export default function RoasIntelligence({ hargaJual, profit, margin, roasBep }) {
  const [active, setActive] = useState('scale')

  const viable = roasBep != null && profit > 0
  const hs = healthScore(margin)
  const hsC = C[hs.color]

  const levels = viable
    ? LEVELS.map(l => {
        const target = r1(roasBep * l.mult)
        const biayaIklanMax = hargaJual / target
        const estProfit = profit - biayaIklanMax
        return { ...l, target, biayaIklanMax, estProfit }
      })
    : []

  const activeLevel = levels.find(l => l.key === active) || levels[0]

  return (
    <div className="bg-surface border border-line/8 rounded-2xl p-5 space-y-4">
      <style>{`
        @keyframes roasPop { 0% { opacity: 0; transform: translateY(3px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .roas-pop { animation: roasPop 0.28s ease-out; }
      `}</style>

      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-600/15 flex items-center justify-center">
          <Target className="w-4 h-4 text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-ink-strong">ROAS Intelligence</h3>
      </div>

      {/* Budget Iklan Maksimal + ROAS BEP */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5">
          <div className="flex items-center text-xs text-ink-muted mb-1">
            <Megaphone className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Budget Iklan Maksimal
            <Tip text="Biaya iklan maksimum per order yang masih membuat produk impas (= Profit Bersih)." />
          </div>
          <p className="text-xl font-bold text-blue-400 tabular-nums">
            <AnimNum>{viable ? fmt(profit) : '—'}</AnimNum>
            <span className="text-xs font-normal text-ink-faint"> / order</span>
          </p>
        </div>

        <div className="rounded-xl border border-line/10 bg-fill/5 p-3.5">
          <div className="flex items-center text-xs text-ink-muted mb-1">
            <Target className="w-3.5 h-3.5 mr-1.5 text-ink-muted" />
            ROAS BEP
            <Tip text="ROAS minimum (Harga Jual ÷ Profit Bersih) agar produk tidak rugi saat diiklankan." />
          </div>
          <p className="text-xl font-bold text-ink-strong tabular-nums">
            <AnimNum>{viable ? `${roasBep.toFixed(1)}×` : '—'}</AnimNum>
          </p>
        </div>
      </div>

      {!viable && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300/90">
          Produk belum profit sebelum iklan — perbaiki harga/HPP/biaya dulu sebelum menghitung target ROAS.
        </div>
      )}

      {viable && (
        <>
          {/* Level ladder — 5 level (mobile: grid 2 kolom) */}
          <div>
            <p className="text-xs text-ink-faint mb-2">Target ROAS untuk scaling — klik untuk detail</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {levels.map(l => {
                const col = C[l.color]
                const on = l.key === active
                return (
                  <button
                    key={l.key}
                    onMouseEnter={() => setActive(l.key)}
                    onClick={() => setActive(l.key)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      on ? `${col.bg} ${col.border} shadow-lg ${col.glow}` : `${col.soft} border-line/8 hover:${col.border}`
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                      <span className={`text-[11px] font-semibold ${on ? col.text : 'text-ink-muted'}`}>{l.label}</span>
                    </div>
                    <p className={`text-base font-bold tabular-nums ${col.text}`}>
                      <AnimNum>{l.target.toFixed(1)}×</AnimNum>
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail Analysis */}
          {activeLevel && (
            <div key={activeLevel.key} className={`rounded-xl border ${C[activeLevel.color].border} ${C[activeLevel.color].soft} p-4 space-y-3 roas-pop`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold ${C[activeLevel.color].text}`}>ROAS {activeLevel.label}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${C[activeLevel.color].bg} ${C[activeLevel.color].text}`}>
                  Target {activeLevel.target.toFixed(1)}×
                </span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">{activeLevel.desc}</p>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-ink-muted">Biaya Iklan Maksimal</span>
                  <span className="font-semibold text-ink-strong tabular-nums">{fmt(activeLevel.biayaIklanMax)}</span>
                </div>
                <p className="text-[11px] text-ink-faint -mt-1">
                  {fmt(hargaJual)} ÷ {activeLevel.target.toFixed(1)} per order
                </p>

                <div className="flex justify-between items-baseline text-sm border-t border-line/8 pt-2">
                  <span className="text-ink-muted">Estimasi Profit Setelah Iklan</span>
                  <span className={`font-bold tabular-nums ${activeLevel.estProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(activeLevel.estProfit)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-faint -mt-1">
                  {fmt(profit)} − {fmt(activeLevel.biayaIklanMax)} per order
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Product Health Score */}
      <div className={`rounded-xl border ${hsC.border} ${hsC.soft} p-3.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg ${hsC.bg} flex items-center justify-center`}>
            <HeartPulse className={`w-4 h-4 ${hsC.text}`} />
          </div>
          <div>
            <div className="flex items-center text-xs text-ink-muted">
              Product Health Score
              <Tip text="Status kelayakan iklan berdasarkan Margin Bersih produk." />
            </div>
            <p className="text-[11px] text-ink-faint mt-0.5">{hs.note}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${hsC.text}`}>{hs.status}</p>
          <p className="text-[11px] text-ink-faint tabular-nums">Margin {margin.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  )
}
