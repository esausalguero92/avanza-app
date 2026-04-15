import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
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
  const [targetOrder, setTargetOrder] = useState(null)
  const [payAmount, setPayAmount]   = useState('')
  const [payMethod, setPayMethod]   = useState('efectivo')
  const [payNotes, setPayNotes]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Reporte
  const [showReport, setShowReport] = useState(false)

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data: ordersData } = await supabase
      .from('orders')
      .select('client_id, client_name, credit_amount')
      .gt('credit_amount', 0)

    if (!ordersData) { setLoading(false); return }

    const map = {}
    ordersData.forEach(o => {
      const key = o.client_id || o.client_name
      if (!map[key]) {
        map[key] = { client_id: o.client_id, client_name: o.client_name, total_credit: 0, orders_count: 0 }
      }
      map[key].total_credit  += o.credit_amount || 0
      map[key].orders_count  += 1
    })

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

    const { data: ordData } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('client_id', client.client_id)
      .gt('credit_amount', 0)
      .order('created_at', { ascending: false })

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

    const maxAmount = targetOrder ? targetOrder.credit_amount : selected.total_credit
    if (amount > maxAmount) {
      setError(`El monto no puede superar Q${maxAmount.toFixed(2)}.`); return
    }

    setSaving(true); setError('')

    const ordersToProcess = targetOrder ? [targetOrder] : orders
    let remaining = amount
    const sorted  = [...ordersToProcess].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    for (const ord of sorted) {
      if (remaining <= 0) break
      const toPay = Math.min(remaining, ord.credit_amount)
      remaining -= toPay
      const newCredit = Math.max(0, ord.credit_amount - toPay)

      await supabase.from('payments').insert({
        order_id:       ord.id,
        amount:         toPay,
        payment_method: payMethod,
        notes:          payNotes.trim() || null,
        created_by:     profile.id,
      })

      const updates = { credit_amount: newCredit }
      if (newCredit === 0) updates.status = 'cerrada'
      await supabase.from('orders').update(updates).eq('id', ord.id)
    }

    setShowModal(false)
    setSuccessMsg(`✓ Pago de Q${amount.toFixed(2)} registrado correctamente.`)
    setSaving(false)

    await fetchClients()
    const updated = clients.find(c => c.client_id === selected.client_id)
    if (updated) await selectClient({ ...selected, total_credit: selected.total_credit - amount })
    else setSelected(null)
  }

  // ── REPORTE ──────────────────────────────────────────────────────
  function getOrderPayments(orderId) {
    return payments.filter(p => p.order_id === orderId)
  }

  function getOrderPaid(order) {
    const fromPayments = getOrderPayments(order.id).reduce((s, p) => s + p.amount, 0)
    return (order.initial_payment || 0) + fromPayments
  }

  function handleExport() {
    const wb = XLSX.utils.book_new()

    // ── Hoja 1: Detalle por orden y producto ──────────────────────
    const headers = [
      'Orden', 'Fecha', 'Estado', 'Archivo',
      'Producto', 'Cant.', 'Precio Q', 'Subtotal Q',
      'Total orden Q', 'Saldo pendiente Q',
    ]

    const detalleRows = []
    ;[...orders]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach(order => {
        const items = order.order_items || []

        if (items.length === 0) {
          detalleRows.push([
            order.order_number,
            new Date(order.created_at).toLocaleDateString('es-GT'),
            order.status,
            order.notes || '',
            '—', '', '', '',
            order.total_amount,
            order.credit_amount,
          ])
        } else {
          items.forEach((item, idx) => {
            detalleRows.push([
              idx === 0 ? order.order_number : '',
              idx === 0 ? new Date(order.created_at).toLocaleDateString('es-GT') : '',
              idx === 0 ? order.status : '',
              idx === 0 ? (order.notes || '') : '',
              item.product_name,
              Number(item.quantity),
              Number(item.unit_price),
              Number(item.subtotal),
              idx === 0 ? order.total_amount  : '',
              idx === 0 ? order.credit_amount : '',
            ])
          })
        }
      })

    // Fila de totales
    const totalRow = [
      '', '', '', '', '', '', '', '',
      'TOTAL SALDO PENDIENTE',
      reportTotalDeuda,
    ]

    const wsDetalle = XLSX.utils.aoa_to_sheet([headers, ...detalleRows, [], totalRow])
    wsDetalle['!cols'] = [
      { wch: 8  }, { wch: 12 }, { wch: 10 }, { wch: 22 },
      { wch: 28 }, { wch: 7  }, { wch: 11  }, { wch: 12 },
      { wch: 22 }, { wch: 16 },
    ]
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle')

    // ── Hoja 3: Historial de pagos ────────────────────────────────
    if (payments.length > 0) {
      const pagosHeaders = ['# Orden', 'Fecha pago', 'Método', 'Monto Q', 'Nota', 'Registrado por']
      const pagosRows = payments.map(p => {
        const orden = orders.find(o => o.id === p.order_id)
        return [
          orden?.order_number || '',
          new Date(p.created_at).toLocaleDateString('es-GT'),
          METHOD_LABELS[p.payment_method] || p.payment_method,
          p.amount,
          p.notes || '',
          p.profiles?.full_name || '',
        ]
      })
      const wsPagos = XLSX.utils.aoa_to_sheet([pagosHeaders, ...pagosRows])
      wsPagos['!cols'] = [{ wch: 10 }, { wch: 13 }, { wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsPagos, 'Historial de pagos')
    }

    const fileName = `credito_${selected.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // LEGACY — ya no se usa, se conserva por si acaso
  function handlePrint() {
    const printWindow = window.open('', '_blank', 'width=900,height=700')

    const rows = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(order => {
      const orderPays = getOrderPayments(order.id)

      const itemsRows = (order.order_items || []).map(item => `
        <tr>
          <td>${item.product_name}</td>
          <td class="right">${item.quantity}</td>
          <td class="right">Q${Number(item.unit_price).toFixed(2)}</td>
          <td class="right">Q${Number(item.subtotal).toFixed(2)}</td>
        </tr>`).join('')

      const initialPayRow = order.initial_payment > 0
        ? `<div class="tot-row"><span>Abono inicial (${METHOD_LABELS[order.initial_payment_method] || order.initial_payment_method || '—'})</span><span class="green">− Q${order.initial_payment.toFixed(2)}</span></div>`
        : ''

      const extraPayRows = orderPays.map(p => `
        <div class="tot-row">
          <span>Pago ${METHOD_LABELS[p.payment_method] || p.payment_method}${p.notes ? ` (${p.notes})` : ''} · ${new Date(p.created_at).toLocaleDateString('es-GT')}</span>
          <span class="green">− Q${p.amount.toFixed(2)}</span>
        </div>`).join('')

      return `
        <div class="order">
          <div class="order-header">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="order-num">Orden #${order.order_number}</span>
              <span class="badge">${order.status}</span>
              <span class="muted">${new Date(order.created_at).toLocaleDateString('es-GT')}</span>
            </div>
            ${order.notes ? `<span class="file-label">📁 ${order.notes}</span>` : ''}
          </div>
          ${itemsRows ? `
          <table>
            <thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">Precio unit.</th><th class="right">Subtotal</th></tr></thead>
            <tbody>${itemsRows}</tbody>
          </table>` : ''}
          <div class="totals">
            <div class="tot-row"><span>Total orden</span><span>Q${order.total_amount.toFixed(2)}</span></div>
            ${initialPayRow}
            ${extraPayRows}
            <div class="tot-row debt"><span>Saldo pendiente</span><span>Q${order.credit_amount.toFixed(2)}</span></div>
          </div>
        </div>`
    }).join('')

    printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Crédito — ${selected.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, Arial, sans-serif; font-size: 13px; color: #111; padding: 2cm; }
    .header { display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
    .company { font-size: 16px; font-weight: 800; color: #2563eb; }
    .report-title { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .gen-date { font-size: 11px; color: #888; margin-top: 4px; }
    .client-name { font-size: 17px; font-weight: 800; text-align: right; }
    .client-info { font-size: 11px; color: #555; text-align: right; margin-top: 3px; }
    .summary { display: flex; gap: 1px; background: #dbeafe; border-radius: 8px;
      overflow: hidden; margin-bottom: 24px; }
    .sum-item { flex: 1; background: #f0f6ff; padding: 12px 16px; }
    .sum-item.debt { background: #fff5f5; }
    .sum-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em;
      color: #666; font-weight: 700; }
    .sum-value { font-family: monospace; font-size: 18px; font-weight: 800;
      color: #111; margin-top: 4px; }
    .sum-value.green { color: #16a34a; }
    .sum-value.red { color: #dc2626; }
    .order { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 18px;
      overflow: hidden; page-break-inside: avoid; }
    .order-header { display: flex; justify-content: space-between; align-items: center;
      background: #f1f5f9; padding: 8px 14px; border-bottom: 1px solid #e5e7eb;
      flex-wrap: wrap; gap: 6px; }
    .order-num { font-family: monospace; font-weight: 800; font-size: 13px; color: #2563eb; }
    .badge { font-size: 10px; background: white; border: 1px solid #e5e7eb;
      border-radius: 999px; padding: 2px 8px; text-transform: uppercase;
      letter-spacing: .05em; color: #555; }
    .muted { font-size: 11px; color: #888; }
    .file-label { font-size: 11px; color: #555; font-style: italic; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase;
      letter-spacing: .06em; color: #555; padding: 7px 14px;
      background: #fafafa; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 14px; border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .totals { padding: 8px 14px; background: #fafafa; border-top: 1px solid #e5e7eb; }
    .tot-row { display: flex; justify-content: space-between; font-size: 12px;
      color: #555; padding: 3px 0; }
    .tot-row.debt { font-weight: 800; color: #dc2626; font-size: 13px;
      border-top: 1px solid #fca5a5; margin-top: 5px; padding-top: 6px; }
    .green { color: #16a34a; }
    .footer { text-align: center; font-size: 10px; color: #aaa;
      margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
    @page { margin: 1.5cm; size: A4; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">Avanza Impresos</div>
      <div class="report-title">Estado de Cuenta Corriente</div>
      <div class="gen-date">Generado el ${new Date().toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
    <div>
      <div class="client-name">${selected.name}</div>
      ${selected.phone ? `<div class="client-info">📞 ${selected.phone}</div>` : ''}
      ${selected.nit   ? `<div class="client-info">NIT: ${selected.nit}</div>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="sum-item">
      <div class="sum-label">Total facturado</div>
      <div class="sum-value">Q${reportTotalFacturado.toFixed(2)}</div>
    </div>
    <div class="sum-item">
      <div class="sum-label">Total cobrado</div>
      <div class="sum-value green">Q${reportTotalPagado.toFixed(2)}</div>
    </div>
    <div class="sum-item debt">
      <div class="sum-label">Saldo pendiente</div>
      <div class="sum-value red">Q${reportTotalDeuda.toFixed(2)}</div>
    </div>
  </div>

  ${rows}

  <div class="footer">Avanza Impresos · avanza.horizongt.com · Reporte generado automáticamente</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`)
    printWindow.document.close()
  }

  const filtered = clients.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.nit?.includes(search) || c.phone?.includes(search)
  )

  const totalDeuda = clients.reduce((s, c) => s + c.total_credit, 0)

  // Totales del reporte
  const reportTotalFacturado = orders.reduce((s, o) => s + o.total_amount, 0)
  const reportTotalPagado    = orders.reduce((s, o) => s + getOrderPaid(o), 0)
  const reportTotalDeuda     = orders.reduce((s, o) => s + o.credit_amount, 0)

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
            <span className="stat-card__value" style={{ color: '#ef4444' }}>Q{totalDeuda.toFixed(2)}</span>
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

                {/* Botones de acción */}
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
                  <button className="btn btn--primary" style={{ flex: 1 }}
                    onClick={() => openPayModal(null)}>
                    💳 Registrar Pago — Saldar Todo o Parcial
                  </button>
                  <button className="btn btn--secondary"
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={handleExport}>
                    📊 Exportar Excel
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

      {/* ── MODAL PAGO ─────────────────────────────────────────────── */}
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

      {/* ── MODAL REPORTE ──────────────────────────────────────────── */}
      {showReport && selected && (
        <>
          {/* Estilos de impresión */}
          <style>{`
            @media print {
              body > * { display: none !important; }
              .cc-report-printable { display: block !important; position: static !important; }
              .cc-report-actions { display: none !important; }
              @page { margin: 1.5cm; size: A4; }
            }
          `}</style>

          <div className="modal-overlay" onClick={() => setShowReport(false)}>
            <div className="cc-report-modal" onClick={e => e.stopPropagation()}>

              {/* Barra de acciones */}
              <div className="cc-report-actions">
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Reporte de Crédito — {selected.name}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn--primary" onClick={handlePrint}>
                    🖨️ Imprimir
                  </button>
                  <button className="btn btn--ghost" onClick={() => setShowReport(false)}>
                    ✕ Cerrar
                  </button>
                </div>
              </div>

              {/* Contenido imprimible */}
              <div className="cc-report-printable">

                {/* Encabezado */}
                <div className="cc-report-header">
                  <div>
                    <div className="cc-report-company">Avanza Impresos</div>
                    <div className="cc-report-title">Estado de Cuenta Corriente</div>
                    <div className="cc-report-date">
                      Generado el {new Date().toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="cc-report-client-name">{selected.name}</div>
                    {selected.phone && <div className="cc-report-client-info">📞 {selected.phone}</div>}
                    {selected.nit   && <div className="cc-report-client-info">NIT: {selected.nit}</div>}
                  </div>
                </div>

                {/* Resumen global */}
                <div className="cc-report-summary">
                  <div className="cc-report-summary-item">
                    <span className="cc-report-summary-label">Total facturado</span>
                    <span className="cc-report-summary-value">Q{reportTotalFacturado.toFixed(2)}</span>
                  </div>
                  <div className="cc-report-summary-item">
                    <span className="cc-report-summary-label">Total cobrado</span>
                    <span className="cc-report-summary-value" style={{ color: '#16a34a' }}>Q{reportTotalPagado.toFixed(2)}</span>
                  </div>
                  <div className="cc-report-summary-item cc-report-summary-item--debt">
                    <span className="cc-report-summary-label">Saldo pendiente</span>
                    <span className="cc-report-summary-value" style={{ color: '#dc2626' }}>Q{reportTotalDeuda.toFixed(2)}</span>
                  </div>
                </div>

                {/* Órdenes */}
                {[...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(order => {
                  const orderPays  = getOrderPayments(order.id)
                  const totalPagado = getOrderPaid(order)

                  return (
                    <div key={order.id} className="cc-report-order">

                      {/* Cabecera de orden */}
                      <div className="cc-report-order-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span className="cc-report-order-num">Orden #{order.order_number}</span>
                          <span className="cc-report-order-status">{order.status}</span>
                          <span className="cc-report-order-date-label">
                            {new Date(order.created_at).toLocaleDateString('es-GT')}
                          </span>
                        </div>
                        {order.notes && (
                          <span className="cc-report-order-file">📁 {order.notes}</span>
                        )}
                      </div>

                      {/* Tabla de productos */}
                      {order.order_items && order.order_items.length > 0 && (
                        <table className="cc-report-table">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th className="cc-report-table-right">Cant.</th>
                              <th className="cc-report-table-right">Precio unit.</th>
                              <th className="cc-report-table-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.order_items.map(item => (
                              <tr key={item.id}>
                                <td>{item.product_name}</td>
                                <td className="cc-report-table-right">{item.quantity}</td>
                                <td className="cc-report-table-right">Q{Number(item.unit_price).toFixed(2)}</td>
                                <td className="cc-report-table-right">Q{Number(item.subtotal).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Montos de la orden */}
                      <div className="cc-report-order-totals">
                        <div className="cc-report-total-row">
                          <span>Total orden</span>
                          <span>Q{order.total_amount?.toFixed(2)}</span>
                        </div>
                        {order.initial_payment > 0 && (
                          <div className="cc-report-total-row">
                            <span>Abono inicial ({METHOD_LABELS[order.initial_payment_method] || order.initial_payment_method || '—'})</span>
                            <span style={{ color: '#16a34a' }}>− Q{order.initial_payment?.toFixed(2)}</span>
                          </div>
                        )}
                        {orderPays.map(p => (
                          <div key={p.id} className="cc-report-total-row">
                            <span>
                              Pago {METHOD_LABELS[p.payment_method] || p.payment_method}
                              {p.notes ? ` (${p.notes})` : ''}
                              {' · '}{new Date(p.created_at).toLocaleDateString('es-GT')}
                            </span>
                            <span style={{ color: '#16a34a' }}>− Q{p.amount?.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="cc-report-total-row cc-report-total-row--debt">
                          <span>Saldo pendiente</span>
                          <span>Q{order.credit_amount?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Pie de página */}
                <div className="cc-report-footer">
                  Avanza Impresos · avanza.horizongt.com · Reporte generado automáticamente
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
