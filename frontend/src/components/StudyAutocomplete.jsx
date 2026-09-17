// src/components/StudyAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';

const StudyAutocomplete = ({ 
    value, 
    onChange, 
    studyType, // 'laboratorio', 'radiologia', o 'imagenologia'
    placeholder = "Buscar estudio...",
    disabled = false
}) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const debounceTimer = useRef(null);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSuggestions = async (term) => {
        if (!term || term.length < 2 || !studyType) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(
                `/api/autocomplete/studies?q=${encodeURIComponent(term)}&type=${studyType}`
            );
            const data = await res.json();
            
            if (data.success) {
                setSuggestions(data.data);
                setShowDropdown(data.data.length > 0);
            }
        } catch (err) {
            console.error('Error fetching studies:', err);
        } finally {
            setIsLoading(false);
        }
    };

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
                disabled={disabled || !studyType}
                className="w-full border p-2 rounded pr-8 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
            />
            
            {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent"></div>
                </div>
            )}

            {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map((item, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => handleSelect(item)}
                            className="w-full text-left px-4 py-2 hover:bg-indigo-50 border-b last:border-b-0 text-sm"
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

export default StudyAutocomplete;

