import StatusBadge from './StatusBadge'
import './OrderCard.css'

const PRIORITY_CONFIG = {
  urgente:     { label: 'URGENTE',     color: '#ef4444' },
  prioritaria: { label: 'PRIORITARIA', color: '#f59e0b' },
  normal:      { label: null,          color: null },
}

export default function OrderCard({ order, onStatusChange, onEdit, allowedRoles, userRole }) {
  const canEdit = allowedRoles?.edit?.includes(userRole)
  const nextStatuses = getNextStatuses(order.status, userRole)
  const prio = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.normal

  return (
    <div className={`order-card${order.priority !== 'normal' ? ' order-card--priority' : ''}`}
      style={prio.color ? { '--prio-color': prio.color } : {}}>

      <div className="order-card__header">
        <span className="order-card__number">#{order.order_number}</span>
        <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
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
            <span>x{item.quantity} — Q{item.subtotal?.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="order-card__footer">
        <div className="order-card__totals">
          <span className="order-card__total">Total: Q{order.total_amount?.toFixed(2)}</span>
          {order.credit_amount > 0 && (
            <span className="order-card__credit">Crédito: Q{order.credit_amount?.toFixed(2)}</span>
          )}
        </div>

        <div className="order-card__actions">
          {canEdit && (
            <button className="btn btn--secondary" onClick={() => onEdit(order)}>Editar</button>
          )}
          {nextStatuses.map(status => (
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

function getNextStatuses(currentStatus, role) {
  const transitions = {
    operator: {
      abierta:    [{ value: 'en_proceso', label: 'Iniciar',      variant: 'btn--primary' }],
      en_proceso: [{ value: 'lista',      label: 'Marcar Lista', variant: 'btn--success' }],
    },
    designer: {
      lista: [{ value: 'en_envio', label: 'Enviar', variant: 'btn--primary' }],
    },
    admin: {
      abierta:             [{ value: 'en_proceso', label: 'Iniciar', variant: 'btn--primary' }],
      en_proceso:          [{ value: 'lista',      label: 'Lista',   variant: 'btn--success' }],
      lista:               [{ value: 'en_envio',   label: 'Enviar',  variant: 'btn--primary' }],
      entregado_pendiente: [{ value: 'cerrada',    label: 'Cerrar',  variant: 'btn--danger'  }],
      entregado_pagado:    [{ value: 'cerrada',    label: 'Cerrar',  variant: 'btn--danger'  }],
    },
    owner: {
      abierta:             [{ value: 'en_proceso', label: 'Iniciar', variant: 'btn--primary' }],
      en_proceso:          [{ value: 'lista',      label: 'Lista',   variant: 'btn--success' }],
      lista:               [{ value: 'en_envio',   label: 'Enviar',  variant: 'btn--primary' }],
      entregado_pendiente: [{ value: 'cerrada',    label: 'Cerrar',  variant: 'btn--danger'  }],
      entregado_pagado:    [{ value: 'cerrada',    label: 'Cerrar',  variant: 'btn--danger'  }],
    },
  }
  return transitions[role]?.[currentStatus] || []
}
