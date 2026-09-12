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
// sekecil itu membuatnya berayun liar. Yang kokoh adalah angka rupiah. Maka
// yang ditebalkan adalah angka yang menjawab pertanyaan kartunya: COST di kartu
// "video boros" (berapa yang terbakar), OMZET di kartu kandidat boost (uang yang
// betul-betul masuk). ROAS selalu diberi warna menurut TINGKATnya, bukan besarnya.
//
// THUMBNAIL. Judul TikTok kerap caption berulang — pada data 12 Sep 2026 ada
// baris yang judulnya cuma "#parfum #parfume #parfumereccomended" dan satu lagi
// yang judulnya ID telanjang. Deretan begitu tampak kembar dan salah-klik jadi
// mudah; gambar 48×72 membedakannya sebelum satu kata pun dibaca.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Check, Bell } from 'lucide-react'
import { useSortableRows, SortTh, tiktokVideoUrl, VideoIdLink, DeliveryBadge } from './ui'
import { VideoExecCell } from './VideoExecActions'
import VideoThumb from './VideoThumb'
import { pickBoostTarget, pickExcludeTarget, undecidedReason } from '../../utils/gmvmaxBoostTarget'
import TargetChooserRow from './TargetChooserRow'

const n = (v) => Math.round(Number(v) || 0).toLocaleString('id-ID')
const KOLOM_VIDEO = new Set(['BOOST_CANDIDATE', 'WASTEFUL', 'AUTH_NEEDED_EARNING'])
// Pekerjaan kartu menentukan jejak mana yang dipakai memilih campaign sasaran:
// menaikkan belanja mengikuti OMZET, menghentikan belanja mengikuti BELANJA.
const KIND_OF = { WASTEFUL: 'EXCLUDE' }
const kindOf = (key) => KIND_OF[key] || 'BOOST'

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

function TargetCell({ video, exec, kind, onGanti }) {
  const eligible = (p) => !!exec.resolve(p)
  const t = kind === 'EXCLUDE'
    ? pickExcludeTarget({ video, eligible })
    : pickBoostTarget({ video, anchorSpu: exec.anchorOf?.(video.videoId) || null, eligible })
  if (!t.options.length) return null
  // SATU BARIS, selalu. Nama produk GMV Max panjang ("AsterixSty Exotic Blue -
  // Extrait de Parfum Aroma Fresh Pear Juicy …") dan saat dibiarkan membungkus
  // ia menambah dua baris pada SETIAP baris tabel — daftar 6 video jadi setinggi
  // layar. Teksnya dipotong, versi utuhnya ada di tooltip; tombolnya di luar
  // potongan supaya tak ikut terpangkas.
  if (!t.confident) {
    const teks = `Sasaran belum pasti — ${undecidedReason(t.options, kind)}`
    return (
      <span className="flex items-center gap-1 mt-1 text-[11px] min-w-0">
        <span className="truncate text-ink-faint" title={teks}>{teks} ·</span>
        <button onClick={onGanti} className="shrink-0 text-blue-300 hover:underline">pilih sasaran</button>
      </span>
    )
  }
  const nama = exec.productName?.(t.placement.productId) || t.placement.productId
  const campaign = t.placement.campaignName || t.placement.campaignId
  return (
    <span className="flex items-center gap-1 mt-1 text-[11px] min-w-0">
      {/* Urutan bagian PENTING: campaign → ALASAN → nama produk. Nama produk
          GMV Max paling panjang, jadi bila ia diletakkan sebelum alasan, justru
          alasannya yang hilang ditelan potongan — padahal "kenapa campaign ini"
          adalah satu-satunya bagian yang membuat sasaran bisa dipercaya. */}
      <span className="truncate" title={`→ ${campaign} — ${t.reason} · ${nama}`}>
        <span className="text-blue-300">→ {campaign}</span>
        <span className="text-ink-faint"> — {t.reason}</span>
        <span className="text-ink-muted"> · {nama}</span>
      </span>
      {t.options.length > 1 && (
        <button onClick={onGanti} className="shrink-0 text-blue-300 hover:underline">ganti</button>
      )}
    </span>
  )
}

