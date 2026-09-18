# Especificación del Bucle: Corrección de Fecha en Historias y Quota Exceeded en Creación de Médicos (qa-fixes-storage-and-history-date-loop.md)

## 1. Objetivo
1. Reparar el error 'Invalid Date' en el detalle de historias médicas dentro del módulo de Telemedicina.
2. Permitir la creación exitosa de usuarios (incluyendo rol 'medico') aun cuando Firebase Storage reporte cuota excedida (`Quota Exceeded`).

## 2. Acciones Requeridas

### A. Frontend — Formateo de Fechas en Historias (`frontend/src/`)
1. Localizar los componentes de detalle de historia médica dentro de Telemedicina (`Telemedicina.jsx`, `HistoriasMedicas.jsx` o modal de detalle).
2. Proteger la conversión de fechas (`createdAt`, `timestamp`, `date`) evaluando si el valor viene como Timestamp nativo de Firestore (`.toDate()`), milisegundos numéricos o string.

### B. Backend/Frontend — Módulo de Usuarios (`AdminUsers.jsx` / `backend/src/routes/users.js` o `auth.js`)
1. En la lógica de creación de médicos:
   - Capturar excepciones en el bloque de subida de archivos a Firebase Storage (`try/catch`).
   - Si se detecta `storage/quota-exceeded` o error de subida, fallback a guardar la representación en base64 comprimida/string por defecto o continuar la creación del usuario en Firestore omitiendo el archivo en Storage para evitar romper el flujo del administrador.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Detalle de historia médica desplegando la fecha legible.
2. Creación de un usuario con rol 'médico' completada con éxito desde el panel de administración sin bloquearse por la cuota de Firebase Storage.
3. Compilación/Pruebas del proyecto en exit code 0.

## 4. Presupuesto
- **Presupuesto:** 2 beats.

