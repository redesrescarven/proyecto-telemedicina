# progress.md - Bitácora de Progreso del Bucle Autónomo

## Estado Actual
* **Fase:** CRUD Usuarios (Eliminar, Clave, Estado) e Impresión Diagnóstica Obligatoria en Telemedicina.
* **Bucle Activo:** `qa-users-crud-and-mandatory-diagnostic-loop.md`
* **Último Estado:** COMPLETADO — Se añadió el router `backend/src/routes/admin.js` (`DELETE /api/admin/users/:uid`, `PATCH /api/admin/users/:uid/password`, `PATCH /api/admin/users/:uid/status`) y se extrajo `checkOperatorRole` a `routes/middleware.js` con bloqueo de cuentas inactivas (`status: inactive | disabled | isActive: false` → 403 "Cuenta inactivada. Contacte al administrador"). El backend ahora ejecuta `admin.auth().deleteUser` / `admin.auth().updateUser({disabled})` al eliminar/inactivar. En el Frontend: `SystemUserManagement.jsx` ganó botón **Eliminar** (modal de confirmación) y **🔑 Clave** (modal de cambio de contraseña), y el toggle "Usuario Activo" sincroniza Firebase Auth vía API; `App.jsx` pasa `user`/`operatorRole` y `updateUserIsActiveStatus` ahora pasa por la API; `Telemedicina.jsx` exige la **Impresión Diagnóstica (CIE10)** para guardar la historia (borde rojo + alerta + toast). Backend `npm test` **9 suites / 77 tests** → EXIT 0; frontend build Docker → EXIT 0.

---

## Historial de Iteraciones (Beats)

### [BEAT 0] - Configuración Inicial
* **Fecha/Hora:** Inicial
* **Acción:** Creación de la estructura Spine (`AGENTS.md`, `progress.md`, `test-suite-loop.md`).
* **Resultado:** Entorno preparado para iniciar el bucle autónomo con OpenCode.

### [BEAT 1] - Construcción de la Suite de Pruebas (Jest/Supertest)
* **Fecha/Hora:** 2026-09-16
* **Acción Principal:**
  * Dependencias agregadas en `backend/package.json`: `jest@^29.7.0` y `supertest@^7.0.0` (devDependencies) y script `"test": "jest --detectOpenHandles --forceExit"`.
  * `backend/src/server.js`: `app.listen` ahora se ejecuta solo si `require.main === module`; se exporta `app` para Supertest (sin alterar endpoints existentes).
  * Mocks manuales deterministas:
    * `backend/__mocks__/firebase-admin.js` → Firestore en memoria (collection/doc/query/transaction/collectionGroup, `.exists` booleano, `FieldValue.serverTimestamp` como estática en `firestore()`).
    * `backend/__mocks__/oracledb.js` → evita dependencias nativas de Oracle.
  * `backend/jest.config.js` + `backend/tests/setup.js`: `APP_ID=test-app-id`, `NODE_ENV=test` (determinismo independiente de `.env`).
  * `backend/tests/stubs/proxy-agent.js` (vía `moduleNameMapper`): `proxy-agent` v8 publica ESM y Jest no lo transforma en `node_modules`.
  * Suites creadas (4 suites / 26 tests):
    1. `tests/emergencies.test.js` → GET `/api/emergencies`, PUT `/api/emergencies/:id/status` (+ bloqueo de cierre sin Fase 1 y Fase 2).
    2. `tests/medicalHistory.test.js` → POST `/api/medical-history/:id/phase1` y `.../phase2` (borrador, cierre y bloqueo por re-modificación).
    3. `tests/telemedicine.test.js` → POST `/api/telemedicine/request` y PUT `/api/telemedicine/sessions/:id/status` (exige Fase 1 para cierre).
    4. `tests/autocomplete.test.js` → Autocompletado determinista (sin Oracle: query corta y tipo inválido).
  * Fracciones de `npm test`:
    * **Intento 1:** 0/26 → SyntaxError de `proxy-agent` (ESM en node_modules). Solución: stub vía `moduleNameMapper`.
    * **Intento 2:** 16/26 → `TypeError: admin.firestore.FieldValue undefined`. Solución: `FieldValue` como propiedad estática del `jest.fn()` `firestore`.
    * **Intento 3:** 26/26 PASSED.
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 4 passed, 4 total
  Tests:       26 passed, 26 total
  Time:        ~3.3 s
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
* **Notas:**
  * `backend/package-lock.json` se restableció tras verificar que una regeneración de lockfile alteraba 189 entradas de dependencias de producción (se preserva el lock original para no afectar `docker build --production`).
  * Backend en ejecución verificado sano después de instalar dev deps en el contenedor (`GET /` → 200).

### [BEAT 2] - Consulta de Historial Médico en Telemedicina
* **Fecha/Hora:** 2026-09-16
* **Acción Principal:**
  * **Backend** (`backend/src/server.js`):
    * Nuevo endpoint `GET /api/medical-history/patient/:userId/summary` protegido con `checkOperatorRole(['medico'])`.
    * Consulta Firestore en `artifacts/{appId}/users/{userId}/medicalHistory` y retorna `{ success, historias, total }` con la estructura reducida por ítem: `id`, `createdAt`, `date`, `symptoms` (de `fase1.fields.sintomas|motivoConsulta|motivo`) y `diagnosis` (de `fase2.fields.diagnosticoFinal|diagnostico`), ordenada por fecha descendente.
    * Helper `toIsoString()` para normalizar `Timestamp`/`Date`/string/number a ISO-8601.
  * **Suite de pruebas** (`backend/tests/medicalHistorySummary.test.js`): 1 test que valida 403 sin cabeceras de operador, 200 con rol médico, orden descendente y que cada ítem contenga **únicamente** las claves `createdAt`, `date`, `diagnosis`, `id`, `symptoms`.
  * **Frontend** (`frontend/src/components/Telemedicina.jsx`):
    * Botón "📜 Consultar Historial Previos" en la cabecera del modal de chat de telemedicina.
    * Modal overlay (z-index superior, cierre con "✕" y "Cerrar") que invoca la API con cabeceras `x-operator-rol`/`x-operator-uid` y renderiza tarjetas (Fecha, Síntomas, Diagnóstico) sin perder el estado del chat activo.
    * Estados nuevos: `showHistoryModal`, `patientHistory`, `isLoadingHistory`; handler `handleOpenHistory`.
  * **Despliegue:** imagen `server13_1-frontend` reconstruida y contenedor recreado (texto del botón presente en `assets`); `server13_1-backend-1` reiniciado para cargar el endpoint (`src` es bind-mount). Verificado en vivo: `403` sin cabeceras, `200` con rol `medico`.
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       27 passed, 27 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
* **Notas:**
  * El archivo de pruebas se copió al contenedor con `docker cp` (los tests no están bind-mounted); en un rebuild de imagen queda incluido desde el contexto `./backend`.

