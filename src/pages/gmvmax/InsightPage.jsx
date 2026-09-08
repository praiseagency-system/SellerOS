// AI Insight — rule-based (bukan model AI eksternal).
//
// DUA tab (sejak 8 Sep 2026, sebelumnya enam — alasan & peta id lama ada di
// utils/insightTabs.js):
//   · Aksi Hari Ini   — vonis harian + kartu kerja yang bisa diantre ke 🔔.
//     Bedanya dgn keluaran Skills yang bertanda DESCRIPTIVE_ONLY: tiap butir di
//     sini punya tombol dan membawa sidik kondisi sebagai kait loop belajar.
//   · Bukti & Riwayat — eksperimen + aksi yang dikerjakan di Seller Centre.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, fmtRpC, fmtRoasX, tiktokVideoUrl, VideoIdLink } from '../../components/gmvmax/ui'
import DecisionPanel, { DecisionVerdictBanner } from '../../components/gmvmax/DecisionPanel'
import ExperimentPanel from '../../components/gmvmax/ExperimentPanel'
import OutOfBandPanel from '../../components/gmvmax/OutOfBandPanel'
import ActionCards from '../../components/gmvmax/ActionCards'
import { VideoBoostDialog, VideoExcludeDialog } from '../../components/gmvmax/VideoExecActions'
import { buildRecommendations, totalActions } from '../../utils/gmvmaxRecommendations'
import { MAIN_TABS, DEFAULT_TAB, resolveInsightTab, isHiddenTab, hiddenTabLabel } from '../../utils/insightTabs'
import { loadCampaignSettingsHistory, latestPerCampaign } from '../../data/gmvmaxCampaignSettings'
import { loadLatestSparkAuth } from '../../data/gmvmaxSparkAuth'

const ACTION_BADGE = {
  scale: { text: '★ SCALE', cls: 'text-emerald-500 border-emerald-500/40' },
  boost: { text: '↗ BOOST', cls: 'text-blue-500 border-blue-500/40' },
  refresh: { text: '↻ REFRESH', cls: 'text-amber-500 border-amber-500/40' },
  kill: { text: '✕ KILL', cls: 'text-red-500 border-red-500/40' },
}

export default function InsightPage({ onOpenUpload, onNavigate }) {
  const { insights, hasData, videos, thresholds, periodName, productNames } = useGmvMax()
  // Deep-link `?tab=` dibaca saat render pertama — App.jsx membersihkan query di
  // efeknya, dan efek anak berjalan lebih dulu, jadi jangan pindahkan ke useEffect.
  const [tab, setTab] = useState(() => resolveInsightTab(new URLSearchParams(window.location.search).get('tab')))
  const [expDraft, setExpDraft] = useState(null)   // draft eksperimen dari DecisionPanel

  // Bahan rekomendasi yang TIDAK ada di context: setelan campaign (utk campaign
  // mati ber-budget + store_id/status eksekusi) & potret otorisasi spark.
  const [settings, setSettings] = useState(null)
  const [sparkAuth, setSparkAuth] = useState([])
  const [dialog, setDialog] = useState(null)
  const [queuedMsg, setQueuedMsg] = useState(null)

  useEffect(() => {
    let alive = true
    loadCampaignSettingsHistory({ days: 30 })
      .then(rows => { if (alive) setSettings(latestPerCampaign(rows)) })
      .catch(() => {})
    // Tabel otorisasi baru ada sejak migrasi 0048; loadernya mengembalikan []
    // bila belum ada, jadi kartunya cukup bilang "menunggu sync harian".
    loadLatestSparkAuth().then(r => { if (alive) setSparkAuth(r) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const cset = useMemo(
    () => (settings ? new Map(settings.map(r => [r.campaign_id, r])) : null),
    [settings])

  const resolve = useCallback((placement) => {
    const c = cset?.get(placement.campaignId)
    if (!c || !c.store_id) return null
    if (String(c.operation_status || '').toUpperCase() !== 'ENABLE') return null
    return { storeId: c.store_id, campaignName: c.campaign_name || placement.campaignName }
  }, [cset])

  // Produk yang tertaut di video (keranjang kuning) — sinyal terkuat penentu
  // sasaran boost. Hanya dimiliki video ber-kode spark, jadi sering kosong;
  // tangga bukti berikutnya yang mengambil alih.
  const anchor = useMemo(
    () => new Map((sparkAuth || []).filter(r => r.spu_id).map(r => [r.item_id, r.spu_id])),
    [sparkAuth])

  const exec = useMemo(() => (cset ? {
    resolve,
    anchorOf: (videoId) => anchor.get(videoId) || null,
    productName: (spuId) => productNames?.[spuId] || spuId,
    onBoost: (video, placement) => setDialog({ kind: 'BOOST', video, placement, storeId: resolve(placement)?.storeId }),
    onExclude: (video, placement) => setDialog({ kind: 'EXCLUDE', video, placement }),
  } : null), [cset, resolve, anchor, productNames])

  const groups = useMemo(
    () => buildRecommendations({ videos, thresholds, settings: settings || [], sparkAuth }),
    [videos, thresholds, settings, sparkAuth])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  // Tombol "Jadikan eksperimen" di DecisionPanel → bawa draft ke tab buktinya.
  const startExperiment = (draft) => { setExpDraft(draft); setTab('bukti') }

  return (
    <div className="p-6 space-y-5">
      <p className="text-sm text-ink-faint -mt-2">Analisis pola data GMV MAX — bukan model AI eksternal.</p>
      <div className="flex gap-1.5 flex-wrap">
        {MAIN_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-fill/5'}`}>{t.label}</button>
        ))}
      </div>

      {/* Panel diagnostik yang dibuka lewat ?tab= — beri tahu di mana pengguna
          berada, dan jalan pulangnya, karena tabnya tak ada di baris di atas. */}
      {isHiddenTab(tab) && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-line/25 bg-fill/5 px-3 py-2">
          <p className="text-xs text-ink-muted flex-1">
            <b className="text-ink">{hiddenTabLabel(tab)}</b> — panel diagnostik, sengaja tak ada di baris tab.
          </p>
          <button onClick={() => setTab(DEFAULT_TAB)}
            className="text-xs text-ink-muted border border-line/25 rounded-lg px-2.5 py-1 hover:bg-fill/5">
            Kembali ke Aksi Hari Ini
          </button>
        </div>
      )}

      {tab === 'aksi' && (
        <div className="space-y-5">
          <DecisionVerdictBanner onOpenFull={() => setTab('di')} />
          {queuedMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-violet-500/25 bg-violet-500/5 px-3 py-2.5">
              <p className="text-xs text-violet-200 flex-1">{queuedMsg}</p>
              <button onClick={() => setQueuedMsg(null)} className="text-[11px] text-ink-faint hover:text-ink">tutup</button>
            </div>
          )}
          <ActionCards groups={groups} total={totalActions(groups)} snapshotDate={periodName}
            exec={exec} thresholds={thresholds} />
        </div>
      )}

      {/* Urutan disengaja: yang masih berjalan dulu (eksperimen), baru sumber
          terbesarnya (boost yang dijalankan sendiri di Seller Centre). */}
      {tab === 'bukti' && (
        <div className="space-y-6">
          <ExperimentPanel draft={expDraft} onDraftUsed={() => setExpDraft(null)} onNavigate={onNavigate} />
          <div className="pt-5 border-t border-line/15 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Terjadi di luar aplikasi</h3>
            <OutOfBandPanel />
          </div>
        </div>
      )}

      {tab === 'di' && <DecisionPanel onExperiment={startExperiment} />}
      {tab === 'insight' && <InsightCards cards={insights.cards} />}
      {tab === 'framework' && <Framework items={insights.framework} />}
      {dialog?.kind === 'BOOST' && (
        <VideoBoostDialog video={dialog.video} placement={dialog.placement} storeId={dialog.storeId}
          onClose={() => setDialog(null)} onQueued={setQueuedMsg} />
      )}
      {dialog?.kind === 'EXCLUDE' && (
        <VideoExcludeDialog video={dialog.video} placement={dialog.placement}
          onClose={() => setDialog(null)} onQueued={setQueuedMsg} />
      )}
    </div>
  )
}

