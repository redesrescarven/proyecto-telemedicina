// src/components/DiagnosticAutocomplete.jsx
import React, { useState, useEffect, useRef } from "react";

const DiagnosticAutocomplete = ({
  value,
  onChange,
  placeholder = "Buscar diagnóstico CIE10...",
  disabled = false
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // 🆕 Referencia para saber si acabamos de seleccionar un item
  const ignoreNextEffect = useRef(false);

  const wrapperRef = useRef(null);

  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // 🔍 Búsqueda en la API
  useEffect(() => {
    // 🆕 Si acabamos de seleccionar, no buscar
    if (ignoreNextEffect.current) {
      ignoreNextEffect.current = false;
      return;
    }

    if (query.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/cie10/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (Array.isArray(data)) {
          setResults(data);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Error CIE10:", error);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSelect = (item) => {
    const text = item.descripcion;
    
    // 🆕 Bloquear el próximo useEffect antes de actualizar los estados
    ignoreNextEffect.current = true;
    
    setQuery(text);
    onChange(text);
    setResults([]); // Limpiar lista
    setIsOpen(false); // Cerrar dropdown
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          ignoreNextEffect.current = false; // Si escribe, permitimos búsqueda
          setQuery(e.target.value);
        }}
        onFocus={() => query.length >= 3 && results.length > 0 && setIsOpen(true)}
        disabled={disabled}
      />

      {loading && (
        <div className="absolute right-3 top-3 border-2 border-red-500 border-t-transparent animate-spin h-5 w-5 rounded-full"></div>
      )}

      {isOpen && results.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-xl">
          {results.map((item, index) => (
            <li
              key={index}
              className="p-3 hover:bg-red-50 cursor-pointer border-b border-gray-100 last:border-b-0 text-sm text-gray-700"
              onClick={() => handleSelect(item)}
            >
              {item.descripcion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DiagnosticAutocomplete;

