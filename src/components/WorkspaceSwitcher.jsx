import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Plus, X, Store, Trash2 } from 'lucide-react'
import { PRESET_COLORS, clearWorkspaceLocalData } from '../utils/workspace'
import { createWorkspace, deleteWorkspace } from '../data/workspaces'
import { useIdentity } from '../contexts/IdentityContext'

// Avatar workspace: pakai LOGO BRAND bila ada (diatur di Settings › Brand),
// jatuh ke inisial berwarna bila belum diset.
function WsAvatar({ ws, brand, size = 'sm' }) {
  const dim = size === 'md' ? 'w-9 h-9 text-xs' : 'w-7 h-7 text-[10px]'
  if (brand?.logo) {
    return (
      <div className={`${dim} rounded-lg overflow-hidden flex-shrink-0`}>
        <img src={brand.logo} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }
  const initials = ws.name.slice(0, 2).toUpperCase()
  return (
    <div className={`${dim} rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-white`}
      style={{ background: ws.color }}>
      {initials}
    </div>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      const ws = await createWorkspace({ name, color })
      await onCreated(ws)
      onClose()
    } catch (e) {
      console.error(e)
      setErr('Gagal membuat workspace. Coba lagi.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface border border-line/10 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold text-ink-strong">Buat Workspace</h3>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Nama toko / brand</label>
            <input autoFocus type="text" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="cth: AsterixSty Official"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-2">Warna</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-[#11141a] ring-white' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 bg-fill/3 rounded-xl p-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs"
              style={{ background: color }}>
              {(name || 'WS').slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm text-ink truncate">{name || 'Workspace Baru'}</span>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-line/10 text-sm text-ink-muted hover:bg-fill/5 disabled:opacity-50">
              Batal
            </button>
            <button onClick={submit} disabled={!name.trim() || busy}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                name.trim() && !busy ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-fill/5 text-ink-faint'
              }`}>
              {busy ? 'Membuat…' : 'Buat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkspaceSwitcher({ workspaces, current, onSwitch, onChange, collapsed }) {
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef(null)
  const { brandFor } = useIdentity()

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (workspaces.length <= 1) {
      alert('Tidak bisa menghapus workspace terakhir.')
      return
    }
    if (!confirm('Hapus workspace ini beserta semua riwayatnya?')) return
    try {
      await deleteWorkspace(id)
      clearWorkspaceLocalData(id)
      await onChange()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus workspace. Coba lagi.')
    }
    setOpen(false)
  }

  if (!current) return null

  const currentBrand = brandFor(current.id)

  return (
    <>
      <div ref={ref} className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-fill/5 transition-colors">
          <WsAvatar ws={current} brand={currentBrand} size="md" />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-bold text-ink-strong text-sm leading-tight truncate">{currentBrand.name || current.name}</p>
                <p className="text-xs text-ink-muted truncate">{currentBrand.name ? current.name : 'Workspace'}</p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line/10 rounded-xl shadow-2xl py-1.5 z-50 min-w-56">
            <p className="text-xs text-ink-faint px-3 py-1.5 font-semibold uppercase tracking-wider">Workspace</p>
            <div className="max-h-64 overflow-y-auto">
              {workspaces.map(ws => {
                const b = brandFor(ws.id)
                return (
                <button key={ws.id} onClick={() => { onSwitch(ws.id); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-fill/5 transition-colors group">
                  <WsAvatar ws={ws} brand={b} />
                  <span className="flex-1 text-left text-sm text-ink truncate">{b.name || ws.name}</span>
                  {ws.id === current.id && <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                  {ws.id !== current.id && workspaces.length > 1 && (
                    <span onClick={e => handleDelete(e, ws.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-red-400 flex-shrink-0 p-0.5">
                      <Trash2 className="w-3 h-3" />
                    </span>
                  )}
                </button>
              ) })}
            </div>
            <div className="border-t border-line/5 mt-1 pt-1">
              <button onClick={() => { setShowCreate(true); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-fill/5 transition-colors text-blue-500">
                <div className="w-7 h-7 rounded-lg border border-dashed border-blue-600/40 flex items-center justify-center flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-medium">Buat workspace baru</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async (ws) => { await onChange(); onSwitch(ws.id) }}
        />
      )}
    </>
  )
}
