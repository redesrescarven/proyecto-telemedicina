// backend/tests/externalApi.test.js
// Suite de pruebas del API Externo (external-api-integration-loop):
// verifica la autenticación por API Key y los endpoints /api/external/*.
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

process.env.EXTERNAL_API_KEY = 'test-external-key';

const { seed, reset, list } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const BASE = `artifacts/${APP_ID}/public/data/emergencyRequests`;
const TEL_BASE = `artifacts/default-app-id/public/data/telemedicineSessions`;
const KEY = 'test-external-key';
const AU = { 'x-api-key': KEY };

beforeEach(() => {
    reset();
});

describe('GET /api/external/health', () => {
    test('devuelve 401 sin API Key', async () => {
        const res = await request(app).get('/api/external/health');
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('devuelve 401 con API Key incorrecta', async () => {
        const res = await request(app)
            .get('/api/external/health')
            .set('x-api-key', 'clave-incorrecta');
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('devuelve 200 con API Key correcta', async () => {
        const res = await request(app).get('/api/external/health').set(AU);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            success: true,
            service: 'rescarven-external-api',
            status: 'ok'
        });
        expect(typeof res.body.timestamp).toBe('string');
    });
});

describe('GET /api/external/emergencies', () => {
    test('devuelve 401 sin API Key', async () => {
        const res = await request(app).get('/api/external/emergencies');
        expect(res.status).toBe(401);
    });

    test('devuelve 200 con lista vacía cuando no hay emergencias', async () => {
        const res = await request(app).get('/api/external/emergencies').set(AU);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, total: 0, emergencies: [] });
    });

    test('devuelve emergencias sembradas ordenadas por timestamp descendente con contrato ligero', async () => {
        seed(`${BASE}/EMG1`, {
            userId: 'u1',
            status: 'pending',
            name: 'Ana Perez',
            timestamp: { toDate: () => new Date('2024-01-01T00:00:00Z') }
        });
        seed(`${BASE}/EMG2`, {
            userId: 'u2',
            status: 'in-progress',
            phone: '555-1234',
            operatorName: 'Dr. Pérez',
            timestamp: { toDate: () => new Date('2024-01-05T00:00:00Z') }
        });

        const res = await request(app).get('/api/external/emergencies').set(AU);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.total).toBe(2);
        expect(res.body.emergencies.map(e => e.id)).toEqual(['EMG2', 'EMG1']);
        expect(res.body.emergencies[0]).toEqual({
            id: 'EMG2',
            userId: 'u2',
            status: 'in-progress',
            name: null,
            phone: '555-1234',
            timestamp: '2024-01-05T00:00:00.000Z',
            operatorName: 'Dr. Pérez'
        });
    });
});

