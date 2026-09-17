// backend/test-email-final.js
require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('📧 Enviando correo de prueba a vitoruggiero@rescarven.com...\n');

// Crear transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS?.replace(/\s+/g, '')
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Opciones del correo
const mailOptions = {
    from: `"Rescarven - Sistema de Emergencias" <${process.env.EMAIL_USER}>`,
    to: 'vitoruggiero@rescarven.com',
    subject: '✅ Configuración de Correo Exitosa - Rescarven',
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4f46e5;">¡Configuración Exitosa! 🎉</h2>
            
            <p>Este es un correo de prueba desde el sistema <strong>Rescarven - Botón de Emergencia</strong>.</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1f2937;">Detalles del Envío:</h3>
                <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-VE')}</p>
                <p><strong>Destinatario:</strong> vitoruggiero@rescarven.com</p>
                <p><strong>Remitente:</strong> ${process.env.EMAIL_USER}</p>
                <p><strong>Servidor SMTP:</strong> ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}</p>
            </div>
            
            <p style="color: #059669; font-weight: bold;">✅ El sistema de envío de correos está funcionando correctamente.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            
            <p style="color: #6b7280; font-size: 14px;">
                <em>Rescarven - Sistema de Emergencias Médicas</em><br>
                <em>Este es un mensaje automático, por favor no responda.</em>
            </p>
        </div>
    `
};

// Enviar correo
transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.error('❌ Error al enviar correo:', error.message);
        console.error('\nDetalles:', error);
        process.exit(1);
    } else {
        console.log('✅ Correo enviado exitosamente!');
        console.log('📬 Message ID:', info.messageId);
        console.log('📤 Destinatario: vitoruggiero@rescarven.com');
        console.log('\n🔍 Revisa la bandeja de entrada (y spam) de vitoruggiero@rescarven.com');
        process.exit(0);
    }
});

