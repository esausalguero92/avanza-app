import './StatusBadge.css'

const STATUS_CONFIG = {
  abierta:              { label: 'Abierta',            color: 'status--abierta' },
  en_proceso:           { label: 'En Proceso',         color: 'status--en-proceso' },
  lista:                { label: 'Lista',              color: 'status--lista' },
  en_envio:             { label: 'En Envío',           color: 'status--en-envio' },
  entregado_pagado:     { label: 'Entregado / Pagado', color: 'status--pagado' },
  entregado_pendiente:  { label: 'Entregado / Pendiente', color: 'status--pendiente' },
  cerrada:              { label: 'Cerrada',            color: 'status--cerrada' },
}

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, color: '' }
  return (
    <span className={`status-badge ${config.color}`}>
      {config.label}
    </span>
  )
}
