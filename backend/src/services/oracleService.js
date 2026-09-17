// backend/src/services/oracleService.js
const oracledb = require('oracledb');

// Pool de conexiones reutilizable
let pool = null;

/**
 * Inicializa el pool de conexiones para autocompletado
 */
async function initializeAutocompletePool() {
    if (pool) return pool;

    try {
        pool = await oracledb.createPool({
            user: process.env.ORACLE_AUTOCOMPLETE_USER,
            password: process.env.ORACLE_AUTOCOMPLETE_PASSWORD,
            connectString: `${process.env.ORACLE_AUTOCOMPLETE_HOST}:${process.env.ORACLE_AUTOCOMPLETE_PORT}/${process.env.ORACLE_AUTOCOMPLETE_SERVICE_NAME || 'ORCL'}`,
            poolMin: 1,
            poolMax: 3,
            poolIncrement: 1,
            poolTimeout: 30
        });
        console.log('✅ Pool Oracle (Autocompletado) inicializado');
        return pool;
    } catch (error) {
        console.error('❌ Error inicializando pool Oracle:', error);
        throw error;
    }
}

/**
 * Busca principios activos con autocompletado
 */
async function searchPrincipiosActivos(searchTerm, limit = 20) {
    if (!searchTerm || searchTerm.length < 2) return [];

    let connection;
    try {
        const dbPool = await initializeAutocompletePool();
        connection = await dbPool.getConnection();

        const view = process.env.ORACLE_AUTOCOMPLETE_VIEW || 'F58PRINCIPIOACTIVO';
        const field = process.env.ORACLE_AUTOCOMPLETE_FIELD || 'drdl01';

        // Query segura con bind variables
        const query = `
            SELECT DISTINCT ${field} AS principio
            FROM ${view}
            WHERE UPPER(${field}) LIKE UPPER(:searchTerm || '%')
            AND ROWNUM <= :limit
            ORDER BY ${field}
        `;

        const result = await connection.execute(query, {
            searchTerm: `%${searchTerm.trim()}%`,
            limit: limit
        });

        return result.rows.map(row => row[0]);

    } catch (error) {
        console.error('❌ Error consultando principios activos:', error);
        return [];
    } finally {
        if (connection) await connection.close();
    }
}

module.exports = { searchPrincipiosActivos, initializeAutocompletePool };

