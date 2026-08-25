// Spark Binding (Execute Layer E1) — Boost Center.
// Alur aman: tempel kode → PRATINJAU (tt_video_info_get, read-only; kamu lihat
// video mana yang akan diikat) → Ajukan (masuk antrean 🔔) → Setujui → apply +
// read-back. Tabel bawah = sumber kebenaran ikatan (tt_video_list_get).
import { useState, useEffect, useCallback } from 'react'
import { Link2, Loader2, RefreshCw, Send, AlertCircle, CheckCircle2, Copy, Check } from 'lucide-react'
import { fetchSparkInfo, fetchSparkList } from '../../data/gmvmaxSpark'
import { createApproval } from '../../data/gmvmaxApprovals'
import { listImports, loadCreatives } from '../../data/gmvmaxImports'

// Respons TikTok bentuknya longgar — gali field umum dengan aman.
const pickItemId = (info) => info?.item_id || info?.item_info?.item_id || info?.video_info?.item_id || null
const pickTitle = (info) => info?.text || info?.item_info?.text || info?.video_info?.title || info?.title || ''
const pickAuthor = (info) => info?.user_name || info?.item_info?.user_name || info?.author_name || ''

export default function SparkBindingSection() {
  const [codes, setCodes] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState([])   // [{code, ok, msg}]
  const [list, setList] = useState(null)       // daftar terikat
  const [listErr, setListErr] = useState(null)
  const [loadingList, setLoadingList] = useState(false)

  // Peta video_id → campaign yang MEMAKAI video itu (dari snapshot creatives
  // terbaru — rotasi nyata, bukan konfigurasi). AUTO_SELECTION tak menyimpan
  // daftar eksplisit, jadi report harian adalah satu-satunya sumber kebenaran.
  const [campMap, setCampMap] = useState(new Map())
  const [copied, setCopied] = useState(null)

  const loadList = useCallback(async () => {
    setLoadingList(true); setListErr(null)
    try {
      const [spark, imports] = await Promise.all([fetchSparkList({ page: 1 }), listImports()])
      setList(spark)
      const latest = imports?.[0]
      if (latest) {
        const creatives = await loadCreatives([latest.id])
        const m = new Map()
        for (const c of creatives) {
          if (!c.videoId || !c.campaignName) continue
          if (!m.has(c.videoId)) m.set(c.videoId, new Map())
          // Satu campaign sekali; simpan status delivery-nya.
          if (!m.get(c.videoId).has(c.campaignName)) m.get(c.videoId).set(c.campaignName, c.status)
        }
        setCampMap(m)
      }
    } catch (e) { setListErr(e.message) }
    finally { setLoadingList(false) }
  }, [])
  useEffect(() => { const t = setTimeout(loadList, 0); return () => clearTimeout(t) }, [loadList])

  async function copyCode(id, code) {
    try { await navigator.clipboard.writeText(code); setCopied(id); setTimeout(() => setCopied(null), 1600) } catch { /* clipboard ditolak browser */ }
  }

  async function submit() {
    const items = [...new Set(codes.split('\n').map(s => s.trim()).filter(Boolean))]
    if (!items.length) return
    setBusy(true); setResults([])
    const out = []
    for (const code of items) {
      try {
        // 1) Pratinjau read-only — memvalidasi kode & mengungkap videonya.
        let info = null
        try { info = await fetchSparkInfo(code) } catch (e) { throw new Error(`kode tak valid / tak bisa dipratinjau: ${e.message}`, { cause: e }) }
        const videoId = pickItemId(info)
        const title = pickTitle(info)
        // 2) Ajukan approval — eksekusi terjadi setelah kamu Setujui di 🔔.
        await createApproval({
          actionType: 'SPARK_BIND',
          target: { video_id: videoId, video_title: title || `kode …${code.slice(-6)}`, author: pickAuthor(info) },
          currentValue: { terikat: 'belum' },
          proposedValue: { terikat: 'ya', auth_code: code },
          reason: title ? `Ikat video "${title.slice(0, 80)}" ke ad account.` : 'Ikat Spark post ke ad account.',
          evidence: videoId ? { item_id: videoId } : null,
          source: 'MANUAL', risk: 'LOW',
        })
        out.push({ code, ok: true, msg: `masuk antrean 🔔${videoId ? ` · video ${videoId}` : ''}${title ? ` · ${title.slice(0, 60)}` : ''}` })
      } catch (e) {
        out.push({ code, ok: false, msg: e.message })
      }
      setResults([...out])
    }
    if (out.some(r => r.ok)) setCodes(items.filter(c => !out.find(r => r.code === c && r.ok)).join('\n'))
    setBusy(false)
  }

  const rows = list?.list || []

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-500 flex items-center justify-center"><Link2 className="w-4 h-4" /></span>
        <h3 className="text-sm font-bold text-ink-strong">Spark Binding</h3>
        <span className="text-xs text-ink-faint">daftarkan kode → video masuk kolam GMV Max</span>
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <textarea value={codes} onChange={e => setCodes(e.target.value)} rows={2} disabled={busy}
            placeholder={'Tempel kode spark di sini — satu kode per baris'}
            className="flex-1 bg-surface2 border border-line/15 rounded-xl px-3 py-2.5 text-xs text-ink font-mono resize-y placeholder:text-ink-faint focus:outline-none focus:border-blue-500/40" />
          <button onClick={submit} disabled={busy || !codes.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Pratinjau &amp; Ajukan
          </button>
        </div>
        <p className="text-[11px] text-ink-faint leading-relaxed">
          Kode dipratinjau dulu (read-only) supaya kelihatan video mana yang akan diikat, lalu masuk antrean
          <span className="mx-1">🔔</span>Persetujuan — pengikatan baru terjadi setelah kamu Setujui.
        </p>
        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <p key={i} className={`text-[11px] flex items-start gap-1.5 ${r.ok ? 'text-green-300' : 'text-red-300'}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <span className="min-w-0"><span className="font-mono">…{r.code.slice(-8)}</span> — {r.msg}</span>
              </p>
            ))}
          </div>
        )}

        {/* Daftar terikat — sumber kebenaran tt_video_list_get */}
        <div className="pt-3 border-t border-line/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              Video ter-otorisasi ke ad account {list?.page_info?.total_number != null && `· ${list.page_info.total_number}`}
            </p>
            <button onClick={loadList} disabled={loadingList}
              className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink disabled:opacity-40">
              {loadingList ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Muat ulang
            </button>
          </div>
          {listErr && <p className="text-[11px] text-red-300">{listErr}</p>}
          {!listErr && rows.length === 0 && !loadingList && (
            <p className="text-[11px] text-ink-faint">Belum ada Spark post ter-otorisasi (atau daftar belum dimuat).</p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead><tr className="text-left text-ink-faint">
                  <th className="py-1.5 pr-3 font-semibold">Video</th>
                  <th className="py-1.5 pr-3 font-semibold">Akun</th>
                  <th className="py-1.5 pr-3 font-semibold">Dipakai campaign</th>
                  <th className="py-1.5 pr-3 font-semibold">Kode</th>
                  <th className="py-1.5 pr-3 font-semibold">Status</th>
                  <th className="py-1.5 pr-3 font-semibold">Berlaku s/d</th>
                </tr></thead>
                <tbody>
                  {rows.map((it, i) => {
                    // Bentuk nyata respons (diverifikasi runtime): item_info.{item_id,text},
                    // user_info.tiktok_name, auth_info.{ad_auth_status,auth_end_time},
                    // video_info.poster_url (thumbnail).
                    const id = it.item_info?.item_id || it.item_id
                    const authStatus = it.auth_info?.ad_auth_status || '—'
                    const tone = authStatus === 'AUTHORIZED' ? 'bg-emerald-500/15 text-emerald-400'
                      : authStatus === 'EXPIRED' ? 'bg-red-500/15 text-red-400' : 'bg-fill/10 text-ink-faint'
                    return (
                      <tr key={id || i} className="border-t border-line/5">
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {it.video_info?.poster_url && (
                              <img src={it.video_info.poster_url} alt="" loading="lazy"
                                className="w-7 h-9 rounded-md object-cover border border-line/10 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-ink truncate max-w-[340px]">{it.item_info?.text?.trim() || '(tanpa judul)'}</p>
                              <p className="font-mono text-ink-faint">{id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 text-ink-muted whitespace-nowrap">{it.user_info?.tiktok_name || '—'}</td>
                        <td className="py-1.5 pr-3">
                          {campMap.has(String(id)) ? (
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {[...campMap.get(String(id)).entries()].map(([name, st]) => (
                                <span key={name} title={st || ''}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[200px] ${st === 'Delivering' ? 'bg-blue-500/15 text-blue-400' : 'bg-fill/10 text-ink-muted'}`}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-ink-faint text-[10px]">belum di rotasi</span>}
                        </td>
                        <td className="py-1.5 pr-3">
                          {it.item_info?.auth_code ? (
                            <button onClick={() => copyCode(id, it.item_info.auth_code)} title={it.item_info.auth_code}
                              className="flex items-center gap-1 font-mono text-[10px] text-ink-muted hover:text-ink border border-line/15 rounded-md px-1.5 py-0.5">
                              {copied === id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              …{it.item_info.auth_code.slice(-8)}
                            </button>
                          ) : '—'}
                        </td>
                        <td className="py-1.5 pr-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tone}`}>{authStatus}</span></td>
                        <td className="py-1.5 pr-3 font-mono text-ink-muted whitespace-nowrap">{it.auth_info?.auth_end_time?.slice(0, 10) || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
