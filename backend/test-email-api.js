// backend/test-email-api.js
require('dotenv').config();
const FormData = require('form-data');
const fetch = require('node-fetch');  // ✅ node-fetch@2 funciona con require()

async function testEmailAPI() {
  console.log('🧪 Probando API de envío de correos...\n');

  const formData = new FormData();

  const emailData = {
    destinatarios: ['vitoruggiero@rescarven.com'],
    asunto: '✅ Test API de Correos - Rescarven',
    mensaje: {
      tipo: 'html',
      contenido: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">¡Funciona! 🎉</h2>
          <p>Este es un correo de prueba desde el sistema <strong>Rescarven</strong>.</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Detalles del Envío:</h3>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-VE')}</p>
            <p><strong>Destinatario:</strong> vitoruggiero@rescarven.com</p>
            <p><strong>Tipo:</strong> HTML</p>
          </div>
          <p style="color: #059669; font-weight: bold;">✅ La API de correos está funcionando correctamente.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            <em>Rescarven - Sistema de Emergencias Médicas</em>
          </p>
        </div>
      `
    }
  };

  formData.append('datos', JSON.stringify(emailData));

  try {
    const response = await fetch('https://api.rescarven.com/enviar_correo', {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders()
      }
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ ¡CORREO ENVIADO EXITOSAMENTE!');
      console.log('📬 Respuesta:', result);
      console.log('\n🔍 Revisa la bandeja de entrada de vitoruggiero@rescarven.com');
    } else {
      console.error('❌ Error en la respuesta:', result);
    }

  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
  }
}

testEmailAPI();
