# Especificación del Bucle: Endpoint API Externa para Emergencias (external-api-emergency-loop.md)

## 1. Objetivo
Crear el endpoint `POST /api/external/emergency-requests` para inyectar emergencias directamente en la ruta de Firestore `artifacts/default-app-id/public/data/emergencyRequests` con autenticación por `X-API-KEY`.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Nuevo Endpoint `POST /api/external/emergency-requests`:**
   - Validar cabecera `x-api-key`.
   - Normalizar campos (`cedula`, `nombre`, `telefono`, `email`).
   - Escribir documento en: `db.collection('artifacts').doc('default-app-id').collection('public').doc('data').collection('emergencyRequests')`.
   - Incluir campos nativos:
     * `isAffiliate`: `false`
     * `latitude`: `req.body.latitude || 10.4819902`
     * `longitude`: `req.body.longitude || -66.8641199`
     * `status`: `'pending'`
     * `timestamp`: `Date.now()`
     * `userCedula`, `userEmail`, `userName`, `userPhone`
     * `userId`: `'EXT-' + userCedula`
     * `wantsMoreInfo`: `false`
     * `motivo`: `req.body.motivo || ''`
     * `source`: `req.body.source || 'CALL_CENTER_API'`
   - Retornar status `201 Created` con el `requestId` generado.

### B. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. Añadir prueba de integración para `POST /api/external/emergency-requests` verificando `201 Created` y estructura correcta.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. `npm test` finaliza con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

