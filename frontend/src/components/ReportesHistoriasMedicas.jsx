// src/components/ReportesHistoriasMedicas.jsx
// Módulo Profesional de Reportes e Inteligencia Médica (analytics-reports-loop):
// - Vista 1: Auditoría y Detalle (filtros avanzados + tabla interactiva + PDF individual)
// - Vista 2: Dashboard Estadístico / BI (KPIs + diagnósticos recurrentes + volumen operativo)
// - Exportación profesional CSV y vista de impresión gerencial en PDF.
import React, { useState } from 'react';
import html2pdf from 'html2pdf.js';

const GENDER_LABELS = { masculino: 'Masculino', femenino: 'Femenino', otro: 'Otro', 'No especificado': 'No especificado' };

const serviceLabel = (type) => {
  const map = {
    telemedicine: 'Telemedicina',
    telemedicine_escalated: 'Telemedicina Escalada',
    emergency_direct: 'Emergencia Directa',
    emergency: 'Emergencia',
  };
  return map[type] || type || 'No especificado';
};

const statusLabel = (status) => {
  const map = {
    completed: 'Cerrada',
    completed_phase1: 'Fase 1 cerrada',
    in_progress: 'En proceso',
    closed: 'Cerrada definitivamente',
  };
  return map[status] || status || 'N/A';
};

// ── Elementos visuales definidos FUERA del componente principal ─────────────
// IMPORTANTE (frontend-ux-videocall-fix-loop): definir estos sub-componentes a
// nivel de módulo evita que React los re-cree en cada render, lo que causaba el
// desmontaje del árbol y la pérdida de foco en el input de cédula al escribir.
const Spinner = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
    <p className="text-sm">{label}</p>
  </div>
);

const EmptyState = ({ titulo, mensaje, icon }) => (
  <div className="text-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-lg bg-gray-50">
    <p className="text-3xl mb-2">{icon || '🔍'}</p>
    <p className="font-semibold text-gray-500">{titulo}</p>
    <p className="text-sm mt-1">{mensaje}</p>
  </div>
);

const renderField = (label, value) => (
  <p className="text-sm text-gray-700">
    <strong>{label}:</strong> <span className="text-gray-800">{value || <span className="italic text-gray-400">No registrado</span>}</span>
  </p>
);

const formatDate = (iso) => {
  if (!iso) return 'N/A';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('es-VE');
  } catch {
    return 'N/A';
  }
};

const FiltroCompartido = ({ filtros, setFiltros, isLoading, handleSearch, limpiar, activeView, exportCSV, imprimirReporte }) => (
  <div className="bg-gray-50 p-4 rounded-lg mb-6 border">
    <h3 className="font-semibold text-gray-700 mb-3">Filtros de Búsqueda</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
        <input type="date" value={filtros.startDate} onChange={(e) => setFiltros({ ...filtros, startDate: e.target.value })} className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
        <input type="date" value={filtros.endDate} onChange={(e) => setFiltros({ ...filtros, endDate: e.target.value })} className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cédula / Paciente</label>
        <input type="text" value={filtros.patientId} onChange={(e) => setFiltros({ ...filtros, patientId: e.target.value })} placeholder="Cédula, ID o nombre" className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Médico</label>
        <input type="text" value={filtros.doctorId} onChange={(e) => setFiltros({ ...filtros, doctorId: e.target.value })} placeholder="Nombre o ID del médico" className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Servicio</label>
        <select value={filtros.serviceType} onChange={(e) => setFiltros({ ...filtros, serviceType: e.target.value })} className="w-full p-2 border rounded">
          <option value="todos">Todos</option>
          <option value="telemedicina">Telemedicina</option>
          <option value="emergencia">Emergencia</option>
        </select>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button onClick={handleSearch} disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded transition disabled:opacity-50">
        {isLoading ? 'Generando...' : '📊 Generar Reporte'}
      </button>
      <button onClick={limpiar} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded transition">
        Limpiar
      </button>
      <div className="flex-1"></div>
      {activeView === 'auditoria' && (
        <>
          <button onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded transition">
            ⬇️ Exportar CSV/Excel
          </button>
          <button onClick={imprimirReporte} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition">
            🖨️ Imprimir Reporte (PDF)
          </button>
        </>
      )}
    </div>
  </div>
);

