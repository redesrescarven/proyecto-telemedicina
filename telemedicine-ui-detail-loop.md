# Especificación del Bucle: Rediseño UI y Detalle de Historia (telemedicine-ui-detail-loop.md)

## 1. Objetivo
Mejorar la distribución visual del formulario de telemedicina y habilitar una vista detallada de la historia médica seleccionada mediante doble clic desde la lista previa.

## 2. Acciones Requeridas

### A. Layout y Diseño UI (`frontend/src/components/Telemedicina.jsx`)
1. **Formulario Principal:** Incrementar el tamaño y padding de la ventana/formulario de telemedicina para aprovechar mejor el espacio de pantalla (layout más amplio, legible y estructurado).
2. **Barra de Herramientas / Botones:** Reorganizar los botones superiores (agrupación limpia, mayor espaciado entre acciones, alineación adecuada de botones principales como el de "Consultar Historial").

### B. Detalle de Historia por Doble Clic
1. **Interacción:** En la tabla/lista de historias previas dentro de la modal, agregar evento `onDoubleClick` a cada tarjeta o fila.
2. **Vista de Detalle:** Al hacer doble clic en una historia, desplegar un sub-modal o vista expandida que muestre la historia clínica completa:
   - Datos generales y fecha.
   - **Fase 1 completa:** Síntomas, examen físico, signos vitales y antecedentes.
   - **Fase 2 completa:** Diagnóstico final, indicaciones, récipes/recetas y exámenes solicitados.
3. **Petición de Datos:** Usar el endpoint existente de historia `GET /api/medical-history/:historyId` o asegurar que la modal obtenga el objeto expandido con las cabeceras de rol médico correspondientes.
4. **Navegación:** Incluir botón "Volver a la lista" o "Cerrar Detalle" para regresar al listado de historias sin cerrar la modal principal.

### C. Reconstrucción de Frontend
- Recompilar el bundle estático de React y recrear el contenedor de frontend para aplicar los cambios visuales.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Correr `npm test` en el backend asegurando que **28/28 tests sigan en verde (exit code 0)**.
2. Confirmar que el bundle no contenga errores sintácticos de React/JSX.

## 4. Presupuesto
- **Presupuesto:** 3 beats.
- **Bitácora:** Registrar las mejoras de UI y la interacción de doble clic en `progress.md`.

