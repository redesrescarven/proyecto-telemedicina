# Especificación del Bucle: Arreglo de Carga de Historial (fix-history-summary-loop.md)

## 1. Contexto y Problema
Al presionar "Consultar Historial Previos" en el módulo de telemedicina, la interfaz muestra el error "No se pudo cargar el historial previo del paciente".
Al abrir unanueva telemedicina guarda el ultimo diagnostico asignado a la historia inmediatamente anterior.

## 2. Causa Raíz y Solución Requerida
* **Consola/Logs:** [Describe la falla observada en logs, ej: la petición no envía la cabecera x-operator-role o el userId llega undefined].
* **Ajuste Frontend (`Telemedicina.jsx`):** Corregir el llamado `fetch` para asegurar que pase las cabeceras requeridas (`x-operator-role: medico`, `x-operator-id`) y que extraiga correctamente el `userId` del paciente seleccionado en la sesión activa.
* **Ajuste Backend (`server.js`):** Asegurar manejo defensivo si `userId` es inválido o si el arreglo de historias retorna vacío.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Actualizar/Agregar prueba en `tests/medicalHistorySummary.test.js` contemplando el caso específico reportado.
2. Ejecutar `npm test` garantizando código de salida **exit 0** (27/27 o 28/28 tests PASSED).

## 4. Presupuesto y Memoria Persistente (Spine)
* **Presupuesto Máximo:** 5 beats.
* **Bitácora:** Registrar la causa corregida y el ajuste de frontend/backend en `progress.md`.