// ── VISTA 1: Auditoría y Detalle ───────────────────────────────────────────
const AuditoriaView = ({ loadingDetailed, hasSearchedDetailed, historias, openHistoryDetail, handleRowPdf }) => (
  <div>
    {loadingDetailed ? (
      <Spinner label="Consultando historias médicas en el servidor..." />
    ) : !hasSearchedDetailed ? (
      <EmptyState
        icon="📋"
        titulo="Auditoría y Detalle de Historias Médicas"
        mensaje="Aplica los filtros y pulsa «Generar Reporte» para listar todas las atenciones de la plataforma."
      />
    ) : historias.length === 0 ? (
      <EmptyState
        icon="🗂️"
        titulo="No se encontraron coincidencias"
        mensaje="No hay historias médicas que coincidan con los filtros aplicados. Amplía el rango de fechas o limpia los filtros."
      />
    ) : (
      <div className="mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">
          Resultados <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-sm font-bold">{historias.length} atenciones</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 border text-left">Fecha</th>
                <th className="py-2 px-4 border text-left">Paciente</th>
                <th className="py-2 px-4 border text-left">Cédula</th>
                <th className="py-2 px-4 border text-left">Servicio</th>
                <th className="py-2 px-4 border text-left">Médico</th>
                <th className="py-2 px-4 border text-left">Diagnóstico</th>
                <th className="py-2 px-4 border text-left">Estado</th>
                <th className="py-2 px-4 border text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {historias.map(h => (
                <tr key={h.id} className="hover:bg-indigo-50 transition" onDoubleClick={() => openHistoryDetail(h)}>
                  <td className="py-2 px-4 border">{formatDate(h.fecha)}</td>
                  <td className="py-2 px-4 border font-medium text-gray-800 cursor-pointer" title="Doble clic para abrir detalle" onClick={() => openHistoryDetail(h)}>{h.pacienteNombre || 'N/A'}</td>
                  <td className="py-2 px-4 border">{h.cedula || 'N/A'}</td>
                  <td className="py-2 px-4 border">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${String(h.encounterType).includes('telemedicine') ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                      {serviceLabel(h.encounterType)}
                    </span>
                  </td>
                  <td className="py-2 px-4 border">{h.medico || 'N/A'}</td>
                  <td className="py-2 px-4 border">{h.diagnosticoFinal || <span className="italic text-gray-400">No registrado</span>}</td>
                  <td className="py-2 px-4 border">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${String(h.status).startsWith('completed') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {statusLabel(h.status)}
                    </span>
                  </td>
                  <td className="py-2 px-4 border text-center whitespace-nowrap">
                    <button onClick={() => openHistoryDetail(h)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-1 px-3 rounded mr-1" title="Ver detalle completo">
                      Ver
                    </button>
                    <button onClick={() => handleRowPdf(h)} className="bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-3 rounded" title="Descargar PDF individual">
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">💡 Tip: haz doble clic sobre una fila para abrir el detalle completo de la historia médica.</p>
      </div>
    )}
  </div>
);

// ── VISTA 2: Dashboard Estadístico / BI ─────────────────────────────────────
const DashboardView = ({ loadingAnalytics, hasSearchedAnalytics, analytics }) => {
  if (loadingAnalytics) {
    return <Spinner label="Calculando indicadores de inteligencia médica..." />;
  }
  if (!hasSearchedAnalytics || !analytics) {
    return (
      <EmptyState
        icon="📈"
        titulo="Dashboard Estadístico / BI"
        mensaje="Aplica los filtros y pulsa «Generar Reporte» para visualizar KPIs, diagnósticos recurrentes y el volumen operativo."
      />
    );
  }

  const kpis = analytics.kpis || {};
  const topDiagnoses = analytics.topDiagnoses || [];
  const genderDistribution = analytics.genderDistribution || [];
  const ageDistribution = analytics.ageDistribution || [];
  const volumeByDate = analytics.volumeByDate || [];

  const maxDiagnosis = Math.max(1, ...topDiagnoses.map(d => d.count));
  const maxAge = Math.max(1, ...ageDistribution.map(a => a.count));
  const maxVolume = Math.max(1, ...volumeByDate.map(v => v.count));
  const genderTotal = genderDistribution.reduce((acc, g) => acc + g.count, 0) || 1;

  const kpiCards = [
    { titulo: 'Total de Atenciones', valor: kpis.totalAtenciones ?? 0, icon: '🩺', color: 'from-indigo-500 to-indigo-700' },
    { titulo: 'Pacientes Únicos', valor: kpis.pacientesUnicos ?? 0, icon: '👥', color: 'from-blue-500 to-blue-700' },
    { titulo: 'Con Diagnóstico', valor: kpis.conDiagnostico ?? 0, icon: '📋', color: 'from-green-500 to-green-700' },
    { titulo: 'Historias Completadas', valor: kpis.completadas ?? 0, icon: '✅', color: 'from-purple-500 to-purple-700' },
  ];

  const genderBars = [
    { key: 'femenino', color: 'bg-pink-500' },
    { key: 'masculino', color: 'bg-blue-500' },
    { key: 'otro', color: 'bg-amber-500' },
    { key: 'No especificado', color: 'bg-gray-300' },
  ];

  return (
    <div className="space-y-6">
      {/* Tarjetas de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(card => (
          <div key={card.titulo} className={`bg-gradient-to-br ${card.color} text-white rounded-xl p-5 shadow-lg`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">{card.titulo}</p>
                <p className="text-4xl font-extrabold mt-1">{card.valor.toLocaleString('es-VE')}</p>
              </div>
              <span className="text-4xl opacity-90">{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Diagnósticos recurrentes */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h4 className="font-bold text-gray-700 mb-4">🧬 Diagnósticos Recurrentes (Top 5)</h4>
          {topDiagnoses.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin diagnósticos registrados en el rango seleccionado.</p>
          ) : (
            <div className="space-y-3">
              {topDiagnoses.map(d => (
                <div key={d.diagnosis}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-800 font-medium">{d.diagnosis}</span>
                    <span className="text-gray-500 font-bold">{d.count}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${(d.count / maxDiagnosis) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distribución por género */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h4 className="font-bold text-gray-700 mb-4">👫 Distribución por Género</h4>
          {genderTotal <= 1 ? (
            <p className="text-sm text-gray-400 italic">Sin datos de género en el rango seleccionado.</p>
          ) : (
            <>
              <div className="flex h-5 w-full rounded-full overflow-hidden mb-4">
                {genderBars.map(bar => {
                  const g = genderDistribution.find(x => x.gender === bar.key);
                  const count = g ? g.count : 0;
                  if (!count) return null;
                  return <div key={bar.key} className={bar.color} style={{ width: `${(count / genderTotal) * 100}%` }} title={`${GENDER_LABELS[bar.key]}: ${count}`}></div>;
                })}
              </div>
              <div className="space-y-2">
                {genderDistribution.filter(g => g.count > 0).map(g => (
                  <div key={g.gender} className="flex justify-between text-sm">
                    <span className="text-gray-700">{GENDER_LABELS[g.gender] || g.gender}</span>
                    <span className="text-gray-500 font-medium">{g.count} · {Math.round((g.count / genderTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Volumen operativo por día */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h4 className="font-bold text-gray-700 mb-4">📅 Volumen Operativo (últimos 30 días)</h4>
          {volumeByDate.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin actividad en el rango seleccionado.</p>
          ) : (
            <>
              <div className="flex items-end gap-1 h-32 border-b border-gray-200 mb-2">
                {volumeByDate.slice(-30).map(v => (
                  <div key={v.date} className="flex-1 flex flex-col items-center justify-end group relative" title={`${v.date}: ${v.count} atención(es)`}>
                    <div className={`w-full rounded-t ${v.count > 0 ? 'bg-indigo-500 group-hover:bg-indigo-700' : 'bg-gray-100'}`} style={{ height: `${Math.max(v.count > 0 ? 6 : 2, (v.count / maxVolume) * 100)}%` }}></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{volumeByDate.slice(-30)[0]?.date || ''}</span>
                <span>hoy</span>
              </div>
            </>
          )}
        </div>

        {/* Grupos etarios */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h4 className="font-bold text-gray-700 mb-4">🎂 Distribución por Grupos Etarios</h4>
          {ageDistribution.every(a => a.count === 0) ? (
            <p className="text-sm text-gray-400 italic">Sin datos de edad en el rango seleccionado.</p>
          ) : (
            <div className="space-y-3">
              {ageDistribution.map(age => (
                <div key={age.ageGroup}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-800 font-medium">{age.ageGroup} años</span>
                    <span className="text-gray-500 font-bold">{age.count}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className="h-3 rounded-full bg-gradient-to-r from-teal-400 to-emerald-600" style={{ width: `${(age.count / maxAge) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ReportesHistoriasMedicas = ({ user, operatorRole, setToast }) => {
  const [activeView, setActiveView] = useState('auditoria'); // 'auditoria' | 'dashboard'
  const [filtros, setFiltros] = useState({
    startDate: '',
    endDate: '',
    patientId: '',
    doctorId: '',
    serviceType: 'todos',
  });

  const [historias, setHistorias] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [hasSearchedDetailed, setHasSearchedDetailed] = useState(false);
  const [hasSearchedAnalytics, setHasSearchedAnalytics] = useState(false);
  const [selectedHistoria, setSelectedHistoria] = useState(null);

  // Cabeceras de operador: el spec exige x-operator-role/x-operator-id y el
  // middleware real checkOperatorRole lee x-operator-rol/x-operator-uid. Se envían ambos.
  const operatorHeaders = {
    'Content-Type': 'application/json',
    'x-operator-role': operatorRole || 'medico',
    'x-operator-id': user?.uid || 'medico_test',
    'x-operator-rol': operatorRole || 'medico',
    'x-operator-uid': user?.uid || 'medico_test',
  };

  const buildQueryString = () => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  };

  const handleSearch = async () => {
    await Promise.all([cargarDetallado(), cargarAnalytics()]);
  };

  const cargarDetallado = async () => {
    setLoadingDetailed(true);
    setHasSearchedDetailed(true);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/reports/detailed?${qs}`, { headers: operatorHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'No se pudieron obtener los reportes.');
      setHistorias(Array.isArray(data.historias) ? data.historias : []);
      setToast({ message: data.total ? `Reporte generado: ${data.total} atenciones encontradas` : 'No se encontraron coincidencias con los filtros aplicados.', type: data.total ? 'success' : 'error' });
    } catch (error) {
      console.error('Error al cargar reporte detallado:', error);
      setHistorias([]);
      setToast({ message: `Error al generar el reporte: ${error.message}`, type: 'error' });
    } finally {
      setLoadingDetailed(false);
    }
  };

  const cargarAnalytics = async () => {
    setLoadingAnalytics(true);
    setHasSearchedAnalytics(true);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/reports/analytics?${qs}`, { headers: operatorHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'No se pudieron calcular los indicadores.');
      setAnalytics(data.analytics || null);
    } catch (error) {
      console.error('Error al cargar analytics:', error);
      setAnalytics(null);
      setToast({ message: `Error al calcular indicadores: ${error.message}`, type: 'error' });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const limpiar = () => {
    setFiltros({ startDate: '', endDate: '', patientId: '', doctorId: '', serviceType: 'todos' });
    setHistorias([]);
    setAnalytics(null);
    setHasSearchedDetailed(false);
    setHasSearchedAnalytics(false);
  };

  // ── Exportación CSV (Excel-compatible, separador ';', BOM UTF-8) ───────────
  const exportCSV = () => {
    if (!historias.length) {
      setToast({ message: 'Primero genera un reporte con resultados para exportar.', type: 'error' });
      return;
    }
    const header = ['Fecha', 'Paciente', 'Cédula', 'Tipo de servicio', 'Médico', 'Diagnóstico final', 'Estado', 'ID de historia'];
    const rows = historias.map(h => [
      h.fecha || '',
      h.pacienteNombre || '',
      h.cedula || '',
      serviceLabel(h.encounterType),
      h.medico || '',
      h.diagnosticoFinal || '',
      statusLabel(h.status),
      h.id || '',
    ]);
    const csv = '\uFEFF' + [header, ...rows]
      .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_historias_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setToast({ message: 'Reporte exportado a CSV. Listo para abrir en Excel.', type: 'success' });
  };

  // ── Vista de impresión gerencial (PDF) ─────────────────────────────────────
  const imprimirReporte = () => {
    if (!historias.length) {
      setToast({ message: 'Primero genera un reporte con resultados para imprimir.', type: 'error' });
      return;
    }
    const win = window.open('', '_blank', 'width=1024,height=720');
    if (!win) {
      setToast({ message: 'Tu navegador bloqueó la ventana de impresión. Permite ventanas emergentes.', type: 'error' });
      return;
    }
    const rowsHtml = historias.map(h => `
      <tr>
        <td>${h.fecha || ''}</td>
        <td>${h.pacienteNombre || 'N/A'}</td>
        <td>${h.cedula || '-'}</td>
        <td>${serviceLabel(h.encounterType)}</td>
        <td>${h.medico || '-'}</td>
        <td>${h.diagnosticoFinal || 'No registrado'}</td>
        <td>${statusLabel(h.status)}</td>
      </tr>
    `).join('');
    const filtrosHtml = [
      filtros.startDate && `<span><strong>Desde:</strong> ${filtros.startDate}</span>`,
      filtros.endDate && `<span><strong>Hasta:</strong> ${filtros.endDate}</span>`,
      filtros.patientId && `<span><strong>Cédula/Paciente:</strong> ${filtros.patientId}</span>`,
      filtros.doctorId && `<span><strong>Médico:</strong> ${filtros.doctorId}</span>`,
      filtros.serviceType && filtros.serviceType !== 'todos' && `<span><strong>Tipo:</strong> ${filtros.serviceType}</span>`,
    ].filter(Boolean).join(' | ') || 'Sin filtros';

    win.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Reporte Gerencial de Historias Médicas</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 24px; }
          h1 { color: #4338ca; font-size: 22px; margin: 0 0 4px; }
          .sub { color: #6b7280; font-size: 13px; margin-bottom: 12px; }
          .filters { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; font-size: 12px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
          th { background: #e0e7ff; color: #3730a3; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 16px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        <h1>📊 Reporte Gerencial de Historias Médicas</h1>
        <div class="sub">Generado el ${new Date().toLocaleString('es-VE')} — Total: ${historias.length} atenciones</div>
        <div class="filters">${filtrosHtml}</div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Paciente</th><th>Cédula</th><th>Servicio</th><th>Médico</th><th>Diagnóstico final</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer">Botón de Emergencia · Rescarven · Módulo Profesional de Reportes e Inteligencia Médica</div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  // ── Detalle individual + PDF de una historia ───────────────────────────────
  const openHistoryDetail = async (h) => {
    setSelectedHistoria({ resumen: h });
    try {
      if (!h.userId) throw new Error('La historia no tiene userId asociado.');
      const res = await fetch(`/api/medical-history/${encodeURIComponent(h.id)}?userId=${encodeURIComponent(h.userId)}`, { headers: operatorHeaders });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'No se pudo cargar la historia completa.');
      setSelectedHistoria({ resumen: h, completa: data.history });
    } catch (error) {
      console.warn('Usando resumen por imposibilidad de cargar detalle completo:', error.message);
    }
  };

  const exportPDFIndividual = () => {
    const element = document.getElementById('historia-impresion');
    if (!element) return;
    const opt = {
      margin: 0.5,
      filename: `historia_${selectedHistoria?.resumen?.pacienteNombre || 'paciente'}_${selectedHistoria?.resumen?.id || 'historia'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    };
    html2pdf().set(opt).from(element).save();
    setToast({ message: 'Generando PDF individual...', type: 'success' });
  };

  // Exportación PDF de un solo clic: abre el detalle, espera el render del
  // modal y dispara html2pdf sobre él.
  const handleRowPdf = async (h) => {
    await openHistoryDetail(h);
    setTimeout(() => exportPDFIndividual(), 300);
  };

  const isLoading = loadingDetailed || loadingAnalytics;

  // ── Modal de Historia Completa (ver/imprimir PDF individual) ──────────────
  const completa = selectedHistoria?.completa;
  const resumen = selectedHistoria?.resumen;
  const fase1 = completa?.fase1;
  const fase2 = completa?.fase2;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex flex-wrap items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-indigo-700">
          📊 Reportes de Historias Médicas
        </h2>
        <span className="text-xs text-gray-400">Centro de Reportes y Análisis Gerencial · Rescarven</span>
      </div>

      {/* Pestañas de navegación del módulo */}
      <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg border mb-6 w-fit">
        <button
          onClick={() => setActiveView('auditoria')}
          className={`px-5 py-2 rounded-md text-sm font-semibold transition ${activeView === 'auditoria' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
        >
          📋 Auditoría y Detalle
        </button>
        <button
          onClick={() => setActiveView('dashboard')}
          className={`px-5 py-2 rounded-md text-sm font-semibold transition ${activeView === 'dashboard' ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
        >
          📈 Dashboard Estadístico / BI
        </button>
      </div>

      <FiltroCompartido
        filtros={filtros}
        setFiltros={setFiltros}
        isLoading={isLoading}
        handleSearch={handleSearch}
        limpiar={limpiar}
        activeView={activeView}
        exportCSV={exportCSV}
        imprimirReporte={imprimirReporte}
      />

      {activeView === 'auditoria' ? (
        <AuditoriaView
          loadingDetailed={loadingDetailed}
          hasSearchedDetailed={hasSearchedDetailed}
          historias={historias}
          openHistoryDetail={openHistoryDetail}
          handleRowPdf={handleRowPdf}
        />
      ) : (
        <DashboardView
          loadingAnalytics={loadingAnalytics}
          hasSearchedAnalytics={hasSearchedAnalytics}
          analytics={analytics}
        />
      )}

      {/* Modal de historia completa */}
      {selectedHistoria && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-4xl p-6 my-8" id="historia-impresion">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="text-2xl font-bold text-indigo-700">Historia Médica Completa</h3>
              <button onClick={() => setSelectedHistoria(null)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
            </div>

            <div className="space-y-6">
              {/* Header resumen */}
              <div className="bg-gray-50 p-4 rounded border">
                <h4 className="font-bold text-gray-700 mb-3">📄 Datos Generales</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {renderField('Paciente', resumen?.pacienteNombre)}
                  {renderField('Cédula', resumen?.cedula)}
                  {renderField('Fecha', formatDate(resumen?.fecha))}
                  {renderField('Tipo de servicio', serviceLabel(resumen?.encounterType))}
                  {renderField('Médico', resumen?.medico)}
                  {renderField('Estado', statusLabel(resumen?.status))}
                  {renderField('Diagnóstico final', resumen?.diagnosticoFinal)}
                </div>
              </div>

              {completa && fase1 && (
                <div className="border rounded p-4 bg-blue-50">
                  <h4 className="font-bold text-lg text-blue-800 mb-3">
                    📞 FASE 1: {String(completa.encounterType).includes('telemedicine') ? 'TELEMEDICINA' : 'PRE-EVALUACIÓN'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {renderField('Nombre', fase1.fields?.nombre)}
                    {renderField('Apellidos', fase1.fields?.apellidos)}
                    {renderField('Cédula', fase1.fields?.cedula)}
                    {renderField('Fecha de nacimiento', fase1.fields?.fechaNacimiento)}
                    {renderField('Familiar', fase1.fields?.nombreFamiliar)}
                    {renderField('Teléfonos', fase1.fields?.telefonos)}
                    {renderField('Motivo de consulta', fase1.fields?.motivoConsulta)}
                    {renderField('Antecedentes', fase1.fields?.antecedentes)}
                    {renderField('Signos (TA/FC/FR/GLIC/SatO2)', [fase1.fields?.ta, fase1.fields?.fc, fase1.fields?.fr, fase1.fields?.glic, fase1.fields?.sato2].filter(Boolean).join(' / '))}
                    {renderField('Síntomas', fase1.fields?.sintomas)}
                    {renderField('Diagnóstico (F1)', fase1.fields?.diagnostico)}
                    {renderField('Tratamiento (F1)', fase1.fields?.tratamiento)}
                  </div>
                  <p className="text-xs text-blue-600 mt-3">Médico que registró: {fase1.filledByName || fase1.filledBy || 'N/A'}</p>
                </div>
              )}

              {completa && fase2 && fase2.completedAt && (
                <div className="border rounded p-4 bg-red-50">
                  <h4 className="font-bold text-lg text-red-800 mb-3">🚨 FASE 2: EMERGENCIA DOMICILIARIA</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {renderField('Examen físico', fase2.fields?.examenFisico)}
                    {renderField('Diagnóstico final', fase2.fields?.diagnosticoFinal || fase2.fields?.diagnostico)}
                    {renderField('Tratamiento', fase2.fields?.tratamientoFinal || fase2.fields?.tratamiento)}
                    {renderField('Traslado', fase2.fields?.traslado)}
                    {renderField('Observaciones', fase2.fields?.observaciones)}
                    {renderField('Indicaciones', fase2.fields?.indicaciones)}
                  </div>
                  <p className="text-xs text-red-600 mt-3">Médico que registró: {fase2.filledByName || fase2.filledBy || 'N/A'}</p>
                </div>
              )}

              {!completa && (
                <p className="text-sm italic text-gray-400">
                  Solo se muestra el resumen disponible. El detalle completo no pudo cargarse para esta historia.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setSelectedHistoria(null)} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded">
                Cerrar
              </button>
              <button onClick={() => { exportPDFIndividual(); setSelectedHistoria(null); }} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
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