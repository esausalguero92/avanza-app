import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

import Login              from './pages/Login'
import NuevaOrden         from './pages/NuevaOrden'
import MisOrdenes         from './pages/MisOrdenes'
import DashboardProduccion from './pages/DashboardProduccion'
import Clientes           from './pages/Clientes'
import Reportes           from './pages/Reportes'
import CuentaCorriente    from './pages/CuentaCorriente'
import Admin              from './pages/Admin'
import Bodega             from './pages/Bodega'
import ProtectedRoute     from './components/ProtectedRoute'

export default function App() {
  const [session, setSession]   = useState(undefined)  // undefined = cargando, null = no hay sesión
  const [profile, setProfile]   = useState(null)

  useEffect(() => {
    // 1. Intentar recuperar sesión existente desde localStorage al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null)
      if (session) fetchProfile(session.user.id)
    })

    // 2. Escuchar cambios de auth:
    //    - SIGNED_IN:       login exitoso o token renovado automáticamente
    //    - TOKEN_REFRESHED: Supabase renovó el JWT silenciosamente (mantiene sesión viva)
    //    - SIGNED_OUT:      el usuario hizo logout explícito o el refresh token expiró
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session)
          if (session) fetchProfile(session.user.id)
        }

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }

  // Mientras verifica si hay sesión guardada, mostrar spinner
  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública */}
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />

        {/* Redirección raíz según rol */}
        <Route
          path="/"
          element={
            !session ? <Navigate to="/login" replace /> :
            !profile  ? <div className="loading-screen"><div className="loading-spinner" /></div> :
            profile.role === 'operator'  ? <Navigate to="/dashboard-produccion" replace /> :
            profile.role === 'warehouse' ? <Navigate to="/bodega" replace /> :
            <Navigate to="/mis-ordenes" replace />
          }
        />

        {/* Rutas protegidas */}
        <Route path="/nueva-orden" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['designer', 'admin', 'owner']}>
            <NuevaOrden profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/mis-ordenes" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['designer', 'admin', 'owner']}>
            <MisOrdenes profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/dashboard-produccion" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['operator', 'admin', 'owner']}>
            <DashboardProduccion profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/clientes" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['admin', 'owner']}>
            <Clientes profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/reportes" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['admin', 'owner']}>
            <Reportes profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/cuenta-corriente" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['admin', 'owner']}>
            <CuentaCorriente profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['admin', 'owner']}>
            <Admin profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/bodega" element={
          <ProtectedRoute session={session} profile={profile}
            allowedRoles={['warehouse', 'admin', 'owner']}>
            <Bodega profile={profile} />
          </ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
