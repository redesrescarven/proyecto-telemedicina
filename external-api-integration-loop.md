# Especificación del Bucle: Integración de API Externa con Autenticación por API Key (external-api-integration-loop.md)

## 1. Objetivo
Exponer un API externo estable (`/api/external`) para que sistemas de terceros (integradores, partner apps, health-tech) consuman datos operativos de la plataforma (emergencias y telemedicina) de forma controlada, sin depender de las cabeceras internas de rol de operador (`x-operator-*`), sino mediante una **API Key secreta**.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js` — router nuevo)
1. **Middleware de autenticación por API Key:**
   - Lee la cabecera `x-api-key`.
   - Compara contra `process.env.EXTERNAL_API_KEY` (con fallback determinista de desarrollo).
   - Cabecera ausente o inválida → **401** `{ success: false, message: 'Acceso denegado: API Key inválida o ausente.' }`.
2. **Endpoint `GET /api/external/health`:** ping autenticado → **200** `{ success: true, service, status: 'ok', timestamp }`.
3. **Endpoint `GET /api/external/emergencies`:** lista emergencias desde Firestore (`artifacts/{appId}/public/data/emergencyRequests`) con contrato ligero y normalizado (id, userId, status, name, phone, timestamp ISO, operatorName), ordenadas por `timestamp` descendente → **200** `{ success, total, emergencies }`.
4. **Endpoint `POST /api/external/telemedicine-sessions`:** crea una solicitud de telemedicina externa. Valida `userId` y `doctorId` (**400** si faltan), persiste con `status: 'requested'`, `createdBy: 'external-api'`, `createdAt` serverTimestamp y `createdAtIso` → **201** `{ success, sessionId, status }`.

### B. Integración (`backend/src/server.js`)
- Importar el router y montarlo en `/api/external` (`app.use('/api/external', externalApiRouter)`), sin alterar endpoints existentes.

### C. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. `GET /api/external/health`: 401 sin API Key, 401 con API Key incorrecta, 200 con API Key correcta.
2. `GET /api/external/emergencies`: 200 con lista vacía, 200 con emergencias sembradas ordenadas desc, 401 sin API Key.
3. `POST /api/external/telemedicine-sessions`: 400 si faltan `userId`/`doctorId`, 201 creando la sesión con `status: 'requested'` y `createdBy: 'external-api'`, 401 sin API Key.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución exitosa del test suite con `npm test` finalizando en **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 1 beat.
- **Bitácora:** Actualizar `progress.md` indicando la habilitación del API externo con autenticación por API Key.