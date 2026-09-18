# Especificación del Bucle: Corrección de Ruta Anidada telemedicineSessions (external-api-nested-route-loop.md)

## 1. Objetivo
Asegurar que el endpoint `POST /api/external/telemedicine-sessions` escriba exactamente en la ruta anidada de Firestore: `artifacts/default-app-id/public/data/telemedicineSessions`.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Definición de Referencia de Colección:**
   - Reemplazar la referencia `db.collection('telemedicine_sessions')` por la ruta exacta del proyecto:
     `db.collection('artifacts').doc('default-app-id').collection('public').doc('data').collection('telemedicineSessions')`
2. **Estructura Nativa del Documento:**
   - Mantener el esquema exacto de la App Móvil:
     * `caseNumber`: `'TM-2026-' + Math.floor(1000 + Math.random() * 9000)`
     * `userName`, `userCedula`, `userPhone`, `userEmail`
     * `userId`: `'EXT-' + userCedula`
     * `type`: `'direct'`
     * `status`: `'requested'`
     * `source`: `'CALL_CENTER_API'`
     * `timestamp`, `createdAt`, `updatedAt`: `admin.firestore.FieldValue.serverTimestamp()`
     * `emergencyId`: `null`, `latitude`: `10.4820125`, `longitude`: `-66.8641175`

### B. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. Actualizar los mocks de la prueba unitaria para reflejar la ruta anidada y validar ejecución limpia.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución de `npm test` con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.
