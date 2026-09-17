// backend/tests/telemedicine.test.js
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { seed, list, reset } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const TEL_BASE = `artifacts/${APP_ID}/public/data/telemedicineSessions`;

beforeEach(() => {
    reset();
});

describe('POST /api/telemedicine/request', () => {
    test('devuelve 400 si faltan userId/userName', async () => {
        const res = await request(app)
            .post('/api/telemedicine/request')
            .send({ userPhone: '123' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('crea una solicitud y devuelve 201 con sessionId', async () => {
        const res = await request(app)
            .post('/api/telemedicine/request')
            .send({ userId: 'u1', userName: 'Ana Pérez', userPhone: '555', userCedula: 'V-10' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.sessionId).toBeDefined();
        expect(res.body.caseNumber).toMatch(/^TM-\d{4}-\d{4}$/);

        const sessions = list(TEL_BASE);
        expect(sessions.length).toBe(1);
        expect(sessions[0].id).toBe(res.body.sessionId);
        expect(sessions[0].data.status).toBe('requested');
        expect(sessions[0].data.userId).toBe('u1');
        expect(sessions[0].data.userName).toBe('Ana Pérez');
    });
});

describe('PUT /api/telemedicine/sessions/:sessionId/status', () => {
    async function createSession() {
        const res = await request(app)
            .post('/api/telemedicine/request')
            .send({ userId: 'u1', userName: 'Ana Pérez' });
        return res.body.sessionId;
    }

    test('devuelve 400 si falta el campo status', async () => {
        const sessionId = await createSession();
        const res = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({});
        expect(res.status).toBe(400);
    });

    test('acepta una sesión solicitada (in-progress)', async () => {
        const sessionId = await createSession();
        const res = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'in-progress', operatorId: 'doc1', operatorName: 'Dra. Rojas' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const sessions = list(TEL_BASE);
        expect(sessions[0].data.status).toBe('in-progress');
        expect(sessions[0].data.attendedAt).toBeDefined();
    });

    test('bloquea el cierre hasta que Fase 1 esté cerrada', async () => {
        const sessionId = await createSession();
        const res = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'resolved' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('HISTORY_INCOMPLETE');
    });

    test('permite el cierre cuando Fase 1 está cerrada', async () => {
        const sessionId = await createSession();
        seed(`artifacts/${APP_ID}/users/u1/medicalHistory/${sessionId}`, { fase1: { isLocked: true } });

        const res = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'resolved', operatorId: 'doc1', operatorName: 'Dra. Rojas' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(list(TEL_BASE)[0].data.status).toBe('resolved');
    });

    test('devuelve 404 si la sesión no existe', async () => {
        const res = await request(app)
            .put('/api/telemedicine/sessions/INEXISTENTE/status')
            .send({ status: 'in-progress' });
        expect(res.status).toBe(404);
    });

    test('permite el reingreso de un médico a una sesión en curso (in-progress) con trazabilidad', async () => {
        const sessionId = await createSession();

        const first = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'in-progress', operatorId: 'doc1', operatorName: 'Dra. Rojas' });
        expect(first.status).toBe(200);

        const rejoin = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'in-progress', operatorId: 'doc2', operatorName: 'Dr. Gómez' });

        expect(rejoin.status).toBe(200);
        expect(rejoin.body.success).toBe(true);

        const sessions = list(TEL_BASE);
        expect(sessions[0].data.status).toBe('in-progress');
        expect(sessions[0].data.lastOperatorId).toBe('doc2');
        expect(sessions[0].data.lastOperatorName).toBe('Dr. Gómez');
        expect(Array.isArray(sessions[0].data.operators)).toBe(true);
        expect(sessions[0].data.operators.length).toBe(2);
        expect(sessions[0].data.operators[0].operatorId).toBe('doc1');
        expect(sessions[0].data.operators[1].operatorId).toBe('doc2');
    });

    test('rechaza el reingreso a una sesión ya cerrada (resolved)', async () => {
        const sessionId = await createSession();
        seed(`artifacts/${APP_ID}/users/u1/medicalHistory/${sessionId}`, { fase1: { isLocked: true } });

        const resolved = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'resolved', operatorId: 'doc1', operatorName: 'Dra. Rojas' });
        expect(resolved.status).toBe(200);

        const rejoin = await request(app)
            .put(`/api/telemedicine/sessions/${sessionId}/status`)
            .send({ status: 'in-progress', operatorId: 'doc2', operatorName: 'Dr. Gómez' });

        expect(rejoin.status).toBe(409);
    });
});