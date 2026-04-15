import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import './Clientes.css'

const EMPTY_FORM = { name: '', phone: '', email: '', nit: '', address: '', notes: '' }

export default function Clientes({ profile }) {
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // Eliminar
  const [deleteTarget, setDeleteTarget] = useState(null) // cliente a eliminar
  const [deleting, setDeleting]         = useState(false)

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select(`
        *,
        orders(id, order_number, status, total_amount, credit_amount, created_at)
      `)
      .order('name')
    setClients(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  function openEdit(client) {
    setEditing(client)
    setForm({
      name:    client.name    || '',
      phone:   client.phone   || '',
      email:   client.email   || '',
      nit:     client.nit     || '',
      address: client.address || '',
      notes:   client.notes   || '',
    })
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es requerido.'); return }
    setSaving(true)
    setError('')

    const payload = {
      name:    form.name.trim(),
      phone:   form.phone.trim()   || null,
      email:   form.email.trim()   || null,
      nit:     form.nit.trim()     || null,
      address: form.address.trim() || null,
      notes:   form.notes.trim()   || null,
    }

    let err
    if (editing) {
      const res = await supabase.from('clients').update(payload).eq('id', editing.id)
      err = res.error
    } else {
      const res = await supabase.from('clients').insert({ ...payload, created_by: profile.id })
      err = res.error
    }

    if (err) {
      setError('Error al guardar: ' + err.message)
    } else {
      setSuccess(editing ? 'Cliente actualizado.' : 'Cliente creado.')
      closeForm()
      fetchClients()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)

    // 1. Desvincular órdenes (conserva client_name en texto)
    const { error: unlinkErr } = await supabase
      .from('orders')
      .update({ client_id: null })
      .eq('client_id', deleteTarget.id)

    if (unlinkErr) {
      setSuccess('')
      setError('Error al desvincular órdenes: ' + unlinkErr.message)
      setDeleting(false)
      setDeleteTarget(null)
      return
    }

    // 2. Eliminar el cliente
    const { error: deleteErr } = await supabase
      .from('clients')
      .delete()
      .eq('id', deleteTarget.id)

    if (deleteErr) {
      setError('Error al eliminar cliente: ' + deleteErr.message)
    } else {
      setSuccess(`Cliente "${deleteTarget.name}" eliminado. Sus órdenes y créditos se conservan.`)
    }

    setDeleting(false)
    setDeleteTarget(null)
    fetchClients()
  }

  const filtered = clients.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.nit?.includes(search)
  )

  const totalClients  = clients.length
  const totalCredito  = clients.reduce((s, c) =>
    s + (c.orders || []).reduce((os, o) => os + (o.credit_amount || 0), 0), 0)
  const clientsCredit = clients.filter(c =>
    (c.orders || []).some(o => o.credit_amount > 0)).length

  return (
    <div className="page">
      <Navbar profile={profile} />
      <main className="page__content">
        <div className="page-top">
          <h1 className="page__title" style={{ marginBottom: 0 }}>Clientes</h1>
          <button className="btn btn--primary" onClick={openNew}>+ Nuevo Cliente</button>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card__label">Total Clientes</span>
            <span className="stat-card__value">{totalClients}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Con Crédito</span>
            <span className="stat-card__value" style={{ color: '#fbbf24' }}>{clientsCredit}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Crédito Total</span>
            <span className="stat-card__value" style={{ color: '#fbbf24' }}>Q{totalCredito.toFixed(2)}</span>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="filters-row">
          <input
            className="form-input"
            type="text"
            placeholder="Buscar por nombre, teléfono, email o NIT..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>

        {success && <p className="success-text" style={{ marginBottom: '1rem' }}>{success}</p>}

        {/* Modal formulario */}
        {showForm && (
          <div className="modal-overlay" onClick={closeForm}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2 className="modal__title">{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
                <button className="modal__close" onClick={closeForm}>✕</button>
              </div>

              <form onSubmit={handleSave} className="client-form">
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" type="text" required autoFocus
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Nombre completo o empresa" />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" type="tel"
                      value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                      placeholder="5555-1234" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input className="form-input" type="email"
                      value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="cliente@email.com" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">NIT</label>
                    <input className="form-input" type="text"
                      value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })}
                      placeholder="CF o número de NIT" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dirección</label>
                    <input className="form-input" type="text"
                      value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                      placeholder="Dirección fiscal o de entrega" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notas internas</label>
                  <textarea className="form-textarea" rows={2}
                    value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Observaciones del cliente..." />
                </div>

                {error && <p className="error-text">{error}</p>}

                <div className="form-actions">
                  <button type="button" className="btn btn--ghost" onClick={closeForm}>Cancelar</button>
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Cliente'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal confirmar eliminación */}
        {deleteTarget && (
          <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h2 className="modal__title">Eliminar cliente</h2>
                <button className="modal__close" onClick={() => setDeleteTarget(null)} disabled={deleting}>✕</button>
              </div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.88rem', color: 'var(--text)' }}>
                  ¿Estás seguro que deseas eliminar a <strong>{deleteTarget.name}</strong>?
                </p>
                {(deleteTarget.orders?.length > 0) && (
                  <div style={{
                    background: '#fef9ec', border: '1px solid #f59e0b',
                    borderRadius: '7px', padding: '0.75rem 1rem',
                    fontSize: '0.8rem', color: '#92400e'
                  }}>
                    ⚠️ Este cliente tiene <strong>{deleteTarget.orders.length} orden{deleteTarget.orders.length !== 1 ? 'es' : ''}</strong>.
                    Serán desvinculadas del catálogo pero sus datos, pagos y créditos se conservan intactos.
                  </div>
                )}
                {error && <p className="error-text">{error}</p>}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn--ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                    Cancelar
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#ef4444', color: 'white' }}
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista de clientes */}
        {loading ? (
          <div className="loading-screen" style={{ height: '200px' }}>
            <div className="loading-spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No se encontraron clientes.</p>
        ) : (
          <div className="clients-list">
            {filtered.map(client => {
              const orders       = client.orders || []
              const totalOrders  = orders.length
              const creditTotal  = orders.reduce((s, o) => s + (o.credit_amount || 0), 0)
              const isExpanded   = expandedId === client.id

              return (
                <div key={client.id} className={`client-card ${isExpanded ? 'client-card--expanded' : ''}`}>
                  <div className="client-card__main">
                    <div className="client-card__info">
                      <span className="client-card__name">{client.name}</span>
                      <div className="client-card__details">
                        {client.phone   && <span>📞 {client.phone}</span>}
                        {client.email   && <span>✉ {client.email}</span>}
                        {client.nit     && <span>NIT: {client.nit}</span>}
                        {client.address && <span>📍 {client.address}</span>}
                      </div>
                    </div>

                    <div className="client-card__stats">
                      <div className="client-stat">
                        <span className="client-stat__label">Órdenes</span>
                        <span className="client-stat__value">{totalOrders}</span>
                      </div>
                      {creditTotal > 0 && (
                        <div className="client-stat">
                          <span className="client-stat__label">Crédito</span>
                          <span className="client-stat__value" style={{ color: '#fbbf24' }}>
                            Q{creditTotal.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="client-card__actions">
                      {totalOrders > 0 && (
                        <button
                          className="btn btn--ghost"
                          onClick={() => setExpandedId(isExpanded ? null : client.id)}
                        >
                          {isExpanded ? 'Ocultar' : 'Ver órdenes'}
                        </button>
                      )}
                      <button className="btn btn--secondary" onClick={() => openEdit(client)}>
                        Editar
                      </button>
                      <button
                        className="btn"
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}
                        onClick={() => { setError(''); setDeleteTarget(client) }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Órdenes del cliente */}
                  {isExpanded && (
                    <div className="client-card__orders">
                      <table className="orders-mini-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Estado</th>
                            <th>Total</th>
                            <th>Crédito</th>
                            <th>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders
                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                            .map(o => (
                              <tr key={o.id}>
                                <td className="mono accent">#{o.order_number}</td>
                                <td>{o.status}</td>
                                <td className="mono">Q{o.total_amount?.toFixed(2)}</td>
                                <td className="mono" style={{ color: o.credit_amount > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                                  {o.credit_amount > 0 ? `Q${o.credit_amount.toFixed(2)}` : '—'}
                                </td>
                                <td className="muted">
                                  {new Date(o.created_at).toLocaleDateString('es-GT')}
                                </td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
