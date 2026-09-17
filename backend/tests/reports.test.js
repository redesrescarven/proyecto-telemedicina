// backend/tests/reports.test.js
// Suite de pruebas del Módulo de Reportes e Inteligencia Médica (analytics-reports-loop):
// verifica GET /api/reports/detailed y GET /api/reports/analytics con datos sembrados.
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { seed, reset } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const OP = { 'x-operator-rol': 'medico', 'x-operator-uid': 'op-uid' };

const ts = (iso) => ({ toDate: () => new Date(iso) });

const seedFixtures = () => {
    // u1 — Ana (telemedicina, mujer, 34 años en 2024, Migraña)
    seed(`artifacts/${APP_ID}/users/u1/medicalHistory/A1`, {
        userId: 'u1',
        encounterType: 'telemedicine',
        createdAt: ts('2024-03-10T10:00:00Z'),
        status: 'completed',
        fase1: {
            filledBy: 'doc1',
            filledByName: 'Dra. Martinez',
            isLocked: true,
            fields: { nombre: 'Ana', apellidos: 'Perez', cedula: 'V-123', fechaNacimiento: '1990-05-15', genero: 'F' }
        },
        fase2: {
            filledBy: 'doc1',
            filledByName: 'Dra. Martinez',
            isLocked: true,
            fields: { diagnosticoFinal: 'Migraña' }
        }
    });

    // u2 — Carlos (emergencia directa, hombre, 64 años en 2024, HTA)
    seed(`artifacts/${APP_ID}/users/u2/medicalHistory/A2`, {
        userId: 'u2',
        encounterType: 'emergency_direct',
        createdAt: ts('2024-03-12T09:30:00Z'),
        status: 'completed',
        fase1: {
            filledBy: 'doc2',
            filledByName: 'Dr. Gomez',
            isLocked: true,
            fields: { nombre: 'Carlos', apellidos: 'Rojas', cedula: 'V-456', fechaNacimiento: '1960-01-01', sexo: 'M' }
        },
        fase2: {
            filledBy: 'doc2',
            filledByName: 'Dr. Gomez',
            isLocked: true,
            fields: { diagnosticoFinal: 'HTA' }
        }
    });

    // u3 — Beatriz (telemedicina escalada, mujer 'f', sin fecha nacimiento → grupo Desconocido, HTA)
    seed(`artifacts/${APP_ID}/users/u3/medicalHistory/A3`, {
        userId: 'u3',
        encounterType: 'telemedicine_escalated',
        createdAt: ts('2024-04-01T14:00:00Z'),
        status: 'completed_phase1',
        fase1: {
            filledByName: 'Dra. Martinez',
            isLocked: true,
            fields: { nombre: 'Beatriz', cedula: 'V-789', genero: 'f' }
        },
        fase2: {
            filledByName: 'Dra. Martinez',
            fields: { diagnosticoFinal: 'HTA' }
        }
    });

    // u1 — Ana otra consulta (telemedicina, niña de 13 años en 2024, Diabetes)
    seed(`artifacts/${APP_ID}/users/u1/medicalHistory/A4`, {
        userId: 'u1',
        encounterType: 'telemedicine',
        createdAt: ts('2024-05-20T11:15:00Z'),
        status: 'completed',
        fase1: {
            filledByName: 'Dra. Martinez',
            isLocked: true,
            fields: { nombre: 'Ana', apellidos: 'Perez', cedula: 'V-123', fechaNacimiento: '2010-09-01', genero: 'F' }
        },
        fase2: {
            filledByName: 'Dra. Martinez',
            isLocked: true,
            fields: { diagnosticoFinal: 'Diabetes' }
        }
    });
};

beforeEach(() => {
    reset();
});

