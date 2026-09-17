import React, { useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';

const ReportesHistoriasMedicas = ({ user, db, appId, operatorRole, setToast }) => {
  const [historias, setHistorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedHistoria, setSelectedHistoria] = useState(null);
  
  // Filtros
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    cedula: '',
    encounterType: '',
    userId: ''
  });

  // Verificar permisos
  const canViewAll = ['administrador', 'supervisor'].includes(operatorRole);

  // Buscar historias
  const buscarHistorias = async () => {
    setLoading(true);
    try {
      let historiasData = [];
      
      if (canViewAll) {
        // Búsqueda global en collection group
        const q = query(collection(db, `artifacts/${appId}/users`));
        const usersSnapshot = await getDocs(q);
        
        for (const userDoc of usersSnapshot.docs) {
          const userId = userDoc.id;
          const historiesRef = collection(db, `artifacts/${appId}/users/${userId}/medicalHistory`);
          const historiesSnapshot = await getDocs(historiesRef);
          
          historiesSnapshot.forEach(doc => {
            const data = doc.data();
            
            // Aplicar filtros
            if (filtros.cedula && data.fase1?.fields?.cedula !== filtros.cedula) return;
            if (filtros.encounterType && data.encounterType !== filtros.encounterType) return;
            
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0);
            if (filtros.fechaInicio && createdAt < new Date(filtros.fechaInicio)) return;
            if (filtros.fechaFin && createdAt > new Date(filtros.fechaFin + ' 23:59:59')) return;
            
            historiasData.push({
              id: doc.id,
              userId,
              userName: data.fase1?.fields?.nombre || data.userName || 'N/A',
              ...data
            });
          });
        }
      } else {
        // Solo puede ver sus propias historias (si es médico)
        const userId = user.uid;
        const historiesRef = collection(db, `artifacts/${appId}/users/${userId}/medicalHistory`);
        const snapshot = await getDocs(historiesRef);
        
        snapshot.forEach(doc => {
          const data = doc.data();
          
          if (filtros.cedula && data.fase1?.fields?.cedula !== filtros.cedula) return;
          if (filtros.encounterType && data.encounterType !== filtros.encounterType) return;
          
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0);
          if (filtros.fechaInicio && createdAt < new Date(filtros.fechaInicio)) return;
          if (filtros.fechaFin && createdAt > new Date(filtros.fechaFin + ' 23:59:59')) return;
          
          historiasData.push({
            id: doc.id,
            userId,
            ...data
          });
        });
      }
      
      // Ordenar por fecha
      historiasData.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });
      
      setHistorias(historiasData);
      setToast({ message: `Se encontraron ${historiasData.length} historias`, type: 'success' });
    } catch (error) {
      console.error('Error buscando historias:', error);
      setToast({ message: 'Error al buscar historias médicas', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Exportar a PDF
  const exportarPDF = (historia) => {
    const element = document.getElementById(`historia-${historia.id}`);
    const opt = {
      margin: 0.5,
      filename: `historia_${historia.fase1?.fields?.nombre || 'paciente'}_${historia.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('es-VE');
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-3xl font-bold text-indigo-700 mb-6">
        📊 Reportes de Historias Médicas
      </h2>

      {/* Filtros */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6 border">
        <h3 className="font-semibold text-gray-700 mb-3">Filtros de Búsqueda</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
            <input
              type="date"
              value={filtros.fechaInicio}
              onChange={(e) => setFiltros({...filtros, fechaInicio: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
            <input
              type="date"
              value={filtros.fechaFin}
              onChange={(e) => setFiltros({...filtros, fechaFin: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cédula</label>
            <input
              type="text"
              value={filtros.cedula}
              onChange={(e) => setFiltros({...filtros, cedula: e.target.value})}
              placeholder="Buscar por cédula"
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={filtros.encounterType}
              onChange={(e) => setFiltros({...filtros, encounterType: e.target.value})}
              className="w-full p-2 border rounded"
            >
              <option value="">Todos</option>
              <option value="telemedicine_escalated">Telemedicina Escalada</option>
              <option value="emergency_direct">Emergencia Directa</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={buscarHistorias}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded transition"
          >
            {loading ? 'Buscando...' : '🔍 Buscar'}
          </button>
          <button
            onClick={() => {
              setFiltros({ fechaInicio: '', fechaFin: '', cedula: '', encounterType: '', userId: '' });
              setHistorias([]);
            }}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded transition"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Resultados */}
      {historias.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-700 mb-3">
            Resultados ({historias.length} historias encontradas)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 border">Fecha</th>
                  <th className="py-2 px-4 border">Paciente</th>
                  <th className="py-2 px-4 border">Cédula</th>
                  <th className="py-2 px-4 border">Tipo</th>
                  <th className="py-2 px-4 border">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historias.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4 border">{formatDate(h.createdAt)}</td>
                    <td className="py-2 px-4 border">{h.fase1?.fields?.nombre || h.userName || 'N/A'}</td>
                    <td className="py-2 px-4 border">{h.fase1?.fields?.cedula || 'N/A'}</td>
                    <td className="py-2 px-4 border">
                      {h.encounterType === 'telemedicine_escalated' ? 'Telemedicina Escalada' : 'Emergencia Directa'}
                    </td>
                    <td className="py-2 px-4 border">
                      <button
                        onClick={() => setSelectedHistoria(h)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-1 px-3 rounded mr-2"
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => exportarPDF(h)}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-3 rounded"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Historia Completa */}
      {selectedHistoria && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-4xl p-6 my-8" id={`historia-${selectedHistoria.id}`}>
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="text-2xl font-bold text-indigo-700">Historia Médica Completa</h3>
              <button
                onClick={() => setSelectedHistoria(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Contenido de la historia */}
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-gray-50 p-4 rounded border">
                <p><strong>Paciente:</strong> {selectedHistoria.fase1?.fields?.nombre || 'N/A'}</p>
                <p><strong>Cédula:</strong> {selectedHistoria.fase1?.fields?.cedula || 'N/A'}</p>
                <p><strong>Fecha:</strong> {formatDate(selectedHistoria.createdAt)}</p>
                <p><strong>Tipo:</strong> {selectedHistoria.encounterType}</p>
              </div>

              {/* Fase 1 */}
              {selectedHistoria.fase1 && (
                <div className="border rounded p-4 bg-blue-50">
                  <h4 className="font-bold text-lg text-blue-800 mb-3">
                    📞 FASE 1: {selectedHistoria.fase1.type === 'telemedicine' ? 'TELEMEDICINA' : 'PRE-EVALUACIÓN'}
                  </h4>
                  <div className="space-y-2">
                    <p><strong>Motivo:</strong> {selectedHistoria.fase1.fields?.motivoConsulta}</p>
                    <p><strong>Síntomas:</strong> {selectedHistoria.fase1.fields?.sintomas}</p>
                    <p><strong>Diagnóstico:</strong> {selectedHistoria.fase1.fields?.diagnostico}</p>
                    <p><strong>Médico:</strong> {selectedHistoria.fase1.filledByName}</p>
                  </div>
                </div>
              )}

              {/* Fase 2 */}
              {selectedHistoria.fase2 && selectedHistoria.fase2.completedAt && (
                <div className="border rounded p-4 bg-red-50">
                  <h4 className="font-bold text-lg text-red-800 mb-3">
                    🚨 FASE 2: EMERGENCIA DOMICILIARIA
                  </h4>
                  <div className="space-y-2">
                    <p><strong>Examen Físico:</strong> {selectedHistoria.fase2.fields?.examenFisico}</p>
                    <p><strong>Diagnóstico Final:</strong> {selectedHistoria.fase2.fields?.diagnosticoFinal}</p>
                    <p><strong>Tratamiento:</strong> {selectedHistoria.fase2.fields?.tratamientoFinal}</p>
                    <p><strong>Médico:</strong> {selectedHistoria.fase2.filledByName}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setSelectedHistoria(null)}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              >
                Cerrar
              </button>
              <button
                onClick={() => exportarPDF(selectedHistoria)}
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

export default ReportesHistoriasMedicas;

