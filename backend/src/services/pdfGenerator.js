// backend/src/services/pdfGenerator.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * Genera un PDF profesional usando plantilla HTML + Puppeteer
 * NUEVO DISEÑO: Una receta completa por página (medicamento + indicaciones)
 */
async function generatePDF(data) {
    const htmlContent = buildHTML(data);
    
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--single-process',
            '--no-zygote',
            '--no-first-run',
            '--no-default-browser-check'
        ],
        env: {
            ...process.env,
            LANG: 'en_US.UTF-8'
        }
    });

    try {
        const page = await browser.newPage();
        
        await page.setContent(htmlContent, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });

        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
        });

        return pdfBuffer;
    } finally {
        await browser.close();
    }
}

/**
 * Construye la plantilla HTML con diseño de página completa por medicamento
 */
function buildHTML({ patient, doctor, medications, prescriptionNumber, type, paraclinicalStudies }) {
    const fecha = new Date().toLocaleDateString('es-VE', { 
        day: '2-digit', month: '2-digit', year: 'numeric' 
    });

    // Ruta del logo (ajustada para Docker)
    const logoPath = path.join(__dirname, '../assets/rescarven-logo-h.svg');
    let logoBase64 = '';
    
    try {
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath);
            logoBase64 = logoData.toString('base64');
        }
    } catch (e) {
        console.error('⚠️ No se encontró el logo:', e.message);
    }

    // Determinar el título según el tipo
    let title = 'RÉCIPE MÉDICO';
    let controlPrefix = 'R';
    
    if (type === 'special_medication') {
        title = 'RÉCIPE ESPECIAL';
        controlPrefix = 'RE';
    } else if (type === 'paraclinical') {
        title = 'ORDEN DE EXÁMENES';
        controlPrefix = 'OE';
    }

    // Generar contenido según el tipo
    let contentHTML = '';
    
    if (type === 'paraclinical' && paraclinicalStudies) {
        // Para exámenes paraclínicos
        contentHTML = `
            <div class="content-section">
                <div class="content-label">EXÁMENES SOLICITADOS:</div>
                <div class="content-text">${paraclinicalStudies}</div>
            </div>
        `;
    } else if (medications && medications.length > 0) {
        // Para medicamentos (normales o especiales)
        contentHTML = medications.map((med, index) => `
            <div class="medication-item">
                <div class="medication-name">${med.name}</div>
                <div class="medication-details">
                    <div class="detail-row">
                        <span class="detail-label">Dosis:</span>
                        <span class="detail-value">${med.dosage || 'Según indicación médica'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duración:</span>
                        <span class="detail-value">${med.duration || 'N/A'}</span>
                    </div>
                </div>
                ${med.instructions ? `
                <div class="instructions-section">
                    <div class="instructions-label">Indicaciones:</div>
                    <div class="instructions-text">${med.instructions}</div>
                </div>
                ` : ''}
            </div>
        `).join('');
    } else {
        contentHTML = '<div class="no-content">No se prescribieron medicamentos en este récipe.</div>';
    }

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { 
                size: letter; 
                margin: 0;
            }
            body { 
                font-family: Arial, Helvetica, sans-serif; 
                margin: 0; 
                padding: 0;
                font-size: 11px; 
                color: #000;
                line-height: 1.4;
            }
            
            .page {
                width: 215.9mm;
                height: 279.4mm;
                padding: 12mm 18mm;
                box-sizing: border-box;
                position: relative;
            }

            /* Logo - MÁS GRANDE (protagonista) */
            .logo {
                width: 300px;
                height: auto;
                margin-bottom: 8px;
            }
            .logo-text {
                font-size: 32px; 
                font-weight: bold; 
                color: #DB1A1D;
                line-height: 1.2;
                margin-bottom: 4px;
            }
            .logo-sub {
                font-size: 14px; 
                color: #00539D; 
                font-weight: bold;
            }
            
            /* Encabezado */
            .header { 
                margin-bottom: 8px; 
            }
            .title { 
                font-size: 18px; 
                font-weight: bold; 
                margin: 8px 0;
                color: #000;
            }
            .control-number {
                text-align: right;
                font-size: 10px;
                line-height: 1.3;
            }
            .control-number strong {
                font-size: 12px;
            }
            
            .separator-line {
                border-top: 1px solid #999;
                margin: 8px 0 12px 0;
            }

            /* Tabla de Datos */
            .data-table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 12px;
                font-size: 10px;
            }
            .data-table td { 
                padding: 3px 0; 
                vertical-align: top;
            }
            .label { 
                font-weight: bold; 
                width: 140px; 
                color: #333;
            }
            .value {
                color: #000;
            }
            
            /* Sección de Contenido */
            .content-section {
                margin: 25px 0;
            }
            .content-label {
                font-size: 11px;
                font-weight: bold;
                margin-bottom: 10px;
                color: #00539D;
            }
            .content-text {
                font-size: 11px;
                line-height: 1.6;
                white-space: pre-line;
            }
            
            /* Medicamento Individual */
            .medication-item {
                margin: 20px 0;
                padding-bottom: 15px;
            }
            .medication-name {
                font-size: 12px;
                font-weight: bold;
                color: #000;
                margin-bottom: 8px;
            }
            .medication-details {
                margin-bottom: 10px;
            }
            .detail-row {
                margin: 4px 0;
                font-size: 10px;
            }
            .detail-label {
                font-weight: bold;
                color: #333;
                display: inline-block;
                width: 80px;
            }
            .detail-value {
                color: #000;
            }
            
            /* Indicaciones (sin línea separadora) */
            .instructions-section {
                margin-top: 8px;
            }
            .instructions-label {
                font-size: 10px;
                font-weight: bold;
                color: #00539D;
                margin-bottom: 4px;
            }
            .instructions-text {
                font-size: 10px;
                line-height: 1.5;
                color: #333;
            }
            
            /* Firma */
            .signature-section {
                margin: 35px 0 25px 0;
                text-align: center;
            }
            .signature-line {
                border-top: 1px solid #000;
                width: 250px;
                margin: 0 auto 5px auto;
            }
            .signature-text {
                font-size: 8px;
                color: #666;
                line-height: 1.4;
            }

            /* Footer - Sedes */
            .footer {
                position: absolute;
                bottom: 12mm;
                left: 18mm;
                right: 18mm;
                font-size: 6px;
                color: #333;
                line-height: 1.5;
            }
            .sede {
                margin-bottom: 6px;
            }
            .sede-title {
                font-weight: bold;
                font-size: 7px;
                margin-bottom: 2px;
                color: #00539D;
            }
            .sede-text {
                color: #555;
            }
            
            /* Sin contenido */
            .no-content {
                text-align: center;
                font-size: 11px;
                color: #999;
                font-style: italic;
                margin-top: 80px;
            }
        </style>
    </head>
    <body>
        <div class="page">
            <!-- Encabezado con Logo -->
            <div class="header">
                ${logoBase64 ? 
                    `<img src="data:image/svg+xml;base64,${logoBase64}" alt="RESCARVEN" class="logo">` :
                    `<div class="logo-text">RESCARVEN<br><span class="logo-sub">Sistema de Emergencias Médicas</span></div>`
                }
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 5px;">
                <div class="title">${title}</div>
                <div class="control-number">
                    N° DE CONTROL<br>
                    <strong>${controlPrefix}-${prescriptionNumber}</strong>
                </div>
            </div>
            
            <div class="separator-line"></div>

            <!-- Datos del Paciente y Médico -->
            <table class="data-table">
                <tr>
                    <td class="label">Paciente:</td>
                    <td class="value"><strong>${patient.name || 'N/A'}</strong></td>
                    <td class="label">Médico:</td>
                    <td class="value">${doctor.name || 'Dr. Rescarven'}</td>
                </tr>
                <tr>
                    <td class="label">Cédula Identidad:</td>
                    <td class="value">${patient.cedula || 'N/A'}</td>
                    <td class="label">Fecha:</td>
                    <td class="value">${fecha}</td>
                </tr>
            </table>
            
            <div class="separator-line"></div>

            <!-- Contenido Principal -->
            ${contentHTML}

            <!-- Espacio para firma -->
            <div class="signature-section">
                <div class="signature-line"></div>
                <div class="signature-text">FIRMA DEL MÉDICO<br>SELLO E INFORMACIÓN C.M./ M.P.P.S.</div>
            </div>

            <!-- Sedes -->
            <div class="footer">
                <div class="sede">
                    <div class="sede-title">CENTRO MÉDICO EL RECREO</div>
                    <div class="sede-text">
                        C.C. Las Galerías, El Recreo, Nivel T2, entre Av. Casanova de Sabana Grande y Av. Venezuela de Bello Monte. 
                        Municipio Libertador, Distrito Capital.<br>
                        Telf: (0212) 610.40.10 • Web: rescarven.com
                    </div>
                </div>
                <div class="sede">
                    <div class="sede-title">CONSULTORIO PARQUE CRISTAL</div>
                    <div class="sede-text">
                        Av. Francisco de Miranda y Primera Calle de la Urb. Los Palos Grandes, Locales LCC3-1 y LCC3-2, 
                        Nivel Comercio Tres, Edif. Parque Cristal. Municipio Chacao.<br>
                        Telfs: Consultorio: (0212) 285.57.92 / Laboratorio: (0212) 285.29.71
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = { generatePDF };

