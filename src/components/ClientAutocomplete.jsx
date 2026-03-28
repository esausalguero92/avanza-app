import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import './ClientAutocomplete.css'

/**
 * ClientAutocomplete
 * Props:
 *   onSelect(client)   — cliente existente seleccionado
 *   onNew(name)        — nombre escrito que no existe aún (solo si no hay coincidencias)
 */
export default function ClientAutocomplete({ onSelect, onNew }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [selected, setSelected]   = useState(null)
  const [showDrop, setShowDrop]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [warned, setWarned]       = useState(false)   // ← NUEVO: hay coincidencias sin seleccionar
  const debounceRef               = useRef(null)
  const wrapperRef                = useRef(null)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        // Si se cierra el dropdown con resultados pero sin seleccionar → advertir
        if (results.length > 0 && !selected && query.length >= 2) {
          setWarned(true)
          onNew('') // Bloquear: no permitir crear mientras haya coincidencias
        }
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [results, selected, query])

  async function search(text) {
    if (!text || text.length < 2) {
      setResults([])
      setShowDrop(false)
      setWarned(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email, nit, address')
      .ilike('name', `%${text}%`)
      .limit(8)
    const found = data || []
    setResults(found)
    setShowDrop(true)
    setLoading(false)

    // Si no hay resultados, es cliente nuevo legítimo
    if (found.length === 0) {
      setWarned(false)
      onNew(text)
    } else {
      // Hay coincidencias — no permitir crear hasta que seleccionen
      onNew('')
    }
  }

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    setSelected(null)
    setWarned(false)

    if (!val) {
      onNew('')
      setResults([])
      setShowDrop(false)
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 280)
  }

  function handleSelect(client) {
    setQuery(client.name)
    setSelected(client)
    setShowDrop(false)
    setResults([])
    setWarned(false)
    onSelect(client)
  }

  function handleClear() {
    setQuery('')
    setSelected(null)
    setResults([])
    setShowDrop(false)
    setWarned(false)
    onNew('')
  }

  return (
    <div className="client-ac" ref={wrapperRef}>
      <div className="client-ac__input-wrap">
        <input
          className={`form-input client-ac__input ${selected ? 'client-ac__input--selected' : ''} ${warned ? 'client-ac__input--warned' : ''}`}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 2 && results.length > 0 && setShowDrop(true)}
          placeholder="Nombre del cliente..."
          autoComplete="off"
        />
        {loading && <span className="client-ac__spinner" />}
        {(selected || query) && (
          <button type="button" className="client-ac__clear" onClick={handleClear} title="Limpiar">✕</button>
        )}
      </div>

      {/* Badge cliente existente ✓ */}
      {selected && (
        <div className="client-ac__badge">
          <span className="client-ac__badge-icon">✓</span>
          <span>Cliente existente</span>
          {selected.phone && <span className="client-ac__badge-detail">· {selected.phone}</span>}
          {selected.nit   && <span className="client-ac__badge-detail">· NIT {selected.nit}</span>}
        </div>
      )}

      {/* ⚠️ Advertencia de posible duplicado */}
      {warned && !selected && (
        <div className="client-ac__warn">
          <span className="client-ac__warn-icon">⚠️</span>
          <span>Hay clientes con ese nombre. Selecciona uno de la lista o borra para ingresar uno nuevo.</span>
        </div>
      )}

      {/* Dropdown de sugerencias */}
      {showDrop && results.length > 0 && (
        <ul className="client-ac__dropdown">
          {results.map(c => (
            <li
              key={c.id}
              className="client-ac__option"
              onMouseDown={() => handleSelect(c)}
            >
              <span className="client-ac__option-name">{c.name}</span>
              <span className="client-ac__option-detail">
                {[c.phone, c.email, c.nit ? `NIT: ${c.nit}` : null].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Sin resultados — crear nuevo */}
      {showDrop && results.length === 0 && query.length >= 2 && !loading && (
        <div className="client-ac__new">
          <span className="client-ac__new-icon">+</span>
          Se creará nuevo cliente: <strong>{query}</strong>
        </div>
      )}
    </div>
  )
}
