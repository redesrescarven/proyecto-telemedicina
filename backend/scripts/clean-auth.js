// backend/scripts/clean-auth.js
const admin = require('firebase-admin');

// Configuración
const serviceAccount = require('../config/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const deleteAllUsers = async () => {
  let deletedCount = 0;
  let nextToken;
  
  console.log('🗑️  Iniciando limpieza de Firebase Auth...');
  
  do {
    // Listar usuarios en lotes de 1000 (límite de Firebase)
    const listUsersResult = await admin.auth().listUsers(1000, nextToken);
    
    // Filtrar: NO borrar el usuario de servicio ni administradores críticos
    const usersToDelete = listUsersResult.users.filter(user => {
      const email = user.email?.toLowerCase() || '';
      // Excluir cuentas de servicio y administradores del sistema
      return !email.includes('serviceaccount') && 
             !email.includes('firebase-adminsdk') &&
             !user.customClaims?.isSystemAdmin;
    });
    
    if (usersToDelete.length > 0) {
      const uids = usersToDelete.map(u => u.uid);
      await admin.auth().deleteUsers(uids);
      deletedCount += uids.length;
      console.log(`🗑️  Eliminados ${uids.length} usuarios de Auth (Total: ${deletedCount})`);
    }
    
    nextToken = listUsersResult.pageToken;
  } while (nextToken);
  
  console.log(`✅ Limpieza completada. Total eliminados de Auth: ${deletedCount}`);
};

// Ejecutar con confirmación
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('⚠️  ¿Estás SEGURO de borrar TODOS los usuarios de Firebase Auth? (escribe YES para confirmar): ', async (answer) => {
  if (answer === 'YES') {
    await deleteAllUsers();
  } else {
    console.log('❌ Operación cancelada');
  }
  rl.close();
  process.exit(0);
});

