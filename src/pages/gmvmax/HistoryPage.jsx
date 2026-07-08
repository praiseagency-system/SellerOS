// Riwayat Upload — daftar snapshot harian + hapus. Tiap snapshot = potret
// kumulatif (MTD) sampai tanggalnya.
import { useState } from 'react'
import { Trash2, Calendar, UploadCloud } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, fmtRp, fmtRoasX } from '../../components/gmvmax/ui'

export default function HistoryPage({ onOpenUpload }) {
  const { imports, removeImport, busy, hasData } = useGmvMax()
  const [confirmId, setConfirmId] = useState(null)

  if (!hasData) return <EmptyState title="Belum ada riwayat upload"
    desc="Tiap file tersimpan sebagai snapshot harian (kumulatif s/d tanggalnya). Upload sekali sehari untuk melihat tren & angka harian."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium inline-flex items-center gap-2"><UploadCloud className="w-4 h-4" /> Upload Data</button>} />

  return (
    <div className="p-6 space-y-3 max-w-3xl mx-auto">
      <div className="flex justify-end">
        <button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium inline-flex items-center gap-2">
          <UploadCloud className="w-4 h-4" /> Upload Data
        </button>
      </div>
      {imports.map(imp => (
        <div key={imp.id} className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm flex items-center gap-4">
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink-strong">{imp.name}</p>
            <p className="text-xs text-ink-faint truncate">
              {imp.start_date && imp.end_date ? `${imp.start_date} — ${imp.end_date} · ` : ''}
              {imp.source_filename}
            </p>
          </div>
          <div className="text-right text-sm flex-shrink-0 hidden sm:block">
            <p className="text-ink font-medium">{fmtRp(imp.totals?.revenue)}</p>
            <p className="text-xs text-ink-faint">ROAS {fmtRoasX(imp.totals?.roas)} · cost {fmtRp(imp.totals?.cost)}</p>
          </div>
          {confirmId === imp.id ? (
            <div className="flex gap-1 flex-shrink-0">
              <button disabled={busy} onClick={() => removeImport(imp.id)} className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs">Hapus</button>
              <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded-lg text-ink-muted text-xs">Batal</button>
            </div>
          ) : (
            <button onClick={() => setConfirmId(imp.id)} className="text-ink-faint hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      ))}
    </div>
  )
}