### [BEAT 3] - Arreglo de Carga de Historial y Reseteo del Formulario Médico
* **Fecha/Hora:** 2026-09-16
* **Acción Principal:**
  * **Causa corregida (doble problema reportado):**
    1. "Consultar Historial Previos" mostraba "No se pudo cargar el historial previo del paciente" cuando el `userId` llegaba inválido/ausente: el backend rompía la ruta de Firestore (`users/undefined` o path traversal) y respondía **500** en vez de un 400 controlado.
    2. Al abrir una telemedicina nueva se guardaba el último diagnóstico de la consulta anterior: `medicalForm` nunca se reseteaba al iniciar/cerrar chat, por lo que `fields: medicalForm` persistía el `diagnostico` previo en la historia nueva.
  * **Ajuste Backend** (`backend/src/server.js`, endpoint `GET /api/medical-history/patient/:userId/summary`):
    * Manejo defensivo de `userId`: si es vacío, no-string, solo espacios, contiene `/` o `..` → **400** `{ success: false, message: 'userId inválido o ausente.' }` (evita error 500 y path traversal en Firestore).
    * La lista vacía sigue respondiendo **200** `{ success: true, historias: [], total: 0 }`.
  * **Ajuste Frontend** (`frontend/src/components/Telemedicina.jsx`):
    * `emptyMedicalForm` como estado inicial; en `handleStartChat` se resetea `medicalForm` **antes** de `preloadPatientData` → el diagnóstico/síntomas anteriores ya no se arrastran a la nueva historia.
    * `handleOpenHistory`: valida `selectedEmergency.userId` (no vacío), limpia `patientHistory` al abrir y usa `encodeURIComponent(userId.trim())` en la URL.
  * **Suite de pruebas** (`backend/tests/medicalHistorySummary.test.js`): +1 test que cubre el caso reportado: `userId` inválido (`%2e%2e%2f` = `../`) → **400**, y paciente sin historias → **200** con lista vacía y `total: 0`.
  * **Despliegue:** backend reiniciado y luego recreado vía `docker compose up -d --build` (carga el `server.js` nuevo; tests/config/mocks restaurados con `docker cp` porque el Dockerfile no los incluye en la imagen). Frontend reconstruido (texto "Consultar Historial Previos" presente en assets).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       28 passed, 28 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo: `GET /` → 200; sin cabeceras → 403; `userId=../` → 400 "userId inválido o ausente."; paciente sin historial → 200 `{ historias: [], total: 0 }`.
* **Notas:**
  * El rebuild de imagen **NO** incluye `tests/`, `__mocks__/` ni devDependencies (Dockerfile usa `npm install --production` y `COPY src config`); por eso tras recrear el contenedor se restauran con `docker cp` (los dev deps sobreviven en el volumen anónimo `/app/node_modules`).

### [BEAT 4] - Bucle fix-history-loop.md: userId dinámico en Frontend y defensa `null` en Backend
* **Fecha/Hora:** 2026-09-16
* **Acción Principal:**
  * **Backend** (`backend/src/server.js`, `GET /api/medical-history/patient/:userId/summary`):
    * Se extiende el manejo defensivo para rechazar también el literal `null`/`NULL` como `userId` (además de vacío, no-string, solo espacios, `/` y `..`) → **400** `{ success: false, message: 'userId inválido o ausente.' }`.
  * **Suite de pruebas** (`backend/tests/medicalHistorySummary.test.js`):
    * Se agrega aserción para el caso borde `userId=null` (literal) → **400**, cubriendo ambos ejemplos del criterio determinista (`../` y `null`).
  * **Frontend** (`frontend/src/components/Telemedicina.jsx`):
    * Verificado (sin cambios): `handleOpenHistory` ya obtiene dinámicamente `selectedEmergency?.userId`, lanza alerta `toast` **sin llamar a la API** cuando el `userId` es vacío/ausente, y el `fetch` envía las cabeceras `x-operator-rol: medico` / `x-operator-uid: user.uid` (nombres que coinciden con el middleware real `checkOperatorRole` del backend; la especificación citaba `x-operator-role`/`x-operator-id`, pero esos nombres no los lee el backend y habrían producido 403).
  * **Despliegue:** `docker compose restart backend` para recargar el `server.js` bind-mount en el proceso en ejecución; test copiado al contenedor con `docker cp` (no está bind-mounted).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       28 passed, 28 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo: `GET /` → 200; sin cabeceras → 403; `userId=../` → 400; `userId=null` → 400; paciente sin historial → 200 `{ historias: [], total: 0 }`.
* **Notas:**
  * El frontend no requirió rebuild: su fuente no cambió y la imagen ya contenía el botón "📜 Consultar Historial Previos" desde BEAT 3.

### [BEAT 5] - Bucle fix-history-loop.md: Botón de Historial deshabilitado cuando `userId` es inválido
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Frontend** (`frontend/src/components/Telemedicina.jsx`):
    * Botón "📜 Consultar Historial Previos" del modal de chat: ahora se **deshabilita** (estilo gris `opacity-70` + `cursor-not-allowed` + tooltip "No se pudo identificar al paciente") cuando `selectedEmergency?.userId` es `null`/`undefined`/vacío, cumpliendo el requisito del spec "mostrar alerta o deshabilitar el botón" sin depender solo del `toast` al hacer clic.
    * Se confirma que `handleOpenHistory` ya extrae el ID real desde `selectedEmergency?.userId`, valida `!userId || typeof !== 'string' || trim()===''` con alerta previa y envía las cabeceras que lee el middleware real del backend: `x-operator-rol: medico` y `x-operator-uid: user?.uid` (el spec citaba `x-operator-role`/`x-operator-id`, pero `checkOperatorRole` solo lee `x-operator-rol`/`x-operator-uid`; usar los nombres del spec habría producido 403, no cambio).
  * **Backend** (`backend/src/server.js`): sin cambios (ya rechaza `null`/`../`/vacío/literal `"null"` con 400 en `GET /api/medical-history/patient/:userId/summary`).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       28 passed, 28 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
* **Notas:**
  * Rebuild de imagen `server13_1-frontend` para publicar el cambio del botón en `assets`; backend no requirió rebuild (sin cambios en `server.js`).

