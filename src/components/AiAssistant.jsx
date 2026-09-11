// AI Assistant SellerOS — panel chat melayang + sidebar riwayat.
// Diport dari src/components/AiAssistant.tsx Pikat (desain sama: FAB robot
// bergradasi, panel 520px, sidebar riwayat 200px yang bisa dilipat & diingat
// per browser, drawer di layar sempit). Token warna dipetakan ke tema SellerOS
// (ink/surface/line, lihat tailwind.config.js) supaya ikut mode gelap/terang.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X, Send, Info, Loader2, SquarePen, PanelLeft, Search, Pencil, Trash2, Check } from 'lucide-react'
import { postJson } from '../lib/apiClient'
import { listThreads, latestThread, getThread, renameThread, deleteThread } from '../data/aiThreads'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { THREAD_GROUP_LABEL, THREAD_GROUP_ORDER, threadGroup } from '../utils/assistantThread'
import { useQuadrant } from '../contexts/QuadrantContext'
import { useLang } from '../contexts/LanguageContext'

// Status buka/tutup sidebar riwayat diingat per browser (bukan per akun).
const SIDEBAR_KEY = 'selleros.ai.sidebar'
// Gradasi brand — disamakan dengan Pikat (violet → indigo).
const BRAND_GRADIENT = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
const MAX_CHARS = 2000

// ── Renderer markdown minimal & aman (tebal + kode inline, bullet, nomor) ────
function renderInline(text, keyPrefix) {
  const parts = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0; let m; let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) parts.push(<strong key={`${keyPrefix}-${i}`} className="font-semibold">{tok.slice(2, -2)}</strong>)
    else parts.push(<code key={`${keyPrefix}-${i}`} className="rounded bg-fill/10 px-1 py-0.5 text-[12px]">{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
    i++
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function FormattedText({ text }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, idx) => {
        if (/^\s*[-*]\s+/.test(line)) {
          const rest = line.replace(/^\s*[-*]\s+/, '')
          return (
            <div key={idx} className="flex gap-1.5">
              <span className="select-none opacity-60">•</span>
              <span>{renderInline(rest, `b${idx}`)}</span>
            </div>
          )
        }
        if (line.trim() === '') return <div key={idx} className="h-1.5" />
        return <div key={idx}>{renderInline(line, `l${idx}`)}</div>
      })}
    </>
  )
}

const QUICK_PROMPTS = [
  'Produk mana yang ramai tapi konversinya rendah?',
  'Ringkasan performa toko bulan ini?',
  'Campaign apa yang sedang berjalan?',
  'Saran: produk mana yang layak diiklankan?',
]

const GREETING = { role: 'assistant', content: 'Halo! Ada yang bisa saya bantu soal data toko kamu?' }

