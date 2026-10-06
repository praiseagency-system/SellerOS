// Chip status tayang video (Tayang / Learning / Antre / …) — satu warna per
// status di daftar eksperimen, kartu vonis, tabel harian, dan pita grafik.
import { statusLabel, statusTone } from '../../utils/gmvmaxExperimentStatus'

const CLS = {
  tay: 'bg-emerald-500/10 text-emerald-400',
  lrn: 'bg-blue-500/10 text-blue-400',
  ant: 'bg-fill/5 text-ink-muted',
  tak: 'bg-red-500/10 text-red-400',
  izn: 'bg-amber-500/10 text-amber-400',
  off: 'bg-fill/5 text-ink-faint',
}
// Warna pita di grafik (SVG) — senada dengan chip.
const FILL = {
  tay: 'rgb(52 211 153)', lrn: 'rgb(96 165 250)', ant: 'rgb(148 163 184)',
  tak: 'rgb(248 113 113)', izn: 'rgb(251 191 36)', off: 'rgb(100 116 139)',
}
// eslint-disable-next-line react-refresh/only-export-components
export const statusFill = (status) => FILL[statusTone(status)] || FILL.off

export default function StatusChip({ status, children, title }) {
  return (
    <span title={title} className={`inline-block text-[11px] rounded-md px-1.5 py-0.5 whitespace-nowrap ${CLS[statusTone(status)] || CLS.off}`}>
      {children ?? statusLabel(status)}
    </span>
  )
}
