/* eslint-disable react-refresh/only-export-components */
// Konteks identitas: foto/data profil (per user) + brand per-workspace.
//
// SUMBERNYA DATABASE sejak Fase 2.1. Sebelumnya localStorage per-perangkat,
// yang berarti anggota yang diundang melihat workspace tanpa nama brand dan
// tanpa logo — datanya hanya ada di browser si pengundang.
//
// Dipakai: HeaderControls (avatar+menu), WorkspaceSwitcher (brand),
// SettingsPage (form). Bentuk nilai yang diekspor SENGAJA tak berubah
// ({ profile, saveProfile, brandFor, saveBrand }) supaya komponen tak perlu
// disentuh — hanya sumber datanya yang pindah.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  getProfile, saveProfile as simpanProfil,
  getAllBrands, saveBrand as simpanBrand, angkatDariLokal,
} from '../data/identity'

const IdentityContext = createContext(null)
const KOSONG = { name: '', phone: '', avatar: null }

export function IdentityProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id || null

  const [profile, setProfile] = useState(KOSONG)
  const [brands, setBrands] = useState({})

  // Muat dari DB saat user berganti. Pengangkatan data lokal lama dijalankan
  // lebih dulu (sekali per user) supaya profil & logo yang sudah ada tidak
  // terlihat "hilang" begitu sumbernya pindah ke DB.
  useEffect(() => {
    let aktif = true
    ;(async () => {
      // Reset logout ikut jalur asinkron yang sama — setState langsung di badan
      // effect memicu render berjenjang (aturan react-hooks).
      if (!uid) { if (aktif) { setProfile(KOSONG); setBrands({}) } ; return }
      await angkatDariLokal(uid)
      try {
        const [p, b] = await Promise.all([getProfile(uid), getAllBrands()])
        if (!aktif) return
        setProfile(p); setBrands(b)
      } catch { /* biarkan kosong — UI tetap jalan, form masih bisa menyimpan */ }
    })()
    return () => { aktif = false }
  }, [uid])

  // Optimistis: tampilan berubah seketika, DB menyusul. Kalau simpan gagal,
  // nilai lama dikembalikan supaya UI tak berbohong tentang apa yang tersimpan.
  const saveProfile = useCallback(async (patch) => {
    const sebelum = profile
    const next = { ...profile, ...patch }
    setProfile(next)
    try { await simpanProfil(uid, patch) } catch (e) { setProfile(sebelum); throw e }
    return next
  }, [uid, profile])

  const brandFor = useCallback((wsId) => brands[wsId] || { name: '', logo: null }, [brands])

  const saveBrand = useCallback(async (wsId, patch) => {
    const sebelum = brands[wsId] || { name: '', logo: null }
    const next = { ...sebelum, ...patch }
    setBrands(prev => ({ ...prev, [wsId]: next }))
    try { await simpanBrand(wsId, patch) }
    catch (e) { setBrands(prev => ({ ...prev, [wsId]: sebelum })); throw e }
    return next
  }, [brands])

  const value = { profile, saveProfile, brandFor, saveBrand }
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity harus dipakai di dalam <IdentityProvider>')
  return ctx
}
