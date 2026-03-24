import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,          // Guarda la sesión en localStorage
    autoRefreshToken:   true,          // Renueva el token automáticamente antes de que expire
    detectSessionInUrl: false,         // No necesario para este flujo
    storage:            localStorage,  // Explícito: usar localStorage (sobrevive recargas)
  },
})