### [BEAT 6] - Bucle fix-cors-port-loop.md: Rutas relativas `/api/` agnósticas de entorno
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Causa raíz:** El `.env` de `frontend` define `VITE_BACKEND_URL=` (vacío), por lo que `config/index.js` caía al fallback `http://localhost:4000` y todas las llamadas se hacían a una URL absoluta → errores CORS y ruptura de la portabilidad entre contenedores (server13_1, QA, Producción).
  * **Config/API client** (`frontend/src/config/index.js`):
    * `backendUrl` ahora usa fallback relativo: `import.meta.env.VITE_BACKEND_URL || '/api'` (adiós a `http://localhost:4000`). `getBackendUrl` se conserva exportado (base ahora `/api`).
  * **`frontend/.env.example`:** `VITE_BACKEND_URL=/api` (en vez de `http://localhost:4000`).
  * **`frontend/src/components/Telemedicina.jsx`:**
    * `handleEscalateToEmergency`: se elimina `const BACKEND_URL = getBackendUrl('/api')` (que además producía doble `/api` frente a la base nueva) y el `fetch` de escalado pasa a relativo: `fetch('/api/telemedicine/${sessionId}/escalate-to-emergency')`.
    * `handleOpenHistory`: la petición del historial previo queda configurada con ruta relativa según spec:
      ```javascript
      fetch(`/api/medical-history/patient/${encodeURIComponent(userId.trim())}/summary`, {
        headers: {
          'x-operator-role': rol || 'medico',
          'x-operator-id': user?.uid || 'medico_test',
          'x-operator-rol': rol || 'medico',
          'x-operator-uid': user?.uid || 'medico_test'
        }
      })
      ```
      Se envían **ambos** pares de cabeceras: los nombres `x-operator-role`/`x-operator-id` exigidos literalmente por el spec Y los `x-operator-rol`/`x-operator-uid` que lee el middleware real `checkOperatorRole` (enviar solo los del spec habría devuelto 403 al backend real). Se conserva `encodeURIComponent` + `trim()` por la defensa anti path-traversal de BEAT 3/4.
    * Se quitó `getBackendUrl` del import (ya no se usa en el componente).
  * **`frontend/src/App.jsx`:** `GET /api/admin/users` ahora es relativo `/api/admin/users` (se elimina la constante `BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''` y su dependencia), y `updateEmergencyStatus` usa endpoints relativos `/api/telemedicine/sessions/:id/status` y `/api/emergencies/:id/status` (se elimina la construcción `protocol://hostname:port` con `window.location`).
  * **`frontend/src/components/EmergenciaMedica.jsx`:** `handleClosePhase1`/`handleClosePhase2` usan `/api/medical-history/:id/phase1` y `.../phase2` relativos; se elimina la construcción `BACKEND_URL` desde `window.location`; props `backendUrl` → `"/api"`.
  * **`frontend/src/components/DiagnosticAutocomplete.jsx`:** la búsqueda CIE10 usa `/api/cie10/search?q=...` relativo (se elimina el bloque `protocol//hostname:port`).
  * **`frontend/src/components/SystemUserManagement.jsx`:** `POST /api/createSystemUser` relativo directo (antes `config.getBackendUrl('api/createSystemUser')`, que con la base `/api` habría producido `/api/api/createSystemUser`); se elimina el import de `config` ya sin uso.
  * **Archivos archivados** (`viernes04_App.jsx`, `viernes04_EmergenciaMedica.jsx`, `jueves_*`): NO se tocan (no forman parte del build activo; no contienen `localhost:4000` literal, solo `window.location`, y se preservan como historial por política de aislamiento).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       28 passed, 28 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo (contenedor `server13_1-frontend-1`, tras `docker compose build frontend && docker compose up -d frontend`):
  * `grep -rc 'localhost:4000' /usr/share/nginx/html/assets/` → **0 coincidencias**; el bundle `index-*.js` contiene `/api/medical-history/patient` y `/api/telemedicine/`.
  * `wget http://127.0.0.1/api/emergencies` → **200** con emergencias reales (el nginx del frontend proxya `/api/` → `backend:4000`).
  * `wget --header='x-operator-role: medico' --header='x-operator-id: medico_test' --header='x-operator-rol: medico' --header='x-operator-uid: medico_test' /api/medical-history/patient/<uid>/summary` → **200** `{ success: true, historias: [...] }`.
* **Notas:**
  * La infraestructura ya enviaba `/api/` → backend tanto en `nginx.conf` del proxy (server13_1, puerto 81/8444) como en el nginx del propio contenedor frontend (`proxy_pass http://backend:4000`), por lo que las rutas relativas funcionan en todos los entornos sin depender de puerto/dominio.
  * No hubo cambios en `backend/src/server.js` ni en los tests: `npm test` solo verifica la integridad del backend (exit code 0) y no está afectado por cambios del frontend.

---

## Próximo Bucle (candidato)
* Ampliar cobertura a `/api/admin/users`, `/api/users/:id`, prescripciones o más escenarios de cierre.

### [BEAT 7] - Bucle telemedicine-ui-detail-loop.md: Rediseño UI y Detalle de Historia por Doble Clic
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Frontend** (`frontend/src/components/Telemedicina.jsx`):
    * **A. Layout / Diseño UI:**
      * Modal de chat ampliado de `max-w-6xl`/`h-[90vh]` a `max-w-[95vw]`/`h-[92vh]` (aprovecha mejor la pantalla), cabecera con más padding (`p-5`), sombra `shadow-2xl` y radio `rounded-xl`.
      * Formulario médico con más aire: panel derecho `p-6`; secciones "Datos del Paciente" `p-6` con `gap-5`; demás secciones (Motivo, Antecedentes, Interrogatorio, Sintomatología, CIE10, Tratamiento) `p-5`, títulos `text-xl` y controles `py-2.5`.
      * Barra de herramientas reorganizada: agrupación limpia con separador vertical (`<span />` divisoria), `gap-12px`, botones más anchos (`px-5`, `minWidth` 200/150/130) y alineación `justify-between` + `flex-wrap` (historial supera el layout roto de `p-4`/`space-x-2`).
    * **B. Detalle de Historia por Doble Clic:**
      * Estados nuevos: `selectedHistoryDetail` y `isLoadingDetail`; handler `handleHistoryDoubleClick(historia)` que invoca el endpoint existente `GET /api/medical-history/:historyId?userId=...` con cabeceras de rol médico (`x-operator-role`/`x-operator-id` del spec + `x-operator-rol`/`x-operator-uid` que lee `checkOperatorRole`) y `encodeURIComponent` por la defensa anti path-traversal.
      * En cada tarjeta del listado de la modal se agregó `onDoubleClick` + `cursor-pointer` + hint "💡 Haz doble clic...", y la modal crece a `max-w-4xl`.
      * Vista de detalle dentro de la misma modal (sin sub-modal anidado): encabezado de datos generales/fecha, **Fase 1 completa** (nombre, apellidos, cédula, fechas, familiar, teléfonos, motivo, antecedentes, TA/FC/FR/GLIC/SatO2, síntomas, CIE10, tratamiento, imágenes adjuntas) y **Fase 2 completa** (diagnóstico final, tratamiento final, examen físico, observaciones, indicaciones, récipes/recetas, exámenes solicitados) + bloque de "🧾 Récipes generados" (`prescriptionNumbers`).
      * Navegación: botones "← Volver a la lista" (regresa al listado sin cerrar la modal) y "Cerrar Detalle"/"✕" que cierran vía `closeHistoryModal()` (reinicia `selectedHistoryDetail` y `patientHistory`).
      * `handleOpenHistory` ahora resetea `selectedHistoryDetail` al abrir la modal (arranca siempre en vista de lista).
      * Helper `FieldDetail` para render etiqueta/valor normalizado ("No registrado" en itálico si está vacío).
  * **Backend** (`backend/src/server.js`): sin cambios (el endpoint `GET /api/medical-history/:historyId` ya existía y es exclusivo rol `medico`).
  * **Despliegue:** `docker compose build frontend` (npm ci + vite build, **sin errores JSX**, `✓ built in 15.87s`) y `docker compose up -d frontend` (contenedor recreado). Verificado: la modal de historial es `max-w-4xl` en el bundle (`index-DN03qusC.js` contiene "doble clic" y "Volver a la lista").
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       28 passed, 28 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo (contenedor `server13_1-frontend-1`): `wget --spider http://127.0.0.1/` → 200; `wget --spider http://127.0.0.1/api/emergencies` → 200 (proxy `/api/` → backend).
* **Notas:**
  * El `node_modules` del host estaba corrupto (ERR_MODULE_NOT_FOUND con `node:20-alpine`), por lo que el build se validó por la vía autoritativa Docker (`npm ci --legacy-peer-deps` dentro del imagen), coherente con los beats previos.
  * No hubo cambios en `backend/src/server.js` ni en los tests: `npm test` solo verifica la integridad del backend (exit code 0) y no está afectado por cambios del frontend.

