# Especificación del Bucle: CRUD Usuarios (Eliminar, Clave, Estado) e Impresión Diagnóstica Obligatoria (qa-users-crud-and-mandatory-diagnostic-loop.md)

## 1. Objetivo
1. Añadir eliminación de usuarios y cambio forzado de contraseña por parte del Administrador.
2. Bloquear el inicio de sesión / acceso a la API a usuarios marcados como inactivos (`inactive`).
3. Hacer obligatoria la Impresión Diagnóstica al guardar la historia médica en Telemedicina.

## 2. Acciones Requeridas

### A. Backend — Usuarios (`backend/src/routes/admin.js` o `users.js`)
1. **Endpoint Eliminar (`DELETE /api/admin/users/:uid`):**
   - Eliminar el usuario en Firebase Auth (`admin.auth().deleteUser`) y su documento en Firestore (`users`).
2. **Endpoint Cambiar Clave (`PATCH /api/admin/users/:uid/password`):**
   - Recibir `newPassword` y actualizar vía `admin.auth().updateUser(uid, { password })`.
3. **Validación de Usuario Inactivo en Login/Auth:**
   - Al autenticar o en el middleware `verifyToken`, consultar el campo `status` o `disabled`. Si `status === 'inactive'`, retornar `403 Forbidden` ("Cuenta inactivada. Contacte al administrador").
   - Al inactivar un usuario, ejecutar `admin.auth().updateUser(uid, { disabled: true })`.

### B. Frontend — Módulo de Usuarios (`SystemUserManagement.jsx`)
1. Agregar botón de **Eliminar** con modal de confirmación en cada fila de usuario.
2. Agregar botón de **Cambiar Contraseña** que abra un modal con input de nueva clave.
3. Asegurar que al cambiar el toggle/select de estado a "Inactivo", la API deshabilite efectivamente al usuario.

### C. Frontend — Telemedicina (`Telemedicina.jsx`)
1. Validar que el campo **Impresión Diagnóstica** no esté vacío (`!diagnostic.trim()`) antes de permitir guardar/finalizar la historia clínica.
2. Mostrar alerta visual / borde rojo si el médico intenta finalizar la consulta sin llenar este campo.

## 3. Criterios de Aceptación Deterministas (exit 0)
1. Eliminación y cambio de clave operativos desde el panel de administración.
2. Bloqueo efectivo de acceso para usuarios en estado inactivo.
3. Formulario de Telemedicina impidiendo el cierre si falta la Impresión Diagnóstica.
4. Compilación del Frontend (`docker compose build frontend`) y `npm test` finalizando en **exit code 0**.

## 4. Presupuesto
- **Presupuesto:** 2 beats.
