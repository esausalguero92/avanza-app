import StatusBadge from './StatusBadge'
import './OrderCard.css'

const PRIORITY_CONFIG = {
  urgente:     { label: 'URGENTE',     color: '#ef4444' },
  prioritaria: { label: 'PRIORITARIA', color: '#f59e0b' },
  normal:      { label: null,          color: null },
}

// Estados que ya no se pueden editar
const LOCKED_STATUSES = ['cerrada', 'entregado_pagado', 'entregado_pendiente']

export default function OrderCard({ order, onStatusChange, onEdit, allowedRoles, userRole, context }) {
  const canEdit      = allowedRoles?.edit?.includes(userRole)
  const isLocked     = LOCKED_STATUSES.includes(order.status)
  const isDelivery   = order.delivery_type === 'delivery'
  const nextStatuses = getNextStatuses(order.status, userRole, context)
  const prio         = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal
  const hasCredit    = order.credit_amount > 0

  return (
    <div className={`order-card${order.priority !== 'normal' ? ' order-card--priority' : ''}`}
      style={prio.color ? { '--prio-color': prio.color } : {}}>

      <div className="order-card__header">
        <span className="order-card__number">#{order.order_number}</span>
        <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap' }}>
          <span className={`delivery-badge delivery-badge--${isDelivery ? 'delivery' : 'local'}`}>
            {isDelivery ? '🛵 Delivery' : '🏠 Local'}
          </span>
          {prio.label && (
            <span className="priority-badge" style={{ color: prio.color, borderColor: prio.color }}>
              {prio.label}
            </span>
          )}
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="order-card__body">
        <p className="order-card__client">{order.client_name}</p>
        <p className="order-card__date">
          {new Date(order.created_at).toLocaleDateString('es-GT', {
            day: '2-digit', month: 'short', year: 'numeric'
          })}
        </p>
      </div>

      <div className="order-card__items">
        {order.order_items?.map(item => (
          <div key={item.id} className="order-card__item">
            <span>{item.product_name}</span>
            <span className="order-card__item-qty">x{item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Saldo pendiente — solo informativo */}
      {hasCredit && (
        <div style={{
          margin: '0.5rem 0',
          padding: '0.5rem 0.75rem',
          background: '#1c0a0a',
          border: '1px solid #7f1d1d',
          borderRadius: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.82rem',
        }}>
          <span style={{ color: '#fca5a5' }}>🔴 Saldo pendiente</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ef4444' }}>
            Q{parseFloat(order.credit_amount).toFixed(2)}
          </span>
        </div>
      )}

      <div className="order-card__footer">
        <div className="order-card__actions">
          {/* Editar solo si la orden no está bloqueada */}
          {canEdit && onEdit && !isLocked && (
            <button className="btn btn--secondary" onClick={() => onEdit(order)}>Editar</button>
          )}
          {onStatusChange && nextStatuses.map(status => (
            <button key={status.value} className={`btn ${status.variant}`}
              onClick={() => onStatusChange(order.id, status.value)}>
              {status.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Flujo web: solo abierta → en_proceso → lista (context = 'production')
// Todo lo demás se gestiona por Telegram
function getNextStatuses(currentStatus, role, context) {
  if (context !== 'production') return []

  const transitions = {
    operator: {
      abierta:    [{ value: 'en_proceso', label: 'Iniciar',      variant: 'btn--primary' }],
      en_proceso: [{ value: 'lista',      label: 'Marcar Lista', variant: 'btn--success' }],
    },
    admin: {
      abierta:    [{ value: 'en_proceso', label: 'Iniciar',      variant: 'btn--primary' }],
      en_proceso: [{ value: 'lista',      label: 'Marcar Lista', variant: 'btn--success' }],
    },
    owner: {
      abierta:    [{ value: 'en_proceso', label: 'Iniciar',      variant: 'btn--primary' }],
      en_proceso: [{ value: 'lista',      label: 'Marcar Lista', variant: 'btn--success' }],
    },
  }
  return transitions[role]?.[currentStatus] || []
}
