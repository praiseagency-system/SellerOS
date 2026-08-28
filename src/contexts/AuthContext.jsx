import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)   // sesi awal sedang dicek
  // Supabase menukar link "lupa sandi" jadi sesi login + event PASSWORD_RECOVERY.
  // Tanpa penanda ini, user langsung masuk aplikasi dan tak pernah diminta
  // sandi baru — link jadi jalan masuk tanpa sandi. Penanda ini menahannya di
  // layar "atur sandi baru" sampai sandi benar-benar diganti.
  const [recovery, setRecovery] = useState(false)

  const user = session?.user ?? null

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); return }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, share_with_admin, created_at')
      .eq('id', uid)
      .maybeSingle()
    if (!error) setProfile(data ?? null)
  }, [])

  useEffect(() => {
    let active = true
    // Tanpa env Supabase, lewati pengecekan sesi → langsung tampilkan login
    // (yang menampilkan pesan setup), bukan stuck di loading.
    if (!isSupabaseConfigured) { setLoading(false); return }
    // Sesi yang tersimpan (persisted) di-load saat mount.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => active && setLoading(false))
    })
    // Dengarkan perubahan auth (login, logout, refresh token, OAuth redirect).
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setSession(sess)
      loadProfile(sess?.user?.id)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signInWithPassword = useCallback(
    (email, password) => supabase.auth.signInWithPassword({ email, password }),
    []
  )

  const signUp = useCallback(
    (email, password) => supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    }),
    []
  )

  const signInWithGoogle = useCallback(
    () => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    }),
    []
  )

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  // Kirim email berisi link pemulihan. redirectTo = origin: link membuka aplikasi
  // ini, lalu SDK memunculkan event PASSWORD_RECOVERY (lihat onAuthStateChange).
  const resetPassword = useCallback(
    (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
    []
  )

  // Setel sandi baru untuk sesi pemulihan yang sedang aktif, lalu lepas penanda
  // recovery agar aplikasi boleh terbuka.
  const updatePassword = useCallback(async (password) => {
    const res = await supabase.auth.updateUser({ password })
    if (!res.error) setRecovery(false)
    return res
  }, [])

  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user?.id])

  const value = {
    session, user, profile, loading, recovery,
    isAdmin: profile?.role === 'admin',
    signInWithPassword, signUp, signInWithGoogle, signOut, refreshProfile,
    resetPassword, updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>')
  return ctx
}
