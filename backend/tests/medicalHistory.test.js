// backend/tests/medicalHistory.test.js
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { seed, read, reset } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const HISTORY = `artifacts/${APP_ID}/users/u1/medicalHistory/H1`;
const OP = { 'x-operator-rol': 'medico', 'x-operator-uid': 'op-uid' };

beforeEach(() => {
    reset();
});

describe('POST /api/medical-history/:historyId/phase1', () => {
    test('devuelve 403 sin cabeceras de operador', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase1')
            .send({ userId: 'u1' });
        expect(res.status).toBe(403);
    });

    test('devuelve 400 si falta el userId', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase1')
            .set(OP)
            .send({ fields: { motivo: 'dolor' } });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('guarda borrador de Fase 1 (isFinal=false)', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase1')
            .set(OP)
            .send({ userId: 'u1', isFinal: false, fields: { motivo: 'dolor abdominal' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('Borrador');

        const doc = read(HISTORY);
        expect(doc.fase1.isLocked).toBe(false);
        expect(doc.fase1.fields.motivo).toBe('dolor abdominal');
        expect(doc.status).toBe('in_progress');
    });

    test('cierra y bloquea Fase 1 (isFinal=true)', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase1')
            .set(OP)
            .send({ userId: 'u1', isFinal: true, fields: { dx: 'HTA' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('cerrada');

        const doc = read(HISTORY);
        expect(doc.fase1.isLocked).toBe(true);
        expect(doc.fase1.fields.dx).toBe('HTA');
        expect(doc.status).toBe('completed_phase1');
    });

    test('rechaza modificaciones cuando Fase 1 ya está cerrada', async () => {
        seed(HISTORY, { fase1: { isLocked: true } });

        const res = await request(app)
            .post('/api/medical-history/H1/phase1')
            .set(OP)
            .send({ userId: 'u1', isFinal: true, fields: {} });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /api/medical-history/:historyId/phase2', () => {
    test('devuelve 403 sin cabeceras de operador', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase2')
            .send({ userId: 'u1' });
        expect(res.status).toBe(403);
    });

    test('devuelve 400 si falta el userId', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase2')
            .set(OP)
            .send({ fields: {} });
        expect(res.status).toBe(400);
    });

    test('guarda borrador de Fase 2 (isFinal=false)', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase2')
            .set(OP)
            .send({ userId: 'u1', isFinal: false, fields: { tx: 'Enalapril' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('Borrador');

        const doc = read(HISTORY);
        expect(doc.fase2.isLocked).toBe(false);
        expect(doc.fase2.fields.tx).toBe('Enalapril');
        expect(doc.status).toBe('in_progress');
    });

    test('cierra y bloquea Fase 2 (isFinal=true)', async () => {
        const res = await request(app)
            .post('/api/medical-history/H1/phase2')
            .set(OP)
            .send({ userId: 'u1', isFinal: true, fields: { tx: 'Losartán 50 mg' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('completada');

        const doc = read(HISTORY);
        expect(doc.fase2.isLocked).toBe(true);
        expect(doc.fase2.fields.tx).toBe('Losartán 50 mg');
        expect(doc.status).toBe('completed');
    });

    test('rechaza modificaciones cuando Fase 2 ya está cerrada', async () => {
        seed(HISTORY, { fase2: { isLocked: true } });

        const res = await request(app)
            .post('/api/medical-history/H1/phase2')
            .set(OP)
            .send({ userId: 'u1', isFinal: true, fields: {} });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});