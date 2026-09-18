# Especificación del Bucle: Alineación Estricta de Esquema Firestore con App Móvil (external-api-schema-align-loop.md)

## 1. Objetivo
Alinear el esquema de documentos creados por `POST /api/external/telemedicine-sessions` en Firestore para que coincida exactamente con los campos creados por la App Móvil (`caseNumber`, `timestamp`, `userCedula`, `userName`, `userPhone`, `userEmail`, `type: "direct"`, etc.).

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Generación de `caseNumber`:**
   - Generar correlativo: `'TM-2026-' + Math.floor(1000 + Math.random() * 9000)` (o similar basado en timestamp).
2. **Estructura Exacta del Documento Firestore:**
   - Guardar en `telemedicine_sessions`:
     * `caseNumber`: string
     * `userName`: `req.body.nombre` || `req.body.patientName` || `req.body.userName`
     * `userCedula`: `req.body.cedula` || `req.body.userId` || `req.body.userCedula`
     * `userPhone`: `req.body.telefono` || `req.body.patientPhone` || `req.body.userPhone`
     * `userEmail`: `req.body.email` || `req.body.patientEmail` || `req.body.userEmail`
     * `userId`: `userCedula` (o ID generado 'EXT-' + Date.now())
     * `type`: `'direct'`
     * `source`: `req.body.source` || `'CALL_CENTER_API'`
     * `status`: `'requested'`
     * `emergencyId`: `null`
     * `latitude`: `req.body.latitude` || `null`
     * `longitude`: `req.body.longitude` || `null`
     * `timestamp`: `admin.firestore.FieldValue.serverTimestamp()`
     * `createdAt`: `admin.firestore.FieldValue.serverTimestamp()`
     * `updatedAt`: `admin.firestore.FieldValue.serverTimestamp()`
     * `motivo`: `req.body.motivo` || `req.body.chiefComplaint` || `''`

### B. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. Actualizar las aserciones para verificar que los campos `caseNumber`, `userName`, `userCedula`, `userPhone`, `userEmail` y `type: "direct"` estén presentes en la respuesta / mock.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución de `npm test` con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

