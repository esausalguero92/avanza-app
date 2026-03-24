import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'

const PRODUCTION_STATUSES = ['abierta', 'en_proceso', 'lista']
const PRIORITY_ORDER = { urgente: 0, prioritaria: 1, normal: 2 }

// ── Tarjeta compacta exclusiva para producción ─────────────────────────────
function ProductionCard({ order }) {
  const isDelivery = order.delivery_type === 'delivery'

  return (
    <div className={`pcard pcard--${order.priority}`}>

      {/* Una sola línea: #Orden · Cliente · 🛵 */}
      <div className="pcard__row">
        <span className="pcard__num">#{order.order_number}</span>
        <span className="pcard__sep">·</span>
        <span className="pcard__client">{order.client_name}</span>
        {isDelivery && <span className="pcard__delivery">🛵</span>}
      </div>


    </div>
  )
}


// ── Dashboard principal ────────────────────────────────────────────────────
export default function DashboardProduccion({ profile }) {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
    const channel = supabase
      .channel('produccion-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    const poll = setInterval(fetchOrders, 20000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('id,order_number,client_name,status,priority,delivery_type,created_at')
      .in('status', PRODUCTION_STATUSES)
      .order('created_at', { ascending: true })
    setOrders(data || [])
    setLoading(false)
  }


  function sortByPriority(list) {
    return [...list].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2
      const pb = PRIORITY_ORDER[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      return new Date(a.created_at) - new Date(b.created_at)
    })
  }

  const columns = {
    abierta:    sortByPriority(orders.filter(o => o.status === 'abierta')),
    en_proceso: sortByPriority(orders.filter(o => o.status === 'en_proceso')),
    lista:      sortByPriority(orders.filter(o => o.status === 'lista')),
  }

  return (
    <div className="page">
      <Navbar profile={profile} />

      <main className="dash-main">

        {/* Stats compactas */}
        <div className="dash-stats">
          <div className="dash-stat dash-stat--blue">
            <span className="dash-stat__n">{columns.abierta.length}</span>
            <span className="dash-stat__l">En Cola</span>
          </div>
          <div className="dash-stat dash-stat--orange">
            <span className="dash-stat__n">{columns.en_proceso.length}</span>
            <span className="dash-stat__l">En Proceso</span>
          </div>
          <div className="dash-stat dash-stat--green">
            <span className="dash-stat__n">{columns.lista.length}</span>
            <span className="dash-stat__l">Listas</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__n" style={{ color: 'var(--text-muted)' }}>{orders.length}</span>
            <span className="dash-stat__l">Total activas</span>
          </div>
        </div>

        {loading ? (
          <div className="loading-screen" style={{ height: '300px' }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="kanban-board">
            {[
              { key: 'abierta',    label: 'En Cola',         cls: 'queue',   list: columns.abierta    },
              { key: 'en_proceso', label: 'En Proceso',       cls: 'process', list: columns.en_proceso },
              { key: 'lista',      label: 'Lista para Envío', cls: 'ready',   list: columns.lista      },
            ].map(col => (
              <div key={col.key} className="kanban-col">
                <div className={`kanban-col__header kanban-col__header--${col.cls}`}>
                  <span>{col.label}</span>
                  <span className="kanban-col__count">{col.list.length}</span>
                </div>
                <div className="kanban-col__body">
                  {col.list.length === 0
                    ? <p className="empty-state" style={{ fontSize: '0.82rem' }}>Sin órdenes</p>
                    : col.list.map(o => (
                      <ProductionCard
                        key={o.id}
                        order={o}
                      />
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        .dash-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 0.75rem 1rem;
          max-width: 100%;
          height: calc(100vh - 70px);
          overflow: hidden;
        }

        /* Stats */
        .dash-stats {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          flex-shrink: 0;
        }
        .dash-stat {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 0.4rem 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .dash-stat__n {
          font-family: var(--font-mono);
          font-size: 1.3rem;
          font-weight: 800;
          line-height: 1;
        }
        .dash-stat__l {
          font-size: 0.68rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .dash-stat--blue   .dash-stat__n { color: #60a5fa; }
        .dash-stat--orange .dash-stat__n { color: #fb923c; }
        .dash-stat--green  .dash-stat__n { color: #4ade80; }

        /* Kanban */
        .kanban-board {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 900px) {
          .kanban-board { grid-template-columns: 1fr; }
          .dash-main    { height: auto; overflow: visible; }
        }
        .kanban-col {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .kanban-col__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.55rem 0.85rem;
          font-family: var(--font-mono);
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 2px solid;
          flex-shrink: 0;
        }
        .kanban-col__header--queue   { border-color: #60a5fa; color: #60a5fa; }
        .kanban-col__header--process { border-color: #fb923c; color: #fb923c; }
        .kanban-col__header--ready   { border-color: #4ade80; color: #4ade80; }
        .kanban-col__count {
          background: rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 1px 7px;
          font-size: 0.7rem;
        }
        .kanban-col__body {
          padding: 0.4rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          overflow-y: auto;
          flex: 1;
        }
        .kanban-col__body::-webkit-scrollbar       { width: 3px; }
        .kanban-col__body::-webkit-scrollbar-track  { background: transparent; }
        .kanban-col__body::-webkit-scrollbar-thumb  { background: var(--border); border-radius: 2px; }

        /* Tarjeta compacta */
        .pcard {
          background: var(--bg);
          border: 1px solid var(--border);
          border-left: 3px solid transparent;
          border-radius: 5px;
          padding: 0.35rem 0.55rem;
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
        }
        .pcard--urgente     { border-left-color: #ef4444; }
        .pcard--prioritaria { border-left-color: #f59e0b; }
        .pcard--normal      { border-left-color: transparent; }

        /* Fila única: #Orden · Cliente */
        .pcard__row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .pcard__num {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--accent);
          flex-shrink: 0;
        }
        .pcard__sep {
          color: var(--border);
          font-size: 0.75rem;
          flex-shrink: 0;
        }
        .pcard__client {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          margin: 0;
        }
        .pcard__delivery {
          font-size: 0.7rem;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
