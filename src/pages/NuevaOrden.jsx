import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import ClientAutocomplete from '../components/ClientAutocomplete'
import './NuevaOrden.css'

export default function NuevaOrden({ profile }) {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // Cliente
  const [selectedClient, setSelectedClient] = useState(null)
  const [newClientName, setNewClientName]   = useState('')
  const [showClientForm, setShowClientForm] = useState(false)
  const [clientPhone, setClientPhone]       = useState('')
  const [clientEmail, setClientEmail]       = useState('')
  const [clientNit, setClientNit]           = useState('')
  const [clientAddress, setClientAddress]   = useState('')

  const [createdOrder, setCreatedOrder] = useState(null)

  // Orden
  const [notes, setNotes]                       = useState('')
  const [isReposition, setIsReposition]         = useState(false)
  const [parentOrderId, setParentOrderId]       = useState('')
  const [repositionReason, setRepositionReason] = useState('error_impresion')
  const [priority, setPriority] = useState('normal')
  const [deliveryType, setDeliveryType] = useState('local')
  // Pago inicial
  const [paymentType, setPaymentType]     = useState('completo') // completo | parcial | credito
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [partialAmount, setPartialAmount] = useState('')
  const [items, setItems] = useState([
    { product_id: '', product_name: '', unit_price: '', quantity: 1, notes: '' }
  ])

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase
      .from('products').select('*').eq('active', true)
      .order('category').order('name')
    setProducts(data || [])
  }

  function handleClientSelect(client) {
    setSelectedClient(client)
    setNewClientName('')
    setShowClientForm(false)
    setClientPhone(''); setClientEmail(''); setClientNit(''); setClientAddress('')
  }

  function handleClientNew(name) {
    setSelectedClient(null)
    setNewClientName(name)
    setShowClientForm(name.length >= 2)
  }

  function addItem() {
    setItems([...items, { product_id: '', product_name: '', unit_price: '', quantity: 1, notes: '' }])
  }

  function removeItem(index) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index, field, value) {
    const updated = [...items]
    updated[index][field] = value
    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product) {
        updated[index].product_name = product.name
        updated[index].unit_price   = product.base_price
      }
    }
    setItems(updated)
  }

  function calcTotal() {
    return items.reduce((sum, item) =>
      sum + ((parseFloat(item.unit_price) || 0) * (parseFloat(item.quantity) || 0)), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const clientName = selectedClient?.name || newClientName.trim()

    if (!clientName) {
      setError('El nombre del cliente es requerido.')
      setLoading(false); return
    }

    if (items.some(i => !i.product_name || !i.unit_price || !i.quantity)) {
      setError('Completa todos los ítems o elimina los vacíos.')
      setLoading(false); return
    }

    // 1. Resolver client_id
    let clientId = selectedClient?.id || null

    if (!clientId) {
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name: clientName,
          phone:   clientPhone.trim()   || null,
          email:   clientEmail.trim()   || null,
          nit:     clientNit.trim()     || null,
          address: clientAddress.trim() || null,
          created_by: profile.id,
        })
        .select().single()

      if (clientErr) {
        setError('Error al registrar cliente: ' + clientErr.message)
        setLoading(false); return
      }
      clientId = newClient.id
    }

    // 1.5 Si es reposición, buscar el UUID de la orden por número
    let resolvedParentId = null
    if (isReposition && parentOrderId.trim()) {
      const orderNum = parseInt(parentOrderId.trim(), 10)
      if (isNaN(orderNum)) {
        setError('El ID de orden original debe ser un número.')
        setLoading(false); return
      }
      const { data: parentOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNum)
        .single()
      if (!parentOrder) {
        setError('No se encontró la orden #' + orderNum + '. Verifica el número.')
        setLoading(false); return
      }
      resolvedParentId = parentOrder.id
    }

    // 2. Crear orden
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        client_name:       clientName,
        client_id:         clientId,
        notes:             notes.trim() || null,
        status:            'abierta',
        priority:          priority,
        created_by:        profile.id,
        delivery_type:     deliveryType,
        is_reposition:     isReposition,
        parent_order_id:   resolvedParentId,
        reposition_reason: isReposition ? repositionReason : null,
      })
      .select().single()

    if (orderErr) {
      setError('Error al crear la orden: ' + orderErr.message)
      setLoading(false); return
    }

    // 3. Insertar ítems — reposiciones van con precio 0
    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(items.map(item => ({
        order_id:     order.id,
        product_id:   item.product_id || null,
        product_name: item.product_name,
        unit_price:   isReposition ? 0 : parseFloat(item.unit_price),
        quantity:     parseFloat(item.quantity),
        notes:        item.notes || null,
      })))

    if (itemsErr) {
      setError('Error al guardar ítems: ' + itemsErr.message)
      setLoading(false); return
    }

    // 4. Registrar pago inicial si corresponde
    // Las reposiciones no generan cobro ni crédito
    if (isReposition) {
      await supabase.from('orders')
        .update({ total_amount: 0, credit_amount: 0, initial_payment: 0 })
        .eq('id', order.id)
    } else {
    const total = order.total_amount || items.reduce((s, i) =>
      s + (parseFloat(i.unit_price)||0) * (parseFloat(i.quantity)||0), 0)

    let creditAmount = 0
    let paymentAmount = 0

    if (paymentType === 'completo') {
      paymentAmount = total
      creditAmount  = 0
    } else if (paymentType === 'parcial') {
      paymentAmount = parseFloat(partialAmount) || 0
      creditAmount  = Math.max(0, total - paymentAmount)
    } else {
      paymentAmount = 0
      creditAmount  = total
    }

    // Actualizar credit_amount en la orden
    await supabase.from('orders')
      .update({
        credit_amount: creditAmount,
        initial_payment: paymentAmount,
        initial_payment_method: paymentType !== 'credito' ? paymentMethod : null,
      })
      .eq('id', order.id)

    // Insertar pago si hubo abono
    if (paymentAmount > 0) {
      await supabase.from('payments').insert({
        order_id:       order.id,
        amount:         paymentAmount,
        payment_method: paymentMethod,
        notes:          'Pago inicial al crear la orden',
        created_by:     profile.id,
      })
    }
    } // fin bloque pagos (no aplica a reposiciones)

    // Fetch the full order with items for the ticket
    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order.id)
      .single()

    setCreatedOrder({ ...fullOrder, clientData: selectedClient, createdByName: profile.full_name })
    setLoading(false)
  }

  const total       = calcTotal()
  const placas      = products.filter(p => p.category === 'placas')
  const impresiones = products.filter(p => p.category === 'impresiones')

  // ── Pantalla post-creación con ticket ─────────────────────────────────────
  if (createdOrder) {
    const o     = createdOrder
    const items = o.order_items || []
    const PRIORITY_LABEL = { normal: 'Normal', prioritaria: 'PRIORITARIA', urgente: 'URGENTE' }
    const REPOSITION_LABEL = {
      error_impresion: 'Error de impresión',
      placa_ctp_dañada: 'Placa CTP dañada',
      error_produccion: 'Error de producción',
      otro: 'Otro',
    }

    function handlePrint() {
      window.print()
    }

    return (
      <div className="page">
        <Navbar profile={profile} />
        <main className="page__content">

          {/* Acciones (no se imprimen) */}
          <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
            <div>
              <h1 className="page__title" style={{ marginBottom:'0.25rem' }}>
                ✓ Orden #{o.order_number} creada
              </h1>
              <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>
                {new Date(o.created_at).toLocaleString('es-GT')}
              </p>
            </div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn btn--primary" onClick={handlePrint}>
                🖨 Imprimir Ticket
              </button>
              <button className="btn btn--secondary" onClick={() => {
                setCreatedOrder(null)
                setSelectedClient(null)
                setNewClientName('')
                setShowClientForm(false)
                setClientPhone(''); setClientEmail(''); setClientNit(''); setClientAddress('')
                setNotes('')
                setPriority('normal')
                setIsReposition(false)
                setParentOrderId('')
                setItems([{ product_id: '', product_name: '', unit_price: '', quantity: 1, notes: '' }])
                setDeliveryType('local')
                setPaymentType('completo')
                setPaymentMethod('efectivo')
                setPartialAmount('')
                setError(''); setSuccess('')
              }}>
                + Nueva Orden
              </button>
              <button className="btn btn--ghost" onClick={() => navigate('/mis-ordenes')}>
                Ver Órdenes
              </button>
            </div>
          </div>

          {/* TICKET IMPRIMIBLE */}
          <div className="ticket" id="ticket-print">

            <div className="ticket__header">
              <div className="ticket__logo">/// AVANZA</div>
              <div className="ticket__order-num">#{o.order_number}</div>
            </div>

            <div className="ticket__meta">
              <div className="ticket__meta-row">
                <span className="ticket__label">Fecha:</span>
                <span>{new Date(o.created_at).toLocaleString('es-GT')}</span>
              </div>
              <div className="ticket__meta-row">
                <span className="ticket__label">Elaboró:</span>
                <span>{o.createdByName || '—'}</span>
              </div>
              <div className="ticket__meta-row">
                <span className="ticket__label">Prioridad:</span>
                <span style={{ fontWeight: 700, color: o.priority === 'urgente' ? '#dc2626' : o.priority === 'prioritaria' ? '#d97706' : 'inherit' }}>
                  {PRIORITY_LABEL[o.priority] || 'Normal'}
                </span>
              </div>
              <div className="ticket__meta-row">
                <span className="ticket__label">Entrega:</span>
                <span style={{ fontWeight: 700 }}>
                  {o.delivery_type === 'delivery' ? '🛵 Delivery' : '🏠 En local'}
                </span>
              </div>
              {o.is_reposition && (
                <div className="ticket__meta-row">
                  <span className="ticket__label">Reposición:</span>
                  <span>{REPOSITION_LABEL[o.reposition_reason] || 'Sí'}</span>
                </div>
              )}
            </div>

            <div className="ticket__divider" />

            <div className="ticket__section">
              <div className="ticket__section-title">Cliente</div>
              <div className="ticket__client-name">{o.client_name}</div>
              {o.clientData?.phone   && <div className="ticket__client-detail">Tel: {o.clientData.phone}</div>}
              {o.clientData?.nit     && <div className="ticket__client-detail">NIT: {o.clientData.nit}</div>}
              {o.clientData?.address && <div className="ticket__client-detail">Dir: {o.clientData.address}</div>}
            </div>

            <div className="ticket__divider" />

            <div className="ticket__section">
              <div className="ticket__section-title">Productos</div>
              <table className="ticket__items-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>P.Unit</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
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
                {o.is_reposition ? 'Q0.00 — Reposición' : `Q${o.total_amount?.toFixed(2)}`}
              </span>
            </div>

            {o.notes && (
              <>
                <div className="ticket__divider" />
                <div className="ticket__section">
                  <div className="ticket__section-title">Notas</div>
                  <p className="ticket__notes">{o.notes}</p>
                </div>
              </>
            )}

            <div className="ticket__footer">
              Estado: ABIERTA — Gracias por su preferencia
            </div>
          </div>

        </main>
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <Navbar profile={profile} />
      <main className="page__content">
        <h1 className="page__title">Nueva Orden</h1>
        <form onSubmit={handleSubmit} className="nueva-orden-form">

          {/* CLIENTE */}
          <section className="form-section">
            <h2 className="form-section__title">Cliente</h2>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Buscar o crear cliente *</label>
                <ClientAutocomplete onSelect={handleClientSelect} onNew={handleClientNew} />
              </div>
              <div className="form-group">
                <label className="form-label">Notas generales</label>
                <input className="form-input" type="text" value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Instrucciones especiales..." />
              </div>
            </div>

            {/* Datos de cliente existente (solo lectura) */}
            {selectedClient && (
              <div className="existing-client-data">
                <p className="new-client-form__label"><span>✓</span> Datos del cliente</p>
                <div className="form-row form-row--3">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" type="tel" readOnly
                      value={selectedClient.phone || ''} placeholder="Sin teléfono" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input className="form-input" type="email" readOnly
                      value={selectedClient.email || ''} placeholder="Sin correo" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NIT</label>
                    <input className="form-input" type="text" readOnly
                      value={selectedClient.nit || ''} placeholder="Sin NIT" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" type="text" readOnly
                    value={selectedClient.address || ''} placeholder="Sin dirección" />
                </div>
              </div>
            )}

            {/* Formulario para cliente nuevo */}
            {showClientForm && !selectedClient && (
              <div className="new-client-form">
                <p className="new-client-form__label"><span>+</span> Datos adicionales del nuevo cliente (opcionales)</p>
                <div className="form-row form-row--3">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" type="tel" value={clientPhone}
                      onChange={e => setClientPhone(e.target.value)} placeholder="5555-1234" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input className="form-input" type="email" value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)} placeholder="cliente@email.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NIT</label>
                    <input className="form-input" type="text" value={clientNit}
                      onChange={e => setClientNit(e.target.value)} placeholder="CF o número de NIT" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" type="text" value={clientAddress}
                    onChange={e => setClientAddress(e.target.value)} placeholder="Dirección de entrega o fiscal" />
                </div>
              </div>
            )}
          </section>

          {/* REPOSICIÓN */}
          <section className="form-section">
            <div className="reposition-toggle">
              <label className="toggle-label">
                <input type="checkbox" checked={isReposition} onChange={e => setIsReposition(e.target.checked)} />
                <span>Esta es una reposición</span>
              </label>
            </div>
            {isReposition && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ID de la orden original *</label>
                  <input className="form-input" type="number" min="1" value={parentOrderId}
                    onChange={e => setParentOrderId(e.target.value)} placeholder="Ej: 42" />
                </div>
                <div className="form-group">
                  <label className="form-label">Razón de reposición</label>
                  <select className="form-select" value={repositionReason} onChange={e => setRepositionReason(e.target.value)}>
                    <option value="error_impresion">Error de impresión</option>
                    <option value="placa_ctp_dañada">Placa CTP dañada</option>
                    <option value="error_produccion">Error de producción</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            )}
          </section>

          {/* PRIORIDAD */}
          <section className="form-section">
            <h2 className="form-section__title">Prioridad</h2>
            <div className="priority-selector">
              {[
                { value: 'normal',      label: 'Normal',      color: '#6b7280' },
                { value: 'prioritaria', label: 'Prioritaria', color: '#f59e0b' },
                { value: 'urgente',     label: 'Urgente',     color: '#ef4444' },
              ].map(opt => (
                <label key={opt.value} className={`priority-option${priority === opt.value ? ' priority-option--active' : ''}`}
                  style={{ '--p-color': opt.color }}>
                  <input type="radio" name="priority" value={opt.value}
                    checked={priority === opt.value} onChange={() => setPriority(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </section>

          {/* TIPO DE ENTREGA */}
          <section className="form-section">
            <h2 className="form-section__title">Tipo de entrega</h2>
            <div className="payment-type-selector">
              {[
                { value: 'local',    label: '🏠 Entrega en local', color: '#60a5fa' },
                { value: 'delivery', label: '🛵 Delivery',          color: '#f59e0b' },
              ].map(opt => (
                <label key={opt.value}
                  className={`priority-option${deliveryType === opt.value ? ' priority-option--active' : ''}`}
                  style={{ '--p-color': opt.color }}>
                  <input type="radio" name="deliveryType" value={opt.value}
                    checked={deliveryType === opt.value}
                    onChange={() => setDeliveryType(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </section>

          {/* ÍTEMS */}
          <section className="form-section">
            <div className="form-section__header">
              <h2 className="form-section__title">Productos</h2>
              <button type="button" className="btn btn--secondary" onClick={addItem}>+ Agregar ítem</button>
            </div>
            <div className="items-list">
              {items.map((item, index) => (
                <div key={index} className="item-row">
                  <div className="form-group item-product">
                    <label className="form-label">Producto</label>
                    <select className="form-select" value={item.product_id}
                      onChange={e => updateItem(index, 'product_id', e.target.value)}>
                      <option value="">— Seleccionar o escribir —</option>
                      <optgroup label="Placas CTP">
                        {placas.map(p => <option key={p.id} value={p.id}>{p.name} — Q{p.base_price}</option>)}
                      </optgroup>
                      <optgroup label="Impresiones">
                        {impresiones.map(p => <option key={p.id} value={p.id}>{p.name} — Q{p.base_price} / {p.unit_label}</option>)}
                      </optgroup>
                    </select>
                    {!item.product_id && (
                      <input className="form-input" style={{ marginTop: '4px' }} type="text"
                        value={item.product_name}
                        onChange={e => updateItem(index, 'product_name', e.target.value)}
                        placeholder="O escribe un producto personalizado" />
                    )}
                  </div>
                  <div className="form-group item-price">
                    <label className="form-label">Precio unit. (Q)</label>
                    <input className="form-input" type="number" step="0.01" min="0"
                      value={item.unit_price} onChange={e => updateItem(index, 'unit_price', e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="form-group item-qty">
                    <label className="form-label">Cantidad</label>
                    <input className="form-input" type="number" step="0.01" min="0.01"
                      value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} />
                  </div>
                  <div className="form-group item-subtotal">
                    <label className="form-label">Subtotal</label>
                    <span className="subtotal-display">
                      Q{((parseFloat(item.unit_price)||0) * (parseFloat(item.quantity)||0)).toFixed(2)}
                    </span>
                  </div>
                  <button type="button" className="btn btn--danger item-remove"
                    onClick={() => removeItem(index)} disabled={items.length === 1} title="Eliminar ítem">✕</button>
                </div>
              ))}
            </div>
            <div className="total-row">
              <span className="total-label">TOTAL</span>
              <span className="total-amount" style={isReposition ? { color: '#4ade80' } : {}}>
                {isReposition ? 'Q0.00 (reposición)' : `Q${total.toFixed(2)}`}
              </span>
            </div>
          </section>

          {/* PAGO INICIAL — no aplica a reposiciones */}
          {!isReposition && <section className="form-section">
            <h2 className="form-section__title">Pago al crear la orden</h2>
            <div className="payment-type-selector">
              {[
                { value: 'completo', label: '✓ Pago completo',  color: '#4ade80' },
                { value: 'parcial',  label: '◑ Pago parcial',   color: '#fbbf24' },
                { value: 'credito',  label: '○ Todo a crédito', color: '#f87171' },
              ].map(opt => (
                <label key={opt.value}
                  className={`priority-option${paymentType === opt.value ? ' priority-option--active' : ''}`}
                  style={{ '--p-color': opt.color }}>
                  <input type="radio" name="paymentType" value={opt.value}
                    checked={paymentType === opt.value}
                    onChange={() => setPaymentType(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>

            {paymentType !== 'credito' && (
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Método de pago</label>
                  <select className="form-select" value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="pos">POS</option>
                    <option value="neolink">Neolink</option>
                  </select>
                </div>
                {paymentType === 'parcial' && (
                  <div className="form-group">
                    <label className="form-label">Monto abonado (Q)</label>
                    <input className="form-input" type="number" min="0" step="0.01"
                      value={partialAmount}
                      onChange={e => setPartialAmount(e.target.value)}
                      placeholder="0.00" />
                    {partialAmount && total > 0 && (
                      <span style={{ fontSize:'0.75rem', color:'#fbbf24', marginTop:'4px', display:'block' }}>
                        Crédito pendiente: Q{Math.max(0, total - parseFloat(partialAmount || 0)).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {paymentType === 'credito' && (
              <p style={{ fontSize:'0.78rem', color:'#f87171', marginTop:'0.75rem' }}>
                ⚠ La orden queda con Q{total.toFixed(2)} pendiente de cobro.
              </p>
            )}
          </section>}

          {/* Aviso cuando es reposición */}
          {isReposition && (
            <div style={{
              background: '#0a1a0a', border: '1px solid #166534',
              borderRadius: '8px', padding: '0.85rem 1rem',
              fontSize: '0.82rem', color: '#4ade80'
            }}>
              ✓ Esta es una reposición — no genera cobro ni crédito. Total: <strong>Q0.00</strong>
            </div>
          )}

          {error   && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/mis-ordenes')}>Cancelar</button>
            <button type="submit" className="btn btn--primary btn--lg" disabled={loading}>
              {loading ? 'Guardando...' : 'Crear Orden'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
