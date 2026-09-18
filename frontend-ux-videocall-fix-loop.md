# Especificación del Bucle: Corrección de Foco en Historias y Reintento de Videollamada (frontend-ux-videocall-fix-loop.md)

## 1. Objetivo
1. Corregir la pérdida de foco en el input de búsqueda por cédula dentro del módulo de Historias Médicas.
2. Permitir que la videollamada se vuelva a solicitar/iniciar múltiples veces dentro de la misma sesión de telemedicina activa sin forzar el cierre del caso.

## 2. Acciones Requeridas

### A. Frontend — Historias Médicas (`frontend/src/pages/` o `frontend/src/components/`)
1. **Estabilización de Input:**
   - Asegurar que el estado del input de cédula mantenga la referencia del DOM sin re-renderizar todo el árbol en cada `onChange`.
   - Evitar re-declarar componentes funcionales dentro de componentes padre.

### B. Frontend — Módulo de Videollamada (`frontend/src/components/VideoCall/` o `Telemedicina.jsx`)
1. **Reset de Estado de Videollamada:**
   - Al cerrar/colgar la llamada, limpiar la sala activa o permitir que el botón "Solicitar/Iniciar Videollamada" re-genere un nuevo token/evento de llamada para la misma atención.
   - Asegurar que el listener de la llamada no quede en estado bloqueado (`ENDED`).

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Inserción continua de caracteres en el buscador de cédulas sin perder el foco.
2. Posibilidad de abrir, cerrar y reabrir la videollamada N veces en una sola sesión de telemedicina.
2. Ejecución exitosa de la build/pruebas del frontend (`npm run build` o `npm test`).

## 4. Presupuesto
- **Presupuesto:** 2 beats.

