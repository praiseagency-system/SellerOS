// Jendela daftar aksi (Opsi A) — tabel berkolom, dipilih user.
//
// Kenapa jendela: daftar yang mengembang di dalam kartu memaksa judul video,
// baris sasaran, angka, dan tombol berdesakan di satu baris sempit — nama
// produk sampai terpotong. Di jendela semuanya dapat ruang.
//
// Kenapa TABEL berkolom: pekerjaan di daftar ini adalah memilih mana dulu dari
// ratusan kandidat, dan itu pekerjaan MEMBANDINGKAN. Hanya kolom sejajar
// berdigit selebar sama yang membuat 2.258.361 dan 1.226.175 bisa diadu dalam
// sekali sapuan mata. Karena itu pula kolomnya bisa diurutkan.
//
// PENONJOLAN ANGKA. Godaannya membesarkan ROAS — ia paling dramatis. Tapi ROAS
// adalah rasio, dan pada data nyata 512,8x lahir dari cost Rp2.391: penyebut
// sekecil itu membuatnya berayun liar. Yang kokoh adalah ORDER (konversi
// berulang) dan OMZET (uang yang betul-betul masuk). Maka dua itu yang
// dibesarkan; ROAS diberi warna menurut TINGKATnya, bukan menurut besarnya.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Check } from 'lucide-react'
import { useSortableRows, SortTh, tiktokVideoUrl } from './ui'
import { VideoExecCell } from './VideoExecActions'
import { pickBoostTarget, undecidedReason } from '../../utils/gmvmaxBoostTarget'

const n = (v) => Math.round(Number(v) || 0).toLocaleString('id-ID')
const KOLOM_VIDEO = new Set(['BOOST_CANDIDATE', 'WASTEFUL', 'AUTH_NEEDED_EARNING'])

// Warna ROAS menurut tingkatnya. Ambangnya sama dengan yang dipakai di seluruh
// aplikasi supaya "hijau" berarti hal yang sama di mana pun.
const roasTone = (r, good = 6, bad = 4) =>
  r == null ? 'text-ink-faint' : r >= good ? 'text-emerald-400' : r >= bad ? 'text-amber-400' : 'text-red-400'

const ACC_VIDEO = {
  orders: (it) => it.video?.lifetime?.orders ?? 0,
  revenue: (it) => it.video?.lifetime?.revenue ?? 0,
  cost: (it) => it.video?.lifetime?.cost ?? 0,
  roas: (it) => it.video?.lifetime?.roas ?? null,
}
const ACC_EXPIRED = { habis: (it) => Date.parse(it.rawEnd || 0) || 0 }
const ACC_IDLE = { budget: (it) => it.budget ?? 0 }

function TargetCell({ video, exec, onGanti }) {
  const t = pickBoostTarget({
    video, anchorSpu: exec.anchorOf?.(video.videoId) || null, eligible: (p) => !!exec.resolve(p),
  })
  if (!t.options.length) return null
  if (!t.confident) {
    return (
      <span className="block text-[10px] text-ink-faint mt-1 break-words">
        Sasaran belum pasti — {undecidedReason(t.options)} ·{' '}
        <button onClick={onGanti} className="text-blue-300 hover:underline">pilih sasaran</button>
      </span>
    )
  }
  const nama = exec.productName?.(t.placement.productId) || t.placement.productId
  return (
    <span className="block text-[10px] mt-1 break-words">
      <span className="text-blue-300">→ {t.placement.campaignName || t.placement.campaignId}</span>
      <span className="text-ink-muted"> · {nama}</span>
      <span className="text-ink-faint"> — {t.reason}</span>
      {t.options.length > 1 && (
        <> · <button onClick={onGanti} className="text-blue-300 hover:underline">ganti</button></>
      )}
    </span>
  )
}

