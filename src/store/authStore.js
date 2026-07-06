import { create } from 'zustand'
import { supabase } from '../services/supabase'
import { useShowStore } from './showStore'

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user, loading: false }),

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    set({ user: data.user })
    return data
  },

  signUp: async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw error
    return data
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ user: null })
    useShowStore.getState().clear()
  },

  initialize: async () => {
    // Guard: useAuth her bileşende çağrılır; abonelik ve getSession bir kez kurulmalı
    if (get().initialized) return
    set({ initialized: true })

    const { data: { session } } = await supabase.auth.getSession()
    set({ user: session?.user ?? null, loading: false })

    supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      set({ user: nextUser })
      // Oturum bittiğinde (çıkış veya token süresi dolması) önceki kullanıcının verisi kalmasın
      if (!nextUser) {
        useShowStore.getState().clear()
      }
    })
  },
}))
