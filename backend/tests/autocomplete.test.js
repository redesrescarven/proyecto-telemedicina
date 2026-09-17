// backend/tests/autocomplete.test.js
const request = require('supertest');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

describe('GET /api/autocomplete/principio-activo', () => {
    test('devuelve resultado vacío cuando la consulta es muy corta', async () => {
        const res = await request(app)
            .get('/api/autocomplete/principio-activo?q=a');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: [], count: 0 });
    });
});

describe('GET /api/autocomplete/studies', () => {
    test('devuelve 400 para un tipo inválido', async () => {
        const res = await request(app)
            .get('/api/autocomplete/studies?q=x&type=invalido');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});