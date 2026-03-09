import { Navigate } from 'react-router-dom'

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
    return (
      <div className="loading-screen">
        <p className="error-text">Tu cuenta está inactiva. Contacta al administrador.</p>
      </div>
    )
  }

  return children
}
