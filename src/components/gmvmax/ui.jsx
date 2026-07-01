/* eslint-disable react-refresh/only-export-components */
// Komponen UI bersama modul GMV Max — memakai token tema (bg-surface, text-ink,
// accent) agar selaras palet Praise. Gaya kartu/badge meniru dashboard Praise.
import { fmtNum, fmtCompact } from '../../utils/quadrantUtils'
import { roasBadge, STATUS_META } from '../../utils/gmvmaxClassify'

export const fmtRp = (n) => (n == null ? '—' : 'Rp ' + fmtNum(Math.round(n)))
export const fmtRpC = (n) => (n == null ? '—' : 'Rp ' + fmtCompact(n))
export const fmtRoasX = (r) => (r == null ? '—' : (r >= 100 ? Math.round(r) : r.toFixed(1)) + 'x')

const TONE = {
  green: 'bg-emerald-500/15 text-emerald-500',
  amber: 'bg-amber-500/15 text-amber-500',
  red: 'bg-red-500/15 text-red-500',
  blue: 'bg-blue-500/15 text-blue-500',
  muted: 'bg-fill/10 text-ink-faint',
  violet: 'bg-violet-500/15 text-violet-500',
}

// Badge ROAS dengan label tier (Bagus/Sedang/Buruk).
export function RoasBadge({ roas, thresholds, showLabel = true }) {
  const b = roasBadge(roas, thresholds)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${TONE[b.tone]}`}>
      {fmtRoasX(roas)}{showLabel && b.text !== '—' && <span className="opacity-70 font-medium">· {b.text}</span>}
    </span>
  )
}

// Badge status lifecycle (Scale/Active/Watch/Kill/Nonaktif).
export function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.inactive
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${TONE[m.tone]}`}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  )
}

// Kartu statistik gaya Praise: ikon-tile berwarna + label + angka besar.
export function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-2">
        {Icon && (
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${TONE[tone]}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
        <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-ink-strong">{value}</p>
      {sub && <p className="text-xs text-ink-faint mt-1">{sub}</p>}
    </div>
  )
}

// Chip filter/segmen.
export function Pill({ active, onClick, children, tone = 'blue', count }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${active ? TONE[tone] + ' ring-1 ring-current/20' : 'text-ink-muted hover:bg-fill/5'}`}
    >
      {children}
      {count != null && <span className="text-xs opacity-70">{count}</span>}
    </button>
  )
}

export function SectionTitle({ children, tone = 'ink', right }) {
  const c = tone === 'green' ? 'text-emerald-500' : tone === 'amber' ? 'text-amber-500'
    : tone === 'red' ? 'text-red-500' : 'text-ink-muted'
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className={`text-xs font-bold uppercase tracking-wider ${c}`}>{children}</h3>
      {right}
    </div>
  )
}

export function EmptyState({ title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-ink-strong font-semibold mb-1">{title}</p>
      {desc && <p className="text-sm text-ink-faint max-w-sm mb-4">{desc}</p>}
      {action}
    </div>
  )
}

// Judul + akun video (dipakai di banyak tabel/kartu).
export function VideoLabel({ title, account, videoId, compact }) {
  return (
    <div className="min-w-0">
      <p className={`font-medium text-ink truncate ${compact ? 'text-sm' : ''}`}>
        {title || '…' + String(videoId || '').slice(-6)}
      </p>
      <p className="text-xs text-ink-faint truncate">{account || 'Akun toko'}</p>
    </div>
  )
}
