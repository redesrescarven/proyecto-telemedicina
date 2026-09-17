// src/components/PrincipioActivoAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';

const PrincipioActivoAutocomplete = ({ 
    value, 
    onChange, 
    placeholder = "Buscar principio activo...",
    backendUrl = '',
    disabled = false
}) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const debounceTimer = useRef(null);
    const wrapperRef = useRef(null);

    // Cerrar dropdown al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Buscar en Oracle
    const fetchSuggestions = async (term) => {
        if (!term || term.length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        setIsLoading(true);
        try {
            // Llama al endpoint que creaste en el Paso 3/4
            const res = await fetch(
                `/api/autocomplete/principio-activo?q=${encodeURIComponent(term)}&limit=15`
            );
            const data = await res.json();
            
            if (data.success) {
                setSuggestions(data.data);
                setShowDropdown(data.data.length > 0);
            }
        } catch (err) {
            console.error('Error fetching suggestions:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar cambio con debounce (espera 300ms antes de buscar)
    const handleInputChange = (e) => {
        const val = e.target.value;
        onChange(val);
        
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => fetchSuggestions(val), 300);
    };

    const handleSelect = (item) => {
        onChange(item);
        setSuggestions([]);
        setShowDropdown(false);
    };

    useEffect(() => () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }, []);

    return (
        <div className="relative" ref={wrapperRef}>
            <input
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={() => value?.length >= 2 && setShowDropdown(suggestions.length > 0)}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full border p-2 rounded pr-8 focus:ring-2 focus:ring-blue-500"
            />
            
            {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                </div>
            )}

            {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map((item, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => handleSelect(item)}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b last:border-b-0 text-sm"
                        >
                            {item}
                        </button>
                    ))}
                    {suggestions.length === 0 && !isLoading && (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">Sin resultados</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PrincipioActivoAutocomplete;