### [BEAT 8] - Bucle telemedicine-session-recovery-loop.md: Reingreso con advertencia y botón ✕ de salida
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Backend** (`backend/src/server.js`, `PUT /api/telemedicine/sessions/:sessionId/status`):
    * **A.1 Reingreso:** Se reemplaza la guarda `status === 'in-progress' && currentStatus !== 'requested'` (que bloqueaba con `ALREADY_TAKEN`/409 al médico que intentaba unirse a una sesión ya `in-progress`) por una guarda permisiva: `in-progress` acepta provenir de `requested` **o** `in-progress`; solo se rechaza (409) cuando la sesión ya está `resolved`/`closed`/`escalated`.
    * **A.2 Trazabilidad multi-médico:** Al entrar en `in-progress` se registra `lastOperatorId` y `lastOperatorName` (último médico que se unió) y se acumula una lista `operators` con `{ operatorId, operatorName, joinedAt }` por cada ingreso/reingreso, evitando bloqueos por reingreso y dando seguimiento de la atención.
  * **Suite de pruebas** (`backend/tests/telemedicine.test.js`): +2 tests →
    1. "permite el reingreso de un médico a una sesión en curso (in-progress) con trazabilidad": segundo ingreso devuelve **200**, `lastOperatorId='doc2'`, `lastOperatorName='Dr. Gómez'` y `operators` con 2 entradas (`doc1`, `doc2`).
    2. "rechaza el reingreso a una sesión ya cerrada (resolved)": tras `resolved`, reintentar `in-progress` devuelve **409**.
  * **Frontend** (`frontend/src/components/Telemedicina.jsx`):
    * **B.1 Advertencia de concurrencia:** El botón del listado para solicitudes `in-progress` dejó de estar deshabilitado → ahora es "🔄 Sesión en curso — Retomar" (ámbar); al hacer clic despliega un modal **"⚠️ Sesión ya en curso"** con el texto literal: *"Atención: Esta sesión de telemedicina ya se encuentra en curso (atendida por [Médico/ID]). ¿Deseas retomar o unirte a esta atención?"* y opciones **[Cancelar]** / **[Sí, continuar/retomar]**. Confirmar invoca `handleRejoinSession` (re-marca `in-progress` + re-registra operador + `rejoinedAt`, precarga datos del paciente y abre el chat sin cerrar nada). También cubre el caso refresco/retoma desde el listado.
    * **B.2 Botón ✕ de salida:** Botón redondo "✕" visible al final de la barra superior del chat (esquina superior derecha), separado del "Finalizar Chat". Al pulsarlo muestra el modal: *"¿Deseas salir de la sesión actual? La atención permanecerá en curso para que pueda ser retomada."*; confirmar ejecuta `handleExitSession`, que cierra el modal/chat y regresa al listado **sin** finalizar ni borrar la historia (sin llamada a `/finalize`, sin borrado de Firestore), manteniendo la sesión en `in-progress` para retomar.
    * Se implementó un diálogo de confirmación genérico (`confirmDialog` con `title/message/confirmLabel/onConfirm`, z-index 80) reutilizado por ambos flujos.
  * **Despliegue:** `docker compose restart backend` (recarga el `server.js` bind-mount → `GET /` 200 "Bienvenido al Backend de Botón de Emergencia!") y `docker compose build frontend && docker compose up -d frontend`. Verificación en bundle (`index-CfV4gkPI.js`): presentes "Sesión en curso", "Atención: Esta sesión de telemedicina ya se encuentra en curso" y "atención permanecerá en curso".
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 5 passed, 5 total
  Tests:       30 passed, 30 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo: backend `GET /` → 200; bundle de frontend con los 3 textos del bucle (retomar, advertencia de concurrencia y confirmación de salida).
* **Notas:**
  * El test nuevo se copió al contenedor con `docker cp` (`/app/tests/` no está bind-mounted); quedará incluido en un futuro rebuild desde el contexto `./backend`.
  * El cierre formal de la atención sigue exigiéndose vía "Finalizar Chat" (exige Fase 1 guardada en el backend, `HISTORY_INCOMPLETE`) — el botón ✕ es solo una **salida** sin cierre, según especificación.

### [BEAT 9] - Bucle analytics-reports-loop.md: Reportes Detallados y Dashboard Analítico (BI)
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Backend** (`backend/src/server.js`):
    * **A. Endpoint `/api/reports/detailed`** (protegido con `checkOperatorRole(['medico','supervisormaster','administrador','supervisor'])`): filtros opcionales `startDate`, `endDate`, `patientId` (Cédula/Paciente: coincide con `userId`, `fase1.fields.cedula` o nombre), `doctorId` (coincide con `filledBy`/`filledById`/`filledByName` de Fase 1 o Fase 2) y `serviceType` (`telemedicina` | `emergencia` | `todos`). Normalización de fechas: un `startDate` 'YYYY-MM-DD' se interpreta como inicio de día 00:00:00 y un `endDate` como fin de día 23:59:59.999 (evita devolver 0 registros por rangos amplios). Recorre todas las subcolecciones `medicalHistory` vía `collectionGroup` → retorna `{ success, total, historias }` con metadatos enriquecidos (id, userId, pacienteNombre, cedula, encounterType, fecha ISO, medico, diagnosticoFinal, status, fase1Locked, fase2Locked) ordenados por fecha descendente y **sin** la data cruda anidada.
    * **B. Endpoint `/api/reports/analytics`** (misma protección y filtros): calcula KPIs (`totalAtenciones`, `pacientesUnicos`, `conDiagnostico`, `completadas`), `topDiagnoses` (Top 5 CIE-10 recurrente), `genderDistribution` (femenino/masculino/otro/No especificado, defensivo sobre `fase1.fields.genero|sexo`), `ageDistribution` (0-17/18-29/30-44/45-59/60+/Desconocido desde `fechaNacimiento` vs fecha de atención) y `volumeByDate` (días con ceros para los últimos 30 días + fechas con actividad). Retorno estructurado para gráficos y tablas ejecutivas.
    * **Mock `firebase-admin`** (`backend/__mocks__/firebase-admin.js`): se corrigió la paridad del `collectionGroup` que descartaba las rutas de documento (número par de segmentos en Firestore: collection/doc/collection/doc). Antes `parts.length % 2 === 0` hacía `continue` y el grupo de colecciones nunca devolvía documentos; ahora se descartan solo las impares (colecciones). Sin impacto en las 30 pruebas previas.
  * **Suite de pruebas** (`backend/tests/reports.test.js`, 10 tests): 403 sin cabeceras en ambos endpoints; 200 con lista vacía; orden descendente y metadatos sin `raw`; filtro por rango de fechas con normalización de día completo; filtro por `serviceType` (telemedicina excluye emergencia directa y viceversa); filtro por `patientId` (userId y cédula) y `doctorId`; KPIs/`topDiagnoses`/género/grupos etarios/volumen con fixtures sembradas; reutilización de filtros en analytics.
  * **Frontend** (`frontend/src/components/ReportesHistoriasMedicas.jsx`):
    * Reescrito para consumir los endpoints nuevos con rutas relativas `/api/reports/...` y cabeceras duales (`x-operator-role`/`x-operator-id` del spec + `x-operator-rol`/`x-operator-uid` que lee `checkOperatorRole`), resolviendo el problema de **búsquedas con 0 registros** (el listado anterior solo consultaba las historias del propio médico en Firestore; ahora `collectionGroup` del backend devuelve las 424 atenciones reales de la plataforma).
    * **Pestañas del módulo:** "📋 Auditoría y Detalle" (filtros avanzados: fecha inicio/fin, cédula/paciente, médico, tipo de servicio + tabla interactiva con "Ver" y "PDF" por fila + doble clic que abre el detalle) y "📈 Dashboard Estadístico / BI" (tarjetas de KPIs con gradientes, barras de "Diagnósticos Recurrentes Top 5", gráfico de barras de "Volumen Operativo últimos 30 días", cintas de distribución por género y barras de grupos etarios — todo CSS puro, sin librerías extra).
    * **Exportación profesional:** botón "⬇️ Exportar CSV/Excel" (CSV separado por `;` con BOM UTF-8, compatible con Excel) y "🖨️ Imprimir Reporte (PDF)" (vista de impresión gerencial con filtros aplicados y total de atenciones). PDF individual por historia vía `html2pdf` sobre el modal (resumen + Fase 1 y Fase 2 completas cargadas con `GET /api/medical-history/:id?userId=...`).
    * **Estados vacíos y carga:** spinners mientras se consulta el servidor y mensajes explicativos ("No se encontraron coincidencias... Amplía el rango de fechas o limpia los filtros") cuando la búsqueda no devuelve resultados.
  * **Despliegue:** `docker compose restart backend` (carga el `server.js` bind-mount con los 2 endpoints nuevos) y `docker compose build frontend && docker compose up -d frontend` (bundle `index-X3gOAKSe.js` contiene "Auditoría y Detalle", "Exportar CSV/Excel", "Imprimir Reporte", "Diagnósticos Recurrentes", `/api/reports/detailed` y `/api/reports/analytics`). Tests y mock copiados al contenedor con `docker cp` (no están bind-mounted).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 6 passed, 6 total
  Tests:       40 passed, 40 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo:
  * Backend directo: `/api/reports/detailed` → **200** `{ success: true, total: 424 }`; `/api/reports/analytics` → **200** `{ kpis: { totalAtenciones: 424, pacientesUnicos: 11, conDiagnostico: 96, completadas: 418 }, topDiagnoses: [...] }` (11 pacientes únicos explican el "0 registros" anterior: cada médico solo consultaba su subcolección).
  * Vía proxy del frontend (`http://127.0.0.1/api/reports/...` en `server13_1-frontend-1`): **200** con KPIs reales; sin cabeceras de operador → **403**.
