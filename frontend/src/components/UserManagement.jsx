// src/components/UserManagement.js
import React, { useState } from 'react';
import { getAuth } from 'firebase/auth'; // Ya no necesitas createUserWithEmailAndPassword
import { doc, setDoc } from 'firebase/firestore'; // No se usarán directamente aquí, pero se mantienen

const UserManagement = () => { // Ya no necesita props, se usará el hook de autenticación
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRole] = useState('operador');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const auth = getAuth();

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validación básica del frontend
    if (!name || !email || !password || !rol) {
      setError('Todos los campos son obligatorios.');
      return;
    }

    try {
      // Obtener el token de autenticación del usuario actual para la llamada al backend
      const userToken = await auth.currentUser.getIdToken();
      const operatorUid = auth.currentUser.uid;
      const operatorRol = 'administrador';

      const response = await fetch('/api/createSystemUser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
          'x-operator-uid': operatorUid,
          'x-operator-rol': operatorRol,
        },
	      body: JSON.stringify({ email, password, name, rol }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setEmail('');
        setPassword('');
        setName('');
        setRole('operador');
        // Usar alert o un componente más amigable para el mensaje de éxito
        alert('Personal creado exitosamente. ¡La contraseña es la que introdujiste!');
      } else {
        setError(data.message || 'Error al crear el usuario.');
      }
    } catch (err) {
      console.error('Error en la llamada al backend:', err);
      setError('Error de conexión con el servidor. Por favor, intenta de nuevo.');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-indigo-700 mb-4">Gestión de Personal</h2>
      <p className="text-gray-600 mb-6">
        Crea nuevos usuarios del sistema y asigna sus roles.
      </p>
      <form onSubmit={handleCreateUser} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
          <input
            type="text"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Contraseña Temporal</label>
          <input
            type="password"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Rol</label>
          <select
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            value={rol}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="administrador">Administrador</option>
            <option value="supervisor">Supervisor</option>
            <option value="operador">Operador</option>
            <option value="medico">Médico</option>
          </select>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-500 text-sm">¡Usuario creado con éxito!</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-full hover:bg-blue-700 transition"
        >
          Crear Personal
        </button>
      </form>
    </div>
  );
};

export default UserManagement;

