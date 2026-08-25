import { useState, useRef, useEffect } from 'react'
import {
  ShieldCheck, ShieldOff, LogOut, AlertCircle, CheckCircle2,
  User, Palette, Users, Camera, Save, Store, Mail, UserPlus,
  Plug, Loader2, Link2Off, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useIdentity } from '../contexts/IdentityContext'
import { fileToAvatarDataUrl } from '../data/localIdentity'
import { supabase } from '../lib/supabase'
import { createPkce, buildAuthorizeUrl, refreshAccessToken, stashOAuthSession, fetchAdvertisers } from '../lib/tiktokOAuth'
import { getConnection, saveConnection, deleteConnection, saveAdvertiser } from '../data/tiktokConnection'
import { getExecutionSettings, saveExecutionSettings, createApproval } from '../data/gmvmaxApprovals'

const TABS = [
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'brand', label: 'Brand', icon: Palette },
  { id: 'integrasi', label: 'Integrasi', icon: Plug },
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
      {tab === 'integrasi' && (
        <div className="space-y-6">
          <IntegrasiTab currentWorkspace={currentWorkspace} />
          <ExecutionSection currentWorkspace={currentWorkspace} />
        </div>
      )}
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

// ── Tab Integrasi: koneksi TikTok Ads MCP (OAuth PKCE) per workspace ───────
function IntegrasiTab({ currentWorkspace }) {
  const wsId = currentWorkspace?.id || null
  const [conn, setConn] = useState(null)
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)

  // Terapkan koneksi + hitung kedaluwarsa (Date.now di luar render = murni).
  function applyConn(c) {
    setConn(c)
    setExpired(!!c && Date.parse(c.expires_at) <= Date.now())
  }

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(null)
    getConnection(wsId)
      .then(c => { if (active) applyConn(c) })
      .catch(e => { if (active) setError(e.message || 'Gagal memuat koneksi.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [wsId])

  async function connect() {
    if (!wsId) return
    setBusy(true); setError(null)
    try {
      const { verifier, challenge, state } = await createPkce()
      stashOAuthSession({ verifier, state, wsId })
      window.location.assign(buildAuthorizeUrl({ challenge, state }))
    } catch (e) {
      setError(e.message || 'Gagal memulai koneksi.'); setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true); setError(null); setOkMsg(null)
    try { await deleteConnection(wsId); applyConn(null); setOkMsg('Koneksi diputus.') }
    catch (e) { setError(e.message || 'Gagal memutus koneksi.') }
    finally { setBusy(false) }
  }

  async function renew() {
    if (!conn?.refresh_token) return
    setBusy(true); setError(null); setOkMsg(null)
    try {
      const tok = await refreshAccessToken(conn.refresh_token)
      await saveConnection(tok, wsId)
      applyConn(await getConnection(wsId))
      setOkMsg('Token diperbarui.')
    } catch (e) {
      const msg = String(e?.message || '')
      // Refresh token TikTok punya masa hidup sendiri; kalau ikut hangus,
      // satu-satunya jalan adalah OAuth ulang — arahkan ke "Sambungkan ulang".
      setError(/expired|invalid_grant/i.test(msg)
        ? 'Refresh token sudah hangus — klik "Sambungkan ulang" untuk login TikTok lagi (koneksi & pemetaan toko tetap tersimpan).'
        : msg || 'Gagal memperbarui token.')
    } finally { setBusy(false) }
  }

  if (!wsId) {
    return <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-8 text-center">
      <p className="text-sm text-ink-faint">Pilih workspace dulu untuk mengatur integrasi.</p>
    </section>
  }

  const expLabel = conn ? new Date(conn.expires_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''

  return (
    <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <Plug className="w-4 h-4 text-blue-500" /> TikTok Ads (GMV Max)
      </h2>
      <p className="text-xs text-ink-muted mb-4 leading-relaxed">
        Sambungkan akun TikTok Ads untuk <span className="text-ink font-medium">{currentWorkspace.name}</span> agar
        data GMV Max tersinkron otomatis — tanpa upload manual. Login dilakukan langsung di TikTok; token
        disimpan aman & diperpanjang otomatis.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat status…
        </div>
      ) : conn ? (
        <div className="space-y-3">
        <div className={`rounded-xl border p-4 ${expired ? 'border-amber-500/25 bg-amber-500/5' : 'border-green-500/25 bg-green-500/5'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${expired ? 'bg-amber-500/15' : 'bg-green-500/15'}`}>
                <CheckCircle2 className={`w-4 h-4 ${expired ? 'text-amber-400' : 'text-green-400'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-strong">
                  {conn.advertiser_name || conn.advertiser_id || 'Akun TikTok tersambung'}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {expired ? 'Token kedaluwarsa — perbarui.' : 'Aktif'} · berlaku s/d {expLabel}
                </p>
                <p className="text-[11px] text-ink-faint mt-0.5">scope {conn.scope || '—'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={renew} disabled={busy || !conn.refresh_token}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Perbarui token
            </button>
            {/* OAuth ulang di atas baris koneksi yang SAMA (saveConnection upsert
                by workspace_id) — id koneksi tak berubah, jadi aman dari FK
                gmvmax_tenant_adv_conn_same_ws dan pemetaan tenant tetap valid.
                Ini jalur wajib bila refresh_token ikut kedaluwarsa. */}
            <button onClick={connect} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 disabled:opacity-40 transition-colors">
              <Plug className="w-3.5 h-3.5" /> Sambungkan ulang
            </button>
            <button onClick={disconnect} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
              <Link2Off className="w-3.5 h-3.5" /> Putuskan
            </button>
          </div>
        </div>

        {/* Pemetaan advertiser/toko: 1 workspace ↔ 1 advertiser */}
        <AdvertiserSection conn={conn} wsId={wsId} onSaved={async () => applyConn(await getConnection(wsId))} />
        </div>
      ) : (
        <button onClick={connect} disabled={busy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Connect TikTok Ads
        </button>
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

// Pemetaan advertiser/toko untuk workspace (1 workspace ↔ 1 advertiser).
// Enumerasi lewat proxy serverless (MCP kena CORS dari browser).
function AdvertiserSection({ conn, wsId, onSaved }) {
  const [list, setList] = useState(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function load() {
    setPicking(true); setErr(null); setBusy(true)
    try { setList(await fetchAdvertisers(conn.access_token)) }
    catch (e) { setErr(e.message || 'Gagal memuat daftar akun.') }
    finally { setBusy(false) }
  }
  async function choose(a) {
    setBusy(true); setErr(null)
    try { await saveAdvertiser(a, wsId); await onSaved(); setPicking(false); setList(null) }
    catch (e) { setErr(e.message || 'Gagal menyimpan pilihan.') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-line/10 bg-fill/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Store className="w-4 h-4 text-blue-400" />
        <p className="text-sm font-semibold text-ink-strong">Akun / Toko TikTok Ads</p>
      </div>

      {conn.advertiser_id ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink truncate">{conn.advertiser_name || conn.advertiser_id}</p>
            <p className="text-[11px] text-ink-faint font-mono">{conn.advertiser_id}</p>
          </div>
          <button onClick={load} disabled={busy} className="text-xs text-blue-400 hover:underline disabled:opacity-40">Ubah</button>
        </div>
      ) : !picking ? (
        <>
          <p className="text-xs text-ink-muted mb-3">Pilih akun/toko mana yang datanya disinkron untuk workspace ini.</p>
          <button onClick={load} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Store className="w-3.5 h-3.5" />} Pilih toko
          </button>
        </>
      ) : null}

      {picking && (
        <div className="mt-3 space-y-1.5">
          {busy && !list && <p className="text-xs text-ink-faint flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat akun…</p>}
          {list?.map(a => {
            const active = conn.advertiser_id === a.advertiser_id
            return (
              <button key={a.advertiser_id} onClick={() => choose(a)} disabled={busy}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm border transition-colors ${active ? 'border-blue-600/50 bg-blue-600/10' : 'border-line/10 hover:bg-fill/10'}`}>
                <span className="min-w-0 truncate"><span className="text-ink font-medium">{a.advertiser_name}</span><span className="text-[11px] text-ink-faint font-mono"> · {a.advertiser_id}</span></span>
                {active && <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              </button>
            )
          })}
          {list && list.length === 0 && <p className="text-xs text-ink-faint">Tak ada akun advertiser terlihat oleh token ini.</p>}
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-300 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{err}</p>}
    </div>
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
// Execute Layer E0 — kill switch + bounds + cooldown + uji alur approval.
// Eksekusi nyata ke TikTok = Fase E1+; panel ini mengatur pagarnya duluan.
function ExecutionSection({ currentWorkspace }) {
  const wsId = currentWorkspace?.id || null
  const [s, setS] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!wsId) return
    getExecutionSettings(wsId).then(setS).catch(e => setError(e.message))
  }, [wsId])

  async function patch(p) {
    setBusy(true); setError(null); setMsg(null)
    try { await saveExecutionSettings(p, wsId); setS(await getExecutionSettings(wsId)); setMsg('Tersimpan.') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function sendTest() {
    setBusy(true); setError(null); setMsg(null)
    try {
      await createApproval({
        actionType: 'TEST',
        target: { campaign_name: 'Uji alur — tanpa efek apa pun' },
        currentValue: { status: 'sebelum' }, proposedValue: { status: 'sesudah' },
        reason: 'Kartu uji E0: pastikan antrean, kartu, dan log otomatis bekerja.',
        source: 'MANUAL', risk: 'LOW',
      })
      setMsg('Approval uji dibuat — cek ikon 🔔 di topbar.')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!wsId || !s) return null
  const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d }

  return (
    <section className="bg-surface rounded-2xl border border-line/10 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-500" /> Eksekusi ke TikTok Ads
        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.enabled ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {s.enabled ? 'AKTIF' : 'DIMATIKAN'}
        </span>
      </h2>
      <p className="text-xs text-ink-muted mb-4 leading-relaxed">
        Pagar untuk lapisan eksekusi: semua aksi (budget, ROI, spark, exclude) wajib lewat persetujuan
        dan tunduk pada batas di bawah. Kill switch menghentikan seluruh eksekusi seketika.
      </p>

      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink">Kill switch — matikan semua eksekusi</span>
          <button disabled={busy} onClick={() => patch({ enabled: !s.enabled })}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ${s.enabled
              ? 'border border-red-500/25 text-red-400 hover:bg-red-500/10'
              : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {s.enabled ? 'Matikan' : 'Nyalakan kembali'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink">Batas kenaikan budget per hari per campaign</span>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="500" defaultValue={s.max_budget_increase_pct} disabled={busy}
              onBlur={(e) => num(e.target.value, s.max_budget_increase_pct) !== s.max_budget_increase_pct && patch({ max_budget_increase_pct: num(e.target.value, 50) })}
              className="w-20 bg-surface2 border border-line/15 rounded-lg px-2 py-1.5 text-right text-xs text-ink" />
            <span className="text-xs text-ink-faint">%</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink">Cooldown antar aksi per campaign</span>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="10080" defaultValue={s.cooldown_minutes} disabled={busy}
              onBlur={(e) => num(e.target.value, s.cooldown_minutes) !== s.cooldown_minutes && patch({ cooldown_minutes: num(e.target.value, 360) })}
              className="w-20 bg-surface2 border border-line/15 rounded-lg px-2 py-1.5 text-right text-xs text-ink" />
            <span className="text-xs text-ink-faint">menit</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink">Approval kedaluwarsa setelah</span>
          <div className="flex items-center gap-1.5">
            <input type="number" min="1" max="168" defaultValue={s.approval_ttl_hours} disabled={busy}
              onBlur={(e) => num(e.target.value, s.approval_ttl_hours) !== s.approval_ttl_hours && patch({ approval_ttl_hours: num(e.target.value, 24) })}
              className="w-20 bg-surface2 border border-line/15 rounded-lg px-2 py-1.5 text-right text-xs text-ink" />
            <span className="text-xs text-ink-faint">jam</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-line/10 flex items-center gap-3">
        <button disabled={busy || !s.enabled} onClick={sendTest}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 disabled:opacity-40">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Kirim approval uji
        </button>
        <span className="text-[11px] text-ink-faint">Membuat kartu TEST di antrean 🔔 — tanpa menyentuh TikTok.</span>
      </div>

      {error && <p className="mt-3 text-xs text-red-300 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      {msg && !error && <p className="mt-3 text-xs text-green-300 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{msg}</p>}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-muted mb-1.5">{label}</span>
      {children}
    </label>
  )
}
