// clean-database.js
const admin = require('firebase-admin');
const readline = require('readline');

const APP_ID = process.env.APP_ID || 'default-app-id';
const CONFIG_PATH = process.env.CONFIG_PATH || '../config/serviceAccountKey.json';

try {
  const serviceAccount = require(CONFIG_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('✅ Firebase Admin SDK inicializado');
} catch (error) {
  console.error('❌ Error cargando serviceAccountKey.json. Verifica la ruta:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = (q) => new Promise(res => rl.question(q, ans => res(ans.trim().toLowerCase() === 'yes')));

// Función recursiva para borrar colecciones
const deleteCollection = async (path, batchSize = 100) => {
  const ref = db.collection(path);
  let deleted = 0;
  const snapshot = await ref.limit(batchSize).get();
  if (snapshot.empty) return 0;

  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  deleted += snapshot.size;
  console.log(`🗑️ Eliminados ${deleted} documentos de: ${path}`);
  
  return snapshot.size === batchSize ? deleted + await deleteCollection(path, batchSize) : deleted;
};

// Borrar subcolecciones de un documento
const deleteSubcollections = async (docPath) => {
  const docRef = db.doc(docPath);
  const snapshot = await docRef.listCollections();
  for (const col of snapshot) {
    await deleteCollection(col.path);
  }
  await docRef.delete();
};

const main = async () => {
  console.log(`\n🧹 LIMPIEZA DE BASE DE DATOS (App ID: ${APP_ID})`);
  console.log('⚠️  ESTE PROCESO ES IRREVERSIBLE\n');

  if (!(await ask('¿Estás SEGURO? (yes/no): '))) return;
  if (!(await ask('Última confirmación (yes/no): '))) return;

  try {
    const base = `artifacts/${APP_ID}`;
    
    // 1. Borrar usuarios y sus subcolecciones (historias médicas, perfiles, etc.)
    console.log('\n👥 Limpiando usuarios...');
    const usersSnap = await db.collection(`${base}/users`).get();
    let uCount = 0;
    for (const doc of usersSnap.docs) {
      await deleteSubcollections(doc.ref.path);
      uCount++;
    }
    console.log(`✅ ${uCount} usuarios y sus datos eliminados.`);

    // 2. Borrar datos públicos (emergencias, telemedicinas)
    console.log('\n🚨 Limpiando datos públicos...');
    await deleteCollection(`${base}/public/data/emergencyRequests`);
    await deleteCollection(`${base}/public/data/telemedicineSessions`);
    console.log('✅ Emergencias y telemedicinas eliminadas.');

    console.log('\n🎉 ¡Limpieza completada exitosamente!');
  } catch (err) {
    console.error('❌ Error durante la limpieza:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
};

main();

