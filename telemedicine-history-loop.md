# Especificación del Bucle: Consulta de Historial Médico en Telemedicina (telemedicine-history-loop.md)

## 1. Contexto y Objetivo
Permitir que el médico consulte historias clínicas previas de un paciente durante una sesión de telemedicina. Se requiere un endpoint backend ligero de solo lectura y una ventana modal interactiva en la interfaz visual del médico.

## 2. Requerimientos Técnicos

### Backend (`backend/src/server.js`)
* Crear el endpoint `GET /api/medical-history/patient/:userId/summary`.
* Requiere autenticación/rol médico (`checkOperatorRole`).
* Debe consultar Firestore (`artifacts/{appId}/users/{userId}/medicalHistory`).
* Retornar una lista en JSON ordenada por fecha descendente conteniendo únicamente:
  - `id`: ID de la historia.
  - `createdAt` / `date`: Fecha de atención.
  - `symptoms`: Motivo de consulta / síntomas (extraídos de Fase 1).
  - `diagnosis`: Diagnóstico final (extraído de Fase 2).

### Frontend (`frontend/src/` o plantilla web de telemedicina)
* Agregar un botón "📜 Consultar Historial Previos" en el panel/pantalla de telemedicina del médico.
* Al hacer clic, abrir una ventana modal (modal overlay) que invoque la API recién creada.
* Renderizar las historias en formato lista/tarjetas simples (Fecha, Síntomas, Diagnóstico).
* Incluir un botón de cierre "X" o "Cerrar" para retornar a la sesión de telemedicina activa sin perder el estado actual.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Crear una nueva suite en `backend/tests/medicalHistorySummary.test.js` que valide que `GET /api/medical-history/patient/:userId/summary` responda 200 con la estructura JSON reducida descrita.
2. La ejecución del comando `npm test` debe finalizar con código de salida **exit 0** (27/27 suites pasadas).

## 4. Presupuesto y Memoria Persistente (Spine)
* **Presupuesto Máximo:** 5 beats de iteración.
* **Bitácora:** Registrar el endpoint creado, la suite de prueba agregada y los componentes de UI ajustados en `progress.md`.