describe('POST /api/external/emergency-requests', () => {
    const EMERGENCY_BASE = 'artifacts/default-app-id/public/data/emergencyRequests';

    test('devuelve 401 sin API Key', async () => {
        const res = await request(app)
            .post('/api/external/emergency-requests')
            .send({ cedula: '1111111', nombre: 'Ana Test' });
        expect(res.status).toBe(401);
    });

    test('devuelve 400 si no llegan datos básicos del paciente', async () => {
        const res = await request(app)
            .post('/api/external/emergency-requests')
            .set(AU)
            .send({ doctorId: 'doc1' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('crea una emergencia en artifacts/default-app-id/public/data/emergencyRequests con 201 y estructura nativa', async () => {
        const res = await request(app)
            .post('/api/external/emergency-requests')
            .set(AU)
            .send({
                cedula: '12345678',
                nombre: 'Juan Perez',
                telefono: '555-0000',
                email: 'juan@example.com',
                motivo: 'Dolor en el pecho'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.requestId).toBeDefined();
        expect(res.body).toMatchObject({
            userId: 'EXT-12345678',
            userName: 'Juan Perez',
            userCedula: '12345678',
            userPhone: '555-0000',
            userEmail: 'juan@example.com',
            status: 'pending',
            source: 'CALL_CENTER_API',
            latitude: 10.4819902,
            longitude: -66.8641199,
            motivo: 'Dolor en el pecho'
        });

        const requests = list(EMERGENCY_BASE);
        expect(requests.length).toBe(1);
        expect(requests[0].id).toBe(res.body.requestId);
        expect(requests[0].data).toMatchObject({
            isAffiliate: false,
            latitude: 10.4819902,
            longitude: -66.8641199,
            status: 'pending',
            userCedula: '12345678',
            userEmail: 'juan@example.com',
            userName: 'Juan Perez',
            userPhone: '555-0000',
            userId: 'EXT-12345678',
            wantsMoreInfo: false,
            motivo: 'Dolor en el pecho',
            source: 'CALL_CENTER_API'
        });
        expect(typeof requests[0].data.timestamp).toBe('number');
        expect(Object.keys(requests[0].data).sort()).toEqual([
            'isAffiliate',
            'latitude',
            'longitude',
            'motivo',
            'source',
            'status',
            'timestamp',
            'userCedula',
            'userEmail',
            'userId',
            'userName',
            'userPhone',
            'wantsMoreInfo'
        ]);
        expect(list('artifacts/default-app-id/public/data/telemedicineSessions')).toEqual([]);
    });

    test('respeta latitude/longitude y source provistos por el integrador y los aliases de la App Móvil', async () => {
        const res = await request(app)
            .post('/api/external/emergency-requests')
            .set(AU)
            .send({
                patientCedula: '87654321',
                patientName: 'Maria Garcia',
                patientPhone: '555-2222',
                patientEmail: 'maria@example.com',
                chiefComplaint: 'Fiebre alta',
                latitude: 11.5,
                longitude: -70.25,
                source: 'PARTNER_AMBULANCE'
            });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            requestId: res.body.requestId,
            userId: 'EXT-87654321',
            userName: 'Maria Garcia',
            userCedula: '87654321',
            userPhone: '555-2222',
            userEmail: 'maria@example.com',
            source: 'PARTNER_AMBULANCE',
            latitude: 11.5,
            longitude: -70.25,
            motivo: 'Fiebre alta'
        });

        const requests = list(EMERGENCY_BASE);
        expect(requests.length).toBe(1);
        expect(requests[0].data).toMatchObject({
            source: 'PARTNER_AMBULANCE',
            latitude: 11.5,
            longitude: -70.25,
            userId: 'EXT-87654321',
            userName: 'Maria Garcia',
            userCedula: '87654321',
            userPhone: '555-2222',
            userEmail: 'maria@example.com',
            motivo: 'Fiebre alta',
            isAffiliate: false,
            wantsMoreInfo: false,
            status: 'pending'
        });
        expect(typeof requests[0].data.timestamp).toBe('number');
        expect(list('users')).toEqual([]);
        expect(list('artifacts/default-app-id/public/data/telemedicineSessions')).toEqual([]);
    });
});

describe('POST /api/external/telemedicine-sessions', () => {
    test('devuelve 401 sin API Key', async () => {
        const res = await request(app)
            .post('/api/external/telemedicine-sessions')
            .send({ userId: 'u1', doctorId: 'doc1' });
        expect(res.status).toBe(401);
    });

    test('devuelve 400 si no llegan datos básicos del paciente', async () => {
        const res = await request(app)
            .post('/api/external/telemedicine-sessions')
            .set(AU)
            .send({ doctorId: 'doc1' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('escribe única y exclusivamente en la ruta anidada artifacts/default-app-id/public/data/telemedicineSessions con el esquema nativo de la App Móvil', async () => {
        const res = await request(app)
            .post('/api/external/telemedicine-sessions')
            .set(AU)
            .send({
                userId: 'u1',
                doctorId: 'doc1',
                cedula: '9999999',
                nombre: 'Maria Lopez',
                telefono: '555-9876',
                email: 'maria@example.com',
                motivo: 'Dolor abdominal',
                externalId: 'EXT-100'
            });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            success: true,
            status: 'requested',
            type: 'direct',
            userName: 'Maria Lopez',
            userCedula: '9999999',
            userPhone: '555-9876',
            userEmail: 'maria@example.com',
            userId: 'EXT-9999999',
            motivo: 'Dolor abdominal'
        });
        expect(res.body.sessionId).toBeDefined();
        expect(res.body.caseNumber).toMatch(/^TM-\d{4}-\d{4}$/);

        const sessions = list(TEL_BASE);
        expect(sessions.length).toBe(1);
        expect(sessions[0].id).toBe(res.body.sessionId);
        expect(sessions[0].data).toMatchObject({
            caseNumber: res.body.caseNumber,
            userId: 'EXT-9999999',
            userName: 'Maria Lopez',
            userCedula: '9999999',
            userPhone: '555-9876',
            userEmail: 'maria@example.com',
            type: 'direct',
            source: 'CALL_CENTER_API',
            status: 'requested',
            emergencyId: null,
            motivo: 'Dolor abdominal'
        });
        expect(typeof sessions[0].data.timestamp.toDate).toBe('function');
        expect(typeof sessions[0].data.createdAt.toDate).toBe('function');
        expect(typeof sessions[0].data.updatedAt.toDate).toBe('function');
        expect(sessions[0].data.latitude).toBe(10.4820125);
        expect(sessions[0].data.longitude).toBe(-66.8641175);
        expect(Object.keys(sessions[0].data).sort()).toEqual([
            'caseNumber',
            'createdAt',
            'emergencyId',
            'latitude',
            'longitude',
            'motivo',
            'source',
            'status',
            'timestamp',
            'type',
            'updatedAt',
            'userCedula',
            'userEmail',
            'userId',
            'userName',
            'userPhone'
        ]);

        expect(list(`artifacts/${APP_ID}/public/data/emergencyRequests`)).toEqual([]);
    });

    test('usa los alias patientName/patientPhone/patientEmail/chiefComplaint y cédula desde userId', async () => {
        const res = await request(app)
            .post('/api/external/telemedicine-sessions')
            .set(AU)
            .send({
                userId: 'c0011223',
                patientName: 'Carlos Ruiz',
                patientPhone: '555-1111',
                patientEmail: 'carlos@example.com',
                chiefComplaint: 'Fiebre'
            });

        expect(res.status).toBe(201);
        const sessions = list(TEL_BASE);
        expect(sessions.length).toBe(1);
        expect(sessions[0].data).toMatchObject({
            caseNumber: res.body.caseNumber,
            userId: 'EXT-c0011223',
            userName: 'Carlos Ruiz',
            userCedula: 'c0011223',
            userPhone: '555-1111',
            userEmail: 'carlos@example.com',
            type: 'direct',
            source: 'CALL_CENTER_API',
            status: 'requested',
            emergencyId: null,
            motivo: 'Fiebre'
        });
        expect(res.body.caseNumber).toMatch(/^TM-\d{4}-\d{4}$/);
        expect(res.body.type).toBe('direct');
        expect(res.body.userName).toBe('Carlos Ruiz');
        expect(res.body.userCedula).toBe('c0011223');
        expect(res.body.userPhone).toBe('555-1111');
        expect(res.body.userEmail).toBe('carlos@example.com');
        expect(res.body.userId).toBe('EXT-c0011223');
        expect(typeof sessions[0].data.timestamp.toDate).toBe('function');
        expect(typeof sessions[0].data.createdAt.toDate).toBe('function');
        expect(typeof sessions[0].data.updatedAt.toDate).toBe('function');
        expect(sessions[0].data.latitude).toBe(10.4820125);
        expect(sessions[0].data.longitude).toBe(-66.8641175);
        expect(list(`artifacts/${APP_ID}/public/data/emergencyRequests`)).toEqual([]);
    });

    test('acepta datos básicos sin userId previo: 201 en la ruta anidada telemedicineSessions y sin tocar otras colecciones', async () => {
        const res = await request(app)
            .post('/api/external/telemedicine-sessions')
            .set(AU)
            .send({
                cedula: '8888888',
                nombre: 'Sofia Martinez',
                telefono: '555-7777',
                email: 'sofia@example.com',
                motivo: 'Consulta general'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.sessionId).toBeDefined();
        expect(res.body.caseNumber).toMatch(/^TM-\d{4}-\d{4}$/);
        expect(res.body.type).toBe('direct');
        expect(res.body.userId).toBe('EXT-8888888');
        expect(res.body.userName).toBe('Sofia Martinez');
        expect(res.body.userCedula).toBe('8888888');
        expect(res.body.userPhone).toBe('555-7777');
        expect(res.body.userEmail).toBe('sofia@example.com');
        expect(res.body).toMatchObject({
            status: 'requested',
            source: 'CALL_CENTER_API',
            emergencyId: null,
            motivo: 'Consulta general'
        });

        const sessions = list(TEL_BASE);
        expect(sessions.length).toBe(1);
        expect(sessions[0].data).toMatchObject({
            caseNumber: res.body.caseNumber,
            userId: 'EXT-8888888',
            userName: 'Sofia Martinez',
            userCedula: '8888888',
            userPhone: '555-7777',
            userEmail: 'sofia@example.com',
            type: 'direct',
            source: 'CALL_CENTER_API',
            status: 'requested',
            emergencyId: null,
            motivo: 'Consulta general'
        });
        expect(typeof sessions[0].data.timestamp.toDate).toBe('function');
        expect(typeof sessions[0].data.createdAt.toDate).toBe('function');
        expect(typeof sessions[0].data.updatedAt.toDate).toBe('function');
        expect(sessions[0].data.latitude).toBe(10.4820125);
        expect(sessions[0].data.longitude).toBe(-66.8641175);
        expect(list('users')).toEqual([]);
        expect(list(`artifacts/${APP_ID}/public/data/emergencyRequests`)).toEqual([]);
    });
});