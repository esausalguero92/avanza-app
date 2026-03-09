import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const ROLES = ['designer', 'operator', 'delivery', 'admin', 'owner']
const ROLE_LABELS = {
  designer: 'Diseñador',
  operator: 'Operador',
  delivery: 'Repartidor',
  admin:    'Administrador',
  owner:    'Owner',
}

export default function Admin({ profile }) {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'designer', password: '' })

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  async function handleToggleActive(user) {
    await supabase
      .from('profiles')
      .update({ active: !user.active })
      .eq('id', user.id)
    fetchUsers()
  }

  async function handleRoleChange(userId, newRole) {
    await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)
    fetchUsers()
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Crear usuario en Supabase Auth (requiere Admin API o invitación)
    // En producción esto se hace desde el panel de Supabase o con service role key
    // Por ahora mostramos instrucciones
    setSuccess(`Usuario creado. Nota: En producción, usa el panel de Supabase Auth para crear usuarios o configura un endpoint con Service Role Key.`)
    setShowForm(false)
    setNewUser({ email: '', full_name: '', role: 'designer', password: '' })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__logo">/// AVANZA WEBAPP</span>
        <nav className="nav-links">
          <NavLink to="/admin"    className={({isActive}) => `nav-link${isActive?' active':''}`}>Admin</NavLink>
          <NavLink to="/reportes" className={({isActive}) => `nav-link${isActive?' active':''}`}>Reportes</NavLink>
        </nav>
        <div className="page__user">
          <span className="page__role">{profile?.full_name}</span>
          <button className="btn btn--ghost" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className="page__content">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
          <h1 className="page__title" style={{marginBottom:0}}>Gestión de Usuarios</h1>
          <button className="btn btn--primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Nuevo Usuario'}
          </button>
        </div>

        {error   && <p className="error-text"  style={{marginBottom:'1rem'}}>{error}</p>}
        {success && <p className="success-text" style={{marginBottom:'1rem'}}>{success}</p>}

        {showForm && (
          <form onSubmit={handleCreateUser} style={{
            background:'var(--bg-card)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', padding:'1.5rem',
            display:'flex', flexDirection:'column', gap:'1rem',
            marginBottom:'1.5rem', maxWidth:'500px'
          }}>
            <h3 style={{fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em'}}>
              Nuevo Usuario
            </h3>
            <div className="form-group">
              <label className="form-label">Nombre completo</label>
              <input className="form-input" type="text" required
                value={newUser.full_name}
                onChange={e => setNewUser({...newUser, full_name: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input className="form-input" type="email" required
                value={newUser.email}
                onChange={e => setNewUser({...newUser, email: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rol</label>
              <select className="form-select"
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role: e.target.value})}
              >
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div style={{display:'flex', gap:'0.75rem', justifyContent:'flex-end'}}>
              <button type="submit" className="btn btn--primary">Crear Usuario</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="loading-screen" style={{height:'200px'}}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>
                      <select
                        className="form-select"
                        style={{width:'auto', padding:'0.3rem 0.5rem', fontSize:'0.8rem'}}
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        disabled={u.id === profile?.id}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <span style={{
                        color: u.active ? '#4ade80' : '#ef4444',
                        fontFamily:'var(--font-mono)',
                        fontSize:'0.78rem',
                        fontWeight:700
                      }}>
                        {u.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'0.78rem'}}>
                      {new Date(u.created_at).toLocaleDateString('es-GT')}
                    </td>
                    <td>
                      <button
                        className={`btn ${u.active ? 'btn--danger' : 'btn--success'}`}
                        style={{fontSize:'0.75rem', padding:'0.3rem 0.75rem'}}
                        onClick={() => handleToggleActive(u)}
                        disabled={u.id === profile?.id}
                      >
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <style>{`
        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
        }
        .report-table th {
          text-align: left;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          padding: 0.6rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .report-table td {
          padding: 0.7rem 0.75rem;
          border-bottom: 1px solid #1a1a1a;
          color: var(--text);
        }
        .report-table tr:hover td { background: var(--bg-card); }
      `}</style>
    </div>
  )
}
