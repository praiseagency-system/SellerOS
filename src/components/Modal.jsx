import { X } from 'lucide-react'

// Modal overlay generik: judul + tombol tutup + body scrollable.
// Dipakai untuk jendela Import di tiap section (Kuadran, Performa Toko).
export default function Modal({ title, subtitle, onClose, children, maxWidth = 'max-w-2xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-auto"
      onClick={onClose}>
      <div className={`bg-surface w-full ${maxWidth} rounded-2xl border border-line/10 shadow-2xl my-8 flex flex-col max-h-[90vh]`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-ink-strong truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-ink-faint truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-auto">{children}</div>
      </div>
    </div>
  )
}