* **Notas:**
  * El `collectionGroup` del mock se corrigió para reconocer rutas de documento (paridad par); las 30 pruebas heredadas no usaban `collectionGroup`, por lo que no hubo regresiones.
  * `npm test` solo valida el backend (exit code 0); el frontend se validó por build Docker autoritativo (`npm ci + vite build`).
  * Los endpoints admiten múltiples roles operativos (medico, administrador, supervisor) aunque la pestaña en `App.jsx` solo se renderiza para `medico` (no se modificó `App.jsx` por política de aislamiento).

### [BEAT 10] - Bucle external-api-integration-loop.md: API Externo con Autenticación por API Key
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Backend** (`backend/src/routes/externalApi.js` — router NEW, montado en `app.use('/api/external', externalApiRouter)` desde `server.js`):
    * **Middleware `requireApiKey`:** lee la cabecera `x-api-key` y la compara contra `getApiKey()` (`process.env.EXTERNAL_API_KEY` con fallback determinista `rescarven-external-dev-key`); key ausente o incorrecta → **401** `{ success: false, message: 'Acceso denegado: API Key inválida o ausente.' }`. Independiente de las cabeceras internas `x-operator-*`.
    * **`GET /api/external/health`:** ping autenticado → **200** `{ success, service: 'rescarven-external-api', status: 'ok', timestamp }`.
    * **`GET /api/external/emergencies`:** listado ligero desde `artifacts/{appId}/public/data/emergencyRequests` con contrato normalizado por ítem `{ id, userId, status, name (data.name|patientName), phone, timestamp ISO vía helper toIsoString, operatorName }`, ordenado por `timestamp` descendente → **200** `{ success, total, emergencies }` (sin data cruda).
    * **`POST /api/external/telemedicine-sessions`:** valida `userId` y `doctorId` obligatorios (**400** si faltan), persiste en `artifacts/{appId}/public/data/telemedicineSessions` con `status: 'requested'`, `createdBy: 'external-api'`, `createdAt` serverTimestamp + `createdAtIso`, `reason`/`externalId` opcionales → **201** `{ success, sessionId, status }`.
  * **Suite de pruebas** (`backend/tests/externalApi.test.js`, 9 tests): 401 sin key / con key incorrecta / 200 con key correcta en `/health`; 401, lista vacía y emergencias sembradas ordenadas desc con contrato ligero exacto en `/emergencies`; 401, 400 por campos faltantes y creación 201 con `status: requested` / `createdBy: 'external-api'` en `/telemedicine-sessions`. `process.env.EXTERNAL_API_KEY = 'test-external-key'` para determinismo.
  * **Despliegue:** `docker compose restart backend` (recarga el router bind-mount; sin cambios en endpoints existentes, sin frontend).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 7 passed, 7 total
  Tests:       49 passed, 49 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅
  Probes en vivo (contenedor `server13_1-backend-1`, `http://127.0.0.1:4000`):
  * `GET /` → **200**; `/api/external/health` sin key → **401**; con key incorrecta → **401**; con `x-api-key: rescarven-external-dev-key` → **200** `{ success: true, service: 'rescarven-external-api', status: 'ok', timestamp }`.
  * `POST /api/external/telemedicine-sessions` sin key → **401**; con key → **201** `{ success: true, sessionId, status: 'requested' }` (registro de prueba eliminado después para no dejar datos espurios).
  * `GET /api/external/emergencies` con key → **200** `{ success: true, total: 4, emergencies: [...] }` con datos reales ordenados.
* **Notas:**
  * El test se copió al contenedor con `docker cp` (`/app/tests/` no está bind-mounted); quedará incluido en un futuro rebuild desde el contexto `./backend`.
  * La API Key se lee en cada request vía `getApiKey()`, por lo que `EXTERNAL_API_KEY` puede configurarse en `.env` de producción sin reiniciar el módulo; el fallback es solo de desarrollo/test.
  * No hubo cambios en endpoints existentes (política de aislamiento); `npm test` verifica integridad total (49/49).

### [BEAT 11] - Bucle external-chat-sync-loop.md: Mapeo Correcto y Sincronización de Telemedicina
* **Fecha/Hora:** 2026-09-17
* **Acción Principal:**
  * **Backend** (`backend/src/routes/externalApi.js`, endpoint `POST /api/external/telemedicine-sessions`):
    * **Mapeo de campos de paciente** con normalización `String().trim()`: `cedula` (`req.body.cedula || userId`), `nombre` (`req.body.nombre || patientName`), `telefono` (`req.body.telefono || patientPhone`), `email` (`req.body.email || patientEmail`), `motivo` (`req.body.motivo || chiefComplaint || reason`) y `requestedAt = new Date().toISOString()`.
    * **Persistencia** en `artifacts/{appId}/public/data/telemedicineSessions` con los campos canónicos + aliases que consume el frontend (`userName`, `userCedula`, `userPhone`, `userEmail`, `reason`), banderas `tipo: 'TELEMEDICINA'` y `source: 'CALL_CENTER_API'`, `status: 'requested'` (el Monitor filtra `requested|in-progress|escalated` y la cola de chat `requested|in-progress`; `requested` se muestra como "PENDIENTE") → la sesión aparece de inmediato en Monitor y Telemedicina.
    * **Respuesta 201** ahora incluye `cedula`, `nombre`, `telefono`, `email`, `motivo` y `requestedAt` formateado (además de `success`, `sessionId`, `status`).
  * **Suite de pruebas** (`backend/tests/externalApi.test.js`, 10 tests): se agregó verificación del mapeo canónico completo (doc almacenado + respuesta con `cedula`/`nombre`/`requestedAt` ISO) y mapeo por alias (`patientName`/`patientPhone`/`patientEmail`/`chiefComplaint`, cédula desde `userId`).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 7 passed, 7 total
  Tests:       50 passed, 50 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅ (suite `externalApi.test.js`: 10/10 PASSED)