describe('GET /api/reports/detailed', () => {
    test('protege el endpoint con rol de operador (403 sin cabeceras)', async () => {
        const res = await request(app).get('/api/reports/detailed');
        expect(res.status).toBe(403);
    });

    test('devuelve 200 con lista vacía cuando no hay datos', async () => {
        const res = await request(app).get('/api/reports/detailed').set(OP);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.total).toBe(0);
        expect(res.body.historias).toEqual([]);
    });

    test('devuelve todas las historias ordenadas por fecha descendente y con metadatos enriquecidos', async () => {
        seedFixtures();

        const res = await request(app).get('/api/reports/detailed').set(OP);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.total).toBe(4);
        expect(res.body.historias.map(h => h.id)).toEqual(['A4', 'A3', 'A2', 'A1']);

        const first = res.body.historias[0];
        expect(first).toMatchObject({
            id: 'A4',
            userId: 'u1',
            pacienteNombre: 'Ana Perez',
            cedula: 'V-123',
            encounterType: 'telemedicine',
            medico: 'Dra. Martinez',
            diagnosticoFinal: 'Diabetes',
            fecha: '2024-05-20T11:15:00.000Z'
        });
        // No debe exponer la data cruda anidada
        expect(first.raw).toBeUndefined();
        expect(first.fase1).toBeUndefined();
    });

    test('filtra por rango de fechas con normalización de día completo (endDate incluye todo el día)', async () => {
        seedFixtures();

        const res = await request(app)
            .get('/api/reports/detailed')
            .query({ startDate: '2024-04-01', endDate: '2024-12-31' })
            .set(OP);

        expect(res.status).toBe(200);
        expect(res.body.historias.map(h => h.id)).toEqual(['A4', 'A3']);
    });

    test('filtra por tipo de servicio: telemedicina / emergencia / todos', async () => {
        seedFixtures();

        const tele = await request(app)
            .get('/api/reports/detailed')
            .query({ serviceType: 'telemedicina' })
            .set(OP);
        expect(tele.body.historias.map(h => h.id).sort()).toEqual(['A1', 'A3', 'A4']);

        const emerg = await request(app)
            .get('/api/reports/detailed')
            .query({ serviceType: 'emergencia' })
            .set(OP);
        expect(emerg.body.historias.map(h => h.id)).toEqual(['A2']);
    });

    test('filtra por cédula/paciente (patientId por userId y por cédula) y por médico (doctorId)', async () => {
        seedFixtures();

        const byUser = await request(app)
            .get('/api/reports/detailed')
            .query({ patientId: 'u1' })
            .set(OP);
        expect(byUser.body.historias.map(h => h.id).sort()).toEqual(['A1', 'A4']);

        const byCedula = await request(app)
            .get('/api/reports/detailed')
            .query({ patientId: 'V-456' })
            .set(OP);
        expect(byCedula.body.historias.map(h => h.id)).toEqual(['A2']);

        const byDoctor = await request(app)
            .get('/api/reports/detailed')
            .query({ doctorId: 'Martinez' })
            .set(OP);
        expect(byDoctor.body.historias.map(h => h.id).sort()).toEqual(['A1', 'A3', 'A4']);
    });
});

describe('GET /api/reports/analytics', () => {
    test('protege el endpoint con rol de operador (403 sin cabeceras)', async () => {
        const res = await request(app).get('/api/reports/analytics');
        expect(res.status).toBe(403);
    });

    test('devuelve 200 con KPIs en cero cuando no hay datos', async () => {
        const res = await request(app).get('/api/reports/analytics').set(OP);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.analytics.kpis).toEqual({
            totalAtenciones: 0,
            pacientesUnicos: 0,
            conDiagnostico: 0,
            completadas: 0
        });
        expect(res.body.analytics.topDiagnoses).toEqual([]);
    });

    test('calcula correctamente KPIs, diagnósticos top, género, grupos etarios y volumen', async () => {
        seedFixtures();

        const res = await request(app).get('/api/reports/analytics').set(OP);

        expect(res.status).toBe(200);
        const a = res.body.analytics;

        // KPIs
        expect(a.kpis).toEqual({
            totalAtenciones: 4,
            pacientesUnicos: 3,
            conDiagnostico: 4,
            completadas: 4 // telemedicina/telemedicina_escalada con Fase 1 bloqueada (A1, A3, A4) y emergencia con Fase 1+2 (A2)
        });

        // Diagnósticos top 5 (HTA recurrente 2 veces)
        expect(a.topDiagnoses).toEqual([
            { diagnosis: 'HTA', count: 2 },
            { diagnosis: 'Diabetes', count: 1 },
            { diagnosis: 'Migraña', count: 1 }
        ]);

        // Distribución por género: 3 femenino (Ana 'F', Ana 'F', Beatriz 'f'), 1 masculino (Carlos 'M')
        const genderMap = Object.fromEntries(a.genderDistribution.map(g => [g.gender, g.count]));
        expect(genderMap).toMatchObject({ femenino: 3, masculino: 1, otro: 0, 'No especificado': 0 });

        // Grupos etarios: Ana 34 → 30-44; Carlos 64 → 60+; Beatriz sin fecha → Desconocido; Ana 13 → 0-17
        const ageMap = Object.fromEntries(a.ageDistribution.map(g => [g.ageGroup, g.count]));
        expect(ageMap).toMatchObject({ '0-17': 1, '18-29': 0, '30-44': 1, '45-59': 0, '60+': 1, Desconocido: 1 });

        // Volumen operativo: los 4 días con datos
        const volumeWithData = a.volumeByDate.filter(v => v.count > 0).sort((x, y) => x.date.localeCompare(y.date));
        expect(volumeWithData).toEqual([
            { date: '2024-03-10', count: 1 },
            { date: '2024-03-12', count: 1 },
            { date: '2024-04-01', count: 1 },
            { date: '2024-05-20', count: 1 }
        ]);
    });

    test('aplica los mismos filtros del reporte detallado (rango de fechas)', async () => {
        seedFixtures();

        const res = await request(app)
            .get('/api/reports/analytics')
            .query({ startDate: '2024-05-01', endDate: '2024-05-31' })
            .set(OP);

        expect(res.status).toBe(200);
        expect(res.body.analytics.kpis.totalAtenciones).toBe(1);
        expect(res.body.analytics.kpis.pacientesUnicos).toBe(1);
        expect(res.body.analytics.topDiagnoses).toEqual([{ diagnosis: 'Diabetes', count: 1 }]);
    });
});