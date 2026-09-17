// backend/jest.config.js
module.exports = {
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/tests/setup.js'],
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    testTimeout: 15000,
    silent: true,
    verbose: true,
    moduleNameMapper: {
        '^proxy-agent$': '<rootDir>/tests/stubs/proxy-agent.js'
    }
};