// backend/tests/emergencies.test.js
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { seed, read, reset } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const BASE = `artifacts/${APP_ID}/public/data/emergencyRequests`;

beforeEach(() => {
    reset();
});

describe('GET /api/emergencies', () => {
    test('devuelve 200 con arreglo vacío cuando no hay emergencias', async () => {
        const res = await request(app).get('/api/emergencies');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('devuelve emergencias ordenadas por timestamp descendente', async () => {
        seed(`${BASE}/EMG1`, {
            userId: 'u1',
            status: 'pending',
            timestamp: { toDate: () => new Date('2024-01-01T00:00:00Z') }
        });
        seed(`${BASE}/EMG2`, {
            userId: 'u2',
            status: 'in-progress',
            timestamp: { toDate: () => new Date('2024-01-05T00:00:00Z') }
        });

        const res = await request(app).get('/api/emergencies');
        expect(res.status).toBe(200);
        expect(res.body.map((e) => e.id)).toEqual(['EMG2', 'EMG1']);
    });
});

describe('PUT /api/emergencies/:emergencyId/status', () => {
    test('devuelve 400 si falta el campo status', async () => {
        const res = await request(app)
            .put('/api/emergencies/EMG1/status')
            .send({ operatorId: 'op1' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('devuelve 404 si la emergencia no existe', async () => {
        const res = await request(app)
            .put('/api/emergencies/DESCONOCIDA/status')
            .send({ status: 'in-progress', operatorId: 'op1' });
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test('actualiza el estado a in-progress', async () => {
        seed(`${BASE}/EMG1`, { userId: 'u1', status: 'pending', statusHistory: [] });

        const res = await request(app)
            .put('/api/emergencies/EMG1/status')
            .send({ status: 'in-progress', operatorId: 'op1', operatorName: 'Dr. Pérez' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const doc = read(`${BASE}/EMG1`);
        expect(doc.status).toBe('in-progress');
        expect(doc.attendedAt).toBeDefined();
        expect(doc.statusHistory.length).toBe(1);
        expect(doc.statusHistory[0].status).toBe('in-progress');
    });

    test('bloquea el cierre si Fase 1 o Fase 2 no están cerradas', async () => {
        seed(`${BASE}/EMG1`, { userId: 'u1', status: 'pending', statusHistory: [] });
        seed(`artifacts/${APP_ID}/users/u1/medicalHistory/EMG1`, {
            fase1: { isLocked: true },
            fase2: { isLocked: false }
        });

        const res = await request(app)
            .put('/api/emergencies/EMG1/status')
            .send({ status: 'resolved', operatorId: 'op1' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('HISTORY_INCOMPLETE');
    });

    test('permite el cierre cuando Fase 1 y Fase 2 están cerradas', async () => {
        seed(`${BASE}/EMG1`, { userId: 'u1', status: 'in-progress', statusHistory: [] });
        seed(`artifacts/${APP_ID}/users/u1/medicalHistory/EMG1`, {
            fase1: { isLocked: true },
            fase2: { isLocked: true }
        });

        const res = await request(app)
            .put('/api/emergencies/EMG1/status')
            .send({ status: 'resolved', operatorId: 'op1', operatorName: 'Dr. Gómez' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(read(`${BASE}/EMG1`).status).toBe('resolved');
    });
});