/* eslint-disable react-refresh/only-export-components */
// Konteks identitas lokal: foto/data profil (per user) + brand per-workspace.
// Sumber data = localStorage via data/localIdentity (lihat catatan freeze di
// sana). Dipakai: HeaderControls (avatar+menu), WorkspaceSwitcher (brand),
// SettingsPage (form). Semua konsumen ikut ter-update saat save.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  getLocalProfile, setLocalProfile,
  getLocalBrand, setLocalBrand, getAllLocalBrands,
} from '../data/localIdentity'

const IdentityContext = createContext(null)

export function IdentityProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id || null

  const [profile, setProfile] = useState(() => getLocalProfile(uid))
  const [brands, setBrands] = useState(() => getAllLocalBrands())

  // Muat ulang profil saat user berganti (login/logout) — sinkron dari
  // localStorage (sumber eksternal), bukan cascading render biasa.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setProfile(getLocalProfile(uid)) }, [uid])

  const saveProfile = useCallback((patch) => {
    const next = setLocalProfile(uid, patch)
    setProfile(next)
    return next
  }, [uid])

  const brandFor = useCallback((wsId) => brands[wsId] || getLocalBrand(wsId), [brands])

  const saveBrand = useCallback((wsId, patch) => {
    const next = setLocalBrand(wsId, patch)
    setBrands(prev => ({ ...prev, [wsId]: next }))
    return next
  }, [])

  const value = { profile, saveProfile, brandFor, saveBrand }
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity harus dipakai di dalam <IdentityProvider>')
  return ctx
}
