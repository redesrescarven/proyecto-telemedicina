// migrate-cie10.js
const oracledb = require('oracledb');
const admin = require('firebase-admin');

// 🔑 1. CREDENCIALES ORACLE (JD Edwards)
const oracleConfig = {
  user: 'proddta',
  password: 'proddta',
  connectString: '192.168.100.2:1521/jde'
};

// 🔑 2. INICIALIZAR FIREBASE ADMIN
const serviceAccount = require('../config/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const APP_ID = 'default-app-id';

async function migrateCIE10() {
  let connection;
  try {
    console.log('🔵 Conectando a Oracle JDE en 192.168.100.2:1521/jde...');
    connection = await oracledb.getConnection(oracleConfig);
    console.log('✅ Conectado exitosamente a Oracle');

    console.log('📥 Extrayendo diagnósticos CIE10...');
    const result = await connection.execute(`
      SELECT a.AGGRUPO, a.AGDESCIE, b.CECODCIE, b.CEDESCIE, b.CEGRUPO, b.CESTATUS
      FROM F58AGRUP a, F58CIEAG b
      WHERE a.AGGRUPO = b.CEGRUPO
      ORDER BY a.AGDESCIE, b.CEDESCIE
    `);

    console.log(`✅ ${result.rows.length} diagnósticos extraídos. Iniciando migración a Firestore...`);

    //let batch = db.collection(`artifacts/${APP_ID}/public/data/cie10`).doc().batch();
    let batch = db.batch();
    let count = 0;
    const BATCH_LIMIT = 500;

    for (const row of result.rows) {
      const [aggrupo, agdescie, cecodcie, cedescie, cegrupo, cestatus] = row;
      
      const docId = cecodcie ? String(cecodcie).replace(/\./g, '') : `doc_${count}`;
      const searchKey = `${cecodcie} ${cedescie}`.toLowerCase();

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

      if (count % BATCH_LIMIT === 0) {
        await batch.commit();
        console.log(`💾 Lote guardado: ${count} registros procesados.`);
        batch = db.collection(`artifacts/${APP_ID}/public/data/cie10`).doc().batch();
      }
    }

    if (count % BATCH_LIMIT !== 0) {
      await batch.commit();
    }

    console.log(`🎉 MIGRACIÓN COMPLETADA: ${count} diagnósticos disponibles en Firestore.`);
    console.log(`📍 Colección: artifacts/${APP_ID}/public/data/cie10`);

  } catch (err) {
    console.error('❌ Error en la migración:', err);
  } finally {
    if (connection) {
      await connection.close();
      console.log('🔌 Conexión a Oracle cerrada');
    }
    process.exit();
  }
}

migrateCIE10();
