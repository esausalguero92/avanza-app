import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import NuevaOrden from './pages/NuevaOrden'
import MisOrdenes from './pages/MisOrdenes'
import DashboardProduccion from './pages/DashboardProduccion'
import Reportes from './pages/Reportes'
import Admin from './pages/Admin'
import Clientes from './pages/Clientes'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  // Cargando sesión
  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={
          session ? <Navigate to={getRoleRedirect(profile?.role)} /> : <Login />
        } />

        <Route path="/nueva-orden" element={
          <ProtectedRoute session={session} profile={profile} allowedRoles={['designer', 'admin', 'owner']}>
            <NuevaOrden profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/mis-ordenes" element={
          <ProtectedRoute session={session} profile={profile} allowedRoles={['designer', 'admin', 'owner']}>
            <MisOrdenes profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/dashboard-produccion" element={
          <ProtectedRoute session={session} profile={profile} allowedRoles={['operator', 'admin', 'owner']}>
            <DashboardProduccion profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/reportes" element={
          <ProtectedRoute session={session} profile={profile} allowedRoles={['admin', 'owner']}>
            <Reportes profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/clientes" element={
          <ProtectedRoute session={session} profile={profile} allowedRoles={['designer', 'admin', 'owner']}>
            <Clientes profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute session={session} profile={profile} allowedRoles={['owner']}>
            <Admin profile={profile} />
          </ProtectedRoute>
        } />

        <Route path="/" element={
          session
            ? <Navigate to={getRoleRedirect(profile?.role)} />
            : <Navigate to="/login" />
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

function getRoleRedirect(role) {
  const redirects = {
    designer: '/mis-ordenes',
    operator: '/dashboard-produccion',
    delivery: '/mis-ordenes',
    admin: '/reportes',
    owner: '/admin',
  }
  return redirects[role] || '/login'
}
