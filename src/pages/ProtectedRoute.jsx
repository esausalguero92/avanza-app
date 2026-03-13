import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ProtectedRoute({ session, profile, allowedRoles, children }) {
  // No hay sesión
  if (!session) return <Navigate to="/login" replace />

  // Perfil cargando
  if (!profile) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  // Rol no permitido
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/login" replace />
  }

  // Usuario inactivo
  if (!profile.active) {
    async function handleLogout() {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }

    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: '1.25rem' }}>
        <p className="error-text">Tu cuenta está inactiva. Contacta al administrador.</p>
        <button
          onClick={handleLogout}
          className="btn btn--ghost"
          style={{ fontSize: '0.85rem' }}
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return children
}
