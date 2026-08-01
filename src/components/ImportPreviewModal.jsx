import { useState } from 'react'
import { X, FileSpreadsheet, AlertTriangle, ChevronLeft } from 'lucide-react'
import { CANONICAL } from '../utils/metricSchema'
import { IMPORT_STATUS_BADGE, METRIC_TOOLTIP } from '../utils/metricLabels'
import { readinessLabel } from '../utils/importPreview'
import { fmtNum, fmtIDR } from '../utils/quadrantUtils'

// Preview sebelum import disimpan. Data TIDAK ditulis sebelum user menekan
// "Konfirmasi Import" — tombol Batal/Kembali keluar tanpa menyimpan apa pun.

const Badge = ({ id }) => {
  const b = IMPORT_STATUS_BADGE[id] || IMPORT_STATUS_BADGE.missing
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${b.cls}`}>{b.label}</span>
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <span className="text-[12px] text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

export default function ImportPreviewModal({ data, replacing, onConfirm, onBack, onCancel }) {
  const [busy, setBusy] = useState(false)
  const { preview, samples, platform, productCount } = data
  const s = preview.summary
  const ready = readinessLabel(preview.readiness)
  const blocked = !preview.readiness.quadrant.ready

  async function confirm() {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-surface border border-line/15 rounded-2xl shadow-xl">
        <div className="sticky top-0 bg-surface border-b border-line/10 px-5 py-3.5 flex items-center gap-3 z-10">
          <FileSpreadsheet className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-strong">Preview Import — {platform === 'tiktok' ? 'TikTok Shop' : 'Shopee'}</p>
            <p className="text-[11px] text-ink-faint truncate">{s.fileName}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${ready.cls}`}>{ready.label}</span>
          <button onClick={onCancel} className="p-1 rounded-lg text-ink-faint hover:text-ink flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Ringkasan file */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 rounded-xl border border-line/10 bg-fill/5 px-4 py-2.5">
            <Row label="Sheet" value={s.sheetName} />
            <Row label="Header row" value={`baris ${s.headerRow + 1}`} />
            <Row label="Periode" value={s.periodStart ? `${s.periodStart} – ${s.periodEnd}` : '—'} />
            <Row label="Sumber periode" value={s.periodSource === 'filename' ? 'nama file' : s.periodSource === 'file_content' ? 'isi file' : '—'} />
            <Row label={platform === 'shopee' ? 'Parent produk' : 'Produk'} value={fmtNum(s.parentCount)} />
            {platform === 'shopee' && <Row label="Variant (tak dijumlahkan)" value={fmtNum(s.variantCount)} />}
            <Row label="Kolom dikenali" value={`${s.mappedColumns} dari ${s.totalColumns}`} />
            <Row label="Tak dikenali / tak dipakai" value={`${s.unknownColumns} / ${s.unusedColumns}`} />
            <Row label="Mapping version" value={`v${preview.mappingVersion}`} />
          </div>

          {/* Warning */}
          {preview.warnings.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 space-y-1">
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{w}
                </p>
              ))}
            </div>
          )}

          {/* Mapping field */}
          <div>
            <p className="text-[13px] font-semibold text-ink-strong mb-1.5">Pemetaan kolom</p>
            <div className="rounded-xl border border-line/10 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line/8 text-[10px] text-ink-faint">
                    <th className="px-3 py-1.5 text-left font-medium">Metrik SellerOS</th>
                    <th className="px-3 py-1.5 text-left font-medium">Header File</th>
                    <th className="px-3 py-1.5 text-right font-medium">Contoh</th>
                    <th className="px-3 py-1.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/5">
                  {preview.mapped.map(m => (
                    <tr key={m.canonical}>
                      <td className="px-3 py-1.5 text-ink" title={METRIC_TOOLTIP[m.canonical] || ''}>{m.label}</td>
                      <td className="px-3 py-1.5 text-ink-faint">{m.rawHeader}</td>
                      <td className="px-3 py-1.5 text-right text-ink-muted tabular-nums">{String(m.example ?? '—')}</td>
                      <td className="px-3 py-1.5 text-right"><Badge id={m.status} /></td>
                    </tr>
                  ))}
                  {preview.unused.map(u => (
                    <tr key={u.header} className="opacity-70">
                      <td className="px-3 py-1.5 text-ink-faint italic">{u.reason}</td>
                      <td className="px-3 py-1.5 text-ink-faint">{u.header}</td>
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5 text-right"><Badge id="unused" /></td>
                    </tr>
                  ))}
                  {preview.ambiguous.map(a => (
                    <tr key={a.key}>
                      <td className="px-3 py-1.5 text-red-300">{CANONICAL[a.key]?.label || a.key}</td>
                      <td className="px-3 py-1.5 text-red-300">{a.headers.join(' / ')}</td>
                      <td className="px-3 py-1.5 text-[10px] text-ink-faint text-right">tidak diimpor — perlu review</td>
                      <td className="px-3 py-1.5 text-right"><Badge id="ambiguous" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Field wajib yang hilang */}
          {(preview.readiness.quadrant.missing.length > 0 || preview.readiness.funnelCore.missing.length > 0) && (
            <div className="rounded-xl border border-line/10 bg-fill/5 px-4 py-3 space-y-1.5">
              {preview.readiness.quadrant.missing.map(k => (
                <p key={k} className="text-[11px] text-red-300">
                  <b>{CANONICAL[k]?.label || k}</b> tidak ditemukan — Kuadran tidak dapat dihitung tanpa metrik ini.
                </p>
              ))}
              {preview.readiness.quadrant.ready && preview.readiness.funnelCore.missing.map(k => (
                <p key={k} className="text-[11px] text-amber-300">
                  <b>{CANONICAL[k]?.label || k}</b> tidak ditemukan — Funnel utama tak lengkap; Kuadran tetap bisa digunakan.
                </p>
              ))}
            </div>
          )}

          {/* Sampel produk */}
          <div>
            <p className="text-[13px] font-semibold text-ink-strong mb-1.5">Sampel produk setelah normalisasi</p>
            <div className="rounded-xl border border-line/10 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line/8 text-[10px] text-ink-faint">
                    <th className="px-3 py-1.5 text-left font-medium">Produk</th>
                    <th className="px-3 py-1.5 text-right font-medium" title={METRIC_TOOLTIP.qualifiedTraffic}>Traffic Produk</th>
                    <th className="px-3 py-1.5 text-right font-medium" title={METRIC_TOOLTIP.atcUsers}>Tambah Keranjang</th>
                    <th className="px-3 py-1.5 text-right font-medium" title={METRIC_TOOLTIP.buyers}>Pembeli</th>
                    <th className="px-3 py-1.5 text-right font-medium" title={METRIC_TOOLTIP.orders}>Pesanan</th>
                    <th className="px-3 py-1.5 text-right font-medium" title={METRIC_TOOLTIP.gmv}>GMV</th>
                    <th className="px-3 py-1.5 text-right font-medium" title={METRIC_TOOLTIP.conversionRate}>Rasio Konversi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/5">
                  {samples.map(p => (
                    <tr key={p.productId}>
                      <td className="px-3 py-1.5">
                        <p className="text-ink line-clamp-1 max-w-[220px]" title={p.name}>{p.name}</p>
                        {/* ID sebagai STRING — 19 digit tampil utuh, tanpa notasi ilmiah */}
                        <p className="text-[10px] text-ink-faint font-mono">{p.productId}</p>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{p.qualifiedTraffic == null ? '—' : fmtNum(p.qualifiedTraffic)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{p.atcUsers == null ? '—' : fmtNum(p.atcUsers)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{p.buyers == null ? '—' : fmtNum(p.buyers)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{p.orders == null ? '—' : fmtNum(p.orders)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{p.gmv == null ? '—' : fmtIDR(p.gmv)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{p.conversionRate == null ? '—' : `${(p.conversionRate * 100).toFixed(2)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Konfirmasi */}
          <div className="rounded-xl border border-line/10 bg-fill/5 px-4 py-3">
            <p className="text-[12px] text-ink mb-0.5">
              {fmtNum(productCount)} produk akan disimpan untuk periode {s.periodStart} – {s.periodEnd}.
            </p>
            <p className="text-[11px] text-ink-faint">
              {replacing
                ? 'Snapshot periode & marketplace yang sama akan DIGANTI (bukan ditambahkan) — import ulang aman diulang.'
                : 'Belum ada snapshot untuk periode ini — data baru akan dibuat.'}
              {' '}Mapping v{preview.mappingVersion}.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-line/10 px-5 py-3 flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-line/15 text-ink-muted hover:text-ink transition-colors">
            <ChevronLeft className="w-4 h-4" /> Kembali
          </button>
          <button onClick={onCancel} className="px-3 py-2 rounded-xl text-sm font-semibold text-ink-faint hover:text-ink transition-colors">Batal</button>
          <button onClick={confirm} disabled={busy || blocked}
            title={blocked ? 'Metrik wajib Kuadran belum lengkap' : undefined}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {busy ? 'Menyimpan…' : 'Konfirmasi Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
