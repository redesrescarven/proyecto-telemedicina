// backend/deleteCollections.js
const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');

// Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Función para borrar una colección
async function deleteCollection(collectionPath) {
  console.log(`\n🚀 Iniciando eliminación de la colección: ${collectionPath}`);

  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`✅ La colección ${collectionPath} ya está vacía.`);
    return;
  }

  const batchSize = 10; // Firestore permite hasta 500 por lote, pero vamos seguro
  let deletedCount = 0;

  for (const doc of snapshot.docs) {
    await doc.ref.delete();
    deletedCount++;
    console.log(`🗑️  Eliminado: ${collectionPath}/${doc.id}`);
  }

  console.log(`✅ ${deletedCount} documentos eliminados de ${collectionPath}`);
}

// Colecciones a borrar
const collectionsToDelete = [
  'artifacts/default-app-id/public/data/emergencyRequests',
  'artifacts/default-app-id/public/data/telemedicineSessions'
];

// Ejecutar
async function run() {
  try {
    for (const path of collectionsToDelete) {
      await deleteCollection(path);
    }
    console.log('\n🎉 ¡Todas las colecciones han sido eliminadas completamente!');
    process.exit(0); // Finaliza el script
  } catch (error) {
    console.error('❌ Error al eliminar colecciones:', error);
    process.exit(1);
  }
}

run();

