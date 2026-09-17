// src/components/EmergenciaMedica.jsx
import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import DiagnosticAutocomplete from './DiagnosticAutocomplete';
import PrescriptionModal from './PrescriptionModal';

const EmergenciaMedica = ({ user, db, appId, operatorName, setToast }) => {
  const [pendingCases, setPendingCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('fase1');

  const [medicalForm, setMedicalForm] = useState({
    nombre: '',
    apellidos: '',
    cedula: '',
    fechaNacimiento: '',
    lugarNacimiento: '',
    nombreFamiliar: '',
    telefonos: '',
    
    // FASE 1 (Remotos/Telefónicos)
    motivoConsulta: '', 
    antecedentes: '', 
    sintomas: '',
    ta: '', fc: '', fr: '', glic: '', sato2: '',
    diagnostico: '', 
    tratamiento: '',
    
    // FASE 2 (Presenciales/Domiciliarios)
    ta_f2: '', 
    fc_f2: '', 
    fr_f2: '', 
    glic_f2: '', 
    sato2_f2: '',
    examenFisico: '',
    diagnostico_f2: '', 
    tratamiento_f2: '', 
    traslado: ''
  });

  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  // ESCUCHAR EMERGENCIAS Y TELEMEDICINAS ESCALADAS
  useEffect(() => {
    if (!db || !user) return;
    
    let emergencies = [];
    let telemedicineEscalated = [];

    const updateCases = () => {
      const allCases = [...emergencies, ...telemedicineEscalated].sort((a, b) => {
        const timeA = a.timestamp?.getTime?.() || a.createdAt?.getTime?.() || 0;
        const timeB = b.timestamp?.getTime?.() || b.createdAt?.getTime?.() || 0;
        return timeB - timeA;
      });
      setPendingCases(allCases);
    };

    const emergencyQuery = query(
      collection(db, `artifacts/${appId}/public/data/emergencyRequests`),
      where('status', 'in', ['in-progress'])
    );

    const unsubEmergency = onSnapshot(emergencyQuery, (snapshot) => {
      emergencies = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        caseType: 'emergency',
        timestamp: doc.data().timestamp?.toDate?.() || new Date()
      }));
      updateCases();
    });

    const teleQuery = query(
      collection(db, `artifacts/${appId}/public/data/telemedicineSessions`),
      where('status', '==', 'escalated')
    );

    const unsubTele = onSnapshot(teleQuery, (snapshot) => {
      telemedicineEscalated = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          caseType: 'telemedicine_escalated',
          historyId: doc.id,
          timestamp: data.timestamp?.toDate?.() || data.createdAt?.toDate?.() || new Date()
        };
      });
      updateCases();
    });

    return () => {
      unsubEmergency();
      unsubTele();
    };
  }, [db, appId, user]);

  // SELECCIONAR CASO Y CARGAR HISTORIA
  const handleSelectCase = async (emergency) => {
    setLoading(true);
    setSelectedCase(emergency);
    setActiveTab(emergency.caseType === 'telemedicine_escalated' ? 'fase2' : 'fase1');
    
    setMedicalForm({
      nombre: emergency.userName?.split(' ')[0] || '',
      apellidos: emergency.userName?.split(' ').slice(1).join(' ') || '',
      cedula: emergency.userCedula || '',
      telefonos: emergency.userPhone || '',
      motivoConsulta: '', antecedentes: '',
      ta: '', fc: '', fr: '', glic: '', sato2: '',
      ta_f2: '', fc_f2: '', fr_f2: '', glic_f2: '', sato2_f2: '',
      sintomas: '', diagnostico: '', tratamiento: '', traslado: '', examenFisico: '',
      diagnostico_f2: '', tratamiento_f2: ''
    });

    try {
      const historyRef = doc(db, `artifacts/${appId}/users/${emergency.userId}/medicalHistory/${emergency.id}`);
      const snap = await getDoc(historyRef);

      if (snap.exists()) {
        const data = snap.data();
        setHistoryData(data);

        if (data.fase1?.fields) {
          setMedicalForm(prev => ({ ...prev, ...data.fase1.fields }));
        }

        if (data.fase2?.fields) {
          setMedicalForm(prev => ({ ...prev, ...data.fase2.fields }));
        }
      } else {
        setHistoryData(null);
      }
    } catch (e) {
      console.error("Error al cargar historia:", e);
      setToast({ message: 'Error al cargar la historia médica', type: 'error' });
    }
    setLoading(false);
  };

  const handleClosePhase1 = async () => {
    if (!selectedCase) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/medical-history/${selectedCase.id}/phase1`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-operator-rol': 'medico',
          'x-operator-uid': user.uid
        },
        body: JSON.stringify({
          userId: selectedCase.userId,
          filledBy: user.uid,
          filledByName: operatorName,
          fields: medicalForm,
          isFinal: true
        })
      });
      const data = await response.json();
      if (data.success) {
        setToast({ message: 'Fase 1 cerrada y bloqueada.', type: 'success' });
        setActiveTab('fase2');
        handleSelectCase(selectedCase);
      } else {
        setToast({ message: data.message || 'Error al cerrar Fase 1', type: 'error' });
      }
    } catch (error) {
      console.error("Error al cerrar Fase 1:", error);
      setToast({ message: "Error al cerrar Fase 1", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClosePhase2 = async () => {
    if (!selectedCase) return;
    if (!medicalForm.examenFisico?.trim() || !medicalForm.diagnostico_f2?.trim()) {
      setToast({ message: 'Examen Físico e Impresión Diagnóstica (Fase 2) son obligatorios.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/medical-history/${selectedCase.id}/phase2`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-operator-rol': 'medico',
          'x-operator-uid': user.uid
        },
        body: JSON.stringify({
          userId: selectedCase.userId,
          filledBy: user.uid,
          filledByName: operatorName,
          fields: {
            ...medicalForm,
            diagnostico: medicalForm.diagnostico_f2,
            tratamiento: medicalForm.tratamiento_f2,
            examenFisico: medicalForm.examenFisico
          },
          isFinal: true
        })
      });
      const data = await response.json();
      if (data.success) {
        setToast({ message: 'Historia médica completada y bloqueada.', type: 'success' });
        setSelectedCase(null);
      } else {
        setToast({ message: data.message || 'Error al cerrar Fase 2', type: 'error' });
      }
    } catch (error) {
      console.error("Error al cerrar Fase 2:", error);
      setToast({ message: "Error al cerrar historia médica", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-red-700 mb-4">🚑 Atención Médica de Emergencia</h2>

      {!selectedCase && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
          {pendingCases.map(em => (
            <button
              key={em.id}
              onClick={() => handleSelectCase(em)}
              className="text-left p-4 border-2 border-gray-200 rounded-lg hover:border-red-400 hover:bg-red-50 transition relative"
            >
              {em.caseType === 'telemedicine_escalated' ? (
                <span className="absolute top-2 right-2 bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">
                  🔄 TELEMEDICINA ESCALADA
                </span>
              ) : (
                <span className="absolute top-2 right-2 bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
                  🚨 EMERGENCIA DIRECTA
                </span>
              )}

              <p className="font-bold text-lg pr-24">{em.userName}</p>
              <p className="text-sm text-gray-600">Cédula: {em.userCedula}</p>
              <p className="text-xs text-gray-500 mt-2">
                {em.caseType === 'telemedicine_escalated' 
                  ? '📞 Origen: Telemedicina → Escalada a Emergencia' 
                  : '🆘 Solicitada directamente'}
              </p>
            </button>
          ))}
          {pendingCases.length === 0 && (
            <p className="text-gray-500 col-span-full text-center py-8">
              No hay casos pendientes.
            </p>
          )}
        </div>
      )}

      {selectedCase && (
        <div className="flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <div>
              <h3 className="text-xl font-bold text-gray-700">
                Historia Clínica: {selectedCase.userName}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedCase.caseType === 'telemedicine_escalated' 
                  ? '🔄 Caso escalado desde Telemedicina' 
                  : '🚨 Emergencia Directa'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('fase1')}
                className={`px-4 py-2 rounded ${activeTab === 'fase1' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                📋 Fase 1
              </button>
              <button
                onClick={() => setActiveTab('fase2')}
                className={`px-4 py-2 rounded ${activeTab === 'fase2' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
              >
                🏥 Fase 2
              </button>
              <button
                onClick={() => setSelectedCase(null)}
                className="text-gray-500 hover:text-gray-800 font-bold ml-4"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 bg-gray-50 rounded flex-grow">
            
            {/* FASE 1 */}
            {activeTab === 'fase1' && (
              <>
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-blue-800 mb-1">📋 FASE 1: Pre-Evaluación e Interrogatorio</h4>
                  {(historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated') && (
                    <p className="text-sm text-blue-600 font-semibold">🔒 Fase 1 BLOQUEADA (Solo Lectura)</p>
                  )}
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-indigo-600 mb-3 border-b pb-2">Datos del Paciente</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <input className="border p-2 rounded" placeholder="Nombre" value={medicalForm.nombre} onChange={e => setMedicalForm({...medicalForm, nombre: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded" placeholder="Apellidos" value={medicalForm.apellidos} onChange={e => setMedicalForm({...medicalForm, apellidos: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded" placeholder="Cédula" value={medicalForm.cedula} readOnly />
                    <input className="border p-2 rounded" type="date" value={medicalForm.fechaNacimiento} onChange={e => setMedicalForm({...medicalForm, fechaNacimiento: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded" placeholder="Lugar Nacimiento" value={medicalForm.lugarNacimiento} onChange={e => setMedicalForm({...medicalForm, lugarNacimiento: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded" placeholder="Nombre Familiar" value={medicalForm.nombreFamiliar} onChange={e => setMedicalForm({...medicalForm, nombreFamiliar: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded" placeholder="Teléfonos" value={medicalForm.telefonos} onChange={e => setMedicalForm({...medicalForm, telefonos: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                  </div>
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-gray-700 mb-2">Motivo de Consulta</h4>
                  <textarea className="w-full border p-2 rounded h-20" value={medicalForm.motivoConsulta} onChange={e => setMedicalForm({...medicalForm, motivoConsulta: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-gray-700 mb-2">Antecedentes</h4>
                  <textarea className="w-full border p-2 rounded h-20" value={medicalForm.antecedentes} onChange={e => setMedicalForm({...medicalForm, antecedentes: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-gray-700 mb-2">Signos Vitales Iniciales</h4>
                  <div className="grid grid-cols-5 gap-2">
                    <input className="border p-2 rounded text-center" placeholder="TA" value={medicalForm.ta} onChange={e => setMedicalForm({...medicalForm, ta: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded text-center" placeholder="FC" value={medicalForm.fc} onChange={e => setMedicalForm({...medicalForm, fc: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded text-center" placeholder="FR" value={medicalForm.fr} onChange={e => setMedicalForm({...medicalForm, fr: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded text-center" placeholder="GLIC" value={medicalForm.glic} onChange={e => setMedicalForm({...medicalForm, glic: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                    <input className="border p-2 rounded text-center" placeholder="SatO2" value={medicalForm.sato2} onChange={e => setMedicalForm({...medicalForm, sato2: e.target.value})} disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'} />
                  </div>
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-gray-700 mb-2">Impresión Diagnóstica (CIE10)</h4>
                  <DiagnosticAutocomplete
                    value={medicalForm.diagnostico}
                    onChange={(val) => setMedicalForm({...medicalForm, diagnostico: val})}
                    backendUrl="/api"
                    disabled={historyData?.fase1?.isLocked || selectedCase.caseType === 'telemedicine_escalated'}
                    placeholder="Ej: E11 Diabetes tipo 2..."
                  />
                </div>

                {!historyData?.fase1?.isLocked && selectedCase.caseType !== 'telemedicine_escalated' && (
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={handleClosePhase1} disabled={loading} className="bg-blue-800 hover:bg-blue-900 text-white font-bold py-2 px-6 rounded">
                      🔒 Cerrar y Bloquear Fase 1
                    </button>
                  </div>
                )}
              </>
            )}

            {/* FASE 2 */}
            {activeTab === 'fase2' && (
              <>
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-red-800 mb-1">🏥 FASE 2: Evaluación Presencial / Examen Físico</h4>
                  {historyData?.fase2?.isLocked && (
                    <p className="text-sm text-red-600 font-semibold">✅ Historia completada y cerrada</p>
                  )}
                </div>

                <div className="bg-white p-4 rounded shadow mb-4 border-2 border-red-200">
                  <h4 className="font-bold text-red-700 mb-2">Examen Físico Completo</h4>
                  <textarea className="w-full border p-2 rounded h-32 bg-red-50" placeholder="Describa hallazgos del examen físico..." value={medicalForm.examenFisico} onChange={e => setMedicalForm({...medicalForm, examenFisico: e.target.value})} disabled={historyData?.fase2?.isLocked} />
                </div>

                <div className="bg-white p-4 rounded shadow mb-4 border-2 border-orange-200">
                  <h4 className="font-bold text-orange-700 mb-2">🩺 Signos Vitales (Presenciales / Fase 2)</h4>
                  <div className="grid grid-cols-5 gap-2">
                    <input className="border p-2 rounded text-center" placeholder="TA" value={medicalForm.ta_f2} onChange={e => setMedicalForm({...medicalForm, ta_f2: e.target.value})} disabled={historyData?.fase2?.isLocked} />
                    <input className="border p-2 rounded text-center" placeholder="FC" value={medicalForm.fc_f2} onChange={e => setMedicalForm({...medicalForm, fc_f2: e.target.value})} disabled={historyData?.fase2?.isLocked} />
                    <input className="border p-2 rounded text-center" placeholder="FR" value={medicalForm.fr_f2} onChange={e => setMedicalForm({...medicalForm, fr_f2: e.target.value})} disabled={historyData?.fase2?.isLocked} />
                    <input className="border p-2 rounded text-center" placeholder="GLIC" value={medicalForm.glic_f2} onChange={e => setMedicalForm({...medicalForm, glic_f2: e.target.value})} disabled={historyData?.fase2?.isLocked} />
                    <input className="border p-2 rounded text-center" placeholder="SatO2" value={medicalForm.sato2_f2} onChange={e => setMedicalForm({...medicalForm, sato2_f2: e.target.value})} disabled={historyData?.fase2?.isLocked} />
                  </div>
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-gray-700 mb-2">Impresión Diagnóstica Final (Fase 2)</h4>
                  <DiagnosticAutocomplete
                    value={medicalForm.diagnostico_f2}
                    onChange={(val) => setMedicalForm({...medicalForm, diagnostico_f2: val})}
                    disabled={historyData?.fase2?.isLocked}
                    placeholder="Diagnóstico definitivo presencial..."
                  />
                </div>

                <div className="bg-white p-4 rounded shadow mb-4">
                  <h4 className="font-bold text-gray-700 mb-2">Tratamiento Definitivo</h4>
                  <textarea 
                    className="w-full border p-2 rounded h-20" 
                    placeholder="Tratamiento final..." 
                    value={medicalForm.tratamiento_f2}
                    onChange={e => setMedicalForm({...medicalForm, tratamiento_f2: e.target.value})} 
                    disabled={historyData?.fase2?.isLocked} 
                  />

                  <button
                    type="button"
                    onClick={() => setShowPrescriptionModal(true)}
                    disabled={historyData?.fase2?.isLocked}
                    className="mt-3 flex items-center justify-center gap-2 w-full bg-red-50 text-red-700 hover:bg-red-100 py-2 px-4 rounded-md text-sm font-medium border border-red-200"
                  >
                    <span>📄</span> Generar Récipe Médico / Estudios (Fase 2)
                  </button>
                </div>

                {!historyData?.fase2?.isLocked && (
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={handleClosePhase2} disabled={loading} className="bg-red-800 hover:bg-red-900 text-white font-bold py-2 px-6 rounded">
                      🔒 Cerrar Historia Definitivamente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showPrescriptionModal && selectedCase && (
        <PrescriptionModal
          show={showPrescriptionModal}
          onClose={() => setShowPrescriptionModal(false)}
          sessionId={selectedCase.id}
          patientData={{
            name: `${medicalForm.nombre} ${medicalForm.apellidos}`.trim(),
            cedula: medicalForm.cedula,
            email: selectedCase.userEmail || ''
          }}
          db={db}
          appId={appId}
          setToast={setToast}
          backendUrl="/api"
        />
      )}
    </div>
  );
};

export default EmergenciaMedica;

