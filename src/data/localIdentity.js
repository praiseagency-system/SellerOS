// Penyimpanan identitas LOKAL (per-device, localStorage) untuk foto profil,
// data profil, dan brand per-workspace. FASE UI (freeze GMV Max 2026-07-12):
// tabel Supabase `profiles`/`workspaces` belum punya kolom ini & migration
// sedang dibekukan, jadi data disimpan lokal dulu. Pindah ke Supabase setelah
// freeze (ganti get/set di sini + IdentityContext, komponen tak berubah).

const PROFILE_KEY = (uid) => `sq_profile_${uid || 'anon'}`
const BRAND_PREFIX = 'sq_brand_'
const BRAND_KEY = (wsId) => `${BRAND_PREFIX}${wsId}`

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota/full — abaikan */ }
}

// ── Profil (per user) ─────────────────────────────────────────────────────
export function getLocalProfile(uid) {
  return readJson(PROFILE_KEY(uid), { name: '', phone: '', avatar: null })
}
export function setLocalProfile(uid, patch) {
  const next = { ...getLocalProfile(uid), ...patch }
  writeJson(PROFILE_KEY(uid), next)
  return next
}

// ── Brand (per workspace) ─────────────────────────────────────────────────
export function getLocalBrand(wsId) {
  if (!wsId) return { name: '', logo: null }
  return readJson(BRAND_KEY(wsId), { name: '', logo: null })
}
export function setLocalBrand(wsId, patch) {
  const next = { ...getLocalBrand(wsId), ...patch }
  writeJson(BRAND_KEY(wsId), next)
  return next
}
// Semua brand tersimpan → { [wsId]: {name, logo} } untuk hidrasi awal context.
export function getAllLocalBrands() {
  const out = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(BRAND_PREFIX)) out[k.slice(BRAND_PREFIX.length)] = readJson(k, null)
    }
  } catch { /* abaikan */ }
  return out
}

// ── Resize gambar → dataURL kecil (avatar/logo) via canvas ────────────────
// Menjaga localStorage tetap ramping: skala ke `max` px (cover) + JPEG 0.85.
export function fileToAvatarDataUrl(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('File harus gambar')); return }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Gambar tidak valid'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        try { resolve(canvas.toDataURL('image/jpeg', 0.85)) }
        catch (e) { reject(e) }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
