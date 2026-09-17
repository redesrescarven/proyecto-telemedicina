// backend/src/routes/autocomplete_st.js
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

router.get('/studies', async (req, res) => {
    let connection;
    
    try {
        const { q, type } = req.query;
        
        // Validación de tipo
        if (!type || !['laboratorio', 'radiologia', 'imagenologia'].includes(type)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tipo inválido. Use: laboratorio, radiologia o imagenologia' 
            });
        }
        
        if (!q || q.length < 2) {
            return res.json({ success: true, data: [], count: 0 });
        }

        const searchTerm = q.trim().toUpperCase();
        
        // ✅ MAPEO CORRECTO CONFIRMADO
        const classificationMap = {
            'laboratorio': 'LABORATORIO',
            'radiologia': 'RAYOS X',
            'imagenologia': 'TARIFAS'
        };
        
        const oracleClassification = classificationMap[type];

        const oracleConfig = {
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_SERVICE}`
        };

        connection = await oracledb.getConnection(oracleConfig);

        // ✅ QUERY CON TRIM para manejar campos CHAR con espacios
        const query = `
            SELECT DISTINCT TRIM(PRDESCAT) AS descripcion
            FROM VIEW_F58PRECL
            WHERE TRIM(PRCLASIF) = :classification
            AND UPPER(TRIM(PRDESCAT)) LIKE :searchTerm
            AND ROWNUM <= :limit
            ORDER BY TRIM(PRDESCAT)
        `;

        const result = await connection.execute(query, {
            classification: oracleClassification,
            searchTerm: `%${searchTerm}%`,
            limit: 20
        });

        // Filtrar resultados vacíos
        const estudios = result.rows
            .map(row => row[0]?.trim())
            .filter(desc => desc && desc.length > 0);

        res.json({ 
            success: true, 
            data: estudios, 
            count: estudios.length, 
            type, 
            query: q 
        });

    } catch (error) {
        console.error('❌ Error en autocomplete_st:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error consultando Oracle',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.close().catch(() => {});
    }
});

module.exports = router;

