import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import './ClientAutocomplete.css'

/**
 * ClientAutocomplete
 * Props:
 *   onSelect(client)   — cliente existente seleccionado
 *   onNew(name)        — nombre escrito que no existe aún
 */
export default function ClientAutocomplete({ onSelect, onNew }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [selected, setSelected]   = useState(null)
  const [showDrop, setShowDrop]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const debounceRef               = useRef(null)
  const wrapperRef                = useRef(null)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function search(text) {
    if (!text || text.length < 2) {
      setResults([])
      setShowDrop(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email, nit')
      .ilike('name', `%${text}%`)
      .limit(8)
    setResults(data || [])
    setShowDrop(true)
    setLoading(false)
  }

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    setSelected(null)
    onNew(val) // Siempre avisamos el texto actual como "nuevo"

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 280)
  }

  function handleSelect(client) {
    setQuery(client.name)
    setSelected(client)
    setShowDrop(false)
    setResults([])
    onSelect(client)
  }

  function handleClear() {
    setQuery('')
    setSelected(null)
    setResults([])
    setShowDrop(false)
    onNew('')
  }

  return (
    <div className="client-ac" ref={wrapperRef}>
      <div className="client-ac__input-wrap">
        <input
          className={`form-input client-ac__input ${selected ? 'client-ac__input--selected' : ''}`}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 2 && setShowDrop(true)}
          placeholder="Nombre del cliente..."
          autoComplete="off"
        />
        {loading && <span className="client-ac__spinner" />}
        {selected && (
          <button type="button" className="client-ac__clear" onClick={handleClear} title="Limpiar">✕</button>
        )}
      </div>

      {/* Badge cliente existente */}
      {selected && (
        <div className="client-ac__badge">
          <span className="client-ac__badge-icon">✓</span>
          <span>Cliente existente</span>
          {selected.phone && <span className="client-ac__badge-detail">· {selected.phone}</span>}
          {selected.nit   && <span className="client-ac__badge-detail">· NIT {selected.nit}</span>}
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
