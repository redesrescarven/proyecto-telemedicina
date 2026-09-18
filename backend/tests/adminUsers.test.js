// backend/tests/adminUsers.test.js
// Suite de pruebas del CRUD administrativo de usuarios (qa-users-crud-and-mandatory-diagnostic-loop):
// verifica DELETE /api/admin/users/:uid, PATCH /api/admin/users/:uid/password,
// PATCH /api/admin/users/:uid/status y el bloqueo de cuentas inactivas en el middleware.
const request = require('supertest');
const adminMock = require('firebase-admin');
const app = require('../src/server');

jest.mock('firebase-admin');
jest.mock('oracledb');

const { seed, reset, read, list } = adminMock.__helpers;
const APP_ID = 'test-app-id';
const ADMIN = { 'x-operator-rol': 'administrador', 'x-operator-uid': 'admin-1' };
const MEDICO = { 'x-operator-rol': 'medico', 'x-operator-uid': 'doc-1' };
const UID = 'user-123';

beforeEach(() => {
    reset();
    adminMock.auth();
    adminMock.auth().deleteUser.mockClear();
    adminMock.auth().updateUser.mockClear();
    adminMock.auth().createUser.mockClear();
});

describe('DELETE /api/admin/users/:uid', () => {
    test('rechaza sin cabeceras de operador (403)', async () => {
        const res = await request(app).delete(`/api/admin/users/${UID}`);
        expect(res.status).toBe(403);
    });

    test('rechaza el rol insuficiente (médico → 403)', async () => {
        const res = await request(app).delete(`/api/admin/users/${UID}`).set(MEDICO);
        expect(res.status).toBe(403);
    });

    test('elimina el usuario en Firebase Auth y Firestore (200)', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/${UID}`, { email: 'op@rescarven.com', rol: 'operador' });
        seed(`artifacts/${APP_ID}/users/${UID}/profile/data`, { email: 'op@rescarven.com', name: 'Operador' });

        const res = await request(app).delete(`/api/admin/users/${UID}`).set(ADMIN);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(adminMock.auth().deleteUser).toHaveBeenCalledWith(UID);
        expect(read(`artifacts/${APP_ID}/systemUsers/${UID}`)).toBeNull();
        expect(read(`artifacts/${APP_ID}/users/${UID}/profile/data`)).toBeNull();
        expect(list(`artifacts/${APP_ID}/systemUsers`).length).toBe(0);
    });

    test('devuelve 404 si el usuario no existe ni en Auth ni en Firestore', async () => {
        adminMock.auth().deleteUser.mockRejectedValueOnce(
            Object.assign(new Error('auth/user-not-found'), { code: 'auth/user-not-found' })
        );

        const res = await request(app).delete(`/api/admin/users/${UID}`).set(ADMIN);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test('devuelve 500 JSON legible si Firebase Auth falla con otro error', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/${UID}`, { email: 'op@rescarven.com', rol: 'operador' });
        adminMock.auth().deleteUser.mockRejectedValueOnce(new Error('auth/network-error'));

        const res = await request(app).delete(`/api/admin/users/${UID}`).set(ADMIN);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.message).toBe('string');
    });
});

describe('PATCH /api/admin/users/:uid/password', () => {
    test('rechaza el rol insuficiente (403)', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${UID}/password`)
            .set(MEDICO)
            .send({ newPassword: 'NuevaClave123!' });
        expect(res.status).toBe(403);
    });

    test('devuelve 400 si falta newPassword', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${UID}/password`)
            .set(ADMIN)
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('devuelve 400 si la nueva contraseña es demasiado corta', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${UID}/password`)
            .set(ADMIN)
            .send({ newPassword: '123' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('actualiza la contraseña vía Firebase Auth (200)', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${UID}/password`)
            .set(ADMIN)
            .send({ newPassword: 'NuevaClave123!' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(adminMock.auth().updateUser).toHaveBeenCalledWith(UID, { password: 'NuevaClave123!' });
    });

    test('devuelve 500 JSON legible si Firebase Auth falla', async () => {
        adminMock.auth().updateUser.mockRejectedValueOnce(new Error('auth/weak-password'));

        const res = await request(app)
            .patch(`/api/admin/users/${UID}/password`)
            .set(ADMIN)
            .send({ newPassword: 'NuevaClave123!' });

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.message).toBe('string');
    });
});

describe('PATCH /api/admin/users/:uid/status', () => {
    test('rechaza el rol insuficiente (403)', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${UID}/status`)
            .set(MEDICO)
            .send({ isActive: false });
        expect(res.status).toBe(403);
    });

    test('devuelve 400 si falta status/isActive', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${UID}/status`)
            .set(ADMIN)
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('inactiva al usuario: deshabilita Auth y sincroniza Firestore (200)', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/${UID}`, { email: 'op@rescarven.com', rol: 'operador' });

        const res = await request(app)
            .patch(`/api/admin/users/${UID}/status`)
            .set(ADMIN)
            .send({ isActive: false });

        expect(res.status).toBe(200);
        expect(adminMock.auth().updateUser).toHaveBeenCalledWith(UID, { disabled: true });

        const sysDoc = read(`artifacts/${APP_ID}/systemUsers/${UID}`);
        expect(sysDoc.status).toBe('inactive');
        expect(sysDoc.isActive).toBe(false);
        const profileDoc = read(`artifacts/${APP_ID}/users/${UID}/profile/data`);
        expect(profileDoc.status).toBe('inactive');
        expect(profileDoc.isActive).toBe(false);
    });

    test('activa al usuario: habilita Auth y sincroniza Firestore (200)', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/${UID}`, { email: 'op@rescarven.com', rol: 'operador', status: 'inactive', isActive: false });

        const res = await request(app)
            .patch(`/api/admin/users/${UID}/status`)
            .set(ADMIN)
            .send({ status: 'active' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(adminMock.auth().updateUser).toHaveBeenCalledWith(UID, { disabled: false });
        expect(read(`artifacts/${APP_ID}/systemUsers/${UID}`).status).toBe('active');
        expect(read(`artifacts/${APP_ID}/systemUsers/${UID}`).isActive).toBe(true);
    });
});

describe('Bloqueo de cuentas inactivas en el middleware (verifyToken)', () => {
    test('bloquea con 403 a un operador con status inactive', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/inactive-op`, { status: 'inactive', isActive: false, rol: 'medico' });

        const res = await request(app)
            .get('/api/reports/detailed')
            .set({ 'x-operator-rol': 'medico', 'x-operator-uid': 'inactive-op' });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Cuenta inactivada/);
    });

    test('bloquea con 403 a un operador con isActive === false', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/disabled-op`, { isActive: false, rol: 'operador' });

        const res = await request(app)
            .get('/api/admin/users')
            .set({ 'x-operator-rol': 'administrador', 'x-operator-uid': 'disabled-op' });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Cuenta inactivada/);
    });

    test('permite el acceso a un operador activo (200)', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/active-op`, { status: 'active', isActive: true, rol: 'medico' });

        const res = await request(app)
            .get('/api/reports/detailed')
            .set({ 'x-operator-rol': 'medico', 'x-operator-uid': 'active-op' });

        expect(res.status).toBe(200);
    });

    test('un administrador inactivo no puede ejecutar acciones admin (403)', async () => {
        seed(`artifacts/${APP_ID}/systemUsers/admin-inactivo`, { status: 'inactive', isActive: false, rol: 'administrador' });

        const res = await request(app)
            .delete(`/api/admin/users/${UID}`)
            .set({ 'x-operator-rol': 'administrador', 'x-operator-uid': 'admin-inactivo' });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Cuenta inactivada/);
    });
});