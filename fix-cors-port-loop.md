# Especificación del Bucle: Rutas Agnosticas de Entorno (fix-cors-port-loop.md)

## 1. Contexto y Problema
El frontend tiene URLs absolutas tipo `http://localhost:4000` que generan errores de CORS y rompen la portabilidad entre contenedores (server13_1, QA, Producción).

## 2. Acciones Requeridas

### Frontend (`frontend/src/components/Telemedicina.jsx` y cliente API)
- Reemplazar cualquier instancia de `http://localhost:4000/api/` o `http://localhost:4001/api/` por rutas relativas `/api/`.
- Asegurar que la petición del historial previo quede configurada como:
  ```javascript
  fetch(`/api/medical-history/patient/${userId}/summary`, {
    headers: {
      'x-operator-role': currentRole || 'medico',
      'x-operator-id': currentOperatorId || 'medico_test'
    }
  })

