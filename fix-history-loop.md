# Especificación del Bucle de Corrección: Carga de Historial Médico (fix-history-loop.md)

## 1. Problema Identificado
El endpoint rechaza la petición porque `userId` llega como `"null"` y no se envían cabeceras de operador médico en el frontend.

## 2. Acciones Requeridas

### Frontend (`frontend/src/components/Telemedicina.jsx`)
1. **Validación Previa:** En la función que abre la modal o consulta el historial, verificar que exista un `userId` o `pacienteId` válido. Si es `null` o `undefined`, mostrar una alerta o deshabilitar el botón "Consultar Historial Previos".
2. **Obtención del ID Real:** Extraer el ID del paciente desde el estado de la sesión activa de telemedicina (ej. `activeSession.userId` o `selectedPatient.id`).
3. **Cabeceras HTTP:** Incluir explícitamente en el `fetch`:
   ```javascript
   headers: {
     'x-operator-role': 'medico',
     'x-operator-id': currentOperatorId || 'medico_test'
   }
