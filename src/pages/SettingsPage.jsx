import { useState, useRef, useEffect } from 'react'
import {
  ShieldCheck, ShieldOff, LogOut, AlertCircle, CheckCircle2,
  User, Palette, Users, Camera, Save, Store, Mail, UserPlus,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useIdentity } from '../contexts/IdentityContext'
import { fileToAvatarDataUrl } from '../data/localIdentity'
import { supabase } from '../lib/supabase'

const TABS = [
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'brand', label: 'Brand', icon: Palette },
  { id: 'team', label: 'Team', icon: Users },
]

export default function SettingsPage({ initialTab = 'profil', currentWorkspace }) {
  const [tab, setTab] = useState(initialTab)
  // Loncat ke tab yang diminta dari menu profil (Profil/Brand/Team).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTab(initialTab) }, [initialTab])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Tab bar (Akun · Brand · Tim), gaya Praise */}
      <div className="flex items-center gap-1 border-b border-line/10">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'profil' && <ProfilTab />}
      {tab === 'brand' && <BrandTab currentWorkspace={currentWorkspace} />}
      {tab === 'team' && <TeamTab />}
    </div>
  )
}

// ── Tab Profil: foto + nama + email + no. WA + privasi + keluar ────────────
function ProfilTab() {
  const { user, profile: acct, isAdmin, refreshProfile, signOut } = useAuth()
  const { profile, saveProfile } = useIdentity()
  const fileRef = useRef(null)
  const [name, setName] = useState(profile.name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [dirty, setDirty] = useState(false)
  const [savedProfile, setSavedProfile] = useState(false)
  const [imgErr, setImgErr] = useState(null)

  async function onPickPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgErr(null)
    if (file.size > 2 * 1024 * 1024) { setImgErr('Ukuran maksimal 2 MB.'); return }
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256)
      saveProfile({ avatar: dataUrl })
    } catch { setImgErr('Gagal memproses gambar.') }
  }

  function saveInfo() {
    saveProfile({ name: name.trim(), phone: phone.trim() })
    setDirty(false); setSavedProfile(true)
    setTimeout(() => setSavedProfile(false), 2500)
  }

  return (
    <div className="space-y-5">
      <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-ink-strong mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-blue-500" /> Informasi Profil
        </h2>

        {/* Foto profil */}
        <div className="flex items-center gap-4 mb-5">
          <button onClick={() => fileRef.current?.click()}
            className="relative w-16 h-16 rounded-2xl overflow-hidden bg-fill/5 border border-line/10 flex items-center justify-center group flex-shrink-0">
            {profile.avatar
              ? <img src={profile.avatar} alt="Foto profil" className="w-full h-full object-cover" />
              : <span className="text-xl font-bold text-ink-muted uppercase">{(name || user?.email || '?')[0]}</span>}
            <span className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </span>
          </button>
          <div>
            <p className="text-sm font-medium text-ink">Foto Profil</p>
            <p className="text-xs text-ink-faint">JPG / PNG / WEBP · maks 2 MB</p>
            {imgErr && <p className="text-xs text-red-400 mt-1">{imgErr}</p>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nama">
            <input value={name} onChange={e => { setName(e.target.value); setDirty(true) }}
              placeholder="Nama tampilan" className={inputCls} />
          </Field>
          <Field label="No. WhatsApp / Telepon">
            <input value={phone} onChange={e => { setPhone(e.target.value); setDirty(true) }}
              placeholder="08xxxxxxxxxx" inputMode="tel" className={inputCls} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Email">
            <input value={user?.email || ''} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
          </Field>
          <p className="text-xs text-ink-faint mt-1">Email login. Tidak bisa diubah dari sini.</p>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button onClick={saveInfo} disabled={!dirty}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-fill/5 text-ink-faint cursor-not-allowed'
            }`}>
            <Save className="w-4 h-4" /> Simpan Profil
          </button>
          {savedProfile && <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan</span>}
          <span className="ml-auto text-[11px] text-ink-faint uppercase tracking-wide">
            {isAdmin ? 'Admin' : 'Pengguna'}
          </span>
        </div>
      </section>

      <PrivacySection user={user} profile={acct} refreshProfile={refreshProfile} />

      <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
        <button onClick={() => signOut()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </section>
    </div>
  )
}

// ── Tab Brand: logo + nama brand per workspace aktif → tampil di sidebar ───
function BrandTab({ currentWorkspace }) {
  const { brandFor, saveBrand } = useIdentity()
  const wsId = currentWorkspace?.id || null
  const brand = brandFor(wsId)
  const fileRef = useRef(null)
  const [name, setName] = useState(brand.name || '')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [imgErr, setImgErr] = useState(null)

  // Sinkronkan field saat ganti workspace.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { setName(brandFor(wsId).name || ''); setDirty(false) }, [wsId])

  if (!wsId) {
    return <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-8 text-center">
      <p className="text-sm text-ink-faint">Pilih workspace dulu untuk mengatur brand.</p>
    </section>
  }

  async function onPickLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgErr(null)
    if (file.size > 2 * 1024 * 1024) { setImgErr('Ukuran maksimal 2 MB.'); return }
    try { saveBrand(wsId, { logo: await fileToAvatarDataUrl(file, 256) }) }
    catch { setImgErr('Gagal memproses gambar.') }
  }
  function saveName() {
    saveBrand(wsId, { name: name.trim() })
    setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <Palette className="w-4 h-4 text-blue-500" /> Brand Workspace
      </h2>
      <p className="text-xs text-ink-muted mb-4">
        Logo & nama brand untuk <span className="text-ink font-medium">{currentWorkspace.name}</span> —
        tampil di pemilih workspace pada sidebar.
      </p>

      <div className="flex items-center gap-4 mb-5">
        <button onClick={() => fileRef.current?.click()}
          className="relative w-16 h-16 rounded-2xl overflow-hidden bg-fill/5 border border-line/10 flex items-center justify-center group flex-shrink-0">
          {brand.logo
            ? <img src={brand.logo} alt="Logo brand" className="w-full h-full object-cover" />
            : <Store className="w-6 h-6 text-ink-muted" />}
          <span className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-5 h-5 text-white" />
          </span>
        </button>
        <div>
          <p className="text-sm font-medium text-ink">Logo Brand</p>
          <p className="text-xs text-ink-faint">JPG / PNG / WEBP · maks 2 MB</p>
          {imgErr && <p className="text-xs text-red-400 mt-1">{imgErr}</p>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickLogo} className="hidden" />
      </div>

      <Field label="Nama Brand">
        <input value={name} onChange={e => { setName(e.target.value); setDirty(true) }}
          placeholder={currentWorkspace.name} className={inputCls} />
      </Field>

      <div className="flex items-center gap-3 mt-5">
        <button onClick={saveName} disabled={!dirty}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-fill/5 text-ink-faint cursor-not-allowed'
          }`}>
          <Save className="w-4 h-4" /> Simpan Brand
        </button>
        {saved && <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan</span>}
      </div>
    </section>
  )
}

