// backend/tests/users.test.js
// Suite de pruebas de la creación de usuarios del sistema (qa-deep-fixes-loop):
// verifica que POST /api/users (y su alias /api/createSystemUser) devuelva SIEMPRE
// JSON estructurado y cree el usuario en Firebase Auth + Firestore sin romper la
// ejecución, incluso al crear un usuario con rol médico.
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { reset } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const SYSTEM_USERS_BASE = `artifacts/${APP_ID}/systemUsers`;

const medicoPayload = {
    email: 'dra.perez@rescarven.com',
    password: 'Temporal123!',
    nombreCompleto: 'Dra. Ana Pérez',
    rol: 'medico',
    isActive: true,
    medicalProfile: { licenseCM: '27216', ministryReg: '174892' }
};

beforeEach(() => {
    reset();
    adminMock.auth();
    adminMock.auth().createUser.mockClear();
});

describe('POST /api/users', () => {
    test('crea un usuario con rol médico y devuelve 201 JSON estructurado', async () => {
        const res = await request(app)
            .post('/api/users')
            .send(medicoPayload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.message).toBe('string');
        expect(res.body.userId).toBeDefined();

        const created = adminMock.auth().createUser.mock.calls[0][0];
        expect(created.email).toBe('dra.perez@rescarven.com');
        expect(created.displayName).toBe('Dra. Ana Pérez');
    });

    test('persiste el perfil del médico en Firestore con medicalProfile', async () => {
        const res = await request(app)
            .post('/api/users')
            .send(medicoPayload);

        expect(res.status).toBe(201);
        const docs = adminMock.__helpers.list(SYSTEM_USERS_BASE);
        expect(docs.length).toBe(1);
        expect(docs[0].data.email).toBe('dra.perez@rescarven.com');
        expect(docs[0].data.rol).toBe('medico');
        expect(docs[0].data.medicalProfile.licenseCM).toBe('27216');
        expect(docs[0].data.isActive).toBe(true);
    });

    test('devuelve 400 JSON si faltan campos obligatorios', async () => {
        const res = await request(app)
            .post('/api/users')
            .send({ email: 'sin.password@rescarven.com' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.message).toBe('string');
    });

    test('devuelve 400 JSON si un médico no envía su perfil clínico', async () => {
        const res = await request(app)
            .post('/api/users')
            .send({ ...medicoPayload, medicalProfile: undefined });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/perfil m[ée]dico/i);
    });

    test('devuelve 400 JSON si el rol es inválido', async () => {
        const res = await request(app)
            .post('/api/users')
            .send({ ...medicoPayload, rol: 'root' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('no rompe la ejecución si Firebase Auth falla: responde 201 con UID local', async () => {
        adminMock.auth().createUser.mockRejectedValueOnce(new Error('auth/unavailable'));

        const res = await request(app)
            .post('/api/users')
            .send(medicoPayload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.userId).toMatch(/^auth_/);
    });

    test('devuelve 500 JSON legible si Firestore falla (sin HTML)', async () => {
        jest.spyOn(adminMock.__helpers.firestore, 'collection').mockImplementationOnce(() => {
            throw new Error('firestore/boom');
        });

        const res = await request(app)
            .post('/api/users')
            .send(medicoPayload);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.message).toBe('string');

        adminMock.__helpers.firestore.collection.mockRestore();
    });
});

describe('POST /api/createSystemUser (alias)', () => {
    test('sigue funcionando y devuelve JSON estructurado', async () => {
        const res = await request(app)
            .post('/api/createSystemUser')
            .send({ email: 'op@rescarven.com', password: 'Temporal123!', nombreCompleto: 'Operador Uno', rol: 'operador' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.userId).toBeDefined();
    });
});