# Especificación del Bucle: Atención Liviana con Datos de Paciente Embebidos (external-api-embedded-patient-loop.md)

## 1. Objetivo
Ajustar el endpoint `POST /api/external/telemedicine-sessions` para que registre atenciones en Firestore de forma directa y liviana (con datos de paciente embebidos) sin tocar ni requerir la colección de usuarios (`users`).

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Atención Autosuficiente (Sin colecciones auxiliares):**
   - No consultar ni escribir en la colección `users`.
   - Generar un documento en la colección de atenciones (`telemedicine_sessions` / `emergencies`) con los datos del paciente embebidos.
2. **Normalización de Estructura:**
   - Extraer campos: `cedula` (fallback `userId`), `nombre` (fallback `patientName`), `telefono`, `email`, `motivo` (fallback `chiefComplaint`), `doctorId` (default `'GENERAL'`).
   - Mapear variables para compatibilidad con la UI:
     * `patientData`: `{ cedula, nombre, telefono, email }`
     * `userData`: `{ cedula, nombre, telefono, email }`
     * `cedula`, `nombre`, `telefono`, `email`, `motivo`
     * `requestedAt`: `new Date().toISOString()`
     * `createdAt`: `Date.now()`
     * `status`: `'requested'`
     * `tipo`: `'TELEMEDICINA'`
     * `source`: `'CALL_CENTER_API'`

### B. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. Verificar que una petición con datos básicos responda `201 Created` y retorne la estructura con los objetos embebidos.
2. Confirmar que no exija existencia previa de `userId` o usuario registrado.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución del test suite `npm test` con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

