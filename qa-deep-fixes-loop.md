# Especificación del Bucle: Corrección de Creación de Usuarios y Campo Fecha en Historias (qa-deep-fixes-loop.md)

## 1. Objetivo
1. Prevenir que `POST /api/users` retorne HTML o expulse excepciones no controladas al crear un usuario con rol médico, asegurando que devuelva siempre JSON estructurado.
2. Formatear la variable exacta que alimenta el campo 'Fecha:' en la vista de detalle del historial médico.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/users.js` o similar)
1. Proteger la ruta `POST /api/users` con un bloque `try/catch` global que devuelva `res.status(500).json({ success: false, message: error.message })` en caso de fallo, garantizando que el frontend reciba JSON siempre.
2. Validar la creación de usuario en Firebase Auth y Firestore sin romper la ejecución.

### B. Frontend (`frontend/src/components/`)
1. **Creación de Usuario (`SystemUserManagement.jsx`):**
   - Asegurar que `response.ok` devuelva el JSON de error correctamente sin romper en `JSON.parse`.
2. **Detalle de Historia (`MedicalHistoryDetail.jsx` / `HistoryDetail.jsx` / `Telemedicina.jsx`):**
   - Identificar la propiedad utilizada para la cabecera `Fecha:` (ej. `history.date`, `history.fecha`, `history.createdAt`).
   - Aplicar la función de normalización de fecha a esa propiedad específica.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Creación de usuario retornando un mensaje JSON legible en caso de error.
2. Cabecera 'Fecha:' mostrando fecha válida en el modal de detalle de historia.
3. Compilación/Pruebas finalizando con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

