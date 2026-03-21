import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import './CuentaCorriente.css'

const METHOD_LABELS = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  pos: 'POS', neolink: 'Neolink', credito: 'Crédito',
}

export default function CuentaCorriente({ profile }) {
  const [clients, setClients]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [orders, setOrders]         = useState([])
  const [payments, setPayments]     = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch]         = useState('')

  // Modal pago
  const [showModal, setShowModal]   = useState(false)
  const [targetOrder, setTargetOrder] = useState(null) // null = saldar todo
  const [payAmount, setPayAmount]   = useState('')
  const [payMethod, setPayMethod]   = useState('efectivo')
  const [payNotes, setPayNotes]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    // Traer clientes que tienen crédito pendiente
    const { data: ordersData } = await supabase
      .from('orders')
      .select('client_id, client_name, credit_amount')
      .gt('credit_amount', 0)

    if (!ordersData) { setLoading(false); return }

    // Agrupar por cliente
    const map = {}
    ordersData.forEach(o => {
      const key = o.client_id || o.client_name
      if (!map[key]) {
        map[key] = { client_id: o.client_id, client_name: o.client_name, total_credit: 0, orders_count: 0 }
      }
      map[key].total_credit  += o.credit_amount || 0
      map[key].orders_count  += 1
    })

    // Enriquecer con datos del cliente
    const clientIds = [...new Set(ordersData.filter(o => o.client_id).map(o => o.client_id))]
    let clientsInfo = {}
    if (clientIds.length > 0) {
      const { data: cd } = await supabase
        .from('clients')
        .select('id, name, phone, nit')
        .in('id', clientIds)
      cd?.forEach(c => { clientsInfo[c.id] = c })
    }

    const list = Object.values(map).map(c => ({
      ...c,
      ...(clientsInfo[c.client_id] || {}),
      name: clientsInfo[c.client_id]?.name || c.client_name,
    })).sort((a, b) => b.total_credit - a.total_credit)

    setClients(list)
    setLoading(false)
  }

  async function selectClient(client) {
    setSelected(client)
    setDetailLoading(true)
    setSuccessMsg('')

    // Órdenes con crédito
    const { data: ordData } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('client_id', client.client_id)
      .gt('credit_amount', 0)
      .order('created_at', { ascending: false })

    // Historial de pagos
    const { data: payData } = await supabase
      .from('payments')
      .select('*, profiles(full_name)')
      .in('order_id', (ordData || []).map(o => o.id).concat(['00000000-0000-0000-0000-000000000000']))
      .order('created_at', { ascending: false })

    setOrders(ordData || [])
    setPayments(payData || [])
    setDetailLoading(false)
  }

  function openPayModal(order = null) {
    setTargetOrder(order)
    setPayAmount(order ? order.credit_amount?.toFixed(2) : selected?.total_credit?.toFixed(2))
    setPayMethod('efectivo')
    setPayNotes('')
    setError('')
    setShowModal(true)
  }

  async function handlePay(e) {
    e.preventDefault()
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) { setError('El monto debe ser mayor a 0.'); return }

    const maxAmount = targetOrder
      ? targetOrder.credit_amount
      : selected.total_credit

    if (amount > maxAmount) {
      setError(`El monto no puede superar Q${maxAmount.toFixed(2)}.`); return
    }

    setSaving(true); setError('')

    const ordersToProcess = targetOrder ? [targetOrder] : orders

    // Distribuir el pago entre las órdenes (por fecha, más antigua primero)
    let remaining = amount
    const sorted  = [...ordersToProcess].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    for (const ord of sorted) {
      if (remaining <= 0) break
      const toPay = Math.min(remaining, ord.credit_amount)
      remaining -= toPay

      const newCredit = Math.max(0, ord.credit_amount - toPay)

      // Registrar pago
      await supabase.from('payments').insert({
        order_id:       ord.id,
        amount:         toPay,
        payment_method: payMethod,
        notes:          payNotes.trim() || null,
        created_by:     profile.id,
      })

      // Actualizar crédito en la orden (ya está cerrada, solo actualizar credit_amount)
      const updates = { credit_amount: newCredit }
      await supabase.from('orders').update(updates).eq('id', ord.id)
    }

    setShowModal(false)
    setSuccessMsg(`✓ Pago de Q${amount.toFixed(2)} registrado correctamente.`)
    setSaving(false)

    // Refrescar datos
    await fetchClients()
    // Refrescar detalle
    const updated = clients.find(c => c.client_id === selected.client_id)
    if (updated) await selectClient({ ...selected, total_credit: selected.total_credit - amount })
    else setSelected(null)
  }

  const filtered = clients.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.nit?.includes(search) || c.phone?.includes(search)
  )

  const totalDeuda = clients.reduce((s, c) => s + c.total_credit, 0)

  return (
    <div className="page">
      <Navbar profile={profile} />
      <main className="page__content">
        <h1 className="page__title">Cuenta Corriente</h1>

        {/* Stats */}
        <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-card__label">Clientes con Deuda</span>
            <span className="stat-card__value" style={{ color: '#f87171' }}>{clients.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Deuda Total</span>
            <span className="stat-card__value" style={{ color: '#fbbf24' }}>Q{totalDeuda.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Órdenes Pendientes</span>
            <span className="stat-card__value">{clients.reduce((s, c) => s + c.orders_count, 0)}</span>
          </div>
        </div>

        {successMsg && (
          <p className="success-text" style={{ marginBottom: '1rem' }}>{successMsg}</p>
        )}

        <div className="cc-layout">

          {/* Lista de clientes */}
          <div className="cc-clients">
            <div style={{ marginBottom: '0.75rem' }}>
              <input className="form-input" type="text"
                placeholder="Buscar cliente, NIT o teléfono..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {loading ? (
              <div className="loading-screen" style={{ height: '150px' }}><div className="loading-spinner" /></div>
            ) : filtered.length === 0 ? (
              <p className="empty-state" style={{ fontSize: '0.85rem' }}>Sin clientes con crédito pendiente.</p>
            ) : (
              filtered.map(c => (
                <div key={c.client_id || c.client_name}
                  className={`cc-client-row${selected?.client_id === c.client_id ? ' cc-client-row--active' : ''}`}
                  onClick={() => selectClient(c)}>
                  <div className="cc-client-info">
                    <span className="cc-client-name">{c.name}</span>
                    <span className="cc-client-meta">
                      {c.orders_count} orden{c.orders_count !== 1 ? 'es' : ''} pendiente{c.orders_count !== 1 ? 's' : ''}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </span>
                  </div>
                  <span className="cc-client-debt">Q{c.total_credit.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>

          {/* Detalle del cliente */}
          <div className="cc-detail">
            {!selected ? (
              <div className="cc-empty-detail">
                <span>←</span>
                <p>Selecciona un cliente para ver su cuenta corriente</p>
              </div>
            ) : detailLoading ? (
              <div className="loading-screen" style={{ height: '200px' }}><div className="loading-spinner" /></div>
            ) : (
              <>
                {/* Header del cliente */}
                <div className="cc-detail-header">
                  <div>
                    <h2 className="cc-detail-name">{selected.name}</h2>
                    <div className="cc-detail-meta">
                      {selected.phone && <span>📞 {selected.phone}</span>}
                      {selected.nit   && <span>NIT: {selected.nit}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="cc-total-debt">Q{selected.total_credit?.toFixed(2)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Deuda total</div>
                  </div>
                </div>

                {/* Botón saldar todo */}
                <div style={{ marginBottom: '1rem' }}>
                  <button className="btn btn--primary" style={{ width: '100%' }}
                    onClick={() => openPayModal(null)}>
                    💳 Registrar Pago — Saldar Todo o Parcial
                  </button>
                </div>

                {/* Órdenes con deuda */}
                <h3 className="cc-section-title">Órdenes con crédito</h3>
                <div className="cc-orders">
                  {orders.length === 0 ? (
                    <p className="empty-state" style={{ fontSize: '0.82rem' }}>Sin órdenes pendientes.</p>
                  ) : orders.map(o => (
                    <div key={o.id} className="cc-order-row">
                      <div className="cc-order-info">
                        <span className="cc-order-num">#{o.order_number}</span>
                        <span className="cc-order-date">
                          {new Date(o.created_at).toLocaleDateString('es-GT')}
                        </span>
                        <span className="cc-order-status">{o.status}</span>
                      </div>
                      <div className="cc-order-amounts">
                        <span className="cc-order-total">Total: Q{o.total_amount?.toFixed(2)}</span>
                        <span className="cc-order-debt">Debe: Q{o.credit_amount?.toFixed(2)}</span>
                      </div>
                      <button className="btn btn--secondary"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', flexShrink: 0 }}
                        onClick={() => openPayModal(o)}>
                        Abonar
                      </button>
                    </div>
                  ))}
                </div>

                {/* Historial de pagos */}
                {payments.length > 0 && (
                  <>
                    <h3 className="cc-section-title" style={{ marginTop: '1.25rem' }}>Historial de pagos</h3>
                    <div className="cc-payments">
                      {payments.map(p => (
                        <div key={p.id} className="cc-payment-row">
                          <div className="cc-payment-info">
                            <span className="cc-payment-method">{METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                            {p.notes && <span className="cc-payment-notes">{p.notes}</span>}
                          </div>
                          <div className="cc-payment-right">
                            <span className="cc-payment-amount">+Q{p.amount?.toFixed(2)}</span>
                            <span className="cc-payment-date">
                              {p.profiles?.full_name} · {new Date(p.created_at).toLocaleDateString('es-GT')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Modal de pago */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">
                {targetOrder ? `Abonar a Orden #${targetOrder.order_number}` : `Pago — ${selected?.name}`}
              </h2>
              <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handlePay} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {targetOrder && (
                <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total orden:</span>
                    <span>Q{targetOrder.total_amount?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Crédito pendiente:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>Q{targetOrder.credit_amount?.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {!targetOrder && (
                <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Deuda total del cliente:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>Q{selected?.total_credit?.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    El pago se aplica primero a las órdenes más antiguas.
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Monto a pagar (Q) *
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.72rem' }}>
                    Máx: Q{(targetOrder ? targetOrder.credit_amount : selected?.total_credit)?.toFixed(2)}
                  </span>
                </label>
                <input className="form-input" type="number" min="0.01" step="0.01"
                  required autoFocus value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>

              <div className="form-group">
                <label className="form-label">Método de pago *</label>
                <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="pos">POS</option>
                  <option value="neolink">Neolink</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Nota (opcional)</label>
                <input className="form-input" type="text" value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="Referencia de transferencia, observación, etc." />
              </div>

              {error && <p className="error-text">{error}</p>}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
