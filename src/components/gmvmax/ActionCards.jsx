// Rekomendasi Aksi Harian — Opsi B (kartu per jenis pekerjaan), dipilih user.
//
// Dua kelompok terbesar bersifat berlawanan, dan itulah alasan bentuk ini:
// otorisasi kedaluwarsa adalah pekerjaan BORONGAN (satu tindakan untuk semua),
// sedangkan kandidat boost adalah keputusan SATU PER SATU. Antrean tunggal
// memaksa keduanya diperlakukan sama.
//
// Kartu bernilai NOL sengaja tetap tampil: "tidak ada video boros" adalah
// informasi, bukan ruang kosong — dan itu yang menjaga daftarnya jujur di hari
// ketika memang tak ada pekerjaan.
import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { tiktokVideoUrl } from './ui'
import { VideoExecCell } from './VideoExecActions'

const TONE = {
  green: { n: 'text-emerald-400', bar: 'bg-emerald-500/60', btn: 'border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/10' },
  red: { n: 'text-red-400', bar: 'bg-red-500/60', btn: 'border-red-500/30 text-red-400 hover:bg-red-500/10' },
  amber: { n: 'text-amber-400', bar: 'bg-amber-500/60', btn: 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' },
  blue: { n: 'text-blue-300', bar: 'bg-blue-500/50', btn: 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10' },
}

// Teks outreach untuk kreator yang izinnya habis — satu baris per video supaya
// bisa langsung ditempel ke WhatsApp/DM.
function outreachText(items) {
  return items.map(i => `@${i.akun || '?'} — ${String(i.judul || '').slice(0, 60)} — https://www.tiktok.com/@${i.akun || ''}/video/${i.id}`).join('\n')
}

function ActionCard({ group, exec }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const t = TONE[group.tone] || TONE.blue
  const n = group.items.length
  const empty = n === 0

  async function copyOutreach() {
    try {
      await navigator.clipboard.writeText(outreachText(group.items))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard ditolak browser — abaikan, tombol tetap ada */ }
  }

  return (
    <div className={`bg-surface border border-line/10 rounded-2xl overflow-hidden shadow-sm ${empty ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3 p-4">
        <span className={`w-1 self-stretch rounded-full ${empty ? 'bg-line/20' : t.bar}`} />
        <span className={`text-2xl font-mono tabular-nums w-12 text-right ${empty ? 'text-ink-faint' : t.n}`}>{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-strong">{group.title}</p>
          <p className="text-xs text-ink-muted mt-0.5">{empty ? group.emptyNote : group.subtitle}</p>
          {group.footnote && <p className="text-[11px] text-ink-faint mt-1">{group.footnote}</p>}
        </div>
        {!empty && (
          group.key === 'AUTH_EXPIRED' ? (
            <button onClick={copyOutreach} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${t.btn}`}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin' : `Salin ${n} outreach`}
            </button>
          ) : (
            <button onClick={() => setOpen(!open)} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border ${t.btn}`}>
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {group.actionLabel}
            </button>
          )
        )}
        {!empty && group.key === 'AUTH_EXPIRED' && (
          <button onClick={() => setOpen(!open)} className="text-ink-faint hover:text-ink p-1" title={open ? 'Tutup daftar' : 'Lihat daftar'}>
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      {open && !empty && (
        <div className="border-t border-line/10 divide-y divide-line/5 max-h-96 overflow-auto">
          {group.items.slice(0, 60).map(it => (
            <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                {it.video || group.key === 'AUTH_EXPIRED' ? (
                  <a href={tiktokVideoUrl(it.id, it.akun) || '#'} target="_blank" rel="noreferrer"
                    className="block text-xs text-ink hover:text-ink-strong truncate">{String(it.judul).slice(0, 80)}</a>
                ) : (
                  <span className="block text-xs text-ink truncate">{String(it.judul).slice(0, 80)}</span>
                )}
                <span className="block text-[10px] text-ink-faint">
                  {it.akun ? `@${it.akun} · ` : ''}{it.detail}
                </span>
              </div>
              {/* Sel yang sama dengan Performa Video: gerbang status + menu ▾
                  untuk video yang ikut di lebih dari satu campaign. Dipakai
                  ulang, bukan ditiru, supaya perilakunya tak bercabang. */}
              {it.video && exec && (
                <VideoExecCell video={it.video} resolve={exec.resolve}
                  onBoost={exec.onBoost} onExclude={exec.onExclude}
                  anchorOf={exec.anchorOf} productName={exec.productName} layout="inline" />
              )}
            </div>
          ))}
          {group.items.length > 60 && (
            <p className="px-4 py-2 text-[10px] text-ink-faint">
              {group.items.length - 60} lainnya tidak ditampilkan — kerjakan yang teratas dulu.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ActionCards({ groups, total, snapshotDate, exec }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-xs text-ink-faint">
          {total > 0
            ? <>{total} aksi bisa dikerjakan hari ini</>
            : <>Tidak ada pekerjaan yang menunggu — semua bersih.</>}
          {snapshotDate && <> · dari snapshot {snapshotDate}</>}
        </p>
        <p className="text-[11px] text-ink-faint">Semua aksi lewat antrean 🔔 — tak ada yang menyentuh TikTok tanpa persetujuanmu.</p>
      </div>
      {groups.map(g => (
        <ActionCard key={g.key} group={g} exec={exec} />
      ))}
    </div>
  )
}
