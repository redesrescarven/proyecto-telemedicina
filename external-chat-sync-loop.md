# Especificación del Bucle: Mapeo Correcto y Sincronización de Telemedicina (external-chat-sync-loop.md)

## 1. Objetivo
Corregir el payload del endpoint `POST /api/external/telemedicine-sessions` para que registre los datos del paciente correctamente (Nombre, Cédula, Teléfono, Email, Fecha) y aparezca de inmediato tanto en el Monitor como en el módulo de Telemedicina (cola de chat).

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Mapeo de Campos de Paciente:**
   - Extraer y normalizar los campos recibidos:
     * `cedula`: desde `req.body.cedula` o `req.body.userId`
     * `nombre`: desde `req.body.nombre` o `req.body.patientName`
     * `telefono`: desde `req.body.telefono` o `req.body.patientPhone`
     * `email`: desde `req.body.email` o `req.body.patientEmail`
     * `motivo`: desde `req.body.motivo` o `req.body.chiefComplaint`
     * `requestedAt`: `new Date().toISOString()`
2. **Inserción en Colecciones Relevantes:**
   - Guardar en la colección `emergencies` / `telemedicine_sessions` con estado `'PENDIENTE'` o `'WAITING_DOCTOR'`.
   - Asegurar que la bandera `tipo: 'TELEMEDICINA'` y `source: 'CALL_CENTER_API'` estén presentes.

### B. Pruebas Automatizadas (`backend/tests/externalApi.test.js`)
1. Verificar que la respuesta del endpoint contenga los campos `cedula`, `nombre` y `requestedAt` formateados.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución de `npm test` finalizando en **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

