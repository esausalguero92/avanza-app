import StatusBadge from './StatusBadge'
import './OrderCard.css'

const PRIORITY_CONFIG = {
  urgente:     { label: 'URGENTE',     color: '#ef4444' },
  prioritaria: { label: 'PRIORITARIA', color: '#f59e0b' },
  normal:      { label: null,          color: null },
}

export default function OrderCard({ order, onStatusChange, onEdit, allowedRoles, userRole }) {
  const canEdit      = allowedRoles?.edit?.includes(userRole)
  const isDelivery   = order.delivery_type === 'delivery'
  const nextStatuses = getNextStatuses(order.status)
  const prio         = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal

  return (
    <div className={`order-card${order.priority !== 'normal' ? ' order-card--priority' : ''}`}
      style={prio.color ? { '--prio-color': prio.color } : {}}>

      <div className="order-card__header">
        <span className="order-card__number">#{order.order_number}</span>
        <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap' }}>
          {/* Badge tipo de entrega */}
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

      {/* Total y crédito pendiente */}
      {(order.total_amount > 0 || order.credit_amount > 0) && (
        <div className="order-card__totals">
          {order.total_amount > 0 && (
            <span className="order-card__total">
              Q{parseFloat(order.total_amount).toFixed(2)}
            </span>
          )}
          {order.credit_amount > 0 && (
            <span className="order-card__credit">
              Crédito pendiente: Q{parseFloat(order.credit_amount).toFixed(2)}
            </span>
          )}
        </div>
      )}

      <div className="order-card__footer">
        <div className="order-card__actions">
          {canEdit && onEdit && order.status !== 'cerrada' && (
            <button className="btn btn--secondary" onClick={() => onEdit(order)}>Editar</button>
          )}
          {onStatusChange && nextStatuses.map(status => (
            <button key={status.value} className={`btn ${status.variant}`}
              onClick={() => onStatusChange(order.id, status.value, order)}>
              {status.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function getNextStatuses(currentStatus) {
  // Solo botones de pago — el flujo de producción se gestiona desde Telegram o DashboardProduccion
  const paymentButtons = [
    { value: 'entregado_pagado',    label: 'Pagado',       variant: 'btn--success'   },
    { value: 'entregado_pendiente', label: 'Crédito',      variant: 'btn--secondary' },
    { value: 'pago_parcial',        label: 'Pago Parcial', variant: 'btn--warning'   },
  ]

  // Los botones de pago aparecen cuando la orden está lista para entregar,
  // sin importar si es local o delivery.
  const map = {
    lista:    paymentButtons,
    en_envio: paymentButtons,
  }

  return map[currentStatus] || []
}
