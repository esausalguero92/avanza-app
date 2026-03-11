import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import './Bodega.css'

export default function Bodega({ profile }) {
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedItem, setSelected] = useState(null)
  const [movements, setMovements]   = useState([])
  const [movLoading, setMovLoading] = useState(false)

  // Modal de movimiento
  const [showModal, setShowModal]   = useState(false)
  const [movType, setMovType]       = useState('entrada')
  const [movQty, setMovQty]         = useState('')
  const [movNotes, setMovNotes]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const canWrite = ['warehouse', 'admin', 'owner'].includes(profile?.role)

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('active', true)
      .order('name')
    setItems(data || [])
    setLoading(false)
  }

  async function fetchMovements(itemId) {
    setMovLoading(true)
    const { data } = await supabase
      .from('inventory_movements')
      .select('*, profiles(full_name)')
      .eq('inventory_id', itemId)
      .order('created_at', { ascending: false })
      .limit(50)
    setMovements(data || [])
    setMovLoading(false)
  }

  function openMovement(item, type) {
    setSelected(item)
    setMovType(type)
    setMovQty('')
    setMovNotes('')
    setError('')
    setShowModal(true)
  }

  function selectItem(item) {
    setSelected(item)
    fetchMovements(item.id)
  }

  async function handleSaveMovement(e) {
    e.preventDefault()
    const qty = parseInt(movQty, 10)
    if (!qty || qty <= 0) { setError('La cantidad debe ser mayor a 0.'); return }
    if (movType === 'salida' && qty > selectedItem.stock) {
      setError(`Stock insuficiente. Disponible: ${selectedItem.stock}`); return
    }

    setSaving(true); setError('')

    const { error: err } = await supabase
      .from('inventory_movements')
      .insert({
        inventory_id: selectedItem.id,
        type:         movType,
        quantity:     qty,
        notes:        movNotes.trim() || null,
        created_by:   profile.id,
      })

    if (err) {
      setError('Error al registrar movimiento: ' + err.message)
    } else {
      setSuccess(`${movType === 'entrada' ? 'Entrada' : 'Salida'} de ${qty} registrada.`)
      setShowModal(false)
      fetchItems()
      if (selectedItem) fetchMovements(selectedItem.id)
    }
    setSaving(false)
  }

  const totalStock = items.reduce((s, i) => s + i.stock, 0)
  const lowStock   = items.filter(i => i.stock <= i.min_stock)

  return (
    <div className="page">
      <Navbar profile={profile} />
      <main className="page__content">
        <h1 className="page__title">Bodega</h1>

        {/* Stats */}
        <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-card__label">Total en Stock</span>
            <span className="stat-card__value">{totalStock}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Productos</span>
            <span className="stat-card__value">{items.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Stock Bajo</span>
            <span className="stat-card__value" style={{ color: lowStock.length > 0 ? '#ef4444' : '#4ade80' }}>
              {lowStock.length}
            </span>
          </div>
        </div>

        {success && <p className="success-text" style={{ marginBottom: '1rem' }}>{success}</p>}

        <div className="bodega-layout">
          {/* Lista de productos */}
          <div className="bodega-items">
            <h2 className="section-title">Placas</h2>
            {loading ? (
              <div className="loading-screen" style={{ height: '150px' }}><div className="loading-spinner" /></div>
            ) : (
              items.map(item => {
                const isLow      = item.stock <= item.min_stock
                const isSelected = selectedItem?.id === item.id
                return (
                  <div
                    key={item.id}
                    className={`bodega-item${isSelected ? ' bodega-item--selected' : ''}${isLow ? ' bodega-item--low' : ''}`}
                    onClick={() => selectItem(item)}
                  >
                    <div className="bodega-item__info">
                      <span className="bodega-item__name">{item.name}</span>
                      {item.description && <span className="bodega-item__desc">{item.description}</span>}
                    </div>
                    <div className="bodega-item__stock-area">
                      <div className="bodega-item__stock-block">
                        <span className="bodega-item__stock" style={{ color: isLow ? '#ef4444' : '#4ade80' }}>
                          {item.stock}
                        </span>
                        <span className="bodega-item__unit">{item.unit}</span>
                      </div>
                      {isLow && <span className="bodega-item__alert">⚠ Stock bajo</span>}
                    </div>
                    {canWrite && (
                      <div className="bodega-item__btns" onClick={e => e.stopPropagation()}>
                        <button className="btn btn--success" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                          onClick={() => openMovement(item, 'entrada')}>
                          + Entrada
                        </button>
                        <button className="btn btn--danger" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                          disabled={item.stock === 0}
                          onClick={() => openMovement(item, 'salida')}>
                          − Salida
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Historial */}
          <div className="bodega-history">
            <h2 className="section-title">
              {selectedItem ? `Historial — ${selectedItem.name}` : 'Historial'}
            </h2>
            {!selectedItem ? (
              <p className="empty-state" style={{ fontSize: '0.85rem' }}>Selecciona un producto para ver su historial.</p>
            ) : movLoading ? (
              <div className="loading-screen" style={{ height: '150px' }}><div className="loading-spinner" /></div>
            ) : movements.length === 0 ? (
              <p className="empty-state" style={{ fontSize: '0.85rem' }}>Sin movimientos registrados.</p>
            ) : (
              <div className="mov-list">
                {movements.map(m => (
                  <div key={m.id} className={`mov-row mov-row--${m.type}`}>
                    <div className="mov-row__left">
                      <span className="mov-row__type">{m.type === 'entrada' ? '▲ Entrada' : '▼ Salida'}</span>
                      <span className="mov-row__notes">{m.notes || '—'}</span>
                    </div>
                    <div className="mov-row__right">
                      <span className="mov-row__qty">{m.type === 'entrada' ? '+' : '-'}{m.quantity}</span>
                      <span className="mov-row__meta">
                        {m.profiles?.full_name || '—'} · {new Date(m.created_at).toLocaleDateString('es-GT')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal de movimiento */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">
                {movType === 'entrada' ? '+ Entrada' : '− Salida'} — {selectedItem?.name}
              </h2>
              <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveMovement} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">
                  Cantidad ({selectedItem?.unit}) *
                  {movType === 'salida' && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    Stock disponible: {selectedItem?.stock}
                  </span>}
                </label>
                <input className="form-input" type="number" min="1" required autoFocus
                  value={movQty} onChange={e => setMovQty(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Notas (opcional)</label>
                <input className="form-input" type="text"
                  value={movNotes} onChange={e => setMovNotes(e.target.value)}
                  placeholder={movType === 'entrada' ? 'Proveedor, factura, etc.' : 'Orden usada, motivo, etc.'} />
              </div>
              {error && <p className="error-text">{error}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={`btn ${movType === 'entrada' ? 'btn--success' : 'btn--danger'}`} disabled={saving}>
                  {saving ? 'Guardando...' : `Registrar ${movType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
