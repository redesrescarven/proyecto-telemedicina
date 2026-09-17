// backend/tests/setup.js
// Ejecutado antes de cada archivo de prueba: garantiza determinismo
// independientemente de backend/.env y del entorno real.
process.env.NODE_ENV = 'test';
process.env.APP_ID = 'test-app-id';
process.env.PORT = '4001';
process.env.GOOGLE_APPLICATION_CREDENTIALS = './config/serviceAccountKey.json';