function readSidebarPref() {
  try { return window.localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
}

/** Label waktu ringkas di item sidebar: jam untuk hari ini, hari untuk minggu ini, tanggal sisanya. */
function threadWhen(iso, group) {
  const d = new Date(iso)
  if (group === 'today') return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
  if (group === 'yesterday' || group === 'week') return d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' })
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
}

export default function AiAssistant({ currentPage, currentWorkspace }) {
  const { periodValue } = useQuadrant()
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ── Riwayat percakapan ──
  const [threads, setThreads] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [threadTitle, setThreadTitle] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPref)
  const [drawerOpen, setDrawerOpen] = useState(false) // layar sempit
  const [switching, setSwitching] = useState(false)

  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  function toggleSidebar() {
    const narrow = !window.matchMedia('(min-width: 640px)').matches
    if (narrow) { setDrawerOpen(v => !v); return }
    setSidebarOpen(v => {
      try { localStorage.setItem(SIDEBAR_KEY, v ? '0' : '1') } catch { /* ignore */ }
      return !v
    })
  }
  const historyActive = sidebarOpen || drawerOpen

  // Muat thread terbaru + daftar riwayat untuk workspace aktif. Layout memasang
  // komponen ini dengan key={workspace id}, jadi ganti workspace = state baru
  // dari nol (tak perlu reset manual di dalam effect).
  const wsId = currentWorkspace?.id ?? null
  useEffect(() => {
    let alive = true
    if (!wsId) return undefined
    ;(async () => {
      try {
        const [latest, list] = await Promise.all([latestThread(), listThreads()])
        if (!alive) return
        setThreads(list)
        if (latest) {
          setThreadId(latest.id)
          setThreadTitle(latest.title)
          setMessages(latest.messages.length ? [GREETING, ...latest.messages] : [GREETING])
        }
      } catch { /* biarkan thread kosong */ }
    })()
    return () => { alive = false }
  }, [wsId])

  const onFreshThread = threadId === null && messages.length <= 1

  function newChat() {
    // Thread lama TIDAK dihapus; thread baru baru tersimpan saat pesan pertama dikirim.
    setThreadId(null); setThreadTitle(''); setMessages([GREETING]); setInput(''); setError(null); setDrawerOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function openThread(id) {
    if (id === threadId || loading) return
    setSwitching(true); setError(null)
    try {
      const data = await getThread(id)
      if (!data) { setThreads(list => list.filter(x => x.id !== id)); setError('Percakapan tidak ditemukan.'); return }
      setThreadId(id); setThreadTitle(data.title); setMessages([GREETING, ...data.messages]); setDrawerOpen(false)
    } catch {
      setError('Koneksi bermasalah. Coba lagi ya.')
    } finally {
      setSwitching(false)
    }
  }

  async function handleRename(id, title) {
    try {
      const saved = await renameThread(id, title)
      if (!saved) return false
      setThreads(list => list.map(x => (x.id === id ? { ...x, title: saved } : x)))
      if (id === threadId) setThreadTitle(saved)
      return true
    } catch { return false }
  }

  async function handleDelete(id) {
    try { await deleteThread(id) } catch { return false }
    setThreads(list => list.filter(x => x.id !== id))
    if (id === threadId) newChat()
    return true
  }

  const charCount = input.length
  const overLimit = charCount > MAX_CHARS

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages, loading, open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // Tutup saat klik di luar panel (tapi bukan FAB).
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      const target = e.target
      if (panelRef.current && !panelRef.current.contains(target) && !target.closest('.ai-fab')) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || loading || switching || trimmed.length > MAX_CHARS) return
    const workspaceId = wsId || getCurrentWorkspaceId()
    if (!workspaceId) { setError('Pilih workspace dulu.'); return }

    setError(null)
    const next = [...messages, { role: 'user', content: trimmed }]
    setMessages(next); setInput(''); setLoading(true)

    try {
      const payload = next.filter(m => m !== GREETING)
      const data = await postJson('/api/assistant/chat', {
        workspace_id: workspaceId,
        messages: payload,
        threadId,
        context: {
          page: currentPage ? t(`nav.${currentPage}.label`) : null,
          period: periodValue || null,
        },
      })
      setMessages(m => [...m, { role: 'assistant', content: data.reply ?? '' }])
      if (typeof data.threadId === 'string') {
        const id = data.threadId
        const title = data.title || threadTitle
        const now = new Date().toISOString()
        setThreadId(id); setThreadTitle(title)
        // Thread baru masuk ke atas; thread lama naik ke atas (updated_at berubah).
        setThreads(list => [{ id, title, updatedAt: now }, ...list.filter(x => x.id !== id)])
      }
    } catch (e) {
      setError(e?.message || 'Gagal menghubungi asisten.')
    } finally {
      setLoading(false)
    }
  }

  const headerTitle = threadTitle || 'AI Seller Assistant'
  const userInitials = (currentWorkspace?.name || 'Aku').slice(0, 2).toUpperCase()

  const threadList = (
    <ThreadList
      threads={threads} activeId={threadId} busy={loading || switching}
      onNew={newChat} newDisabled={onFreshThread} onOpen={openThread}
      onRename={handleRename} onDelete={handleDelete}
    />
  )

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            style={{ transformOrigin: 'bottom right' }}
            className={`relative flex h-[520px] overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-br from-surface to-surface2 shadow-2xl transition-[width] duration-200 ${
              sidebarOpen ? 'w-[min(92vw,384px)] sm:w-[min(92vw,620px)]' : 'w-[min(92vw,384px)]'
            }`}
          >
            <div className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), transparent 40%, rgba(139,92,246,0.06))' }} />

            {sidebarOpen && (
              <aside className="relative z-[1] hidden w-[200px] shrink-0 flex-col border-r border-line/10 bg-surface2/60 sm:flex">
                {threadList}
              </aside>
            )}

            {drawerOpen && (
              <div className="absolute inset-0 z-20 sm:hidden">
                <button aria-label="Tutup riwayat" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/40" />
                <aside className="absolute inset-y-0 left-0 flex w-[240px] flex-col rounded-l-3xl border-r border-line/10 bg-surface shadow-xl">
                  {threadList}
                </aside>
              </div>
            )}

            <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
              {/* Header */}
              <div className="relative flex items-center justify-between gap-2 px-4 pt-4 pb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button onClick={toggleSidebar} aria-label={historyActive ? 'Tutup riwayat' : 'Buka riwayat'} title="Riwayat percakapan"
                    className={`rounded-full p-1.5 transition-colors hover:bg-fill/10 hover:text-ink ${historyActive ? 'bg-accent/10 text-accent' : 'text-ink-muted'}`}>
                    <PanelLeft className="h-4 w-4" />
                  </button>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="truncate text-sm font-semibold text-ink" title={headerTitle}>{headerTitle}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!sidebarOpen && (
                    <button onClick={newChat} disabled={loading || onFreshThread} aria-label="Chat baru" title="Chat baru"
                      className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-fill/10 hover:text-ink disabled:opacity-40">
                      <SquarePen className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} aria-label="Tutup"
                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-fill/10 hover:text-ink">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div ref={bodyRef} className="relative flex-1 space-y-3 overflow-y-auto px-4 py-2">
                {switching && (
                  <div className="flex items-center gap-2 pl-8 text-[12px] text-ink-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Membuka percakapan…
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${m.role === 'user' ? 'bg-emerald-100 text-emerald-700' : 'text-white'}`}
                      style={m.role === 'assistant' ? { background: BRAND_GRADIENT } : undefined}>
                      {m.role === 'user' ? userInitials : 'AI'}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl border px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user' ? 'whitespace-pre-wrap rounded-br-md border-transparent text-white' : 'rounded-bl-md border-line/10 bg-surface text-ink'}`}
                      style={m.role === 'user' ? { background: BRAND_GRADIENT } : undefined}>
                      {m.role === 'user' ? m.content : <FormattedText text={m.content} />}
                    </div>
                  </div>
                ))}

                {messages.length === 1 && !loading && (
                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {QUICK_PROMPTS.map(q => (
                      <button key={q} onClick={() => send(q)}
                        className="rounded-full border border-line/10 bg-surface px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-accent/50 hover:text-ink">
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="flex items-end gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ background: BRAND_GRADIENT }}>AI</div>
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line/10 bg-surface px-3 py-2.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
                    </div>
                  </div>
                )}

                {error && <p className="pl-8 text-[12px] text-red-500">{error}</p>}
              </div>

              {/* Composer */}
              <div className="relative px-3 pb-3 pt-1">
                <div className="rounded-2xl border border-line/10 bg-surface2/70 transition-colors focus-within:border-accent/50">
                  <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                    rows={2} placeholder="Tanya soal toko… (mis. produk mana yang boros iklan)" disabled={loading}
                    className="block max-h-32 min-h-[56px] w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
                    style={{ scrollbarWidth: 'none' }} />
                  <div className="flex items-center justify-between px-3 pb-2">
                    <span className={`text-[11px] font-medium ${overLimit ? 'text-red-500' : 'text-ink-faint'}`}>{charCount}/{MAX_CHARS}</span>
                    <button onClick={() => send(input)} disabled={loading || !input.trim() || overLimit} aria-label="Kirim"
                      className="group flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40"
                      style={{ background: BRAND_GRADIENT, boxShadow: '0 6px 16px -4px rgba(99,102,241,0.5)' }}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[10.5px] text-ink-faint">
                  <span className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    <kbd className="rounded border border-line/10 bg-surface2 px-1 py-0.5 font-mono text-[9.5px] text-ink-muted">Enter</kbd>
                    kirim ·
                    <kbd className="rounded border border-line/10 bg-surface2 px-1 py-0.5 font-mono text-[9.5px] text-ink-muted">Shift+Enter</kbd>
                    baris baru
                  </span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Online</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tombol melayang bercahaya ── */}
      <button onClick={() => setOpen(o => !o)} aria-label={open ? 'Tutup AI Assistant' : 'Buka AI Assistant'}
        className="ai-fab relative flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 hover:scale-105"
        style={{ background: BRAND_GRADIENT, boxShadow: '0 0 20px rgba(139,92,246,0.55), 0 0 40px rgba(99,102,241,0.35), 0 8px 24px -6px rgba(79,70,229,0.5)', border: '2px solid rgba(255,255,255,0.18)' }}>
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent opacity-40" />
        {!open && <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-indigo-400/20" />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? 'close' : 'open'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18 }} className="relative z-10 text-white">
            {open ? <X className="h-7 w-7" /> : <RobotIcon className="h-9 w-9 robot-nod" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  )
}

// ── Sidebar riwayat ──────────────────────────────────────────────────────────
function ThreadList({ threads, activeId, busy, newDisabled, onNew, onOpen, onRename, onDelete }) {
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    if (confirmId === null) return undefined
    const t = setTimeout(() => setConfirmId(null), 4000)
    return () => clearTimeout(t)
  }, [confirmId])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const now = new Date()
    const buckets = { today: [], yesterday: [], week: [], older: [] }
    for (const t of threads) {
      if (q && !t.title.toLowerCase().includes(q)) continue
      buckets[threadGroup(new Date(t.updatedAt), now)].push(t)
    }
    return buckets
  }, [threads, query])

  const visibleCount = THREAD_GROUP_ORDER.reduce((n, g) => n + grouped[g].length, 0)

  async function commitRename(id) {
    const title = draft.trim()
    setRenamingId(null)
    if (!title) return
    await onRename(id, title)
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 pt-3.5 pb-2">
        <button onClick={onNew} disabled={busy || newDisabled}
          className="flex flex-1 items-center gap-2 rounded-xl border border-line/10 bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-accent/50 disabled:opacity-50">
          <SquarePen className="h-3.5 w-3.5 text-accent" />Chat baru
        </button>
      </div>
      {threads.length > 3 && (
        <label className="mx-3 mb-1 flex items-center gap-1.5 rounded-lg border border-line/10 bg-surface px-2 py-1 text-[11.5px] text-ink-faint focus-within:border-accent/50">
          <Search className="h-3 w-3 shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari percakapan"
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-faint" />
        </label>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {threads.length === 0 && (
          <p className="px-2 pt-6 text-center text-[11.5px] leading-relaxed text-ink-faint">
            Belum ada riwayat. Percakapan tersimpan otomatis begitu kamu mengirim pesan pertama.
          </p>
        )}
        {threads.length > 0 && visibleCount === 0 && (
          <p className="px-2 pt-6 text-center text-[11.5px] text-ink-faint">Tidak ada yang cocok.</p>
        )}
        {THREAD_GROUP_ORDER.map(g => grouped[g].length === 0 ? null : (
          <div key={g}>
            <div className="px-1.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{THREAD_GROUP_LABEL[g]}</div>
            {grouped[g].map(t => {
              const active = t.id === activeId
              const renaming = renamingId === t.id
              const confirming = confirmId === t.id
              return (
                <div key={t.id} className={`group relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] ${active ? 'bg-accent/10 font-semibold text-ink' : 'text-ink hover:bg-surface'}`}>
                  {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded bg-accent" />}
                  {renaming ? (
                    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(t.id) } if (e.key === 'Escape') setRenamingId(null) }}
                      onBlur={() => commitRename(t.id)} maxLength={60}
                      className="w-full rounded border border-accent/50 bg-surface px-1.5 py-0.5 text-[12px] font-normal text-ink outline-none" />
                  ) : confirming ? (
                    <>
                      <span className="flex-1 truncate text-red-500">Hapus percakapan?</span>
                      <button onClick={() => { setConfirmId(null); onDelete(t.id) }} aria-label="Ya, hapus" className="rounded p-0.5 text-red-500 hover:bg-red-500/10"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setConfirmId(null)} aria-label="Batal" className="rounded p-0.5 text-ink-muted hover:bg-fill/10"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onOpen(t.id)} disabled={busy} title={t.title} className="min-w-0 flex-1 truncate text-left disabled:opacity-60">{t.title}</button>
                      <span className="shrink-0 text-[10px] text-ink-faint group-hover:hidden">{threadWhen(t.updatedAt, g)}</span>
                      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button onClick={() => { setDraft(t.title); setRenamingId(t.id) }} aria-label="Ubah nama" title="Ubah nama" className="rounded p-0.5 text-ink-muted hover:bg-fill/10 hover:text-ink"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => setConfirmId(t.id)} aria-label="Hapus" title="Hapus" className="rounded p-0.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-line/10 px-3 py-2 text-[10.5px] text-ink-faint">{threads.length} percakapan</div>
    </>
  )
}

// Maskot robot AI (SVG yang sama dengan Pikat) — mata elemen terpisah supaya bisa berkedip.
function RobotIcon({ className }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle className="robot-antenna" cx="50" cy="15" r="5.5" fill="currentColor" />
      <rect x="47" y="18" width="6" height="12" rx="3" fill="currentColor" />
      <rect x="36" y="26" width="28" height="12" rx="6" fill="currentColor" />
      <rect x="11" y="46" width="13" height="25" rx="6.5" fill="currentColor" />
      <rect x="76" y="46" width="13" height="25" rx="6.5" fill="currentColor" />
      <rect x="22" y="32" width="56" height="52" rx="24" fill="currentColor" />
      <g className="robot-eyes" fill="#2a2c4a">
        <ellipse className="robot-eye" cx="42" cy="59" rx="5.5" ry="8" />
        <ellipse className="robot-eye robot-eye-2" cx="58" cy="59" rx="5.5" ry="8" />
      </g>
    </svg>
  )
}