function InsightCards({ cards }) {
  const groups = [
    { key: 'scale', title: 'SCALE — ROAS Tinggi', tone: 'text-emerald-500' },
    { key: 'watch', title: 'WATCH — ROAS 1x–3x', tone: 'text-amber-500' },
    { key: 'kill', title: 'KILL — Rugi', tone: 'text-red-500' },
  ]
  const total = cards.scale.length + cards.watch.length + cards.kill.length
  if (!total) return <p className="text-sm text-ink-faint py-10 text-center">Belum ada rekomendasi — data spend masih tipis.</p>
  return (
    <div className="space-y-6">
      {groups.map(g => cards[g.key].length > 0 && (
        <div key={g.key}>
          <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${g.tone}`}>{g.title} · {cards[g.key].length}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cards[g.key].map(c => <Card key={c.videoId} c={c} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function Card({ c }) {
  const badge = ACTION_BADGE[c.action] || ACTION_BADGE.scale
  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm flex flex-col gap-2 hover-lift">
      <span className={`self-start text-xs font-bold px-2 py-0.5 rounded-md border ${badge.cls}`}>{badge.text}</span>
      <a href={tiktokVideoUrl(c.videoId, c.account)} target="_blank" rel="noopener noreferrer"
        className="text-sm font-semibold text-ink leading-snug line-clamp-2 hover:text-accent hover:underline">
        {c.title}
      </a>
      <p className="text-xs text-ink-faint truncate">{c.account}</p>
      <VideoIdLink videoId={c.videoId} account={c.account} />
      <div className="flex items-end justify-between mt-1">
        <span className="text-2xl font-bold text-ink-strong">{fmtRoasX(c.roas)}</span>
        <div className="text-right text-xs text-ink-faint">
          <p>COST {fmtRpC(c.cost)}</p>
          <p>REV {fmtRpC(c.revenue)}</p>
        </div>
      </div>
      <p className="text-xs text-ink-muted border-t border-line/10 pt-2 mt-1">{c.detail}</p>
    </div>
  )
}

// Blok "Panduan umum" (4 langkah dari actionPlan()) DIHAPUS 8 Sep 2026: isinya
// nasihat statis — "cek ROAS tiap Senin" — yang duduk persis di bawah kartu
// kerja nyata dan mengencerkannya. Generatornya di utils/gmvmaxInsights.js
// dibiarkan hidup; context masih menghitungnya, tak ada yang perlu dibongkar.

function Framework({ items }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <div key={i} className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
          <p className="text-xs font-bold text-violet-500 tracking-wider">INSIGHT {String(i + 1).padStart(2, '0')}</p>
          <p className="font-semibold text-ink-strong mt-1 mb-2">{it.title}</p>
          <p className="text-xs text-ink-muted leading-relaxed">{it.detail}</p>
        </div>
      ))}
    </div>
  )
}
