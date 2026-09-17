// backend/src/routes/autocomplete_pa.js
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

// ✅ HABILITAR MODO THICK para compatibilidad con Oracle antiguo
// Esto debe ejecutarse ANTES de cualquier conexión
oracledb.initOracleClient({
    libDir: process.env.ORACLE_CLIENT_LIB_DIR || '' // Vacío = usar ruta por defecto del sistema
});

/**
 * GET /api/autocomplete/principio-activo?q=parac&limit=15
 */
router.get('/principio-activo', async (req, res) => {
    let connection;
    
    try {
        const { q, limit } = req.query;
        
        if (!q || typeof q !== 'string' || q.length < 2) {
            return res.json({ success: true, data: [], count: 0 });
        }

        const searchLimit = parseInt(limit) || 15;
        const searchTerm = q.trim().toUpperCase();

        // ✅ CONEXIÓN USANDO VARIABLES DE ENTORNO EXACTAS
        const oracleConfig = {
            user: process.env.ORACLE_AUTOCOMPLETE_USER,
            password: process.env.ORACLE_AUTOCOMPLETE_PASSWORD,
            connectString: `${process.env.ORACLE_AUTOCOMPLETE_HOST}:${process.env.ORACLE_AUTOCOMPLETE_PORT}/${process.env.ORACLE_AUTOCOMPLETE_SERVICE_NAME}`
        };

        connection = await oracledb.getConnection(oracleConfig);

        const view = process.env.ORACLE_AUTOCOMPLETE_VIEW;
        const field = process.env.ORACLE_AUTOCOMPLETE_FIELD;

        if (!view || !field) {
            throw new Error('Faltan variables ORACLE_AUTOCOMPLETE_VIEW o ORACLE_AUTOCOMPLETE_FIELD');
        }

        const query = `
            SELECT DISTINCT ${field} AS principio
            FROM ${view}
            WHERE UPPER(${field}) LIKE :searchTerm
            AND ROWNUM <= :limit
            ORDER BY ${field}
        `;

        const result = await connection.execute(query, {
            searchTerm: `${searchTerm}%`,
            limit: searchLimit
        });

        const principios = result.rows.map(row => row[0]);

        res.json({ 
            success: true, 
            data: principios,
            count: principios.length,
            query: q
        });

    } catch (error) {
        console.error('❌ Error en autocomplete_pa:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al consultar principios activos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;