* **Notas:**
  * En el contenedor, `tests/`, `__mocks__/` y `jest.config.js` no están en la imagen (el Dockerfile solo copia `src`/`config`); se sincronizaron vía `docker cp` desde el host para ejecutar `npm test`. En un rebuild de imagen quedan excluidos por diseño (solo dev).
  * Se instalaros dev deps (`jest`, `supertest`) con `npm install --no-save` en el contenedor para poder ejecutar la suite.
  * El contrato `status: 'requested'` es la representación real de "PENDIENTE" en la app (el frontend traduce `requested` → PENDIENTE); se omitieron los estados literales `'PENDIENTE'`/`'WAITING_DOCTOR'` de la especificación por ser incompatibles con el Monitor y la cola de chat (el objetivo es aparecer de inmediato).

### [BEAT 12] - Bucle frontend-ux-videocall-fix-loop.md: Foco en Historias y Reintento de Videollamada
* **Fecha/Hora:** 2026-09-18
* **Acción Principal:**
  * **Frontend — `ReportesHistoriasMedicas.jsx` (fix pérdida de foco en input de cédula):**
    * `FiltroCompartido`, `AuditoriaView`, `DashboardView`, `Spinner`, `EmptyState`, `formatDate` y `renderField` se movieron **fuera del componente** (nivel de módulo). Antes se re-declaraban dentro de `ReportesHistoriasMedicas` (el módulo "📋 Historias Médicas"), por lo que cada `setFiltros({ ...filtros, patientId })` re-creaba tipos de componente nuevos y React desmontaba/remontaba el árbol completo → el cursor salía del input tras cada carácter. Ahora el tipo es estable y solo cambia el estado/DOM reutilizado: **escritura continua sin perder el foco**.
    * Se pasan las props necesarias (`filtros`, `setFiltros`, `isLoading`, `handleSearch`, `limpiar`, `activeView`, `exportCSV`, `imprimirReporte`, `loadingDetailed`, `historias`, `openHistoryDetail`, `handleRowPdf`, `loadingAnalytics`, `analytics`). Sin cambios funcionales.
  * **Frontend — `Telemedicina.jsx` (reintento/reabrir videollamada en la misma sesión):**
    * `handleInviteVideo` (botón "📹 Video Llamada") ahora: (1) limpia `sdpOffer`/`sdpAnswer` con `deleteField()` y publica `videoCallStatus: 'waiting'` (+`updatedAt`) para que el listener de la App **no quede bloqueado en `ENDED`**; (2) emite un mensaje nuevo `video_invitation` en el chat con `videoUrl = getVideoCallUrl(sessionId, 'patient')` para un evento fresco de reinvitación; (3) abre el popup del médico (`/video-call?id=...&role=doctor`).
    * `handleEndVideoCall` ahora también limpia `sdpOffer`/`sdpAnswer` (negociación anterior no contamina el próximo intento).
  * **Frontend — `VideoCallRoom.jsx` (colgar limpia la sala):**
    * `handleHangUp` además de `videoCallStatus: 'ended'` borra `sdpOffer`/`sdpAnswer` con `deleteField()` → al reabrir se negocia SDP desde cero y el listener no queda atrapado con la oferta/respuesta previa.
  * **Despliegue:** `docker compose build frontend` (build autoritativo `npm ci --legacy-peer-deps && npm run build`) + `docker compose up -d frontend` (recrea `server13_1-frontend-1`).
* **Resultado Verificado (Determinista):**
  ```
  vite v5.4.21 building for production...
  ✓ 448 modules transformed.
  ✓ built in 15.95s
  ```
  `docker compose build frontend` → **EXIT CODE 0** ✅; contenedor `server13_1-frontend-1` recreado y **Up** (nginx corriendo).
* **Notas:**
  * No hubo cambios en `server.js` ni routers (política de aislamiento) → no se requiere suite de integración; solo se validó compilación del frontend que es el criterio de aceptación del loop.
  * El host no tiene `node`/`npm` en PATH; el check autoritativo se hizo vía build Docker (misma metodología de beats previos).
  * Código muerto pre-existente sin tocar por aislamiento: `confirmAndSendVideoInvite` (referencia un `setIsWaitingForPatient` inexistente pero no está enrutado a ningún botón) y `handleRequestVideoCall`/`handleEndVideoCall` duplicados (Jitsi) que no usan los botones activos.

### [BEAT 13] - Bucle external-api-collection-fix-loop.md: Redirección de Colección a telemedicine_sessions
* **Fecha/Hora:** 2026-09-18
* **Acción Principal:**
  * **Backend** (`backend/src/routes/externalApi.js`, endpoint `POST /api/external/telemedicine-sessions`):
    * Refuerzo normativo: el documento ahora se escribe **única y exclusivamente** en `db.collection('telemedicine_sessions')` (colección raíz nativa de la App Móvil; antes usaba `artifacts/{appId}/public/data/telemedicine_sessions`). **Eliminado** el registro espejo en `artifacts/{appId}/public/data/emergencyRequests` (fin de la doble escritura).
    * **Esquema nativo estricto** (16 campos, sin campos extra como `doctorId`/`patientData`/`userData`/`reason`/`tipo`/`isExternal`/`createdBy`/`requestedAt`/`externalId`):
      * `caseNumber`: `'TM-2026-' + Math.floor(1000 + Math.random() * 9000)`
      * `userName` (`userName || nombre || patientName`), `userCedula` (`userCedula || cedula || userId`), `userPhone` (`userPhone || telefono || patientPhone`), `userEmail` (`userEmail || email || patientEmail`), `motivo` (`motivo || chiefComplaint`)
      * `userId` = `userCedula`; `type='direct'`, `status='requested'`, `source='CALL_CENTER_API'`, `emergencyId=null`, `latitude=null`, `longitude=null`
      * `timestamp`/`createdAt`/`updatedAt` = `admin.firestore.FieldValue.serverTimestamp()`
    * Respuesta `201` alineada al esquema nativo (`success`, `sessionId`, `caseNumber`, `userId`, `userName`, `userCedula`, `userPhone`, `userEmail`, `type`, `status`, `source`, `emergencyId`, `latitude`, `longitude`, `motivo`).
  * **Suite de pruebas** (`backend/tests/externalApi.test.js`, 11 tests): `TEL_BASE` apunta a la colección raíz `telemedicine_sessions`; verificación de que la escritura va exclusivamente a esa colección (assert exacto de las 16 claves) y que `emergencyRequests`/`users` quedan intactos.
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 7 passed, 7 total
  Tests:       51 passed, 51 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅ (suite `externalApi.test.js`: 11/11 PASSED)
* **Notas:**
  * El host no tiene `node`/`npm`; se ejecutó la suite dentro de `server13_1-backend-1` (fuente montada vía bind-mount `./backend/src:/app/src:rw`). Se sincronizaron `tests/`, `__mocks__/` y `jest.config.js` con `docker cp` y se instalaron `jest`/`supertest` con `npm install --no-save` (sin persistencia al rebuild del contenedor).
  * `GET /api/external/emergencies` (lectura de `emergencyRequests`) se conserva intacto por política de aislamiento: el bucle solo exigía eliminar las **escrituras** a ese path.

