// Rekomendasi Aksi Harian — kartu per jenis pekerjaan (Opsi B), dipilih user.
//
// Dua kelompok terbesar bersifat berlawanan, dan itulah alasan bentuk ini:
// otorisasi kedaluwarsa adalah pekerjaan BORONGAN (satu tindakan untuk semua),
// sedangkan kandidat boost adalah keputusan SATU PER SATU. Antrean tunggal
// memaksa keduanya diperlakukan sama.
//
// Kartu bernilai NOL sengaja tetap tampil: "tidak ada video boros" adalah
// informasi, bukan ruang kosong — dan itu yang menjaga daftarnya jujur di hari
// ketika memang tak ada pekerjaan.
//
// Daftarnya dibuka di JENDELA (ActionListWindow), bukan mengembang di dalam
// kartu: mengembang memaksa judul video, baris sasaran, angka, dan tombol
// berdesakan di satu baris sempit sampai nama produknya terpotong.
import { useState } from 'react'
import { ChevronRight, Copy, Check } from 'lucide-react'
import ActionListWindow from './ActionListWindow'

const TONE = {
  green: { n: 'text-emerald-400', bar: 'bg-emerald-500/60', btn: 'border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/10' },
  red: { n: 'text-red-400', bar: 'bg-red-500/60', btn: 'border-red-500/30 text-red-400 hover:bg-red-500/10' },
  amber: { n: 'text-amber-400', bar: 'bg-amber-500/60', btn: 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' },
  blue: { n: 'text-blue-300', bar: 'bg-blue-500/50', btn: 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10' },
}

// Teks outreach untuk kreator yang izinnya habis — satu baris per video supaya
// bisa langsung ditempel ke WhatsApp/DM tanpa membuka daftarnya dulu.
const outreachText = (items) => items
  .map(i => `@${i.akun || '?'} — ${String(i.judul || '').slice(0, 60)} — https://www.tiktok.com/@${i.akun || ''}/video/${i.id}`)
  .join('\n')

function ActionCard({ group, onOpen }) {
  const [copied, setCopied] = useState(false)
  const t = TONE[group.tone] || TONE.blue
  const n = group.items.length
  const empty = n === 0

  async function copyOutreach() {
    try {
      await navigator.clipboard.writeText(outreachText(group.items))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard ditolak peramban — tombolnya tetap ada */ }
  }

  return (
    <div className={`bg-surface border border-line/10 rounded-2xl shadow-sm ${empty ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3 p-4">
        <span className={`w-1 self-stretch rounded-full ${empty ? 'bg-line/20' : t.bar}`} />
        <span className={`text-2xl font-mono tabular-nums w-12 text-right ${empty ? 'text-ink-faint' : t.n}`}>{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-strong">{group.title}</p>
          <p className="text-xs text-ink-muted mt-0.5">{empty ? group.emptyNote : group.subtitle}</p>
          {!empty && group.footnote && <p className="text-[11px] text-ink-faint mt-1">{group.footnote}</p>}
        </div>
        {!empty && group.key === 'AUTH_EXPIRED' && (
          <button onClick={copyOutreach} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${t.btn}`}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Tersalin' : `Salin ${n} outreach`}
          </button>
        )}
        {!empty && (
          <button onClick={onOpen} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border ${t.btn}`}>
            <ChevronRight className="w-3.5 h-3.5" /> {group.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ActionCards({ groups, total, snapshotDate, exec, thresholds }) {
  const [openKey, setOpenKey] = useState(null)
  const openGroup = groups.find(g => g.key === openKey) || null

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
        <ActionCard key={g.key} group={g} onOpen={() => setOpenKey(g.key)} />
      ))}

      {openGroup && (
        <ActionListWindow group={openGroup} exec={exec} thresholds={thresholds}
          onClose={() => setOpenKey(null)} />
      )}
    </div>
  )
}
