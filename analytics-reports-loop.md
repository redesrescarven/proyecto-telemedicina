# Especificación del Bucle: Módulo Profesional de Reportes e Inteligencia Médica (analytics-reports-loop.md)

## 1. Objetivo
Transformar la pestaña de Historias Médicas en un Centro de Reportes y Análisis Gerencial para la toma de decisiones. Debe solucionar las búsquedas sin resultados (0 registros) e implementar reportes operativos, clínicos y estadísticos.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/medicalHistory.js` o `server.js`)
1. **Endpoint Detallado `/api/reports/detailed`:**
   - Filtros opcionales: Rango de fechas (`startDate`, `endDate`), Cédula/Paciente (`patientId`), Médico (`doctorId`), Tipo de Servicio (`telemedicina` | `emergencia` | `todos`).
   - Normalización de fechas para asegurar que devuelva registros reales aun cuando el rango sea amplio.
2. **Endpoint Analítico `/api/reports/analytics`:**
   - Métricas clave (KPIs): Total atenciones, Pacientes únicos, Diagnósticos top 5 (CIE-10), Distribución por género y grupos etarios.
   - Retorno en formato estructurado para gráficos y tablas ejecutivas.

### B. Frontend (`frontend/src/components/ReportesHistoriasMedicas.jsx`)
1. **Pestañas de Navegación del Módulo:**
   - **Vista 1: Auditoría y Detalle:** Filtros avanzados + Tabla interactiva de historias médicas (con opción de ver/imprimir PDF individual).
   - **Vista 2: Dashboard Estadístico / BI:** Tarjetas de KPIs + Gráficos/Indicadores visuales de diagnósticos recurrentes y volumen operativo.
2. **Exportación Profesional:**
   - Botón para exportar el reporte filtrado a **CSV/Excel** y opción de vista de impresión gerencial en PDF.
3. **Manejo de Estados Vacíos:**
   - Mensajes explicativos y estados de carga (skeletons/spinners) si la búsqueda no encuentra coincidencia.

### C. Pruebas Backend (`backend/tests/reports.test.js` o en `medicalHistory.test.js`)
1. Verificar que `/api/reports/detailed` responda con array de datos (status 200).
2. Verificar que `/api/reports/analytics` calcule correctamente agregaciones básicas.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución exitosa del test suite con `npm test` finalizando en **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 3 beats.
- **Bitácora:** Actualizar `progress.md` indicando la habilitación del dashboard analítico y reportes detallados.