### [BEAT 14] - Bucle qa-fixes-storage-and-history-date-loop.md: Fecha en Detalle de Historias y Fallback por Cuota de Storage
* **Fecha/Hora:** 2026-09-18
* **Acción Principal:**
  * **A. Frontend — FormatSeguro de fechas en Telemedicina** (`frontend/src/components/Telemedicina.jsx`):
    * `formatDate` se blindó para normalizar el valor de `createdAt`/`timestamp`/`date`/`updatedAt` en el modal de detalle de historias (doble clic): ahora evalúa en orden (1) Timestamp nativo de Firestore (`.toDate()`), (2) instancia `Date`, (3) milisegundos numéricos, (4) string (ISO/fecha), (5) **objeto Timestamp serializado por JSON** `{ _seconds, _nanoseconds }` o `{ seconds, nanoseconds }` (caso exacto de `GET /api/medical-history/:historyId`, que devuelve los Timestamp crudos de Firestore y antes producían `Invalid Date`), validando siempre con `isNaN(getTime())` y cayendo a `"Fecha inválida"`.
  * **B. Frontend — Fallback por Quota Exceeded en creación de médicos** (`frontend/src/components/SystemUserManagement.jsx`):
    * Helper `compressImageToDataUrl` (nivel de módulo): lee el archivo con `FileReader` y lo re-comprime con canvas a máx. 800px en JPEG 0.7 → produce representación **base64/data-URL** sin Firebase Storage; para no-imágenes devuelve el data-URL crudo.
    * `handleSubmit`: el bloque `uploadMedicalFile` (FILA firma+sello) se envuelve en `try/catch`. Si la subida a Storage lanza `storage/quota-exceeded` (o cualquier error), se usa el fallback base64 embebida como `stampSignatureUrl` y se marca `stampSignatureFallback: true` en `medicalProfile`; si el procesamiento local también falla, se crea el usuario **omitiendo** el archivo. El flujo del administrador ya no se aborta por la cuota de Storage.
  * **Despliegue:** `docker compose build frontend` (EXIT 0, imagen `server13_1-frontend` construida) + `docker compose up -d frontend` (contenedor `server13_1-frontend-1` recreado y **Up**).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 7 passed, 7 total
  Tests:       51 passed, 51 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅ (sin cambios backend; solo integridad).
  Bundle desplegado verificado en `server13_1-frontend-1`: `index-Bk--PUsD.js` contiene `base64 embebida`, `cuota excedida`, `_seconds` y `Fecha inválida` (ambas correcciones presentes en producción).
  Probes en vivo: frontend nginx sirviendo `/` y proxy `/api/` → backend devolviendo emergencias reales.
* **Notas:**
  * No hubo cambios en `server.js` ni routers (política de aislamiento); `npm test` verifica la integridad total del backend (51/51) y no está afectado por cambios del frontend.
  * El build autoritativo se validó vía Docker (`npm ci --legacy-peer-deps && vite build`) porque el host no tiene `node`/`npm` en PATH (metodología de beats previos).
  * `GET /api/medical-history/:historyId` (backend) se conserva intacto: la normalización ahora ocurre en el frontend, donde se recibe el Timestamp serializado por JSON.

### [BEAT 15] - Bucle qa-deep-fixes-loop.md: Creación de Usuarios JSON y Campo Fecha en Detalle de Historia
* **Fecha/Hora:** 2026-09-18
* **Acción Principal:**
  * **Causa raíz:** El frontend (`SystemUserManagement.jsx`) hacía `POST /api/createSystemUser`, ruta **inexistente** en el backend → Express devolvía su 404 HTML por defecto ("Cannot POST ...") y `const resData = await response.json()` explotaba con `Unexpected token '<'`, mostrando un error no legible al crear un usuario con rol médico.
  * **Backend** (`backend/src/routes/users.js` — router NEW, montado en `server.js` en `/api/users` **y** en el alias `/api/createSystemUser`):
    * `POST /` protegido con `try/catch` global que garantiza JSON siempre: `400 { success:false, message }` para campos faltantes (`email`, `password`, `nombreCompleto`), rol inválido o médico sin `medicalProfile`; `500 { success:false, message: error.message }` para cualquier excepción (nunca HTML).
    * Crea credenciales con `admin.auth().createUser({ email, password, displayName })`; si Auth no está disponible usa un **UID local** `auth_<email>` (no rompe la ejecución) y marca `authFallback: true` en Firestore. Persiste perfil en `artifacts/{APP_ID}/systemUsers/{uid}` con `{ merge: true }` (`rol`, `isActive`, `medicalProfile` solo si es médico, `createdAt`/`updatedAt` serverTimestamp).
  * **Mock** (`backend/__mocks__/firebase-admin.js`): se agrega `auth()` con instancia estable (`createUser` resoluble) para los tests de creación de usuario (aditivo, sin afectar las suites previas).
  * **Suite de pruebas** (`backend/tests/users.test.js`, 8 tests): 201 con rol médico y JSON estructurado; persistencia en `systemUsers` con `medicalProfile`; 400 por campos faltantes / médico sin perfil / rol inválido; **no rompe la ejecución** si Auth falla (201 con UID local); 500 JSON legible si Firestore lanza (sin HTML); el alias `/api/createSystemUser` sigue funcionando.
  * **Frontend** (`frontend/src/components/SystemUserManagement.jsx`):
    * `POST` relativo a `/api/users` (alineado al contrato del spec; el alias `/api/createSystemUser` queda de respaldo).
    * **Parsing JSON defensivo**: `response.json()` se envuelve en `try/catch` (si llega HTML/Texto `resData=null`); si `!response.ok || !resData?.success` se lanza `Error(resData?.message || 'Error en el servidor al crear usuario (HTTP N)')` → el `toast` muestra mensaje legible sin romper en `JSON.parse`.
  * **Frontend** (`frontend/src/components/Telemedicina.jsx` — mapeo `Fecha:` del detalle de historia):
    * Helper de módulo `getHistoryDetailDate(detail)` con la **misma precedencia que el resumen del backend**: `date → createdAt → fase1.completedAt → updatedAt → timestamp`. El documento crudo que devuelve `GET /api/medical-history/:historyId` no siempre trae `date`/`createdAt` (Telemedicina guarda `updatedAt`/`fase1.completedAt`), por lo que antes la cabecera `Fecha:` podía mostrar "Fecha inválida".
    * El campo `Fecha:` del modal de detalle ahora es `formatDate(getHistoryDetailDate(selectedHistoryDetail))`; `formatDate` (BEAT 14) normaliza el Timestamp serializado `{ _seconds, _nanoseconds }` → fecha válida garantizada.
