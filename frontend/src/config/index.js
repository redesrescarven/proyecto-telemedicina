// src/config/index.js

const config = {
  // Ambiente actual (qa, prod, dev)
  env: import.meta.env.VITE_APP_ENV || 'development',
  
  // Backend API
  backendUrl: import.meta.env.VITE_BACKEND_URL || '/api',
  
  // Firebase Configuration
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  },
  
  // App ID de Rescarven
  appId: import.meta.env.VITE_APP_ID || 'default-app-id',
  
  // URLs base
  videoCallBaseUrl: import.meta.env.VITE_VIDEO_CALL_BASE_URL || window.location.origin,
  
  // Helpers
  isProduction: import.meta.env.VITE_APP_ENV === 'production',
  isQA: import.meta.env.VITE_APP_ENV === 'qa',
  isDevelopment: import.meta.env.VITE_APP_ENV === 'development',
  
  // Construir URLs completas
  getBackendUrl: (endpoint) => {
    const baseUrl = config.backendUrl.replace(/\/$/, ''); // Remove trailing slash
    const cleanEndpoint = endpoint.replace(/^\//, ''); // Remove leading slash
    return `${baseUrl}/${cleanEndpoint}`;
  },
  
  getVideoCallUrl: (sessionId, role) => {
    const baseUrl = config.videoCallBaseUrl.replace(/\/$/, '');
    return `${baseUrl}/video-call?id=${sessionId}&role=${role}`;
  }
};

// Validar configuración requerida
const requiredVars = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID'];
const missingVars = requiredVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0 && config.env !== 'development') {
  console.warn('⚠️ Variables de entorno faltantes:', missingVars);
}

// Exportar configuración
export default config;

// Exportar individualmente para conveniencia
export const { 
  env, 
  backendUrl, 
  firebase, 
  appId, 
  videoCallBaseUrl,
  isProduction,
  isQA,
  isDevelopment,
  getBackendUrl,
  getVideoCallUrl
} = config;

