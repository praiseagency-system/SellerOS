import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)   // sesi awal sedang dicek

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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
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

  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user?.id])

  const value = {
    session, user, profile, loading,
    isAdmin: profile?.role === 'admin',
    signInWithPassword, signUp, signInWithGoogle, signOut, refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>')
  return ctx
}