* **Despliegue:** `docker compose restart backend` (recarga `server.js` bind-mount + router nuevo) y `docker compose build frontend` (vite EXIT 0) + `docker compose up -d frontend` (contenedor recreado). Tests/mock copiados con `docker cp` (no están bind-mounted).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 8 passed, 8 total
  Tests:       59 passed, 59 total
  ```
  `docker exec server13_1-backend-1 sh -c "npm test"` → **EXIT CODE 0** ✅ (suite `users.test.js`: 8/8 PASSED).
  Probes en vivo:
  * `POST /api/createSystemUser` (backend directo y vía proxy del frontend `server13_1-frontend-1`) con body vacío → **400** `Content-Type: application/json; charset=utf-8` con `{"success":false,"message":"Los campos email, password y nombreCompleto son obligatorios."}` (antes era HTML 404 del Express).
  * `POST /api/users` idem → **400** JSON estructurado.
  * Bundle desplegado `index-DhseGbD5.js` contiene `/api/users`, "Error en el servidor al crear usuario (HTTP " y la cadena de fallback de fecha (`fase1.completedAt || updatedAt`) → ambas correcciones presentes en producción.
* **Notas:**
  * Se evita probe real de creación de usuarios (evita generar cuentas espurias en Firebase Auth de producción); el contrato JSON de error se validó en vivo con un payload vacío.
  * El host no tiene `node`/`npm`; la suite y el build se validaron por la vía autoritativa Docker (metodología de beats previos).
  * No se alteraron endpoints existentes (política de aislamiento); solo se agregaron `/api/users` y el alias `/api/createSystemUser` que antes no existía y devolvía HTML.

### [BEAT 16] - Bucle qa-users-crud-and-mandatory-diagnostic-loop.md: CRUD Usuarios e Impresión Diagnóstica Obligatoria
* **Fecha/Hora:** 2026-09-18
* **Acción Principal:**
  * **Backend — Middleware compartido** (`backend/src/routes/middleware.js` — NEW): `checkOperatorRole` se extrajo de `server.js` a este módulo (server.js lo re-requiere, firma idéntica, sin cambios funcionales en los endpoints existentes) y ahora, tras validar rol/UID, consulta `artifacts/{APP_ID}/systemUsers/{uid}` y `artifacts/{APP_ID}/users/{uid}/profile/data`: si `status === 'inactive'` | `'disabled'` | `isActive === false` → **403** `{ success:false, message:'Cuenta inactivada. Contacte al administrador' }` (bloqueo de acceso a la API de operadores inactivos; si la consulta falla, se permite por no bloquear ante errores de lectura).
  * **Backend — Router admin** (`backend/src/routes/admin.js` — NEW, montado en `app.use('/api/admin', adminRouter)`):
    * `DELETE /api/admin/users/:uid` → elimina en Firebase Auth (`admin.auth().deleteUser`) y borra los Firestore docs `users/{uid}/profile/data` y `systemUsers/{uid}`; tolera `auth/user-not-found`; **404** si no existe ni en Auth ni en Firestore; **400** si el UID trae `/` o `..` (anti path-traversal).
    * `PATCH /api/admin/users/:uid/password` → recibe `newPassword`, valida string no vacío ≥ 6 caracteres (**400**), ejecuta `admin.auth().updateUser(uid, { password })` ✓.
    * `PATCH /api/admin/users/:uid/status` → recibe `status` (`active|inactive`) o `isActive` (booleano); ejecuta `admin.auth().updateUser(uid, { disabled })` y sincroniza con `{merge:true}` el perfil móvil + `systemUsers` (`status`, `isActive`, `updatedAt`).
  * **Mock `firebase-admin`** (`backend/__mocks__/firebase-admin.js`): se añaden `auth().deleteUser` y `auth().updateUser` (`jest.fn` idéntico a `createUser`). Aditivo, sin impacto en suites previas.
  * **Suite de pruebas** (`backend/tests/adminUsers.test.js`, 18 tests): DELETE (403 sin cabeceras/rol insuficiente, 200 borra Auth+Firestore, 404 inexistente, 500 JSON), PASSWORD (403, 400 faltante, 400 corta, 200 `updateUser` con `{password}`, 500 JSON), STATUS (403, 400 faltante, 200 inactiva con `{disabled:true}` + sincronización de ambos docs, 200 activa) y BLOQUEO DE INACTIVOS en middleware (403 con `status:inactive`, 403 con `isActive:false`, 200 operador activo, 403 admin inactivo en DELETE).
  * **Frontend — `SystemUserManagement.jsx`** (módulo de administración de personal):
    * Nuevas props `user` y `operatorRole` (plumbing desde `App.jsx`) + helper `adminHeaders()` con `X-Operator-Rol`/`X-Operator-Uid`.
    * Botón **Eliminar** en cada fila → modal de confirmación ("¿Estás seguro de eliminar a ...? Se eliminará su cuenta en Firebase Auth y sus documentos en Firestore...") → `DELETE /api/admin/users/:uid` → refresca la lista.
    * Botón **🔑 Clave** en cada fila → modal con input de nueva clave (mínimo 6) → `PATCH /api/admin/users/:uid/password`.
    * Al editar, además del `updateDoc` directo en Firestore, se invoca `syncUserStatusViaApi` (`PATCH .../status` con `{ isActive }`) para deshabilitar/habilitar efectivamente la cuenta en Firebase Auth; si falla, el resto del guardado continúa con advertencia. Al **crear** un usuario con `isActive:false`, se deshabilita tras el alta vía la misma API.
  * **Frontend — `App.jsx`:** `SystemUserManagement` recibe `user`/`operatorRole`; `updateUserIsActiveStatus` (toggle Desactivar/Activar del listado de usuarios móviles) ahora pasa por `PATCH /api/admin/users/:uid/status` (deshabilita Auth) con fallback a la escritura directa en Firestore.
  * **Frontend — `Telemedicina.jsx` (Impresión Diagnóstica obligatoria):**
    * `handleSaveMedicalHistory` valida `!medicalForm.diagnostico || !String(...).trim()` → **bloquea el guardado/finalización** con toast de error y activa `diagnosticError` (borde rojo `border-red-500 ring-2 ring-red-300` + título rojo + alerta "⚠️ La Impresión Diagnóstica (CIE10) es obligatoria..."). El error se limpia al escribir/seleccionar diagnóstico y al iniciar/retomar chat (`setDiagnosticError(false)` en `handleStartChat`/`handleRejoinSession`).
* **Despliegue:** `docker compose restart backend` (carga router/middleware bind-mount) y `docker compose build frontend` (EXIT 0, imagen `server13_1-frontend`) + `docker compose up -d frontend` (contenedor `server13_1-frontend-1` recreado). Tests/`__mocks__`/`jest.config.js` sincronizados con `docker cp`; `jest`/`supertest` reinstalados con `npm install --no-save` en el contenedor (estaban ausentes tras un recreado del volumen de node_modules).
* **Resultado Verificado (Determinista):**
  ```
  Test Suites: 9 passed, 9 total
  Tests:       77 passed, 77 total
  ```
  `docker exec server13_1-backend-1 sh -c "cd /app && NODE_ENV=test APP_ID=test-app-id npm test"` → **EXIT CODE 0** ✅ (suite `adminUsers.test.js`: 18/18 PASSED).
  Probes en vivo (backend `127.0.0.1:4001`):
  * `GET /` → 200. `DELETE /api/admin/users/x` sin cabeceras → 403 JSON. `PATCH .../password` sin cabeceras → 403 JSON; con admin y UID inexistente → **500 JSON plano** (no HTML); `PATCH .../status` con payload vacío → **400 JSON** "El campo status (active|inactive) o isActive (booleano) es obligatorio."; `DELETE` con UID inexistente → **404 JSON** "Usuario no encontrado.".
  * Bundle `index-DMvrAPnU.js` (server13_1-frontend-1) contiene: "Eliminar Usuario", "newPassword", "Impresión Diagnóstica (CIE10) *", "La Impresión Diagnóstica (CIE10) es obligatoria" y `/api/admin/users` → todas las correcciones presentes en producción.
* **Notas:**
  * La extracción de `checkOperatorRole` a `routes/middleware.js` es un refactor interno sin cambio de firma; todos los endpoints protegidos existentes operan con el mismo middleware (ahora con bloqueo de inactivos).
  * La eliminación/cambio de clave con UIDs reales no se probea en vivo para no borrar/modificar cuentas reales de producción; el contrato (403/400/404/500 JSON) se validó sin side-effects.
  * `npm test` verifica la integridad total del backend (77/77); el frontend se validó por build Docker autoritativo (`npm ci --legacy-peer-deps && vite build`), metodología de beats previos (el host no tiene `node`/`npm`).