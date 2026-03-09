import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import OrderCard from '../components/OrderCard'

const PRODUCTION_STATUSES = ['abierta', 'en_proceso', 'lista']

export default function DashboardProduccion({ profile }) {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
    const channel = supabase
      .channel('produccion-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(*)`)
      .in('status', PRODUCTION_STATUSES)
      .order('created_at', { ascending: true })
    setOrders(data || [])
    setLoading(false)
  }

  async function handleStatusChange(orderId, newStatus) {
    await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
    fetchOrders()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const columns = {
    abierta:    orders.filter(o => o.status === 'abierta'),
    en_proceso: orders.filter(o => o.status === 'en_proceso'),
    lista:      orders.filter(o => o.status === 'lista'),
  }

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__logo">/// IMPRENTA</span>
        <span className="page__role" style={{marginLeft:'auto', marginRight:'1rem'}}>{profile?.full_name}</span>
        <button className="btn btn--ghost" onClick={handleLogout}>Salir</button>
      </header>

      <main className="page__content" style={{maxWidth:'100%', padding:'1.5rem'}}>
        <h1 className="page__title">Dashboard de Producción</h1>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card__label">En Cola</span>
            <span className="stat-card__value" style={{color:'#60a5fa'}}>{columns.abierta.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">En Proceso</span>
            <span className="stat-card__value" style={{color:'#fb923c'}}>{columns.en_proceso.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Listas para Envío</span>
            <span className="stat-card__value" style={{color:'#4ade80'}}>{columns.lista.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="loading-screen" style={{height:'200px'}}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="kanban-board">
            {/* Columna: En Cola */}
            <div className="kanban-col">
              <div className="kanban-col__header kanban-col__header--queue">
                <span>En Cola</span>
                <span className="kanban-col__count">{columns.abierta.length}</span>
              </div>
              <div className="kanban-col__body">
                {columns.abierta.length === 0
                  ? <p className="empty-state">Sin órdenes</p>
                  : columns.abierta.map(o => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        onEdit={() => {}}
                        allowedRoles={{ edit: ['admin', 'owner'] }}
                      />
                    ))
                }
              </div>
            </div>

            {/* Columna: En Proceso */}
            <div className="kanban-col">
              <div className="kanban-col__header kanban-col__header--process">
                <span>En Proceso</span>
                <span className="kanban-col__count">{columns.en_proceso.length}</span>
              </div>
              <div className="kanban-col__body">
                {columns.en_proceso.length === 0
                  ? <p className="empty-state">Sin órdenes</p>
                  : columns.en_proceso.map(o => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        onEdit={() => {}}
                        allowedRoles={{ edit: ['admin', 'owner'] }}
                      />
                    ))
                }
              </div>
            </div>

            {/* Columna: Lista */}
            <div className="kanban-col">
              <div className="kanban-col__header kanban-col__header--ready">
                <span>Lista para Envío</span>
                <span className="kanban-col__count">{columns.lista.length}</span>
              </div>
              <div className="kanban-col__body">
                {columns.lista.length === 0
                  ? <p className="empty-state">Sin órdenes</p>
                  : columns.lista.map(o => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        userRole={profile?.role}
                        onStatusChange={handleStatusChange}
                        onEdit={() => {}}
                        allowedRoles={{ edit: ['admin', 'owner'] }}
                      />
                    ))
                }
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .kanban-board {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .kanban-board { grid-template-columns: 1fr; }
        }
        .kanban-col {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .kanban-col__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 2px solid;
        }
        .kanban-col__header--queue   { border-color: #60a5fa; color: #60a5fa; }
        .kanban-col__header--process { border-color: #fb923c; color: #fb923c; }
        .kanban-col__header--ready   { border-color: #4ade80; color: #4ade80; }
        .kanban-col__count {
          background: rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 2px 8px;
          font-size: 0.75rem;
        }
        .kanban-col__body {
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-height: 100px;
        }
      `}</style>
    </div>
  )
}
