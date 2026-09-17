const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Ruta para el chat móvil
router.get('/mobile/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { userId, userName } = req.query;

        console.log('📱 Chat solicitado - SessionID:', sessionId, 'User:', userName);

        // Configuración de Firebase - MOVIDA FUERA del try-catch
        const firebaseConfig = {
            apiKey: "AIzaSyCOlR4FQ5E2NrwCrMS9uE5cfbgha0oj56A",
            authDomain: "botonemergenciaapp.firebaseapp.com",
            projectId: "botonemergenciaapp",
            storageBucket: "botonemergenciaapp.firebasestorage.app",
            messagingSenderId: "359428132408",
            appId: "1:359428132408:web:c603c37fc3656e835d60cd"
        };

        // Renderizar página HTML para el chat
        res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Chat de Telemedicina</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f0f2f5;
            height: 100vh;
            overflow: hidden;
            position: fixed;
            width: 100%;
        }

        .chat-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            width: 100%;
        }

        .header {
            background: #1976d2;
            color: white;
            padding: 15px;
            text-align: center;
            position: fixed;
            top: 0;
            width: 100%;
            z-index: 1000;
            height: 60px;
        }

        .messages-container {
            flex: 1;
            padding: 70px 10px 70px 10px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            margin-top: 0;
        }

        .message {
            margin-bottom: 12px;
            padding: 12px;
            border-radius: 18px;
            max-width: 85%;
            word-wrap: break-word;
            position: relative;
        }

        .own-message {
            background: #1976d2;
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
            margin-left: auto;
        }

        .other-message {
            background: white;
            color: #333;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            margin-right: auto;
        }

        .message-sender {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 4px;
            opacity: 0.9;
        }

        .message-text {
            fontSize: 14px;
            line-height: 1.4;
        }

        .input-container {
            padding: 10px;
            background: white;
            border-top: 1px solid #e0e0e0;
            display: flex;
            align-items: center;
            position: fixed;
            bottom: 0;
            width: 100%;
            z-index: 1000;
        }

        .input-container input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid #ddd;
            border-radius: 24px;
            margin-right: 10px;
            font-size: 16px;
            outline: none;
            -webkit-appearance: none;
        }

        .input-container input:focus {
            border-color: #1976d2;
        }

        .input-container button {
            padding: 12px 20px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 24px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
        }

        .input-container button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .messages-container::-webkit-scrollbar {
            width: 4px;
        }

        .messages-container::-webkit-scrollbar-track {
            background: #f1f1f1;
        }

        .messages-container::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 2px;
        }

        /* 🆕 Estilos para debug */
        .debug-console {
            position: fixed;
            top: 60px;
            right: 10px;
            width: 300px;
            height: 200px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px;
            overflow-y: auto;
            z-index: 9999;
            font-size: 12px;
            border-radius: 5px;
            display: none;
        }

        .debug-btn {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            padding: 5px 10px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
    </style>
    
    <!-- Firebase version actualizada -->
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <h2 style="font-size: 18px; margin: 0;">Consulta de Telemedicina</h2>
        </div>

        <div class="messages-container" id="messages"></div>

        <div class="input-container">
            <input type="text" id="messageInput" placeholder="Escribe tu mensaje..." autocomplete="off">
            <button onclick="sendMessage()" id="sendButton">Enviar</button>
        </div>
    </div>

    <!-- 🆕 Botón y consola de debug -->
    <button class="debug-btn" onclick="toggleDebug()">DEBUG</button>
    <div class="debug-console" id="debugConsole"></div>

    <script>
    // CONFIGURACIÓN INICIAL
    const backendUrl = 'http://181.225.58.220:4000';
    const sessionId = '${sessionId}';
    const userId = '${userId}';
    const userName = '${userName}';

    // CONFIGURACIÓN DE FIREBASE - ACCESIBLE GLOBALMENTE
    const firebaseConfig = {
        apiKey: "AIzaSyCOlR4FQ5E2NrwCrMS9uE5cfbgha0oj56A",
        authDomain: "botonemergenciaapp.firebaseapp.com",
        projectId: "botonemergenciaapp",
        storageBucket: "botonemergenciaapp.firebasestorage.app",
        messagingSenderId: "359428132408",
        appId: "1:359428132408:web:c603c37fc3656e835d60cd"
    };

    console.log('🚀 INICIANDO WEBVIEW - Session:', sessionId, 'User:', userName);
    console.log('🔧 Configurando Firebase con projectId:', firebaseConfig.projectId);

    // 🆕 FUNCIÓN DE DEBUG
    function showDebugMessage(message, isError = false) {
        const debugDiv = document.getElementById('debugConsole') || createDebugConsole();
        const messageDiv = document.createElement('div');
        messageDiv.style.color = isError ? '#ff6b6b' : '#51cf66';
        messageDiv.style.padding = '4px';
        messageDiv.style.borderBottom = '1px solid #444';
        messageDiv.style.fontSize = '11px';
        messageDiv.textContent = new Date().toLocaleTimeString() + ' - ' + message;
        debugDiv.appendChild(messageDiv);
        debugDiv.scrollTop = debugDiv.scrollHeight;
        
        console.log(message);
    }

    function createDebugConsole() {
        const debugDiv = document.createElement('div');
        debugDiv.id = 'debugConsole';
        debugDiv.className = 'debug-console';
        document.body.appendChild(debugDiv);
        return debugDiv;
    }

    function toggleDebug() {
        const debugDiv = document.getElementById('debugConsole');
        debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
    }

    try {
        // Inicializar Firebase
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase no está cargado');
        }

        // Inicializar la app de Firebase
        firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase inicializado correctamente');

        const db = firebase.firestore();
        console.log('✅ Firestore inicializado');

        // Test de conexión
        db.collection('test').doc('connection').get()
            .then(() => console.log('✅ Conexión a Firestore exitosa'))
            .catch(error => console.error('❌ Error conectando a Firestore:', error));

        // Referencia a los mensajes
        const messagesRef = db.collection('artifacts')
            .doc('default-app-id')
            .collection('public')
            .doc('data')
            .collection('telemedicineSessions')
            .doc(sessionId)
            .collection('messages');

        console.log('📁 Referencia Firestore: ' + messagesRef.path);

        // Escuchar mensajes en tiempo real
        messagesRef.orderBy('timestamp').onSnapshot(
            (snapshot) => {
                console.log('📨 Snapshot recibido - Mensajes: ' + snapshot.size);
                
                const messagesContainer = document.getElementById('messages');
                if (!messagesContainer) {
                    console.error('❌ No se encuentra el contenedor de mensajes');
                    return;
                }

                messagesContainer.innerHTML = '';

                if (snapshot.empty) {
                    messagesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No hay mensajes aún</div>';
                    return;
                }

                snapshot.forEach(doc => {
                    const message = doc.data();
                    const messageElement = document.createElement('div');
                    messageElement.className = 'message ' + 
                        (message.senderId === userId ? 'own-message' : 'other-message');

                    messageElement.innerHTML = \`
                        <div class="message-sender">\${message.senderName || 'Desconocido'}</div>
                        <div class="message-text">\${message.text || ''}</div>
                        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
                            \${formatTime(message.timestamp)}
                        </div>
                    \`;
                    messagesContainer.appendChild(messageElement);
                });

                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            },
            (error) => {
                console.error('❌ Error en listener de mensajes:', error);
                alert('Error al cargar mensajes: ' + error.message);
            }
        );

        // Función para enviar mensajes
        window.sendMessage = function() {
            const input = document.getElementById('messageInput');
            const button = document.getElementById('sendButton');
            const text = input.value.trim();

            if (!text) {
                alert('Por favor escribe un mensaje');
                return;
            }

            console.log('📤 Intentando enviar mensaje:', text);
            button.disabled = true;

            const messageData = {
                senderId: userId,
                senderName: userName,
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            messagesRef.add(messageData)
                .then(docRef => {
                    console.log('✅ Mensaje enviado - ID:', docRef.id);
                    input.value = '';
                    button.disabled = false;
                })
                .catch(error => {
                    console.error('❌ Error enviando mensaje:', error);
                    alert('Error: ' + error.message);
                    button.disabled = false;
                });
        };

        // Focus en input
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) {
                input.focus();
                console.log('🎯 Input con focus');
            }
        }, 1000);

    } catch (error) {
        console.error('💥 Error crítico:', error);
        alert('Error inicial: ' + error.message);
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = timestamp.toDate();
            return date.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            return '';
        }
    }

    console.log('🟢 WebView completamente cargado');
    </script>
</body>
</html>`);

    } catch (error) {
        console.error('Error loading chat:', error);
        res.status(500).send('Error interno del servidor: ' + error.message);
    }
});


module.exports = router;

