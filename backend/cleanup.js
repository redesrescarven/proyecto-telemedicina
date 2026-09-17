// backend/cleanup.js
const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanup() {
  const batchSize = 10;
  const collections = [
    'artifacts/default-app-id/public/data/emergencyRequests',
    'artifacts/default-app-id/public/data/telemedicineSessions'
  ];

  for (const path of collections) {
    const query = db.collection(path);
    const snapshot = await query.get();
    let deletedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const isTestUser = 
        data.userName?.includes('Prueba') ||
        data.userName?.includes('Test') ||
        data.userEmail?.includes('test') ||
        data.cedula?.includes('12345678');

      if (isTestUser) {
        await doc.ref.delete();
        console.log(`✅ Eliminado: ${path}/${doc.id}`);
        deletedCount++;
      }
    }

    console.log(`\n${deletedCount} documentos eliminados de ${path}`);
  }

  console.log('\n✅ Limpieza completada.');
}

cleanup().catch(console.error);

