import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Reportes({ profile }) {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('ventas') // 'ventas' | 'creditos'
  const [period, setPeriod]   = useState('hoy')    // 'hoy' | 'mes'

  useEffect(() => { fetchData() }, [period])

  async function fetchData() {
    setLoading(true)
    const now   = new Date()
    let fromDate

    if (period === 'hoy') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    }

    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(*), payments(*)`)
      .gte('created_at', fromDate)
      .order('created_at', { ascending: false })

    setOrders(data || [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // Cálculos de ventas
  const cerradas    = orders.filter(o => ['cerrada','entregado_pagado'].includes(o.status))
  const totalVentas = cerradas.reduce((s, o) => s + (o.total_amount || 0), 0)
  const totalOrdenes = orders.length

  // Cálculos de créditos
  const conCredito    = orders.filter(o => o.status === 'entregado_pendiente' || o.credit_amount > 0)
  const totalCredito  = conCredito.reduce((s, o) => s + (o.credit_amount || 0), 0)

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__logo">/// IMPRENTA</span>
        <nav className="nav-links">
          {(profile?.role === 'owner') && (
            <NavLink to="/admin" className={({isActive}) => `nav-link${isActive?' active':''}`}>Admin</NavLink>
          )}
          <NavLink to="/reportes" className={({isActive}) => `nav-link${isActive?' active':''}`}>Reportes</NavLink>
        </nav>
        <div className="page__user">
          <span className="page__role">{profile?.full_name}</span>
          <button className="btn btn--ghost" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className="page__content">
        <h1 className="page__title">Reportes</h1>

        {/* Selector de período */}
        <div className="filters-row" style={{marginBottom:'1.5rem'}}>
          <button
            className={`btn ${period==='hoy' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setPeriod('hoy')}
          >Hoy</button>
          <button
            className={`btn ${period==='mes' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setPeriod('mes')}
          >Este Mes</button>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card__label">Total Órdenes</span>
            <span className="stat-card__value">{totalOrdenes}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Ventas Cobradas</span>
            <span className="stat-card__value">Q{totalVentas.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Créditos Pendientes</span>
            <span className="stat-card__value" style={{color:'#fbbf24'}}>Q{totalCredito.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Clientes con Crédito</span>
            <span className="stat-card__value" style={{color:'#fbbf24'}}>{conCredito.length}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="report-tabs">
          <button
            className={`report-tab ${tab==='ventas'?'report-tab--active':''}`}
            onClick={() => setTab('ventas')}
          >Ventas</button>
          <button
            className={`report-tab ${tab==='creditos'?'report-tab--active':''}`}
            onClick={() => setTab('creditos')}
          >Estado de Créditos</button>
        </div>

        {loading ? (
          <div className="loading-screen" style={{height:'200px'}}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="report-table-wrap">
            {tab === 'ventas' && (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0
                    ? <tr><td colSpan="5" className="empty-state">Sin órdenes en este período.</td></tr>
                    : orders.map(o => (
                        <tr key={o.id}>
                          <td className="mono">#{o.order_number}</td>
                          <td>{o.client_name}</td>
                          <td>{o.status}</td>
                          <td className="mono accent">Q{o.total_amount?.toFixed(2)}</td>
                          <td className="muted">{new Date(o.created_at).toLocaleDateString('es-GT')}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            )}

            {tab === 'creditos' && (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th>Total Orden</th>
                    <th>Crédito Pendiente</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {conCredito.length === 0
                    ? <tr><td colSpan="5" className="empty-state">Sin créditos pendientes.</td></tr>
                    : conCredito.map(o => (
                        <tr key={o.id}>
                          <td className="mono">#{o.order_number}</td>
                          <td>{o.client_name}</td>
                          <td className="mono">Q{o.total_amount?.toFixed(2)}</td>
                          <td className="mono" style={{color:'#fbbf24'}}>Q{o.credit_amount?.toFixed(2)}</td>
                          <td className="muted">{new Date(o.created_at).toLocaleDateString('es-GT')}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
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
          transition: color 0.15s, border-color 0.15s;
        }
        .report-tab--active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
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
        }
        .report-table td {
          padding: 0.7rem 0.75rem;
          border-bottom: 1px solid #1a1a1a;
          color: var(--text);
        }
        .report-table tr:hover td { background: var(--bg-card); }
        .report-table .mono  { font-family: var(--font-mono); }
        .report-table .accent { color: var(--accent); }
        .report-table .muted  { color: var(--text-muted); }
      `}</style>
    </div>
  )
}
