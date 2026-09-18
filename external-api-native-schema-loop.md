# Especificación del Bucle: Inyección Nativa en telemedicine_sessions (external-api-native-schema-loop.md)

## 1. Objetivo
Garantizar que `POST /api/external/telemedicine-sessions` escriba directamente en la colección `telemedicine_sessions` replicando exactamente el esquema nativo de la App Móvil.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Punto de Escritura:** Escribir únicamente en `db.collection('telemedicine_sessions')`.
2. **Normalización de Campos:**
   - Normalizar entradas (`cedula` -> `userCedula`, `nombre` -> `userName`, `telefono` -> `userPhone`, `email` -> `userEmail`).
   - Generar `caseNumber` con formato `'TM-2026-' + Math.floor(1000 + Math.random() * 9000)`.
   - Asignar `userId`: `'EXT-' + userCedula`.
   - Asignar `type`: `'direct'`.
   - Asignar `status`: `'requested'`.
   - Asignar `source`: `req.body.source || 'CALL_CENTER_API'`.
   - Utilizar `admin.firestore.Timestamp.now()` o `FieldValue.serverTimestamp()` para `createdAt`, `timestamp` y `updatedAt`.
   - Asignar `emergencyId`: `null`, `latitude`: `0.0`, `longitude`: `0.0`.

### B. Backend Pruebas (`backend/tests/externalApi.test.js`)
1. Validar que las aserciones apunten a la colección `telemedicine_sessions` y verifiquen las claves nativas `userName`, `userCedula`, `type: "direct"`.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución de `npm test` con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

