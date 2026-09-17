# Especificación del Bucle: Recuperación de Sesión y Control de Cierre (telemedicine-session-recovery-loop.md)

## 1. Objetivo
Permitir que un médico retome o ingrese a una sesión de telemedicina que ya se encuentra "en curso" (*in-progress*), mediante una advertencia clara de concurrencia, y controlar el cierre de la ventana/pestaña mediante un botón visible "X" de salida sin perder el estado de la atención.

## 2. Acciones Requeridas

### A. Lógica y API Backend (`backend/src/server.js`)
1. **Permitir Reingreso:** Asegurar que `PUT /api/telemedicine/sessions/:sessionId/status` o el endpoint de ingreso a la sesión permita a un médico unirse aunque el estado ya sea `in-progress`.
2. **Trazabilidad de Atención Multi-Médico:** Registrar en la sesión el ID del último médico que se unió o mantener la lista de operadores activos para evitar bloqueos por reingreso.

### B. Interfaz y Flujo Frontend (`frontend/src/components/Telemedicina.jsx`)
1. **Modal / Alerta de Concurrencia:** 
   - Al intentar seleccionar o abrir una llamada en estado `in-progress` (sea por refrescar pantalla o tomarla del listado), desplegar una confirmación:
     > *"Atención: Esta sesión de telemedicina ya se encuentra en curso (atendida por [Médico/ID]). ¿Deseas retomar o unirte a esta atención?"*
   - Opciones: **[Sí, continuar/retomar]** y **[Cancelar]**.
2. **Botón "X" de Salida / Minimizar Chat:**
   - Incluir una **X** visible en la esquina superior derecha del panel/chat de la sesión actual.
   - Al hacer clic en la **X**, mostrar la confirmación:
     > *"¿Deseas salir de la sesión actual? La atención permanecerá en curso para que pueda ser retomada."*
   - Si confirma, la interfaz regresa al listado general de telemedicina sin cerrar formalmente la historia médica (Fase 1/2) para que el médico u otro colega la pueda reanudar.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. **Pruebas Backend:** Agregar pruebas en `tests/telemedicine.test.js` que confirmen que una sesión en estado `in-progress` acepta reingreso de médicos (retornando 200).
2. **Ejecución:** Ejecutar `npm test` verificando que todas las suites pasen con código de salida **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 3 beats.
- **Bitácora:** Registrar la lógica de recuperación de sesión y control de salida en `progress.md`.

