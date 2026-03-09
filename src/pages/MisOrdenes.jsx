import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import OrderCard from '../components/OrderCard'

export default function MisOrdenes({ profile }) {
  const [orders, setOrders]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchOrders()
    // Suscripción en tiempo real
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(*)`)
      .order('created_at', { ascending: false })
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

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.client_name.toLowerCase().includes(search.toLowerCase()) ||
      String(o.order_number).includes(search)
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total:      orders.length,
    abiertas:   orders.filter(o => o.status === 'abierta').length,
    en_proceso: orders.filter(o => o.status === 'en_proceso').length,
    listas:     orders.filter(o => o.status === 'lista').length,
    credito:    orders.filter(o => o.status === 'entregado_pendiente').length,
  }

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__logo">/// IMPRENTA</span>
        <nav className="nav-links">
          <NavLink to="/nueva-orden" className={({isActive}) => `nav-link${isActive?' active':''}`}>Nueva Orden</NavLink>
          <NavLink to="/mis-ordenes" className={({isActive}) => `nav-link${isActive?' active':''}`}>Órdenes</NavLink>
        </nav>
        <div className="page__user">
          <span className="page__role">{profile?.full_name}</span>
          <button className="btn btn--ghost" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className="page__content">
        <h1 className="page__title">Órdenes</h1>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card__label">Total</span>
            <span className="stat-card__value">{stats.total}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Abiertas</span>
            <span className="stat-card__value" style={{color:'#60a5fa'}}>{stats.abiertas}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">En Proceso</span>
            <span className="stat-card__value" style={{color:'#fb923c'}}>{stats.en_proceso}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Listas</span>
            <span className="stat-card__value" style={{color:'#4ade80'}}>{stats.listas}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Crédito</span>
            <span className="stat-card__value" style={{color:'#fbbf24'}}>{stats.credito}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="filters-row">
          <input
            className="form-input"
            type="text"
            placeholder="Buscar cliente o # de orden..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="form-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="abierta">Abierta</option>
            <option value="en_proceso">En Proceso</option>
            <option value="lista">Lista</option>
            <option value="en_envio">En Envío</option>
            <option value="entregado_pagado">Entregado / Pagado</option>
            <option value="entregado_pendiente">Entregado / Pendiente</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>

        {/* Grid de órdenes */}
        {loading ? (
          <div className="loading-screen" style={{height:'200px'}}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="orders-grid">
            {filtered.length === 0
              ? <p className="empty-state">No se encontraron órdenes.</p>
              : filtered.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    userRole={profile?.role}
                    onStatusChange={handleStatusChange}
                    onEdit={() => {/* TODO: modal de edición */}}
                    allowedRoles={{ edit: ['designer', 'admin', 'owner'] }}
                  />
                ))
            }
          </div>
        )}
      </main>
    </div>
  )
}
