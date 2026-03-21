import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import OrderCard from '../components/OrderCard'

const EDITABLE_STATUSES = ['abierta', 'en_proceso', 'lista', 'en_envio']

export default function MisOrdenes({ profile }) {
  const [orders, setOrders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modal edición
  const [editOrder, setEditOrder]   = useState(null)
  const [editItems, setEditItems]   = useState([])
  const [editNotes, setEditNotes]   = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editClientName, setEditClientName] = useState('')
  const [products, setProducts]     = useState([])
  const [saving, setSaving]         = useState(false)
  const [savedOrder, setSavedOrder]   = useState(null)
  const [editError, setEditError]   = useState('')

  useEffect(() => {
    fetchOrders()
    fetchProducts()
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data || [])
  }

  async function handleStatusChange(orderId, newStatus) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    fetchOrders()
  }

  // ── Abrir modal de edición ──────────────────────────────────
  function handleEdit(order) {
    setEditOrder(order)
    setEditClientName(order.client_name || '')
    setEditNotes(order.notes || '')
    setEditPriority(order.priority || 'normal')
    setEditItems(order.order_items?.map(i => ({
      id:           i.id,
      product_id:   i.product_id || '',
      product_name: i.product_name,
      unit_price:   i.unit_price,
      quantity:     i.quantity,
      notes:        i.notes || '',
    })) || [])
    setEditError('')
  }

  function closeEdit() { setEditOrder(null); setSavedOrder(null) }

  // ── Manejo de ítems del modal ───────────────────────────────
  function updateItem(index, field, value) {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, [field]: value }
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) {
          updated.product_name = prod.name
          updated.unit_price   = prod.price
        }
      }
      return updated
    }))
  }

  function addItem() {
    setEditItems(prev => [...prev, { product_id: '', product_name: '', unit_price: '', quantity: 1, notes: '' }])
  }

  function removeItem(index) {
    if (editItems.length === 1) return
    setEditItems(prev => prev.filter((_, i) => i !== index))
  }

  const editTotal = editItems.reduce((s, i) =>
    s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity, 10) || 0), 0)

  // ── Guardar cambios ─────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    if (!editClientName.trim()) { setEditError('El nombre del cliente es requerido.'); return }
    if (editItems.some(i => !i.product_name || !i.unit_price || !i.quantity)) {
      setEditError('Completa todos los ítems.'); return
    }

    setSaving(true); setEditError('')

    // Actualizar orden
    const { error: orderErr } = await supabase.from('orders')
      .update({
        client_name: editClientName.trim(),
        notes:       editNotes.trim() || null,
        priority:    editPriority,
      })
      .eq('id', editOrder.id)

    if (orderErr) { setEditError('Error al guardar: ' + orderErr.message); setSaving(false); return }

    // Borrar ítems existentes y reinsertar
    await supabase.from('order_items').delete().eq('order_id', editOrder.id)
    const { error: itemsErr } = await supabase.from('order_items').insert(
      editItems.map(item => ({
        order_id:     editOrder.id,
        product_id:   item.product_id || null,
        product_name: item.product_name,
        unit_price:   parseFloat(item.unit_price),
        quantity:     parseInt(item.quantity, 10),  // ← entero
        notes:        item.notes || null,
      }))
    )

    if (itemsErr) { setEditError('Error al guardar ítems: ' + itemsErr.message); setSaving(false); return }

    // Cargar orden actualizada con ítems para el ticket
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', editOrder.id)
      .single()

    setSaving(false)
    setSavedOrder(updatedOrder)
    fetchOrders()
  }

  // ── Filtros ─────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.client_name.toLowerCase().includes(search.toLowerCase()) ||
      String(o.order_number).includes(search)
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total:      orders.length,
    abiertas:   orders.filter(o => o.status === 'abierta').length,
    en_proceso: orders.filter(o => o.status === 'en_proceso').length,
    listas:     orders.filter(o => o.status === 'lista').length,
    credito:    orders.filter(o => o.status === 'entregado_pendiente').length,
  }

  const canEdit = ['designer', 'admin', 'owner'].includes(profile?.role)

  return (
    <div className="page">
      <Navbar profile={profile} />

      <main className="page__content">
        <h1 className="page__title">Órdenes</h1>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card__label">Total</span>
            <span className="stat-card__value">{stats.total}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Abiertas</span>
            <span className="stat-card__value" style={{color:'#60a5fa'}}>{stats.abiertas}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">En Proceso</span>
            <span className="stat-card__value" style={{color:'#fb923c'}}>{stats.en_proceso}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Listas</span>
            <span className="stat-card__value" style={{color:'#4ade80'}}>{stats.listas}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Crédito</span>
            <span className="stat-card__value" style={{color:'#fbbf24'}}>{stats.credito}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="filters-row">
          <input className="form-input" type="text"
            placeholder="Buscar cliente o # de orden..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="abierta">Abierta</option>
            <option value="en_proceso">En Proceso</option>
            <option value="lista">Lista</option>
            <option value="en_envio">En Envío</option>
            <option value="entregado_pagado">Entregado / Pagado</option>
            <option value="entregado_pendiente">Entregado / Pendiente</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>

        {/* Grid de órdenes */}
        {loading ? (
          <div className="loading-screen" style={{height:'200px'}}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="orders-grid">
            {filtered.length === 0
              ? <p className="empty-state">No se encontraron órdenes.</p>
              : filtered.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    userRole={profile?.role}
                    onStatusChange={handleStatusChange}
                    onEdit={canEdit ? handleEdit : null}
                    context="orders"
                    allowedRoles={{ edit: ['designer', 'admin', 'owner'] }}
                  />
                ))
            }
          </div>
        )}
      </main>

      {/* ── MODAL DE EDICIÓN ─────────────────────────────────── */}
      {editOrder && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" style={{ maxWidth: '700px', width: '95vw' }}
            onClick={e => e.stopPropagation()}>

            <div className="modal__header">
              <h2 className="modal__title">
                Editar Orden #{editOrder.order_number}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.75rem', fontWeight: 400 }}>
                  {editOrder.status}
                </span>
              </h2>
              <button className="modal__close" onClick={closeEdit}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '75vh', overflowY: 'auto' }}>

              {/* Cliente y prioridad */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cliente *</label>
                  <input className="form-input" type="text" required
                    value={editClientName} onChange={e => setEditClientName(e.target.value)} />
                </div>
                <div className="form-group" style={{ maxWidth: '180px' }}>
                  <label className="form-label">Prioridad</label>
                  <select className="form-select" value={editPriority}
                    onChange={e => setEditPriority(e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="prioritaria">Prioritaria</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>

              {/* Ítems */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Productos</label>
                  <button type="button" className="btn btn--secondary"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                    onClick={addItem}>+ Agregar ítem</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {editItems.map((item, index) => (
                    <div key={index} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="form-row" style={{ gap: '0.5rem' }}>
                        <div className="form-group" style={{ flex: 2 }}>
                          <label className="form-label" style={{ fontSize: '0.7rem' }}>Producto</label>
                          <select className="form-select" value={item.product_id}
                            onChange={e => updateItem(index, 'product_id', e.target.value)}>
                            <option value="">— Personalizado —</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        {!item.product_id && (
                          <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Nombre</label>
                            <input className="form-input" type="text"
                              value={item.product_name}
                              onChange={e => updateItem(index, 'product_name', e.target.value)}
                              placeholder="Descripción del producto" />
                          </div>
                        )}
                        <div className="form-group" style={{ maxWidth: '90px' }}>
                          <label className="form-label" style={{ fontSize: '0.7rem' }}>Precio Q</label>
                          <input className="form-input" type="number" min="0" step="0.01"
                            value={item.unit_price}
                            onChange={e => updateItem(index, 'unit_price', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ maxWidth: '80px' }}>
                          <label className="form-label" style={{ fontSize: '0.7rem' }}>Cant.</label>
                          <input className="form-input" type="number" min="1" step="1"
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', e.target.value)} />
                        </div>
                        <button type="button"
                          style={{ alignSelf: 'flex-end', marginBottom: '0', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0.4rem' }}
                          onClick={() => removeItem(index)}
                          disabled={editItems.length === 1}>✕</button>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Nota del ítem (opcional)</label>
                        <input className="form-input" type="text"
                          value={item.notes}
                          onChange={e => updateItem(index, 'notes', e.target.value)}
                          placeholder="Observación específica..." />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nombre de archivo */}
              <div className="form-group">
                <label className="form-label">Nombre de archivo</label>
                <textarea className="form-input" rows={2}
                  value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  placeholder="Ej: diseño_cliente_v2.pdf" />
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)' }}>
                  Q{editTotal.toFixed(2)}
                </span>
              </div>

              {editError && <p className="error-text">{editError}</p>}

              {savedOrder ? (
                /* ── Vista post-guardado con ticket ── */
                <div>
                  <p style={{ color: '#4ade80', fontWeight: 600, marginBottom: '1rem' }}>
                    ✓ Orden #{savedOrder.order_number} actualizada correctamente
                  </p>

                  {/* Ticket imprimible */}
                  <div className="ticket" id="ticket-print" style={{ background: '#fff', color: '#000', padding: '1rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                    <div className="ticket__header">
                      <div className="ticket__logo">/// AVANZA</div>
                      <div className="ticket__order-num">#{savedOrder.order_number}</div>
                    </div>
                    <div className="ticket__meta">
                      <div className="ticket__meta-row">
                        <span className="ticket__label">Fecha:</span>
                        <span>{new Date(savedOrder.created_at).toLocaleString('es-GT')}</span>
                      </div>
                      <div className="ticket__meta-row">
                        <span className="ticket__label">Cliente:</span>
                        <span style={{ fontWeight: 700 }}>{savedOrder.client_name}</span>
                      </div>
                      <div className="ticket__meta-row">
                        <span className="ticket__label">Prioridad:</span>
                        <span style={{ fontWeight: 700, color: savedOrder.priority === 'urgente' ? '#dc2626' : savedOrder.priority === 'prioritaria' ? '#d97706' : 'inherit' }}>
                          {{ normal: 'Normal', prioritaria: 'PRIORITARIA', urgente: 'URGENTE' }[savedOrder.priority] || 'Normal'}
                        </span>
                      </div>
                      <div className="ticket__meta-row">
                        <span className="ticket__label">Entrega:</span>
                        <span style={{ fontWeight: 700 }}>
                          {savedOrder.delivery_type === 'delivery' ? '🛵 Delivery' : '🏠 En local'}
                        </span>
                      </div>
                    </div>
                    <div className="ticket__divider" />
                    <div className="ticket__section">
                      <div className="ticket__section-title">Productos</div>
                      <table className="ticket__items-table">
                        <thead>
                          <tr><th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th></tr>
                        </thead>
                        <tbody>
                          {(savedOrder.order_items || []).map((item, i) => (
                            <tr key={i}>
                              <td>{item.product_name}</td>
                              <td>{item.quantity}</td>
                              <td>Q{parseFloat(item.unit_price).toFixed(2)}</td>
                              <td>Q{(item.quantity * item.unit_price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="ticket__divider" />
                    <div className="ticket__total-row">
                      <span className="ticket__total-label">TOTAL</span>
                      <span className="ticket__total-amount">
                        {savedOrder.is_reposition ? 'Q0.00 — Reposición' : `Q${savedOrder.total_amount?.toFixed(2)}`}
                      </span>
                    </div>
                    {savedOrder.notes && (
                      <>
                        <div className="ticket__divider" />
                        <div className="ticket__section">
                          <div className="ticket__section-title">Nombre de archivo</div>
                          <p className="ticket__notes">{savedOrder.notes}</p>
                        </div>
                      </>
                    )}
                    <div className="ticket__footer">
                      Estado: {savedOrder.status?.toUpperCase()} — Gracias por su preferencia
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="button" className="btn btn--ghost" onClick={closeEdit}>Cerrar</button>
                    <button type="button" className="btn btn--primary" onClick={() => window.print()}>
                      🖨 Imprimir Ticket
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn--ghost" onClick={closeEdit}>Cancelar</button>
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
