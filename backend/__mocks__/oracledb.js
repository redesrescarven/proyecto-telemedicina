// backend/__mocks__/oracledb.js
// Mock manual de oracledb: evita dependencias nativas y Oracle durante los tests.
'use strict';

module.exports = {
    initOracleClient: jest.fn(),
    getConnection: jest.fn(() => Promise.reject(new Error('oracledb mocked - sin conexión a Oracle')))
};