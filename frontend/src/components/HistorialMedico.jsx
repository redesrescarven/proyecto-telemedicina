import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import html2pdf from 'html2pdf.js';

const HistorialMedico = ({ userId, userName, db, appId = "default-app-id", onClose }) => {
  const [historias, setHistorias] = useState([]);
  const [selectedHistoria, setSelectedHistoria] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCedula, setFilterCedula] = useState('');

  useEffect(() => {
    const fetchHistorias = async () => {
      try {
        const ref = collection(db, `artifacts/${appId}/users/${userId}/medicalHistory`);
        const q = query(ref, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
        }));
        
        setHistorias(data);
      } catch (e) {
        console.error("Error al cargar historias médicas:", e);
        setError("No se pudieron cargar las historias médicas.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchHistorias();
  }, [userId, db, appId]);

  // Exportar a PDF
  const exportToPDF = (historia) => {
    const element = document.getElementById(`historia-${historia.id}`);
    const opt = {
      margin: 0.5,
      filename: `historia_${userName}_${historia.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  // Formatear fecha
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return date.toLocaleString('es-VE');
  };

  // Filtrar historias
  const filteredHistorias = historias.filter(h => {
    if (filterDate && h.createdAt.toDateString() !== new Date(filterDate).toDateString()) return false;
    if (filterCedula && h.fase1?.fields?.cedula !== filterCedula) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h2 className="text-3xl font-bold text-indigo-700">
          📋 Historias Médicas de {userName}
        </h2>
        <button
          onClick={onClose}
          className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition"
        >
          Cerrar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6 border">
        <h3 className="font-semibold text-gray-700 mb-3">Filtros de Búsqueda</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cédula</label>
            <input
              type="text"
              value={filterCedula}
              onChange={(e) => setFilterCedula(e.target.value)}
              placeholder="Buscar por cédula"
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
        <button
          onClick={() => { setFilterDate(''); setFilterCedula(''); }}
          className="mt-3 text-sm text-indigo-600 hover:underline"
        >
          Limpiar filtros
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          {error}
        </div>
      ) : filteredHistorias.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-xl">No hay historias médicas registradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredHistorias.map(historia => (
            <div
              key={historia.id}
              onClick={() => setSelectedHistoria(historia)}
              className="border-2 border-gray-200 rounded-lg p-5 hover:border-indigo-500 hover:shadow-xl transition cursor-pointer bg-gradient-to-br from-gray-50 to-white"
            >
              <div className="flex justify-between items-start mb-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                  historia.encounterType?.includes('emergency') 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {historia.encounterType === 'telemedicine' ? '💬 Telemedicina' : 
                   historia.encounterType === 'emergency_direct' ? '🚨 Emergencia Directa' : 
                   '🔄 Emergencia Escalada'}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDate(historia.createdAt)}
                </span>
              </div>
              
              <h3 className="font-bold text-lg text-gray-800 mb-2">
                {historia.fase1?.fields?.motivoConsulta?.substring(0, 50) || 'Sin motivo registrado'}...
              </h3>
              
              <div className="space-y-2 text-sm">
                <p className="text-gray-600">
                  <span className="font-semibold">Cédula:</span> {historia.fase1?.fields?.cedula || 'N/A'}
                </p>
                <p className="text-gray-600">
                  <span className="font-semibold">Diagnóstico:</span> {historia.fase1?.fields?.diagnostico || 'N/A'}
                </p>
                <p className="text-gray-600">
                  <span className="font-semibold">Estado:</span> 
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    historia.fase2?.isLocked ? 'bg-green-100 text-green-800' :
                    historia.fase1?.isLocked ? 'bg-orange-100 text-orange-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {historia.fase2?.isLocked ? 'COMPLETADA' : 
                     historia.fase1?.isLocked ? 'FASE 1 BLOQUEADA' : 'EN PROGRESO'}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Historia Completa - SOLO LECTURA */}
      {selectedHistoria && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-4xl p-6 my-8" id={`historia-${selectedHistoria.id}`}>
            <div className="flex justify-between items-center mb-6 border-b-2 border-indigo-600 pb-4">
              <h3 className="text-2xl font-bold text-indigo-700">Historia Médica Completa</h3>
              <button
                onClick={() => setSelectedHistoria(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Header */}
            <div className="bg-gray-50 p-4 rounded border mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Paciente</p>
                  <p className="font-bold text-lg text-gray-800">{userName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Fecha de Atención</p>
                  <p className="font-semibold">{formatDate(selectedHistoria.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Tipo de Encuentro</p>
                  <p className="font-semibold">{selectedHistoria.encounterType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cédula</p>
                  <p className="font-semibold">{selectedHistoria.fase1?.fields?.cedula || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* FASE 1 */}
            {selectedHistoria.fase1 && (
              <div className="border-2 border-blue-300 rounded-lg p-5 mb-4 bg-blue-50">
                <h4 className="text-xl font-bold text-blue-800 mb-4 flex items-center gap-2">
                  📞 FASE 1: {selectedHistoria.fase1.type === 'telemedicine' ? 'TELEMEDICINA' : 'PRE-EVALUACIÓN'}
                  {selectedHistoria.fase1.isLocked && <span className="text-sm text-blue-600">(Bloqueada)</span>}
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Motivo de Consulta</h5>
                    <p className="bg-white p-3 rounded border">{selectedHistoria.fase1.fields?.motivoConsulta || 'No registrado'}</p>
                  </div>
                  
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Antecedentes</h5>
                    <p className="bg-white p-3 rounded border">{selectedHistoria.fase1.fields?.antecedentes || 'No registrado'}</p>
                  </div>
                  
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Signos Vitales</h5>
                    <div className="grid grid-cols-5 gap-2 bg-white p-3 rounded border">
                      <div className="text-center"><p className="text-xs text-gray-600">TA</p><p className="font-bold">{selectedHistoria.fase1.fields?.ta || 'N/A'}</p></div>
                      <div className="text-center"><p className="text-xs text-gray-600">FC</p><p className="font-bold">{selectedHistoria.fase1.fields?.fc || 'N/A'}</p></div>
                      <div className="text-center"><p className="text-xs text-gray-600">FR</p><p className="font-bold">{selectedHistoria.fase1.fields?.fr || 'N/A'}</p></div>
                      <div className="text-center"><p className="text-xs text-gray-600">GLIC</p><p className="font-bold">{selectedHistoria.fase1.fields?.glic || 'N/A'}</p></div>
                      <div className="text-center"><p className="text-xs text-gray-600">SatO2</p><p className="font-bold">{selectedHistoria.fase1.fields?.sato2 || 'N/A'}</p></div>
                    </div>
                  </div>
                  
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Sintomatología</h5>
                    <p className="bg-white p-3 rounded border">{selectedHistoria.fase1.fields?.sintomas || 'No registrado'}</p>
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-300 p-3 rounded">
                    <h5 className="font-semibold text-yellow-800 mb-1">Impresión Diagnóstica</h5>
                    <p className="font-semibold text-gray-800">{selectedHistoria.fase1.fields?.diagnostico || 'No registrado'}</p>
                  </div>
                  
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Tratamiento</h5>
                    <p className="bg-white p-3 rounded border">{selectedHistoria.fase1.fields?.tratamiento || 'No registrado'}</p>
                  </div>

                  <div className="text-xs text-gray-500 border-t pt-2 mt-3">
                    <p>Médico: {selectedHistoria.fase1.filledByName}</p>
                    <p>Fecha: {formatDate(selectedHistoria.fase1.completedAt)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* FASE 2 */}
            {selectedHistoria.fase2 && selectedHistoria.fase2.completedAt && (
              <div className="border-2 border-red-300 rounded-lg p-5 mb-4 bg-red-50">
                <h4 className="text-xl font-bold text-red-800 mb-4 flex items-center gap-2">
                  🚨 FASE 2: EMERGENCIA DOMICILIARIA
                  {selectedHistoria.fase2.isLocked && <span className="text-sm text-red-600">(Completada)</span>}
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Examen Físico</h5>
                    <p className="bg-white p-3 rounded border whitespace-pre-line">{selectedHistoria.fase2.fields?.examenFisico || 'No registrado'}</p>
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-300 p-3 rounded">
                    <h5 className="font-semibold text-yellow-800 mb-1">Diagnóstico Final</h5>
                    <p className="font-semibold text-gray-800">{selectedHistoria.fase2.fields?.diagnosticoFinal || selectedHistoria.fase2.fields?.diagnostico || 'No registrado'}</p>
                  </div>
                  
                  <div>
                    <h5 className="font-semibold text-gray-700 mb-1">Tratamiento Aplicado</h5>
                    <p className="bg-white p-3 rounded border whitespace-pre-line">{selectedHistoria.fase2.fields?.tratamientoFinal || selectedHistoria.fase2.fields?.tratamiento || 'No registrado'}</p>
                  </div>

                  <div className="text-xs text-gray-500 border-t pt-2 mt-3">
                    <p>Médico: {selectedHistoria.fase2.filledByName}</p>
                    <p>Fecha: {formatDate(selectedHistoria.fase2.completedAt)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Botones de acción */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setSelectedHistoria(null)}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              >
                Cerrar
              </button>
              <button
                onClick={() => exportToPDF(selectedHistoria)}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                📄 Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistorialMedico;

