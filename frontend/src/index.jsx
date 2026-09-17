// File: src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client'; // Importa desde 'react-dom/client' para React 18+
import App from './App'; // Importa tu componente principal App

// Crea una raíz de renderizado para React 18+
const root = ReactDOM.createRoot(document.getElementById('root'));

// Renderiza el componente App dentro del elemento 'root' en public/index.html
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

