# Especificación del Bucle: Suite de Pruebas Automatizadas (test-suite-loop.md)

## 1. Contexto y Objetivo
Crear una suite de pruebas de integración deterministas (usando Jest y Supertest) en el backend para validar los endpoints críticos de `server.js` (Historias Médicas Fase 1/Fase 2, Emergencias, Telemedicina y Autocompletado) sin requerir intervención humana.

## 2. Requerimientos del Bucle
* Instalar `jest` y `supertest` como dependencias de desarrollo en `package.json`.
* Crear la carpeta `tests/` y los archivos de prueba para:
  1. `/api/emergencies` (GET y PUT status)
  2. `/api/medical-history/:historyId/phase1` (POST - guardado borrador y cierre)
  3. `/api/medical-history/:historyId/phase2` (POST - guardado borrador y cierre)
  4. `/api/telemedicine/request` (POST)
* Configurar el script `"test": "jest --detectOpenHandles --forceExit"` en `package.json`.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. La ejecución del comando `npm test` finaliza con código de salida **exit 0**.
2. Todas las suites de prueba reportan **PASSED** al 100%.

## 4. Presupuesto y Memoria Persistente (Spine)
* **Presupuesto Máximo:** 5 beats de iteración.
* **Bitácora:** Registrar las pruebas creadas y el resultado del comando `npm test` en `progress.md`.