export default function ActionListWindow({ group, exec, thresholds = {}, periodLabel = null, onClose }) {
  const [chooser, setChooser] = useState(null)   // { id, kind }
  const [copied, setCopied] = useState(false)
  const isVideo = KOLOM_VIDEO.has(group.key)
  const kind = kindOf(group.key)
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
        className="glass-modal w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border border-line/15 shadow-2xl">

        <div className="flex items-start gap-3 px-6 py-4 border-b border-line/10">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink-strong">{group.title}</h3>
            <p className="text-[13px] text-ink-muted mt-1">{group.items.length} baris · {group.subtitle}</p>
            {/* RENTANG DISEBUT EKSPLISIT. Tanpa ini daftar tampak seperti daftar
                tetap, padahal cost/omzet/ROAS-nya dijumlah HANYA untuk rentang
                terpilih — dan video yang sama bisa lolos di satu rentang lalu
                hilang di rentang lain. Kejadian nyata 12 Sep 2026: @abarrr ber-ROAS
                1,2 pada 5–11 Sep (boros) tapi 7,73 pada 1–11 Sep (tidak boros),
                karena omzet 2 jutanya lahir di 1–4 Sep. Itu bukan data hilang,
                tapi tak ada apa pun di layar yang mengatakannya. */}
            {periodLabel && (
              <p className="text-[12px] text-ink-faint mt-1.5">
                Dinilai atas <span className="text-ink-muted">{periodLabel}</span> — angka & vonisnya ikut rentang ini,
                jadi video yang sama bisa masuk daftar di satu rentang dan tidak di rentang lain.
              </p>
            )}
            {group.footnote && <p className="text-[12px] text-ink-faint mt-1.5">{group.footnote}</p>}
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

        <div className="flex-1 overflow-auto px-6 py-3">
          {/* table-fixed WAJIB: pada tata letak otomatis, max-width sel diabaikan
              dan baris sasaran yang panjang membuat kolom melar sampai tabelnya
              melampaui jendela (judul video ikut terdorong keluar layar).
              Kolom VIDEO sengaja TANPA lebar: pada table-fixed ia menyerap sisa
              ruang. Memberinya persentase berbahaya — persentase + jumlah kolom
              tetap bisa melebihi lebar tabel dan meluber lagi.
              min-w menjaga angka tetap terbaca di layar sempit: biar wadahnya
              yang menggeser, bukan kolomnya yang gepeng. */}
          <table className="w-full text-sm table-fixed min-w-[920px]">
            <thead>
              <tr className="text-left text-xs text-ink-faint border-b border-line/10">
                <th className="py-2.5 pr-3 font-medium">{group.key === 'CAMPAIGN_IDLE_BUDGET' ? 'CAMPAIGN' : 'VIDEO'}</th>
                {/* Urutan kolom: COST → OMZET → ROAS → ORDER (permintaan user,
                    12 Sep 2026). Uang yang keluar dibaca lebih dulu, baru uang
                    yang masuk, lalu rasionya; jumlah order jadi penutup karena
                    paling jarang menentukan keputusan di layar ini. */}
                {/* TAHAP = status pengiriman menurut snapshot TERBARU. Diminta user
                    12 Sep 2026: kandidat boost tak bisa dinilai tanpa tahu ia sudah
                    tayang, masih belajar, atau malah sudah dikecualikan — "naikkan
                    belanjanya" berarti hal yang berbeda di tiap tahap. */}
                {isVideo && <>
                  <th className="py-2.5 px-3 font-medium w-28">TAHAP</th>
                  <SortTh label="COST" sortKey="cost" sort={sort} onSort={toggle} className="w-28" />
                  <SortTh label="OMZET" sortKey="revenue" sort={sort} onSort={toggle} className="w-28" />
                  <SortTh label="ROAS" sortKey="roas" sort={sort} onSort={toggle} className="w-16" />
                  <SortTh label="ORDER" sortKey="orders" sort={sort} onSort={toggle} className="w-14" />
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
                const baris = (
                  <tr key={it.id} className="border-b border-line/5 align-top hover:bg-fill/[0.025] transition-colors">
                    <td className="py-3 pr-3 align-top">
                      <div className="flex items-start gap-3">
                        {/* Thumbnail = pengenalan materi tanpa membaca. Judul TikTok
                            sering caption berulang ("#parfum #parfume …") sehingga
                            deretan baris tampak kembar; gambarnya yang membedakan.
                            Baris campaign tak punya video, jadi tak punya gambar. */}
                        {group.key !== 'CAMPAIGN_IDLE_BUDGET' && (
                          <VideoThumb videoId={it.id} account={it.akun} title={it.judul} size="row" />
                        )}
                        <div className="min-w-0 flex-1">
                          <a href={tiktokVideoUrl(it.id, it.akun) || '#'} target="_blank" rel="noreferrer"
                            title={it.judul}
                            className="block text-[13px] leading-snug text-ink hover:text-ink-strong truncate">{it.judul}</a>
                          {/* ID video dibawa serta, bukan hanya judulnya: judul bisa
                              sama persis antar-video (caption yang diulang kreator)
                              dan cuma ID yang bisa dicocokkan ke Ads Manager, spark
                              code, atau baris approval saat mengecek. */}
                          {group.key !== 'CAMPAIGN_IDLE_BUDGET' && (
                            <span className="flex items-center gap-1 text-[11px] text-ink-faint mt-1">
                              {it.akun && group.key !== 'AUTH_EXPIRED' && <span>@{it.akun} ·</span>}
                              <VideoIdLink videoId={it.id} account={it.akun} full />
                            </span>
                          )}
                          {isVideo && it.video && exec && (
                            <TargetCell video={it.video} exec={exec} kind={kind}
                              onGanti={() => setChooser({ id: it.id, kind })} />
                          )}
                        </div>
                      </div>
                    </td>

                    {isVideo && <>
                      <td className="py-2.5 px-3 align-top">
                        <DeliveryBadge delivery={it.video?.delivery} compact />
                      </td>
                      {/* COST ditebalkan di kartu boros: di sanalah pertanyaannya
                          ("berapa yang terbakar"). Di kartu lain OMZET yang tebal
                          — fakta uang masuk, bukan rasio yang bisa berayun. */}
                      <td className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${kind === 'EXCLUDE' ? 'text-[15px] font-bold text-ink-strong' : 'text-[13px] text-ink-faint'}`}>
                        {n(m?.cost)}
                        {it.thin && (
                          <span className="ml-1.5 px-1.5 py-px rounded text-[9px] bg-amber-500/15 text-amber-400"
                            title={`Cost di bawah ${n(group.minSpend)} — ROAS-nya belum bisa dipercaya, tapi ordernya yang berulang tetap membuatnya layak`}>tipis</span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono tabular-nums ${kind === 'EXCLUDE' ? 'text-[13px] text-ink-muted' : 'text-[15px] font-bold text-ink-strong'}`}>{n(m?.revenue)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono tabular-nums text-[13px] ${roasTone(m?.roas, thresholds.roasGood, thresholds.roasBad)}`}>
                        {m?.roas == null ? '—' : `${m.roas.toFixed(1)}×`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[13px] text-ink-muted">{m?.orders || 0}</td>
                      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                        {it.pending ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-amber-500/30 text-amber-400"
                            title="Exclude untuk video ini sudah diajukan dan masih menunggu persetujuanmu di 🔔">
                            <Bell className="w-2.5 h-2.5" /> menunggu
                          </span>
                        ) : exec && (
                          <VideoExecCell video={it.video} resolve={exec.resolve}
                            onBoost={exec.onBoost} onExclude={exec.onExclude}
                            anchorOf={exec.anchorOf} productName={exec.productName}
                            showBlockHint={false}
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
                return [baris, chooser?.id === it.id && it.video && exec ? (
                  <TargetChooserRow key={`${it.id}-pilih`} video={it.video} exec={exec}
                    kind={chooser.kind} colSpan={isVideo ? 7 : 3}
                    onPick={(pp) => {
                      setChooser(null)
                      ;(chooser.kind === 'BOOST' ? exec.onBoost : exec.onExclude)(it.video, pp)
                    }}
                    onCancel={() => setChooser(null)} />
                ) : null]
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-line/10">
          <p className="text-[11px] text-ink-faint">
            Semua aksi lewat antrean 🔔 — tak ada yang menyentuh TikTok tanpa persetujuanmu.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
