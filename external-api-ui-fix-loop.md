# Especificación del Bucle: Corrección de Fecha y Sincronización de Cola Telemedicina (external-api-ui-fix-loop.md)

## 1. Objetivo
Garantizar que las sesiones inyectadas mediante el API externa muestren la fecha/hora correctamente en pantalla y aparezcan en el listado activo del módulo de Telemedicina.

## 2. Acciones Requeridas

### A. Backend (`backend/src/routes/externalApi.js`)
1. **Formato de Fecha Nativo de Firestore:**
   - Usar `admin.firestore.FieldValue.serverTimestamp()` o `admin.firestore.Timestamp.now()` para `requestedAt` y `createdAt`.
   - Incluir fallback como ISO string `requestedAtFormatted: new Date().toLocaleDateString()` para compatibilidad en renderizado directo.
2. **Campos para Cola de Telemedicina:**
   - Escribir el documento en `telemedicine_sessions` con:
     * `status`: `'PENDIENTE'` (o `'requested'` según corresponda en la UI)
     * `tipo`: `'TELEMEDICINA'`
     * `isExternal`: `true`
     * `patientData`: `{ nombre, cedula, telefono, email }`
     * `userData`: `{ nombre, cedula, telefono, email }`
     * `nombre`, `cedula`, `telefono`, `email`, `motivo`
3. **Guardado en `emergencies` (Si aplica al Monitor):**
   - Asegurar que si el Monitor lee de `emergencies`, los campos `nombre`, `cedula`, `telefono` y `requestedAt` estén en la raíz del documento.

### B. Pruebas Backend (`backend/tests/externalApi.test.js`)
1. Verificar que la respuesta retorne un código `201 Created` y los objetos de fecha formateados.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Ejecución de `npm test` con **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

