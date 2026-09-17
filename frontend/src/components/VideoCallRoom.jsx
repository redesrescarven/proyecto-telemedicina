import React, { useEffect, useRef, useState } from 'react';
import { db } from '../App';
import {
    doc,
    onSnapshot,
    updateDoc,
    collection,
    addDoc
} from 'firebase/firestore';

import config from '../config';

const VideoCallRoom = () => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('id');
    const role = params.get('role'); 
    const appId = "default-app-id"; 

    const [status, setStatus] = useState('conectando...');
    const [isEnded, setIsEnded] = useState(false);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnection = useRef(null);

    useEffect(() => {
        if (!roomId || roomId === "null") return;

        const sessionRef = doc(db, "artifacts", appId, "public", "data", "telemedicineSessions", roomId);
        const iceCandidatesRef = collection(sessionRef, 'iceCandidates');

        const startCall = async () => {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            peerConnection.current = pc;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            } catch (e) {
                setStatus("Error de periféricos");
            }

            pc.ontrack = (event) => {
                if (remoteVideoRef.current && event.streams[0]) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    setStatus("En vivo");
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    addDoc(iceCandidatesRef, { ...event.candidate.toJSON(), sender: role });
                }
            };

            onSnapshot(iceCandidatesRef, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.sender !== role) {
                            pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
                        }
                    }
                });
            });

            const unsubscribe = onSnapshot(sessionRef, async (snapshot) => {
                const data = snapshot.data();
                if (!data) return;

                if (role === 'doctor') {
                    if (!pc.localDescription) {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        await updateDoc(sessionRef, { sdpOffer: JSON.stringify(offer) });
                    }
                    if (data.sdpAnswer && !pc.remoteDescription) {
                        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.sdpAnswer)));
                    }
                } else {
                    if (data.sdpOffer && !pc.remoteDescription) {
                        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.sdpOffer)));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        await updateDoc(sessionRef, { sdpAnswer: JSON.stringify(answer) });
                    }
                }
            });
            return unsubscribe;
        };

        const cleanupPromise = startCall();
        return () => {
            if (peerConnection.current) peerConnection.current.close();
            cleanupPromise.then(unsub => unsub && unsub());
        };
    }, [roomId, role]);

    const handleHangUp = async () => {
        // Detener cámara y micro
        if (localVideoRef.current && localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
        if (peerConnection.current) peerConnection.current.close();

        // Informar a Firebase
        const sessionRef = doc(db, "artifacts", appId, "public", "data", "telemedicineSessions", roomId);
        await updateDoc(sessionRef, { videoCallStatus: 'ended' }).catch(() => {});

        if (role === 'doctor') {
            window.close(); // En PC cierra la pestaña
        } else {
            setIsEnded(true); // En App muestra pantalla de retorno
        }
    };

    // --- VISTA DE FINALIZACIÓN ---
    if (isEnded) {
        return (
            <div style={{ height: '100vh', width: '100vw', backgroundColor: '#f4f4f4', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
                <h2>La video llamada ha finalizado.</h2>
                <button 
                    onClick={() => window.location.href = "return-to-chat://now"}
                    style={{ padding: '15px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '50px', fontSize: '18px', fontWeight: 'bold', marginTop: '20px' }}
                >
                    Regresar al Chat de Telemedicina
                </button>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#000', height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* VIDEO REMOTO (Siempre ocupa todo) */}
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

            {/* VIDEO LOCAL (Solo visible para el Médico) */}
            <video 
                ref={localVideoRef} 
                autoPlay playsInline muted 
                style={{ 
                    display: role === 'doctor' ? 'block' : 'none', // ❌ OCULTO PARA PACIENTE
                    position: 'absolute', bottom: '100px', right: '20px', 
                    width: '120px', borderRadius: '10px', border: '2px solid #fff' 
                }} 
            />

            {/* BOTÓN FINALIZAR (Visible para ambos) */}
            <div style={{ position: 'absolute', bottom: '30px', width: '100%', display: 'flex', justifyContent: 'center' }}>
                <button 
                    onClick={handleHangUp}
                    style={{ padding: '15px 40px', background: '#ff3b30', color: 'white', border: 'none', borderRadius: '50px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                    Finalizar Llamada
                </button>
            </div>

            {/* STATUS */}
            <div style={{ position: 'absolute', top: '20px', width: '100%', textAlign: 'center' }}>
                <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '5px 15px', borderRadius: '20px', fontSize: '12px' }}>
                    {role === 'doctor' ? 'PANEL MÉDICO' : 'PACIENTE'} | {status}
                </span>
            </div>
        </div>
    );
};

export default VideoCallRoom;

