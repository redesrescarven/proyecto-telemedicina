# Especificación del Bucle: Redirección de Colección a telemedicine_sessions (external-api-collection-fix-loop.md)

## 1. Objetivo
Asegurar que el endpoint `POST /api/external/telemedicine-sessions` escriba única y exclusivamente en la colección `telemedicine_sessions` de Firestore, utilizando el esquema nativo idéntico al generado por la App Móvil.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Cambio de Colección Destino:**
   - Apuntar la referencia de Firestore a `db.collection('telemedicine_sessions')`.
   - Eliminar cualquier escritura hacia `emergencyRequests` o `emergencies`.
2. **Campos del Documento Nativo:**
   - `caseNumber`: `'TM-2026-' + Math.floor(1000 + Math.random() * 9000)`
   - `userName`: `req.body.userName` || `req.body.nombre` || `req.body.patientName`
   - `userCedula`: `req.body.userCedula` || `req.body.cedula` || `req.body.userId`
   - `userPhone`: `req.body.userPhone` || `req.body.telefono` || `req.body.patientPhone`
   - `userEmail`: `req.body.userEmail` || `req.body.email` || `req.body.patientEmail`
   - `userId`: `userCedula`
   - `type`: `'direct'`
   - `status`: `'requested'`
   - `source`: `'CALL_CENTER_API'`
   - `emergencyId`: `null`
   - `latitude`: `null`
   - `longitude`: `null`
   - `timestamp`: `admin.firestore.FieldValue.serverTimestamp()`
   - `createdAt`: `admin.firestore.FieldValue.serverTimestamp()`
   - `updatedAt`: `admin.firestore.FieldValue.serverTimestamp()`
   - `motivo`: `req.body.motivo` || `req.body.chiefComplaint` || `''`

### B. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. Verificar en los mocks que la escritura se realice sobre la colección `telemedicine_sessions`.
2. Garantizar ejecución de `npm test` finalizando en **exit code 0**.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. `npm test` finaliza con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.
