import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import ClientAutocomplete from '../components/ClientAutocomplete'
import './NuevaOrden.css'

const PAYMENT_METHODS = [
  { value: 'efectivo',      label: '💵 Efectivo' },
  { value: 'pos',           label: '💳 POS / Tarjeta' },
  { value: 'transferencia', label: '📲 Transferencia' },
]

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
  const [clientAddressAlt, setClientAddressAlt] = useState('')

  // Dirección alternativa para esta orden (campo libre, no toca datos del cliente)
  const [useAltAddress, setUseAltAddress]         = useState(false)
  const [altDeliveryAddress, setAltDeliveryAddress] = useState('')

  const [createdOrder, setCreatedOrder] = useState(null)

  // Orden
  const [notes, setNotes]                       = useState('')
  const [deliveryNotes, setDeliveryNotes]       = useState('')
  const [isReposition, setIsReposition]         = useState(false)
  const [parentOrderId, setParentOrderId]       = useState('')
  const [repositionReason, setRepositionReason] = useState('error_impresion')
  const [priority, setPriority]                 = useState('normal')
  const [deliveryType, setDeliveryType]         = useState('local')
  const [items, setItems] = useState([
    { product_id: '', product_name: '', unit_price: '', quantity: 1, notes: '' }
  ])

  // Pago inicial
  const [hasInitialPayment, setHasInitialPayment]       = useState(false)
  const [initialPaymentAmount, setInitialPaymentAmount] = useState('')
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('efectivo')

  useEffect(() => { fetchProducts() }, [])

  // Resetear dirección alternativa al cambiar tipo de entrega
  useEffect(() => {
    if (deliveryType === 'local') {
      setUseAltAddress(false)
      setAltDeliveryAddress('')
    }
  }, [deliveryType])

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
    setClientPhone(''); setClientEmail(''); setClientNit('')
    setClientAddress(''); setClientAddressAlt('')
    setUseAltAddress(false); setAltDeliveryAddress('')
  }

  function handleClientNew(name) {
    setSelectedClient(null)
    setNewClientName(name)
    setShowClientForm(name.length >= 2)
    setUseAltAddress(false); setAltDeliveryAddress('')
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
      sum + ((parseFloat(item.unit_price) || 0) * (parseInt(item.quantity, 10) || 0)), 0)
  }

  // Dirección efectiva para la orden: solo si se habilitó el checkbox
  function getEffectiveDeliveryAddress() {
    if (useAltAddress && altDeliveryAddress.trim()) return altDeliveryAddress.trim()
    return null
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

    const parsedInitialPayment = parseFloat(initialPaymentAmount) || 0
    if (hasInitialPayment && parsedInitialPayment <= 0) {
      setError('El monto del pago inicial debe ser mayor a Q0.')
      setLoading(false); return
    }

    // 1. Resolver client_id
    let clientId = selectedClient?.id || null

    if (!clientId) {
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name:        clientName,
          phone:       clientPhone.trim()      || null,
          email:       clientEmail.trim()      || null,
          nit:         clientNit.trim()        || null,
          address:     clientAddress.trim()    || null,
          address_alt: clientAddressAlt.trim() || null,
          created_by:  profile.id,
        })
        .select().single()

      if (clientErr) {
        setError('Error al registrar cliente: ' + clientErr.message)
        setLoading(false); return
      }
      clientId = newClient.id
    }

    // 1.5 Si es reposición, buscar UUID de la orden padre
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

    const effectiveDeliveryAddress = getEffectiveDeliveryAddress()

    // 2. Crear orden
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        client_name:       clientName,
        client_id:         clientId,
        notes:             notes.trim()         || null,
        delivery_notes:    deliveryNotes.trim()  || null,
        delivery_address:  effectiveDeliveryAddress,
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

    // 3. Insertar ítems
    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(items.map(item => ({
        order_id:     order.id,
        product_id:   item.product_id || null,
        product_name: item.product_name,
        unit_price:   isReposition ? 0 : parseFloat(item.unit_price),
        quantity:     parseInt(item.quantity, 10),
        notes:        item.notes || null,
      })))

    if (itemsErr) {
      setError('Error al guardar ítems: ' + itemsErr.message)
      setLoading(false); return
    }

    // 4. Calcular montos y registrar pago inicial
    if (isReposition) {
      await supabase.from('orders')
        .update({ total_amount: 0, credit_amount: 0, initial_payment: 0 })
        .eq('id', order.id)
    } else {
      const orderTotal = order.total_amount || calcTotal()
      const ipAmount   = hasInitialPayment ? parsedInitialPayment : 0
      const credit     = orderTotal - ipAmount

      await supabase.from('orders')
        .update({
          credit_amount:          credit,
          initial_payment:        ipAmount,
          initial_payment_method: hasInitialPayment ? initialPaymentMethod : null,
        })
        .eq('id', order.id)

      if (hasInitialPayment && ipAmount > 0) {
        await supabase.from('payments').insert({
          order_id:       order.id,
          amount:         ipAmount,
          payment_method: initialPaymentMethod,
          notes:          'Pago inicial al crear orden',
          created_by:     profile.id,
        })
      }
    }

    // 5. Fetch orden completa para el ticket
    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order.id)
      .single()

    setCreatedOrder({
      ...fullOrder,
      clientData:       selectedClient,
      createdByName:    profile.full_name,
      deliveryAddress: effectiveDeliveryAddress,
      paidNow:          hasInitialPayment ? parsedInitialPayment : 0,
      paymentMethodNow: hasInitialPayment ? initialPaymentMethod : null,
    })
    setLoading(false)
  }

  const total       = calcTotal()
  const placas      = products.filter(p => p.category === 'placas')
  const impresiones = products.filter(p => p.category === 'impresiones')
  const parsedIP    = parseFloat(initialPaymentAmount) || 0
  const remaining   = Math.max(0, total - parsedIP)

  // ── Imprimir via iframe invisible ─────────────────────────────────────────
  function printTicket(o, orderItems) {
    const PRIO_COLOR = { normal:'#000', prioritaria:'#92400e', urgente:'#b91c1c' }
    const PRIO_LABEL = { normal:'Normal', prioritaria:'PRIORITARIA', urgente:'URGENTE' }
    const REPO_LABEL = {
      error_impresion:'Error de impresión', placa_ctp_dañada:'Placa CTP dañada',
      error_produccion:'Error de producción', otro:'Otro',
    }
    const METHOD_LABEL = { efectivo:'Efectivo', pos:'POS/Tarjeta', transferencia:'Transferencia' }

    const rows = orderItems.map(item =>
      '<tr><td>' + item.product_name + '</td><td>' + item.quantity + '</td><td>Q' +
      parseFloat(item.unit_price).toFixed(2) + '</td><td>Q' +
      (item.quantity * item.unit_price).toFixed(2) + '</td></tr>'
    ).join('')

    const clientExtra = [
      o.clientData?.phone   ? 'Tel: ' + o.clientData.phone   : '',
      o.clientData?.nit     ? 'NIT: ' + o.clientData.nit     : '',
      o.deliveryAddress     ? 'Dir: ' + o.deliveryAddress     : (o.clientData?.address ? 'Dir: ' + o.clientData.address : ''),
    ].filter(Boolean).map(t => '<div class="det">' + t + '</div>').join('')

    const notesBlock = o.notes
      ? '<div class="div"></div><div class="sec"><div class="sec-t">Nombre de archivo</div><div class="notes">' + o.notes + '</div></div>'
      : ''

    const deliveryNotesBlock = o.delivery_notes
      ? '<div class="div"></div><div class="sec"><div class="sec-t">Observaciones</div><div class="notes">' + o.delivery_notes + '</div></div>'
      : ''

    const repoBlock = o.is_reposition
      ? '<div class="row"><span class="lbl">Reposición:</span><span>' + (REPO_LABEL[o.reposition_reason] || 'Sí') + '</span></div>'
      : ''

    const totalStr = o.is_reposition
      ? 'Q0.00 — Reposición'
      : 'Q' + parseFloat(o.total_amount || 0).toFixed(2)

    const paidNow = o.paidNow || 0
    const pagoBlock = (!o.is_reposition && paidNow > 0)
      ? '<div class="div"></div>' +
        '<div class="trow" style="font-size:10pt"><span>Pagado (' + (METHOD_LABEL[o.paymentMethodNow] || o.paymentMethodNow) + ')</span><span style="color:#166534">- Q' + paidNow.toFixed(2) + '</span></div>' +
        '<div class="trow"><span style="font-weight:900">SALDO PENDIENTE</span><span class="tamt" style="color:#b91c1c">Q' + (parseFloat(o.total_amount) - paidNow).toFixed(2) + '</span></div>'
      : ''

    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
      '<title>Ticket #' + o.order_number + '</title>' +
      '<style>' +
      '@page{size:80mm auto;margin:0}' +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'body{width:80mm;padding:4mm 6mm;font-family:"Courier New",Courier,monospace;font-size:11pt;font-weight:700;color:#000;background:#fff;-webkit-print-color-adjust:exact}' +
      '.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:3mm}' +
      '.logo{font-size:14pt;font-weight:900;letter-spacing:0.05em}' +
      '.num{font-size:18pt;font-weight:900}' +
      '.meta{display:flex;flex-direction:column;gap:1mm;margin-bottom:3mm}' +
      '.row{display:flex;gap:2mm}.lbl{font-weight:900;min-width:22mm}' +
      '.div{border-top:2px dashed #555;margin:2.5mm 0}' +
      '.sec{margin-bottom:2mm}' +
      '.sec-t{font-size:8pt;font-weight:900;text-transform:uppercase;letter-spacing:.1em;margin-bottom:1.5mm;text-decoration:underline}' +
      '.cname{font-size:13pt;font-weight:900;margin-bottom:1mm}' +
      '.det{font-size:9.5pt;font-weight:700}' +
      'table{width:100%;border-collapse:collapse;font-size:9.5pt}' +
      'th{text-align:left;border-bottom:2px solid #333;padding:1mm;font-size:8pt;font-weight:900;text-transform:uppercase}' +
      'td{padding:1.5mm 1mm;border-bottom:1px solid #ccc;vertical-align:top;font-weight:700}' +
      'th:not(:first-child),td:not(:first-child){text-align:right;white-space:nowrap}' +
      '.trow{display:flex;justify-content:space-between;align-items:baseline;padding:1.5mm 0}' +
      '.tlbl{font-size:11pt;font-weight:900;letter-spacing:.08em}' +
      '.tamt{font-size:17pt;font-weight:900}' +
      '.notes{font-size:10pt;font-weight:700}' +
      '.foot{margin-top:3mm;text-align:center;font-size:8pt;font-weight:700;border-top:2px dashed #555;padding-top:2mm}' +
      '</style></head><body>' +
      '<div class="hdr"><div class="logo">AVANZA</div><div class="num">#' + o.order_number + '</div></div>' +
      '<div class="div"></div>' +
      '<div class="meta">' +
        '<div class="row"><span class="lbl">Fecha:</span><span>' + new Date(o.created_at).toLocaleString('es-GT') + '</span></div>' +
        (o.createdByName ? '<div class="row"><span class="lbl">Elaboró:</span><span>' + o.createdByName + '</span></div>' : '') +
        '<div class="row"><span class="lbl">Prioridad:</span><span style="font-weight:900;color:' + (PRIO_COLOR[o.priority]||'#000') + '">' + (PRIO_LABEL[o.priority]||'Normal') + '</span></div>' +
        '<div class="row"><span class="lbl">Entrega:</span><span style="font-weight:900">' + (o.delivery_type === 'delivery' ? 'Delivery' : 'En local') + '</span></div>' +
        repoBlock +
      '</div>' +
      '<div class="div"></div>' +
      '<div class="sec"><div class="sec-t">Cliente</div><div class="cname">' + o.client_name + '</div>' + clientExtra + '</div>' +
      '<div class="div"></div>' +
      '<div class="sec"><div class="sec-t">Productos</div>' +
        '<table><thead><tr><th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
      '</div>' +
      '<div class="div"></div>' +
      '<div class="trow"><span class="tlbl">TOTAL</span><span class="tamt">' + totalStr + '</span></div>' +
      pagoBlock +
      notesBlock +
      deliveryNotesBlock +
      '<div class="foot">Estado: ABIERTA — Gracias por su preferencia</div>' +
      '</body></html>'

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
    document.body.appendChild(iframe)
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
    iframe.contentWindow.onafterprint = () => { document.body.removeChild(iframe) }
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print() }, 400)
  }

  // ── Pantalla post-creación con ticket ─────────────────────────────────────
  if (createdOrder) {
    const o     = createdOrder
    const items = o.order_items || []
    const PRIORITY_LABEL = { normal: 'Normal', prioritaria: 'PRIORITARIA', urgente: 'URGENTE' }
    const REPOSITION_LABEL = {
      error_impresion:  'Error de impresión',
      placa_ctp_dañada: 'Placa CTP dañada',
      error_produccion: 'Error de producción',
      otro:             'Otro',
    }
    const METHOD_LABEL = { efectivo: 'Efectivo', pos: 'POS/Tarjeta', transferencia: 'Transferencia' }

    return (
      <div className="page">
        <Navbar profile={profile} />
        <main className="page__content">

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
              <button className="btn btn--primary" onClick={() => printTicket(o, items)}>
                🖨 Imprimir Ticket
              </button>
              <button className="btn btn--secondary" onClick={() => {
                setCreatedOrder(null)
                setSelectedClient(null); setNewClientName(''); setShowClientForm(false)
                setClientPhone(''); setClientEmail(''); setClientNit('')
                setClientAddress(''); setClientAddressAlt('')
                setNotes(''); setDeliveryNotes(''); setPriority('normal')
                setIsReposition(false); setParentOrderId(''); setDeliveryType('local')
                setUseAltAddress(false); setAltDeliveryAddress('')
                setHasInitialPayment(false); setInitialPaymentAmount(''); setInitialPaymentMethod('efectivo')
                setItems([{ product_id: '', product_name: '', unit_price: '', quantity: 1, notes: '' }])
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
              {o.deliveryAddress     && <div className="ticket__client-detail">Dir: {o.deliveryAddress}</div>}
            </div>

            <div className="ticket__divider" />

            <div className="ticket__section">
              <div className="ticket__section-title">Productos</div>
              <table className="ticket__items-table">
                <thead>
                  <tr>
                    <th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th>
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

            {/* Totales con desglose de pago */}
            <div className="ticket__total-row">
              <span className="ticket__total-label">TOTAL</span>
              <span className="ticket__total-amount">
                {o.is_reposition ? 'Q0.00 — Reposición' : `Q${o.total_amount?.toFixed(2)}`}
              </span>
            </div>

            {!o.is_reposition && o.paidNow > 0 && (
              <>
                <div className="ticket__total-row" style={{ fontSize: '0.8rem', color: '#16a34a' }}>
                  <span>Pagado ({METHOD_LABEL[o.paymentMethodNow] || o.paymentMethodNow})</span>
                  <span>− Q{o.paidNow.toFixed(2)}</span>
                </div>
                <div className="ticket__total-row" style={{ borderTop: '1px dashed #bbb', paddingTop: '0.25rem' }}>
                  <span style={{ fontWeight: 700 }}>SALDO PENDIENTE</span>
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>
                    Q{(o.total_amount - o.paidNow).toFixed(2)}
                  </span>
                </div>
              </>
            )}

            {o.notes && (
              <>
                <div className="ticket__divider" />
                <div className="ticket__section">
                  <div className="ticket__section-title">Nombre de archivo</div>
                  <p className="ticket__notes">{o.notes}</p>
                </div>
              </>
            )}

            {o.delivery_notes && (
              <>
                <div className="ticket__divider" />
                <div className="ticket__section">
                  <div className="ticket__section-title">Observaciones</div>
                  <p className="ticket__notes">{o.delivery_notes}</p>
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

  // ── Formulario ────────────────────────────────────────────────────────────
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
                <label className="form-label">Nombre de archivo</label>
                <input className="form-input" type="text" value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Ej: diseño_cliente_v2.pdf" />
              </div>
            </div>

            {selectedClient && (
              <div className="existing-client-data">
                <p className="new-client-form__label"><span>✓</span> Datos del cliente</p>
                <div className="form-row form-row--3">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" type="tel" readOnly value={selectedClient.phone || ''} placeholder="Sin teléfono" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input className="form-input" type="email" readOnly value={selectedClient.email || ''} placeholder="Sin correo" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NIT</label>
                    <input className="form-input" type="text" readOnly value={selectedClient.nit || ''} placeholder="Sin NIT" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" type="text" readOnly value={selectedClient.address || ''} placeholder="Sin dirección" />
                </div>
              </div>
            )}

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
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Dirección principal</label>
                    <input className="form-input" type="text" value={clientAddress}
                      onChange={e => setClientAddress(e.target.value)} placeholder="Dirección principal" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dirección alternativa</label>
                    <input className="form-input" type="text" value={clientAddressAlt}
                      onChange={e => setClientAddressAlt(e.target.value)} placeholder="Dirección alternativa (opcional)" />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* OBSERVACIONES */}
          <section className="form-section">
            <h2 className="form-section__title">Observaciones de entrega</h2>
            <div className="form-group">
              <textarea className="form-input" rows={3} value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder="Indicaciones especiales, acabados, detalles de producción..." />
            </div>
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
            {/* Checkbox siempre visible — no depende del tipo de entrega */}
            <div className="alt-address-block" style={{ marginTop: '0.5rem' }}>
              <label className="toggle-label">
                <input type="checkbox" checked={useAltAddress}
                  onChange={e => {
                    setUseAltAddress(e.target.checked)
                    if (!e.target.checked) setAltDeliveryAddress('')
                  }} />
                <span>Enviar a dirección alternativa</span>
              </label>
              {useAltAddress && (
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label className="form-label">Dirección de entrega</label>
                  <input className="form-input" type="text"
                    value={altDeliveryAddress}
                    onChange={e => setAltDeliveryAddress(e.target.value)}
                    placeholder="Ej: 6a Av 12-34 Zona 10, Guatemala"
                    autoFocus />
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.25rem' }}>
                    Aparecerá en el ticket y en el mensaje de Telegram al repartidor.
                  </p>
                </div>
              )}
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
                    <input className="form-input" type="number" step="1" min="1"
                      value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} />
                  </div>
                  <div className="form-group item-subtotal">
                    <label className="form-label">Subtotal</label>
                    <span className="subtotal-display">
                      Q{((parseFloat(item.unit_price)||0) * (parseInt(item.quantity,10)||0)).toFixed(2)}
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

          {/* PAGO INICIAL */}
          {!isReposition && total > 0 && (
            <section className="form-section">
              <h2 className="form-section__title">Pago inicial</h2>
              <div className="reposition-toggle">
                <label className="toggle-label">
                  <input type="checkbox" checked={hasInitialPayment}
                    onChange={e => {
                      setHasInitialPayment(e.target.checked)
                      if (!e.target.checked) { setInitialPaymentAmount('') }
                    }} />
                  <span>Recibir pago ahora</span>
                </label>
              </div>

              {hasInitialPayment && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Monto recibido (Q)</label>
                      <input className="form-input" type="number" step="0.01" min="0.01"
                        value={initialPaymentAmount}
                        onChange={e => setInitialPaymentAmount(e.target.value)}
                        placeholder="0.00" autoFocus />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Método de pago</label>
                      <div className="priority-selector" style={{ flexWrap: 'nowrap' }}>
                        {PAYMENT_METHODS.map(m => (
                          <label key={m.value}
                            className={`priority-option${initialPaymentMethod === m.value ? ' priority-option--active' : ''}`}
                            style={{ '--p-color': '#60a5fa', fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}>
                            <input type="radio" name="initPayMethod" value={m.value}
                              checked={initialPaymentMethod === m.value}
                              onChange={() => setInitialPaymentMethod(m.value)} />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {parsedIP > 0 && (
                    <div style={{
                      background: '#0c1a0c', border: '1px solid #166534',
                      borderRadius: '8px', padding: '0.85rem 1rem',
                      fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem'
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color: '#86efac' }}>Total orden</span>
                        <span style={{ color: '#86efac' }}>Q{total.toFixed(2)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color: '#4ade80' }}>Pago recibido</span>
                        <span style={{ color: '#4ade80' }}>− Q{parsedIP.toFixed(2)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid #166534', paddingTop:'0.35rem', fontWeight:700 }}>
                        <span style={{ color: remaining > 0 ? '#fca5a5' : '#4ade80' }}>Saldo pendiente</span>
                        <span style={{ color: remaining > 0 ? '#fca5a5' : '#4ade80' }}>Q{remaining.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!hasInitialPayment && (
                <div style={{
                  background: '#0c1a2e', border: '1px solid #1e3a5f',
                  borderRadius: '8px', padding: '0.85rem 1rem',
                  fontSize: '0.82rem', color: '#60a5fa'
                }}>
                  💳 El cobro se registrará al momento de la entrega vía Telegram.
                </div>
              )}
            </section>
          )}

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
