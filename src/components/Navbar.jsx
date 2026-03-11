import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import './Navbar.css'

const NAV_BY_ROLE = {
  designer: [
    { to: '/nueva-orden', label: 'Nueva Orden' },
    { to: '/mis-ordenes', label: 'Órdenes' },
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
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function closeMenu() { setMenuOpen(false) }

  return (
    <>
      <header className="page__header">
        <img src="/logo.png" alt="Avanza" className="page__logo-img" />

        {/* Nav desktop */}
        <nav className="nav-links nav-links--desktop">
          {links.map(link => (
            <NavLink key={link.to} to={link.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Usuario desktop */}
        <div className="page__user page__user--desktop">
          <span className="page__role">{profile?.full_name}</span>
          <span className="page__role" style={{ color: 'var(--accent)', marginLeft: '0.25rem' }}>
            [{profile?.role}]
          </span>
          <button className="btn btn--ghost" onClick={handleLogout}>Salir</button>
        </div>

        {/* Botón hamburguesa mobile */}
        <button
          className={`hamburger${menuOpen ? ' hamburger--open' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menú">
          <span /><span /><span />
        </button>
      </header>

      {/* Menú mobile desplegable */}
      {menuOpen && (
        <div className="mobile-menu">
          <div className="mobile-menu__user">
            <span className="mobile-menu__name">{profile?.full_name}</span>
            <span className="mobile-menu__role">[{profile?.role}]</span>
          </div>
          <nav className="mobile-menu__nav">
            {links.map(link => (
              <NavLink key={link.to} to={link.to} onClick={closeMenu}
                className={({ isActive }) => `mobile-menu__link${isActive ? ' active' : ''}`}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <button className="btn btn--ghost mobile-menu__logout" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      )}

      {/* Overlay para cerrar el menú */}
      {menuOpen && <div className="mobile-menu__overlay" onClick={closeMenu} />}
    </>
  )
}
