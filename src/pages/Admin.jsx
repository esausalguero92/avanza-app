import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabaseClient'

const ROLES = ['designer', 'operator', 'warehouse', 'delivery', 'admin', 'owner']
const ROLE_LABELS = {
  designer:  'Diseñador',
  operator:  'Operador',
  warehouse: 'Bodega',
  delivery:  'Repartidor',
  admin:     'Administrador',
  owner:     'Owner',
}

const EMPTY_USER = { email: '', full_name: '', role: 'designer', password: '' }

export default function Admin({ profile }) {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [newUser, setNewUser]   = useState(EMPTY_USER)

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
    await supabase.from('profiles').update({ active: !user.active }).eq('id', user.id)
    fetchUsers()
  }

  async function handleRoleChange(userId, newRole) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    fetchUsers()
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setError(''); setSuccess(''); setSaving(true)

    if (!newUser.email || !newUser.full_name || !newUser.password) {
      setError('Todos los campos son requeridos.'); setSaving(false); return
    }
    if (newUser.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.'); setSaving(false); return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: newUser.email,
      password: newUser.password,
      options: { data: { full_name: newUser.full_name } }
    })

    if (signUpError) {
      setError('Error al crear usuario: ' + signUpError.message)
      setSaving(false); return
    }

    const userId = data?.user?.id
    if (!userId) {
      setError('No se pudo obtener el ID del nuevo usuario.'); setSaving(false); return
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId, full_name: newUser.full_name, role: newUser.role, active: true,
    })

    if (profileError) {
      setError('Usuario creado pero error al asignar perfil: ' + profileError.message)
    } else {
      setSuccess('Usuario "' + newUser.full_name + '" creado como ' + ROLE_LABELS[newUser.role] + '.')
      setShowForm(false); setNewUser(EMPTY_USER); fetchUsers()
    }
    setSaving(false)
  }

  return (
    <div className="page">
      <Navbar profile={profile} />
      <main className="page__content">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
          <h1 className="page__title" style={{ marginBottom:0 }}>Gestión de Usuarios</h1>
          <button className="btn btn--primary" onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}>
            {showForm ? 'Cancelar' : '+ Nuevo Usuario'}
          </button>
        </div>

        {error   && <p className="error-text"   style={{ marginBottom:'1rem' }}>{error}</p>}
        {success && <p className="success-text" style={{ marginBottom:'1rem' }}>{success}</p>}

        {showForm && (
          <form onSubmit={handleCreateUser} style={{
            background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius)',
            padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1rem',
            marginBottom:'1.5rem', maxWidth:'500px'
          }}>
            <h3 style={{ fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>
              Nuevo Usuario
            </h3>
            <div className="form-group">
              <label className="form-label">Nombre completo *</label>
              <input className="form-input" type="text" required autoFocus
                value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                placeholder="Ej: Juan Pérez" />
            </div>
            <div className="form-group">
              <label className="form-label">Correo electrónico *</label>
              <input className="form-input" type="email" required
                value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="usuario@empresa.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña temporal *</label>
              <input className="form-input" type="password" required minLength={6}
                value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="form-group">
              <label className="form-label">Rol *</label>
              <select className="form-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="loading-screen" style={{ height:'200px' }}><div className="loading-spinner" /></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="report-table">
              <thead>
                <tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight:600 }}>{u.full_name || '—'}</td>
                    <td>
                      <select className="form-select" style={{ width:'auto', padding:'0.3rem 0.5rem', fontSize:'0.8rem' }}
                        value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)} disabled={u.id === profile?.id}>
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <span style={{ color: u.active ? '#4ade80' : '#ef4444', fontFamily:'var(--font-mono)', fontSize:'0.78rem', fontWeight:700 }}>
                        {u.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'0.78rem' }}>
                      {new Date(u.created_at).toLocaleDateString('es-GT')}
                    </td>
                    <td>
                      <button className={`btn ${u.active ? 'btn--danger' : 'btn--success'}`}
                        style={{ fontSize:'0.75rem', padding:'0.3rem 0.75rem' }}
                        onClick={() => handleToggleActive(u)} disabled={u.id === profile?.id}>
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
        .report-table { width:100%; border-collapse:collapse; font-size:0.88rem; }
        .report-table th { text-align:left; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); padding:0.6rem 0.75rem; border-bottom:1px solid var(--border); }
        .report-table td { padding:0.7rem 0.75rem; border-bottom:1px solid #1a1a1a; color:var(--text); }
        .report-table tr:hover td { background:var(--bg-card); }
      `}</style>
    </div>
  )
}
