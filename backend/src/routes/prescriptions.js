// backend/src/routes/prescriptions.js
// ============================================
// RUTAS PARA GENERACIÓN Y ENVÍO DE RECETAS
// ============================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const db = admin.firestore();
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.rescarven.com/enviar_correo';
const APP_ID = process.env.APP_ID || 'default-app-id';
const APP_NAME = process.env.APP_NAME || 'RESCARVEN';

// ============================================
// ENDPOINT 1: Obtener siguiente número
// ============================================
router.post('/next-number', async (req, res) => {
    try {
        const result = await db.runTransaction(async (transaction) => {
            const counterRef = db.collection('counters').doc('prescription_number');
            const counterDoc = await transaction.get(counterRef);
            let currentValue = parseInt(process.env.PRESCRIPTION_COUNTER_START) || 50000000;
            
            if (counterDoc.exists) {
                currentValue = counterDoc.data().value;
            }

            const nextValue = currentValue + 1;
            transaction.set(counterRef, { value: nextValue, updatedAt: new Date() }, { merge: true });
            return nextValue;
        });

        res.json({ success: true, prescriptionNumber: result });
    } catch (error) {
        console.error("Error obteniendo número:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ENDPOINT 2: Generar MÚLTIPLES Recipes y Enviar Correos
// ============================================
router.post('/send', async (req, res) => {
    try {
        const {
            prescriptionNumber,
            type,
            doctor,
            patient,
            medications,
            specialMedications,
            paraclinicalStudies,
            emails
        } = req.body;

        const recipesToSend = [];
        let currentNumber = parseInt(prescriptionNumber);

        // 1️⃣ MEDICAMENTOS NORMALES
        if (medications && medications.length > 0) {
            const pdfBuffer = await generatePrescriptionPDF({
                prescriptionNumber: currentNumber,
                type: 'medication',
                doctor,
                patient,
                medications,
                specialMedications: [],
                paraclinicalStudies: []
            });
            recipesToSend.push({ number: currentNumber, type: 'medication', pdf: pdfBuffer });
            currentNumber++;
        }

        // 2️⃣ MEDICAMENTOS ESPECIALES
        if (specialMedications && specialMedications.length > 0) {
            const pdfBuffer = await generatePrescriptionPDF({
                prescriptionNumber: currentNumber,
                type: 'special_medication',
                doctor,
                patient,
                medications: [],
                specialMedications,
                paraclinicalStudies: []
            });
            recipesToSend.push({ number: currentNumber, type: 'special_medication', pdf: pdfBuffer });
            currentNumber++;
        }

        // 3️⃣ ESTUDIOS PARA CLÍNICOS (LÓGICA NUEVA SEPARADA POR TIPO)
        if (paraclinicalStudies) {
            const { laboratorio, radiologia, imagenologia } = paraclinicalStudies;

            // Laboratorio
            if (laboratorio && laboratorio.length > 0) {
                const pdfBuffer = await generatePrescriptionPDF({
                    prescriptionNumber: currentNumber,
                    type: 'laboratorio',
                    doctor,
                    patient,
                    medications: [],
                    specialMedications: [],
                    paraclinicalStudies: [],
                    studies: laboratorio // Pasamos array específico
                });
                recipesToSend.push({ number: currentNumber, type: 'laboratorio', pdf: pdfBuffer });
                currentNumber++;
            }

            // Radiología
            if (radiologia && radiologia.length > 0) {
                const pdfBuffer = await generatePrescriptionPDF({
                    prescriptionNumber: currentNumber,
                    type: 'radiologia',
                    doctor,
                    patient,
                    medications: [],
                    specialMedications: [],
                    paraclinicalStudies: [],
                    studies: radiologia
                });
                recipesToSend.push({ number: currentNumber, type: 'radiologia', pdf: pdfBuffer });
                currentNumber++;
            }

            // Imagenología
            if (imagenologia && imagenologia.length > 0) {
                const pdfBuffer = await generatePrescriptionPDF({
                    prescriptionNumber: currentNumber,
                    type: 'imagenologia',
                    doctor,
                    patient,
                    medications: [],
                    specialMedications: [],
                    paraclinicalStudies: [],
                    studies: imagenologia
                });
                recipesToSend.push({ number: currentNumber, type: 'imagenologia', pdf: pdfBuffer });
                currentNumber++;
            }
        }

        // 4️⃣ GUARDAR EN FIRESTORE
        for (const recipe of recipesToSend) {
            const prescriptionRef = db.collection('artifacts')
                .doc(APP_ID)
                .collection('public')
                .doc('data')
                .collection('prescriptions')
                .doc(String(recipe.number));

            await prescriptionRef.set({
                prescriptionNumber: recipe.number,
                type: recipe.type,
                doctor: { id: doctor.id, name: doctor.name, license: doctor.license },
                patient: { name: patient.name, cedula: patient.cedula },
                content: recipe.type === 'medication' ? { medications } : 
                         recipe.type === 'special_medication' ? { specialMedications } : 
                         recipe.studies || [], // Guardar lista de estudios
                emailsSentTo: emails,
                createdAt: new Date(),
                isPartOfBatch: recipesToSend.length > 1,
                batchId: prescriptionNumber
            });
        }

        // 5️ ENVIAR CORREOS
        const formData = new FormData();
        const emailData = {
            destinatarios: emails,
            asunto: `Recipes Médicos - ${APP_NAME} (N° ${prescriptionNumber}-${currentNumber - 1})`,
            mensaje: {
                tipo: 'html',
                contenido: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #4f46e5;">🏥 ${APP_NAME} - Recipes Médicos</h2>
                        <p>Estimado(a) ${patient.name},</p>
                        <p>Adjunto encontrará <strong>${recipesToSend.length} recipe(s) médica(s)</strong>:</p>
                        <ul style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
                            ${recipesToSend.map(r => `
                                <li style="margin: 10px 0;">
                                    <strong>Recipe N° ${r.number}</strong> - ${getRecipeTypeLabel(r.type)}
                                </li>
                            `).join('')}
                        </ul>
                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                        <p><strong>Médico:</strong> ${doctor.name}</p>
                        <p><strong>Colegiado:</strong> ${doctor.license}</p>
                        <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-VE')}</p>
                    </div>
                `
            }
        };

        formData.append('datos', JSON.stringify(emailData));

        recipesToSend.forEach(recipe => {
            formData.append('archivos', recipe.pdf, {
                filename: `Recipe_${recipe.number}.pdf`,
                contentType: 'application/pdf'
            });
        });

        const apiResponse = await fetch(EMAIL_API_URL, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        const apiResult = await apiResponse.json();

        if (apiResponse.ok) {
            const recipeNumbers = recipesToSend.map(r => r.number).join(', ');
            console.log(`✅ Recipes ${recipeNumbers} enviadas por correo a: ${emails.join(', ')}`);
            
            res.json({ 
                success: true, 
                message: `${recipesToSend.length} recipe(s) generada(s) y enviada(s) exitosamente.`,
                recipeNumbers: recipesToSend.map(r => r.number)
            });
        } else {
            console.error('❌ Error en API de correos:', apiResult);
            res.status(500).json({ success: false, message: 'Error al enviar correos', details: apiResult });
        }

    } catch (error) {
        console.error("❌ Error en proceso de recipes:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// FUNCIÓN GENERADORA DE PDF (PDFKit)
// ============================================
async function generatePrescriptionPDF({
    prescriptionNumber,
    type,
    doctor,
    patient,
    medications,
    specialMedications,
    paraclinicalStudies,
    studies // Nuevo array para estudios específicos
}) {
    const doc = new PDFDocument({ margin: 0, size: 'LETTER', bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const COLORS = {
        red: '#DB1A1D',
        blue: '#00539D',
        black: '#000000',
        gray: '#555555',
        line: '#CCCCCC'
    };

    const SEDE_1 = {
        nombre: 'CENTRO MÉDICO EL RECREO',
        dir: 'C.C. Las Galerías, El Recreo, Nivel T2, entre Av. Casanova de Sabana Grande y Av. Venezuela de Bello Monte. Municipio Libertador, Distrito Capital.',
        telf: 'Telf: (0212) 610.40.10 • Web: rescarven.com'
    };

    const SEDE_2 = {
        nombre: 'CONSULTORIO PARQUE CRISTAL',
        dir: 'Av. Francisco de Miranda y Primera Calle de la Urb. Los Palos Grandes, Locales LCC3-1 y LCC3-2, Nivel Comercio Tres, Edif. Parque Cristal. Municipio Chacao.',
        telf: 'Telfs: Consultorio: (0212) 285.57.92 / Laboratorio: (0212) 285.29.71'
    };

    // Determinar medicamentos según tipo
    let medsToUse = [];
    if (type === 'special_medication' && specialMedications) {
        medsToUse = specialMedications;
    } else if (medications) {
        medsToUse = medications;
    }

    // ============================================
    // 🎨 TÍTULOS CORREGIDOS
    // ============================================
    let title = 'Récipe Médico';
    if (type === 'special_medication') {
        title = 'Récipe Especial';
    } else if (type === 'laboratorio') {
        title = 'Orden de Laboratorio';
    } else if (type === 'radiologia') {
        title = 'Orden de Radiología';
    } else if (type === 'imagenologia') {
        title = 'Orden de Imagenología';
    }

    const fecha = new Date().toLocaleDateString('es-VE');

    // ============================================
    // 🎨 HEADER (Se mantiene exactamente igual)
    // ============================================
    // Logo
    const logoPath = path.join(__dirname, '../assets/rescarven-logo.png');
    if (fs.existsSync(logoPath)) {
        try {
            doc.image(logoPath, 20, 10, { height: 100, align: 'left' });
        } catch (e) {
            console.error('⚠️ Error cargando logo:', e.message);
            doc.fillColor(COLORS.red).fontSize(24).font('Helvetica-Bold').text('RESCARVEN', 30, 15);
        }
    } else {
        doc.fillColor(COLORS.red).fontSize(24).font('Helvetica-Bold').text('RESCARVEN', 30, 15);
    }

    // Título
    doc.fillColor(COLORS.blue).fontSize(16).font('Helvetica-Bold')
       .text(title, 0, 95, { width: 582, align: 'center' });

    // Número de Control
    doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
       .text('N° DE CONTROL', 450, 20, { width: 100, align: 'right' });
    doc.fillColor(COLORS.red).fontSize(16).font('Courier-Bold')
       .text(String(prescriptionNumber), 450, 38, { width: 100, align: 'right' });

    // Línea Header
    doc.moveTo(30, 125).lineTo(582, 125).strokeColor(COLORS.line).lineWidth(0.5).stroke();

    // ============================================
    // 📋 DATOS PACIENTE Y MÉDICO
    // ============================================
//  const fecha = new Date().toLocaleDateString('es-VE');
    const dataStartY = 135;

    doc.fillColor(COLORS.black).fontSize(10);
    doc.font('Helvetica-Bold').text('Paciente:', 40, dataStartY);
    doc.font('Helvetica').text(patient.name || 'N/A', 40, dataStartY + 12);
    doc.font('Helvetica-Bold').text('Cédula Identidad:', 40, dataStartY + 26);
    doc.font('Helvetica').text(patient.cedula || 'N/A', 40, dataStartY + 38);

    doc.font('Helvetica-Bold').text('Médico:', 300, dataStartY);
    doc.font('Helvetica').text(doctor.name || 'Dr. Rescarven', 300, dataStartY + 12);
    doc.font('Helvetica-Bold').text('Fecha:', 300, dataStartY + 26);
    doc.font('Helvetica').text(fecha, 300, dataStartY + 38);

    doc.moveTo(30, dataStartY + 55).lineTo(582, dataStartY + 55).strokeColor(COLORS.black).lineWidth(0.5).stroke();

    // ============================================
    // 📄 LÓGICA DE CONTENIDO
    // ============================================
    let currentY = dataStartY + 70; // Y=205 aprox

    // LÓGICA PARA ESTUDIOS (Laboratorio, Radiología, Imagenología)
    if (['laboratorio', 'radiologia', 'imagenologia'].includes(type)) {
        if (studies && studies.length > 0) {
            studies.forEach((study, i) => {
                doc.fillColor(COLORS.black).font('Helvetica').fontSize(11)
                   .text(`${i + 1}. ${study}`, 50, currentY, { width: 500 });
                currentY += 20;
            });
        } else {
            doc.font('Helvetica-Oblique').fontSize(10).fillColor('#999')
               .text('No se especificaron estudios.', 50, currentY);
            currentY += 20;
        }
        currentY += 40; // Espacio antes de la firma para estudios
    } 
    // LÓGICA PARA MEDICAMENTOS (Normales y Especiales)
    else {
        // --- SECCIÓN 1: PARA FARMACÉUTICO ---
        doc.fillColor(COLORS.black).fontSize(14).font('Helvetica-Bold').text('Rp.', 40, currentY);
        currentY += 20;

        if (medsToUse.length > 0) {
            medsToUse.forEach((med, i) => {
                doc.fillColor(COLORS.black);
                doc.font('Helvetica-Bold').fontSize(11).text(`${i + 1}. ${med.name}`, 50, currentY, { width: 500 });
                doc.font('Helvetica').fontSize(10).text(`Presentación: ${med.dosage || 'Según indicación'}`, 50, currentY + 14);
                currentY += 35;
            });
        } else {
            doc.font('Helvetica-Oblique').fontSize(10).fillColor('#999').text('No se prescribieron medicamentos.', 50, currentY);
            currentY += 30;
        }

        // --- DIVISOR VISUAL + TÍTULO SECCIÓN 2 ---
        doc.moveTo(40, currentY + 10).lineTo(572, currentY + 10).strokeColor(COLORS.line).lineWidth(0.5).stroke();
        // Título "Indicaciones" en NEGRO (Sobrío)
        doc.fillColor(COLORS.black).fontSize(12).font('Helvetica-Bold').text('Indicaciones', 40, currentY + 25);
        currentY += 50;

        // --- SECCIÓN 2: INDICACIONES ---
        if (medsToUse.length > 0) {
            medsToUse.forEach((med, i) => {
                doc.fillColor(COLORS.black); // Asegurar color negro
                doc.font('Helvetica-Bold').fontSize(10).text(`${med.name}:`, 50, currentY);
                doc.font('Helvetica').fontSize(10).text(`${med.instructions || 'Tomar según indicación médica.'}`, 50, currentY + 14);
                doc.fillColor(COLORS.gray).font('Helvetica-Oblique').fontSize(9).text(`Duración: ${med.duration || 'N/A'}`, 50, currentY + 28);
                currentY += 45;
            });
        }
    }

    // ============================================
    // ️ FIRMA Y PIE DE PÁGINA
    // ============================================
    const signatureY = 680;
    doc.fillColor(COLORS.black).strokeColor(COLORS.black); // Resetear colores
    
    doc.moveTo(350, signatureY).lineTo(520, signatureY).lineWidth(0.5).stroke();
    doc.fillColor(COLORS.gray).fontSize(7).font('Helvetica')
        .text('FIRMA DEL MÉDICO', 350, signatureY + 5, { align: 'center', width: 170 })
        .text('SELLO E INFORMACIÓN C.M./ M.P.P.S.', 350, signatureY + 14, { align: 'center', width: 170 });

    const footerY = 720;
    doc.fillColor(COLORS.black).fontSize(7).font('Helvetica-Bold').text(SEDE_1.nombre, 40, footerY);
    doc.fontSize(6).font('Helvetica').text(SEDE_1.dir, 40, footerY + 7, { width: 250, continued: true });
    doc.fontSize(6).text(SEDE_1.telf, 40, footerY + 15, { width: 250 });

    doc.fillColor(COLORS.black).fontSize(7).font('Helvetica-Bold').text(SEDE_2.nombre, 300, footerY);
    doc.fontSize(6).font('Helvetica').text(SEDE_2.dir, 300, footerY + 7, { width: 250, continued: true });
    doc.fontSize(6).text(SEDE_2.telf, 300, footerY + 15, { width: 250 });

    doc.end();
    return await new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));
}

function getRecipeTypeLabel(type) {
    const labels = {
        'medication': 'Medicamentos Generales',
        'special_medication': 'Medicamentos Especiales (Controlados)',
        'laboratorio': 'Orden de Laboratorio',
        'radiologia': 'Orden de Radiología',
        'imagenologia': 'Orden de Imagenología'
    };
    return labels[type] || type;
}

module.exports = router;

