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

  // Orden
  const [notes, setNotes]                       = useState('')
  const [isReposition, setIsReposition]         = useState(false)
  const [parentOrderId, setParentOrderId]       = useState('')
  const [repositionReason, setRepositionReason] = useState('error_impresion')
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

    // 2. Crear orden
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        client_name:       clientName,
        client_id:         clientId,
        notes:             notes.trim() || null,
        status:            'abierta',
        created_by:        profile.id,
        is_reposition:     isReposition,
        parent_order_id:   isReposition && parentOrderId ? parentOrderId : null,
        reposition_reason: isReposition ? repositionReason : null,
      })
      .select().single()

    if (orderErr) {
      setError('Error al crear la orden: ' + orderErr.message)
      setLoading(false); return
    }

    // 3. Insertar ítems
    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(items.map(item => ({
        order_id:     order.id,
        product_id:   item.product_id || null,
        product_name: item.product_name,
        unit_price:   parseFloat(item.unit_price),
        quantity:     parseFloat(item.quantity),
        notes:        item.notes || null,
      })))

    if (itemsErr) {
      setError('Error al guardar ítems: ' + itemsErr.message)
      setLoading(false); return
    }

    setSuccess(`Orden #${order.order_number} creada exitosamente.`)
    setLoading(false)
    setTimeout(() => navigate('/mis-ordenes'), 1500)
  }

  const total       = calcTotal()
  const placas      = products.filter(p => p.category === 'placas')
  const impresiones = products.filter(p => p.category === 'impresiones')

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
                  <label className="form-label">Número de orden original</label>
                  <input className="form-input" type="text" value={parentOrderId}
                    onChange={e => setParentOrderId(e.target.value)} placeholder="UUID de la orden original" />
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
              <span className="total-amount">Q{total.toFixed(2)}</span>
            </div>
          </section>

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
