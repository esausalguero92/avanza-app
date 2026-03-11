import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'

const TABS = [
  { key: 'ordenes',      label: 'Órdenes' },
  { key: 'pagos',        label: 'Pagos' },
  { key: 'creditos',     label: 'Créditos' },
  { key: 'clientes',     label: 'Por Cliente' },
  { key: 'reposiciones', label: 'Reposiciones' },
]

const PERIODS = [
  { key: 'hoy',    label: 'Hoy' },
  { key: 'semana', label: 'Esta Semana' },
  { key: 'mes',    label: 'Este Mes' },
  { key: 'año',    label: 'Este Año' },
  { key: 'rango',  label: 'Rango' },
]

const METHOD_LABELS = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  pos: 'POS', neolink: 'Neolink', credito: 'Crédito',
}

const STATUS_LABELS = {
  abierta: 'Abierta', en_proceso: 'En Proceso', lista: 'Lista',
  en_envio: 'En Envío', entregado_pagado: 'Entregado/Pagado',
  entregado_pendiente: 'Entregado/Pendiente', cerrada: 'Cerrada',
}

const REPOSITION_LABELS = {
  error_impresion: 'Error impresión', placa_ctp_dañada: 'Placa CTP dañada',
  error_produccion: 'Error producción', otro: 'Otro',
}

function getDateRange(period, from, to) {
  const now = new Date()
  if (period === 'hoy') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      to:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString(),
    }
  }
  if (period === 'semana') {
    const day  = now.getDay() || 7
    const mon  = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0)
    return { from: mon.toISOString(), to: now.toISOString() }
  }
  if (period === 'mes') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to:   now.toISOString(),
    }
  }
  if (period === 'año') {
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString(),
      to:   now.toISOString(),
    }
  }
  if (period === 'rango') {
    return {
      from: from ? new Date(from).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to:   to   ? new Date(to + 'T23:59:59').toISOString() : now.toISOString(),
    }
  }
}

