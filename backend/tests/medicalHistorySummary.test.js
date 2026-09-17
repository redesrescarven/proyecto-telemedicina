// backend/tests/medicalHistorySummary.test.js
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { seed, reset } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const HISTORY_BASE = `artifacts/${APP_ID}/users/u1/medicalHistory`;
const OP = { 'x-operator-rol': 'medico', 'x-operator-uid': 'op-uid' };

beforeEach(() => {
    reset();
});

describe('GET /api/medical-history/patient/:userId/summary', () => {
    test('devuelve 200 con la lista reducida ordenada por fecha descendente y protege el rol médico', async () => {
        const forbidden = await request(app)
            .get('/api/medical-history/patient/u1/summary');
        expect(forbidden.status).toBe(403);

        seed(`${HISTORY_BASE}/H1`, {
            userId: 'u1',
            createdAt: { toDate: () => new Date('2024-01-01T00:00:00Z') },
            fase1: { fields: { motivoConsulta: 'Cefalea' } },
            fase2: { fields: { diagnosticoFinal: 'Migraña' } }
        });
        seed(`${HISTORY_BASE}/H2`, {
            userId: 'u1',
            createdAt: { toDate: () => new Date('2024-06-15T00:00:00Z') },
            fase1: { fields: { sintomas: 'Dolor torácico' } },
            fase2: { fields: { diagnostico: 'Angina' } }
        });

        const res = await request(app)
            .get('/api/medical-history/patient/u1/summary')
            .set(OP);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.historias)).toBe(true);

        const resumen = res.body.historias;
        expect(resumen.map(h => h.id)).toEqual(['H2', 'H1']);

        resumen.forEach(h => {
            expect(Object.keys(h).sort()).toEqual(['createdAt', 'date', 'diagnosis', 'id', 'symptoms']);
        });

        expect(resumen[0]).toMatchObject({ id: 'H2', symptoms: 'Dolor torácico', diagnosis: 'Angina' });
        expect(resumen[0].date).toBe('2024-06-15T00:00:00.000Z');
        expect(resumen[0].createdAt).toBe('2024-06-15T00:00:00.000Z');
        expect(resumen[1]).toMatchObject({ id: 'H1', symptoms: 'Cefalea', diagnosis: 'Migraña' });
    });

    test('manejo defensivo: userId inválido responde 400 y paciente sin historias responde 200 con lista vacía', async () => {
        const invalid = await request(app)
            .get('/api/medical-history/patient/%2e%2e%2f/summary')
            .set(OP);
        expect(invalid.status).toBe(400);
        expect(invalid.body.success).toBe(false);

        const nullId = await request(app)
            .get('/api/medical-history/patient/null/summary')
            .set(OP);
        expect(nullId.status).toBe(400);
        expect(nullId.body.success).toBe(false);

        const empty = await request(app)
            .get('/api/medical-history/patient/user-sin-historial/summary')
            .set(OP);
        expect(empty.status).toBe(200);
        expect(empty.body.success).toBe(true);
        expect(empty.body.historias).toEqual([]);
        expect(empty.body.total).toBe(0);
    });
});
