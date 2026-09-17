// migrate-cie10.js
const oracledb = require('oracledb');
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert('./config/serviceAccountKey.json')
});
const db = admin.firestore();
const APP_ID = 'default-app-id';

async function migrateCIE10() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: 'proddta',
      password: 'proddta',
      connectString: '192.168.100.2:1521/jde'
    });

    console.log('📥 Extrayendo diagnósticos desde Oracle...');
//  const result = await connection.execute(`
//    SELECT a.AGGRUPO, a.AGDESCIE, b.CECODCIE, b.CEDESCIE, b.CEGRUPO, b.CESTATUS
//    FROM F58AGRUP a, F58CIEAG b
//    WHERE a.AGGRUPO = b.CEGRUPO
//    ORDER BY a.AGDESCIE, b.CEDESCIE
//  `);
    const result = await connection.execute(`
       SELECT * FROM VITOCIE10 ORDER BY CEDESCIE
       `);

    console.log(`✅ ${result.rows.length} registros extraídos. Migrando a Firestore...`);

    let batch = db.collection(`artifacts/${APP_ID}/public/data/cie10`).doc().batch();
    let count = 0;
    const BATCH_SIZE = 500;

    for (const row of result.rows) {
      const [aggrupo, agdescie, cecodcie, cedescie, cegrupo, cestatus] = row;
      const docId = cecodcie ? String(cecodcie).replace(/\./g, '') : `doc_${count}`;
      
      // 🔑 Clave de búsqueda optimizada (lowercase, sin caracteres especiales)
      const searchKey = `${cecodcie} ${cedescie}`.toLowerCase().replace(/[^\w\s]/g, '');

      batch.set(
        db.collection(`artifacts/${APP_ID}/public/data/cie10`).doc(docId),
        {
          code: cecodcie || '',
          description: cedescie || '',
          groupCode: cegrupo || '',
          groupDescription: agdescie || '',
          status: cestatus || '',
          searchKey,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }
      );

      count++;
      if (count % BATCH_SIZE === 0) {
        await batch.commit();
        console.log(`💾 Lote ${count} guardado.`);
        batch = db.collection(`artifacts/${APP_ID}/public/data/cie10`).doc().batch();
      }
    }

    if (count % BATCH_SIZE !== 0) await batch.commit();
    console.log(`🎉 Migración completada: ${count} diagnósticos.`);

  } catch (err) {
    console.error('❌ Error en migración:', err);
  } finally {
    if (connection) await connection.close();
    process.exit();
  }
}

migrateCIE10();