// ── Tab Team: anggota (backend menyusul setelah freeze) ────────────────────
function TeamTab() {
  const { user } = useAuth()
  const { profile } = useIdentity()
  return (
    <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-ink-strong mb-4 flex items-center gap-2">
        <Users className="w-4 h-4 text-blue-500" /> Anggota Tim
      </h2>

      <div className="flex items-center gap-3 p-3 rounded-xl bg-fill/5 border border-line/10">
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-blue-600 flex items-center justify-center text-white text-sm font-bold uppercase flex-shrink-0">
          {profile.avatar
            ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            : (user?.email?.[0] || '?')}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{profile.name || user?.email}</p>
          <p className="text-xs text-ink-faint flex items-center gap-1"><Mail className="w-3 h-3" />{user?.email}</p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-blue-500/15 text-blue-400">Pemilik</span>
      </div>

      <button disabled
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-line/15 text-sm text-ink-faint cursor-not-allowed">
        <UserPlus className="w-4 h-4" /> Undang anggota — segera hadir
      </button>
      <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
        Kolaborasi multi-user butuh sinkron akun. Menyusul setelah backend disiapkan.
      </p>
    </section>
  )
}

// ── Bagian privasi (dipertahankan dari versi lama) ─────────────────────────
function PrivacySection({ user, profile, refreshProfile }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const shared = profile?.share_with_admin ?? false

  async function toggleShare(next) {
    setSaving(true); setError(null); setSaved(false)
    const { error } = await supabase.from('profiles').update({ share_with_admin: next }).eq('id', user.id)
    if (error) setError('Gagal menyimpan izin. Coba lagi.')
    else { await refreshProfile(); setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  return (
    <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-ink-strong mb-1">Privasi Data</h2>
      <p className="text-xs text-ink-muted mb-4">
        Atur apakah tim Praise Agency boleh melihat data toko kamu untuk membantu analisis.
      </p>
      <div className={`rounded-xl border p-4 ${shared ? 'border-green-500/25 bg-green-500/5' : 'border-line/10 bg-fill/5'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${shared ? 'bg-green-500/15' : 'bg-fill/10'}`}>
              {shared ? <ShieldCheck className="w-4 h-4 text-green-400" /> : <ShieldOff className="w-4 h-4 text-ink-muted" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-strong">Izinkan tim Praise Agency melihat data saya</p>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                {shared
                  ? 'AKTIF — admin Praise Agency bisa melihat seluruh workspace & data kuadran kamu (hanya baca). Kamu bisa mematikan ini kapan saja.'
                  : 'NONAKTIF — tidak ada admin yang bisa melihat data kamu. Hanya kamu yang punya akses.'}
              </p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={shared} disabled={saving}
            onClick={() => toggleShare(!shared)}
            className={`relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${shared ? 'bg-green-500' : 'bg-fill/25'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${shared ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {(error || saved || saving) && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {saving && <span className="text-ink-muted">Menyimpan…</span>}
            {error && <><AlertCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-300">{error}</span></>}
            {saved && !error && <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-green-300">Tersimpan.</span></>}
          </div>
        )}
      </div>
    </section>
  )
}

const inputCls = 'w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50'
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-muted mb-1.5">{label}</span>
      {children}
    </label>
  )
}
