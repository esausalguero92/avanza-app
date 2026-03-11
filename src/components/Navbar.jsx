import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const NAV_BY_ROLE = {
  designer: [
    { to: '/nueva-orden', label: 'Nueva Orden' },
    { to: '/mis-ordenes', label: 'Órdenes' },
    { to: '/clientes',    label: 'Clientes' },
  ],
  operator: [
    { to: '/dashboard-produccion', label: 'Producción' },
  ],
  warehouse: [
    { to: '/bodega', label: 'Bodega' },
  ],
  delivery: [],
  admin: [
    { to: '/nueva-orden',          label: 'Nueva Orden' },
    { to: '/mis-ordenes',          label: 'Órdenes' },
    { to: '/clientes',             label: 'Clientes' },
    { to: '/dashboard-produccion', label: 'Producción' },
  ],
  owner: [
    { to: '/nueva-orden',          label: 'Nueva Orden' },
    { to: '/mis-ordenes',          label: 'Órdenes' },
    { to: '/clientes',             label: 'Clientes' },
    { to: '/dashboard-produccion', label: 'Producción' },
    { to: '/reportes',             label: 'Reportes' },
    { to: '/cuenta-corriente',     label: 'Créditos' },
    { to: '/admin',                label: 'Admin' },
  ],
}

export default function Navbar({ profile }) {
  const links = NAV_BY_ROLE[profile?.role] || []

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <header className="page__header">
      <img src="/logo.png" alt="Avanza" className="page__logo-img" />
      <nav className="nav-links">
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="page__user">
        <span className="page__role">{profile?.full_name}</span>
        <span className="page__role" style={{color:'var(--accent)', marginLeft:'0.25rem'}}>
          [{profile?.role}]
        </span>
        <button className="btn btn--ghost" onClick={handleLogout}>Salir</button>
      </div>
    </header>
  )
}
