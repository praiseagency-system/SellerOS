// Pengaturan → Integrasi: sambungan Pikat (kode spark kreator → halaman Boost).
// Token `psl_…` dibuat di Pikat (License Key → Sambungan SellerOS) dan hanya
// disimpan server; di sini yang tampil cuma 4 karakter terakhirnya.
import { useState, useEffect } from 'react'
import { Loader2, Link2, Link2Off, CheckCircle2, AlertCircle } from 'lucide-react'
import { getPikatLink, connectPikat, disconnectPikat } from '../../data/pikatSpark'

const waktu = (iso) => iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function PikatIntegrasiSection({ currentWorkspace }) {
  const wsId = currentWorkspace?.id || null
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(null)
    getPikatLink()
      .then(l => { if (active) setLink(l) })
      .catch(e => { if (active) setError(e.message || 'Gagal memuat sambungan Pikat.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [wsId])

  async function connect() {
    setBusy(true); setError(null); setOkMsg(null)
    try {
      const r = await connectPikat(token.trim())
      setToken('')
      setLink(await getPikatLink())
      setOkMsg(`Tersambung ke Pikat${r?.pikat?.name ? ` · ${r.pikat.name}` : ''}.`)
    } catch (e) { setError(e.message || 'Gagal menyambungkan Pikat.') }
    finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true); setError(null); setOkMsg(null)
    try { await disconnectPikat(); setLink(null); setOkMsg('Sambungan Pikat diputus. Kode yang sudah masuk tetap tersimpan.') }
    catch (e) { setError(e.message || 'Gagal memutus sambungan.') }
    finally { setBusy(false) }
  }

  if (!wsId) return null

  return (
    <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-blue-500" /> Pikat (kode spark kreator)
      </h2>
      <p className="text-xs text-ink-muted mb-4 leading-relaxed">
        Kode spark yang dikumpulkan Pikat dari kreator muncul langsung di <span className="text-ink font-medium">GMV Max → Boost</span> —
        tanpa salin-tempel. Buat token di Pikat: <span className="text-ink">License Key → Sambungan SellerOS → Buat token</span>.
        Hanya pemilik workspace yang bisa menyambungkan.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat status…
        </div>
      ) : link ? (
        <div className={`rounded-xl border p-4 ${link.last_error ? 'border-amber-500/25 bg-amber-500/5' : 'border-green-500/25 bg-green-500/5'}`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${link.last_error ? 'bg-amber-500/15' : 'bg-green-500/15'}`}>
              {link.last_error ? <AlertCircle className="w-4 h-4 text-amber-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-strong">
                {link.pikat_workspace_name || 'Pikat'} <span className="font-mono text-ink-faint font-normal">· …{link.token_hint}</span>
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                tersambung {waktu(link.connected_at)} · tarikan terakhir {waktu(link.last_pulled_at)}
              </p>
              {link.last_error && <p className="text-[11px] text-amber-300 mt-1">{link.last_error}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={disconnect} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />} Putuskan
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <label className="flex-1">
            <span className="sr-only">Token sambungan Pikat</span>
            <input value={token} onChange={e => setToken(e.target.value)} disabled={busy} type="password" autoComplete="off"
              placeholder="psl_…"
              className="w-full bg-surface2 border border-line/15 rounded-xl px-3 py-2.5 text-xs text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:border-blue-500/40" />
          </label>
          <button onClick={connect} disabled={busy || !token.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Sambungkan
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /><span className="text-red-300">{error}</span>
        </div>
      )}
      {okMsg && !error && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /><span className="text-green-300">{okMsg}</span>
        </div>
      )}
    </section>
  )
}