export default function ActionListWindow({ group, exec, thresholds = {}, onClose }) {
  const [chooser, setChooser] = useState(null)   // { id, kind }
  const [copied, setCopied] = useState(false)
  const isVideo = KOLOM_VIDEO.has(group.key)
  const acc = isVideo ? ACC_VIDEO : group.key === 'AUTH_EXPIRED' ? ACC_EXPIRED : ACC_IDLE
  const { sorted, sort, toggle } = useSortableRows(group.items, acc)

  async function copyOutreach() {
    const teks = group.items
      .map(i => `@${i.akun || '?'} — ${String(i.judul || '').slice(0, 60)} — https://www.tiktok.com/@${i.akun || ''}/video/${i.id}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(teks)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard ditolak peramban — abaikan */ }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="glass-modal w-full max-w-5xl max-h-[85vh] flex flex-col rounded-2xl border border-line/15 shadow-2xl">

        <div className="flex items-start gap-3 px-5 py-4 border-b border-line/10">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink-strong">{group.title}</h3>
            <p className="text-xs text-ink-muted mt-0.5">{group.items.length} baris · {group.subtitle}</p>
            {group.footnote && <p className="text-[11px] text-ink-faint mt-1">{group.footnote}</p>}
          </div>
          {group.key === 'AUTH_EXPIRED' && (
            <button onClick={copyOutreach}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin' : `Salin ${group.items.length} outreach`}
            </button>
          )}
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {/* table-fixed WAJIB: pada tata letak otomatis, max-width sel diabaikan
              dan baris sasaran yang panjang membuat kolom melar sampai tabelnya
              melampaui jendela (judul video ikut terdorong keluar layar).
              Kolom VIDEO sengaja TANPA lebar: pada table-fixed ia menyerap sisa
              ruang. Memberinya persentase berbahaya — persentase + jumlah kolom
              tetap bisa melebihi lebar tabel dan meluber lagi.
              min-w menjaga angka tetap terbaca di layar sempit: biar wadahnya
              yang menggeser, bukan kolomnya yang gepeng. */}
          <table className="w-full text-sm table-fixed min-w-[740px]">
            <thead>
              <tr className="text-left text-xs text-ink-faint border-b border-line/10">
                <th className="py-2.5 pr-3 font-medium">{group.key === 'CAMPAIGN_IDLE_BUDGET' ? 'CAMPAIGN' : 'VIDEO'}</th>
                {isVideo && <>
                  <SortTh label="ORDER" sortKey="orders" sort={sort} onSort={toggle} className="w-16" />
                  <SortTh label="OMZET" sortKey="revenue" sort={sort} onSort={toggle} className="w-28" />
                  <SortTh label="COST" sortKey="cost" sort={sort} onSort={toggle} className="w-32" />
                  <SortTh label="ROAS" sortKey="roas" sort={sort} onSort={toggle} className="w-20" />
                </>}
                {group.key === 'AUTH_EXPIRED' && <>
                  <th className="py-2.5 px-3 font-medium">AKUN</th>
                  <SortTh label="IZIN HABIS" sortKey="habis" sort={sort} onSort={toggle} />
                </>}
                {group.key === 'CAMPAIGN_IDLE_BUDGET' && <>
                  <SortTh label="BUDGET" sortKey="budget" sort={sort} onSort={toggle} />
                  <th className="py-2.5 px-3 font-medium">STATUS</th>
                </>}
                {isVideo && <th className="py-2.5 pl-3 font-medium text-right w-36">AKSI</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(it => {
                const m = it.video?.lifetime
                return (
                  <tr key={it.id} className="border-b border-line/5 align-top">
                    <td className="py-3 pr-3 align-top">
                      <a href={tiktokVideoUrl(it.id, it.akun) || '#'} target="_blank" rel="noreferrer"
                        title={it.judul}
                        className="block text-xs text-ink hover:text-ink-strong truncate">{it.judul}</a>
                      {it.akun && group.key !== 'AUTH_EXPIRED' && (
                        <span className="block text-[10px] text-ink-faint">@{it.akun}</span>
                      )}
                      {isVideo && it.video && exec && (
                        <TargetCell video={it.video} exec={exec}
                          onGanti={() => setChooser({ id: it.id, kind: 'BOOST' })} />
                      )}
                    </td>

                    {isVideo && <>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-sm font-bold text-ink-strong">{m?.orders || 0}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-sm font-bold text-ink-strong">{n(m?.revenue)}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-ink-faint whitespace-nowrap">
                        {n(m?.cost)}
                        {it.thin && (
                          <span className="ml-1.5 px-1.5 py-px rounded text-[9px] bg-amber-500/15 text-amber-400"
                            title={`Cost di bawah ${n(group.minSpend)} — ROAS-nya belum bisa dipercaya, tapi ordernya yang berulang tetap membuatnya layak`}>tipis</span>
                        )}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono tabular-nums text-xs ${roasTone(m?.roas, thresholds.roasGood, thresholds.roasBad)}`}>
                        {m?.roas == null ? '—' : `${m.roas.toFixed(1)}×`}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        {exec && (
                          <VideoExecCell video={it.video} resolve={exec.resolve}
                            onBoost={exec.onBoost} onExclude={exec.onExclude}
                            anchorOf={exec.anchorOf} productName={exec.productName}
                            open={chooser?.id === it.id ? chooser.kind : null}
                            onOpenChange={(k) => setChooser(k ? { id: it.id, kind: k } : null)} />
                        )}
                      </td>
                    </>}

                    {group.key === 'AUTH_EXPIRED' && <>
                      <td className="py-3 px-3 text-xs text-ink-muted">@{it.akun || '?'}</td>
                      <td className="py-3 px-3 text-right text-xs text-amber-400 whitespace-nowrap">{it.detail}</td>
                    </>}

                    {group.key === 'CAMPAIGN_IDLE_BUDGET' && <>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-sm font-bold text-ink-strong">{n(it.budget)}</td>
                      <td className="py-3 px-3 text-xs text-ink-muted">{it.status}</td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-line/10">
          <p className="text-[11px] text-ink-faint">
            Semua aksi lewat antrean 🔔 — tak ada yang menyentuh TikTok tanpa persetujuanmu.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
