import StatusBadge from './StatusBadge'
import './OrderCard.css'

const PRIORITY_CONFIG = {
  urgente:     { label: 'URGENTE',     color: '#ef4444' },
  prioritaria: { label: 'PRIORITARIA', color: '#f59e0b' },
  normal:      { label: null,          color: null },
}

export default function OrderCard({ order, onStatusChange, onEdit, allowedRoles, userRole, context }) {
  const canEdit      = allowedRoles?.edit?.includes(userRole)
  const isDelivery   = order.delivery_type === 'delivery'
  // context='production' = dashboard (sin botones de entrega final)
  // context='orders' = mis-ordenes (con botones de entrega para local)
  const nextStatuses = getNextStatuses(order.status, userRole, isDelivery, context)
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

      {/* Saldo pendiente si hay crédito */}
      {order.credit_amount > 0 && (
        <div className="order-card__credit">
          <span>💰 Saldo pendiente</span>
          <span className="order-card__credit-amount">Q{parseFloat(order.credit_amount).toFixed(2)}</span>
        </div>
      )}

      <div className="order-card__footer">
        <div className="order-card__actions">
          {canEdit && onEdit && (
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

function getNextStatuses(currentStatus, role, isDelivery, context) {
  const isProduction = context === 'production'

  // Transición de entrega — solo en MisOrdenes y solo para local
  // Delivery lo resuelve el repartidor por Telegram
  const entregaTransition = isDelivery
    ? [] // Telegram lo maneja
    : [
        { value: 'entregado_pagado',    label: 'Entregado / Pagado',  variant: 'btn--success'   },
        { value: 'entregado_pendiente', label: 'Entregado / Crédito', variant: 'btn--secondary' },
      ]

  const transitions = {
    designer: {
      // Solo puede marcar entrega en órdenes locales desde MisOrdenes
      lista: !isProduction ? entregaTransition : [],
    },
    operator: {
      // En dashboard: solo producción. Nunca maneja entregas
      abierta:    isProduction ? [{ value: 'en_proceso', label: 'Iniciar',    variant: 'btn--primary' }] : [],
      en_proceso: isProduction ? [{ value: 'lista',      label: 'Terminado ✓', variant: 'btn--success' }] : [],
      lista:      [], // Ya terminó su trabajo
    },
    admin: {
      abierta:             isProduction ? [{ value: 'en_proceso', label: 'Iniciar', variant: 'btn--primary' }] : [],
      en_proceso:          isProduction ? [{ value: 'lista', label: 'Terminado ✓', variant: 'btn--success' }] : [],
      lista:               !isProduction ? entregaTransition : [],
      entregado_pendiente: [{ value: 'cerrada', label: 'Cerrar', variant: 'btn--danger' }],
      entregado_pagado:    [{ value: 'cerrada', label: 'Cerrar', variant: 'btn--danger' }],
    },
    owner: {
      abierta:             isProduction ? [{ value: 'en_proceso', label: 'Iniciar', variant: 'btn--primary' }] : [],
      en_proceso:          isProduction ? [{ value: 'lista', label: 'Terminado ✓', variant: 'btn--success' }] : [],
      lista:               !isProduction ? entregaTransition : [],
      entregado_pendiente: [{ value: 'cerrada', label: 'Cerrar', variant: 'btn--danger' }],
      entregado_pagado:    [{ value: 'cerrada', label: 'Cerrar', variant: 'btn--danger' }],
    },
  }
  return transitions[role]?.[currentStatus] || []
}