export default function Reportes({ profile }) {
  const [tab, setTab]       = useState('ordenes')
  const [period, setPeriod] = useState('mes')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const [loading, setLoading]   = useState(true)

  const [orders, setOrders]     = useState([])
  const [payments, setPayments] = useState([])
  const [clientSearch, setClientSearch] = useState('')

  useEffect(() => { fetchData() }, [period, fromDate, toDate])

  async function fetchData() {
    setLoading(true)
    const range = getDateRange(period, fromDate, toDate)

    const [{ data: ordData }, { data: payData }] = await Promise.all([
      supabase.from('orders')
        .select('*, order_items(*)')
        .gte('created_at', range.from)
        .lte('created_at', range.to)
        .order('created_at', { ascending: false }),
      supabase.from('payments')
        .select('*, orders(order_number, client_name), profiles(full_name)')
        .gte('created_at', range.from)
        .lte('created_at', range.to)
        .order('created_at', { ascending: false }),
    ])

    setOrders(ordData || [])
    setPayments(payData || [])
    setLoading(false)
  }

  // ── Cálculos globales ──────────────────────────────────────
  const totalOrdenes   = orders.length
  const totalVentas    = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  const totalCobrado   = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalCredito   = orders.reduce((s, o) => s + (o.credit_amount || 0), 0)
  const totalReposiciones = orders.filter(o => o.is_reposition).length

  // ── Tab: Créditos ──────────────────────────────────────────
  const ordenesConCredito = orders.filter(o => o.credit_amount > 0)

  // ── Tab: Por Cliente ───────────────────────────────────────
  const clientMap = {}
  orders.forEach(o => {
    const key = o.client_name
    if (!clientMap[key]) clientMap[key] = { name: key, ordenes: 0, total: 0, credito: 0 }
    clientMap[key].ordenes += 1
    clientMap[key].total   += o.total_amount || 0
    clientMap[key].credito += o.credit_amount || 0
  })
  const clientList = Object.values(clientMap)
    .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    .sort((a, b) => b.total - a.total)

  // ── Tab: Reposiciones ──────────────────────────────────────
  const reposiciones = orders.filter(o => o.is_reposition)

  return (
    <div className="page">
      <Navbar profile={profile} />

      <main className="page__content">
        <h1 className="page__title">Reportes</h1>

        {/* Selector de período */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
          {PERIODS.map(p => (
            <button key={p.key}
              className={`btn ${period === p.key ? 'btn--primary' : 'btn--secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
              onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
          {period === 'rango' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" className="form-input" style={{ width: 'auto', fontSize: '0.82rem' }}
                value={fromDate} onChange={e => setFromDate(e.target.value)} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>hasta</span>
              <input type="date" className="form-input" style={{ width: 'auto', fontSize: '0.82rem' }}
                value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          )}
        </div>

        {/* Stats globales */}
        <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-card__label">Órdenes</span>
            <span className="stat-card__value">{totalOrdenes}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Total Generado</span>
            <span className="stat-card__value" style={{ color: '#4ade80' }}>Q{totalVentas.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Total Cobrado</span>
            <span className="stat-card__value" style={{ color: '#60a5fa' }}>Q{totalCobrado.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Crédito Pendiente</span>
            <span className="stat-card__value" style={{ color: '#fbbf24' }}>Q{totalCredito.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Reposiciones</span>
            <span className="stat-card__value" style={{ color: '#f87171' }}>{totalReposiciones}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="report-tabs">
          {TABS.map(t => (
            <button key={t.key}
              className={`report-tab ${tab === t.key ? 'report-tab--active' : ''}`}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-screen" style={{ height: '200px' }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="report-table-wrap">

            {/* ── ÓRDENES ─────────────────────────────────── */}
            {tab === 'ordenes' && (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>#</th><th>Cliente</th><th>Productos</th>
                    <th>Estado</th><th>Prioridad</th><th>Total</th><th>Crédito</th><th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0
                    ? <tr><td colSpan="8" className="empty-state">Sin órdenes en este período.</td></tr>
                    : orders.map(o => (
                      <tr key={o.id}>
                        <td className="mono accent">#{o.order_number}</td>
                        <td>{o.client_name}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {o.order_items?.map(i => i.product_name).join(', ')}
                        </td>
                        <td><span className="status-chip">{STATUS_LABELS[o.status] || o.status}</span></td>
                        <td>
                          {o.priority !== 'normal' && (
                            <span style={{ color: o.priority === 'urgente' ? '#f87171' : '#fbbf24', fontSize: '0.75rem', fontWeight: 700 }}>
                              {o.priority?.toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="mono">Q{o.total_amount?.toFixed(2)}</td>
                        <td className="mono" style={{ color: o.credit_amount > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                          {o.credit_amount > 0 ? `Q${o.credit_amount?.toFixed(2)}` : '—'}
                        </td>
                        <td className="muted">{new Date(o.created_at).toLocaleDateString('es-GT')}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            )}

            {/* ── PAGOS ───────────────────────────────────── */}
            {tab === 'pagos' && (
              <>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  {Object.entries(METHOD_LABELS).map(([key, label]) => {
                    const total = payments.filter(p => p.payment_method === key)
                      .reduce((s, p) => s + p.amount, 0)
                    if (total === 0) return null
                    return (
                      <div key={key} className="stat-card" style={{ minWidth: '140px' }}>
                        <span className="stat-card__label">{label}</span>
                        <span className="stat-card__value" style={{ fontSize: '1.1rem', color: '#4ade80' }}>
                          Q{total.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <table className="report-table">
                  <thead>
                    <tr><th>Orden</th><th>Cliente</th><th>Método</th><th>Monto</th><th>Nota</th><th>Registrado por</th><th>Fecha</th></tr>
                  </thead>
                  <tbody>
                    {payments.length === 0
                      ? <tr><td colSpan="7" className="empty-state">Sin pagos en este período.</td></tr>
                      : payments.map(p => (
                        <tr key={p.id}>
                          <td className="mono accent">#{p.orders?.order_number}</td>
                          <td>{p.orders?.client_name}</td>
                          <td><span className="method-chip">{METHOD_LABELS[p.payment_method] || p.payment_method}</span></td>
                          <td className="mono" style={{ color: '#4ade80' }}>Q{p.amount?.toFixed(2)}</td>
                          <td className="muted" style={{ fontSize: '0.78rem' }}>{p.notes || '—'}</td>
                          <td className="muted">{p.profiles?.full_name || '—'}</td>
                          <td className="muted">{new Date(p.created_at).toLocaleDateString('es-GT')}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </>
            )}

            {/* ── CRÉDITOS ────────────────────────────────── */}
            {tab === 'creditos' && (
              <table className="report-table">
                <thead>
                  <tr><th>#</th><th>Cliente</th><th>Total Orden</th><th>Crédito Pendiente</th><th>Estado</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {ordenesConCredito.length === 0
                    ? <tr><td colSpan="6" className="empty-state">Sin créditos en este período.</td></tr>
                    : ordenesConCredito.map(o => (
                      <tr key={o.id}>
                        <td className="mono accent">#{o.order_number}</td>
                        <td>{o.client_name}</td>
                        <td className="mono">Q{o.total_amount?.toFixed(2)}</td>
                        <td className="mono" style={{ color: '#fbbf24', fontWeight: 700 }}>Q{o.credit_amount?.toFixed(2)}</td>
                        <td><span className="status-chip">{STATUS_LABELS[o.status] || o.status}</span></td>
                        <td className="muted">{new Date(o.created_at).toLocaleDateString('es-GT')}</td>
                      </tr>
                    ))
                  }
                </tbody>
                {ordenesConCredito.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700, padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        TOTAL CRÉDITO PENDIENTE:
                      </td>
                      <td className="mono" style={{ color: '#fbbf24', fontWeight: 900, padding: '0.75rem' }}>
                        Q{ordenesConCredito.reduce((s, o) => s + o.credit_amount, 0).toFixed(2)}
                      </td>
                      <td colSpan="2" />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {/* ── POR CLIENTE ─────────────────────────────── */}
            {tab === 'clientes' && (
              <>
                <div style={{ marginBottom: '1rem', maxWidth: '320px' }}>
                  <input className="form-input" type="text"
                    placeholder="Buscar cliente..."
                    value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                </div>
                <table className="report-table">
                  <thead>
                    <tr><th>Cliente</th><th>Órdenes</th><th>Total Generado</th><th>Crédito Pendiente</th></tr>
                  </thead>
                  <tbody>
                    {clientList.length === 0
                      ? <tr><td colSpan="4" className="empty-state">Sin resultados.</td></tr>
                      : clientList.map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{c.name}</td>
                          <td className="mono">{c.ordenes}</td>
                          <td className="mono accent">Q{c.total.toFixed(2)}</td>
                          <td className="mono" style={{ color: c.credito > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                            {c.credito > 0 ? `Q${c.credito.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </>
            )}

            {/* ── REPOSICIONES ────────────────────────────── */}
            {tab === 'reposiciones' && (
              <>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  {Object.entries(REPOSITION_LABELS).map(([key, label]) => {
                    const count = reposiciones.filter(o => o.reposition_reason === key).length
                    if (count === 0) return null
                    return (
                      <div key={key} className="stat-card" style={{ minWidth: '160px' }}>
                        <span className="stat-card__label">{label}</span>
                        <span className="stat-card__value" style={{ fontSize: '1.2rem', color: '#f87171' }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
                <table className="report-table">
                  <thead>
                    <tr><th>#</th><th>Cliente</th><th>Razón</th><th>Productos</th><th>Orden Original</th><th>Estado</th><th>Fecha</th></tr>
                  </thead>
                  <tbody>
                    {reposiciones.length === 0
                      ? <tr><td colSpan="7" className="empty-state">Sin reposiciones en este período.</td></tr>
                      : reposiciones.map(o => (
                        <tr key={o.id}>
                          <td className="mono accent">#{o.order_number}</td>
                          <td>{o.client_name}</td>
                          <td><span className="reposition-chip">{REPOSITION_LABELS[o.reposition_reason] || 'Otro'}</span></td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {o.order_items?.map(i => i.product_name).join(', ')}
                          </td>
                          <td className="mono muted">{o.parent_order_id ? '✓' : '—'}</td>
                          <td><span className="status-chip">{STATUS_LABELS[o.status] || o.status}</span></td>
                          <td className="muted">{new Date(o.created_at).toLocaleDateString('es-GT')}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </>
            )}

          </div>
        )}
      </main>

      <style>{`
        .report-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 1.5rem;
          overflow-x: auto;
        }
        .report-tab {
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 0.88rem;
          font-weight: 600;
          margin-bottom: -1px;
          padding: 0.6rem 1.25rem;
          white-space: nowrap;
          transition: color 0.15s, border-color 0.15s;
        }
        .report-tab--active { color: var(--accent); border-bottom-color: var(--accent); }
        .report-table-wrap { overflow-x: auto; }
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
          white-space: nowrap;
        }
        .report-table td {
          padding: 0.7rem 0.75rem;
          border-bottom: 1px solid #1a1a1a;
          color: var(--text);
        }
        .report-table tfoot td {
          border-top: 1px solid var(--border);
          border-bottom: none;
        }
        .report-table tr:hover td { background: var(--bg-card); }
        .report-table .mono   { font-family: var(--font-mono); }
        .report-table .accent { color: var(--accent); }
        .report-table .muted  { color: var(--text-muted); }
        .status-chip {
          font-size: 0.7rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          white-space: nowrap;
        }
        .method-chip {
          font-size: 0.72rem;
          background: #0c1424;
          border: 1px solid #1e3a5f;
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          color: #60a5fa;
          white-space: nowrap;
        }
        .reposition-chip {
          font-size: 0.72rem;
          background: #1f0c0c;
          border: 1px solid #7f1d1d;
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          color: #f87171;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}
