# AGENTS.md - Reglas Permanentes del Proyecto (Rescarven Backend)

## 1. Arquitectura y Stack Tecnológico
* **Core:** Node.js, Express, Firebase Admin SDK (Firestore), OracleDB, Nodemailer, WebRTC.
* **Orquestación:** Docker Compose en servidor Linux.
* **Control de Memoria:** Archivo `progress.md` como única fuente de verdad persistente entre ejecuciones.

## 2. Reglas Inviolables de Desarrollo
* **Prohibido el Bucle Auto-Aprobatorio:** Ningún cambio en `server.js` ni routers se da por válido sin pasar las pruebas de integración con exit code 0 (`npm test`).
* **Firebase SDK:** Recuerda que `docSnap.exists` en `firebase-admin` es una propiedad **booleana**, NO una función.
* **Integridad de Datos:** Al guardar Fase 1 o Fase 2 de Historias Médicas, siempre utilizar `.set(..., { merge: true })` para garantizar la creación o actualización sin errores 500 si el documento es nuevo.
* **Aislamiento de Cambios:** No alterar endpoints existentes ajenos al bucle activo.

## 3. Comandos de Verificación (Nivel Determinista)
* **Suite de Pruebas:** `npm test`
* **Chequeo de Logs Docker:** `docker logs server13-backend-1`

