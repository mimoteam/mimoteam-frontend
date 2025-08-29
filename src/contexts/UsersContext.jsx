import React, { createContext, useContext, useEffect, useState } from 'react';
import { USERS_KEY } from '../constants/storageKeys';

const UsersContext = createContext(null);

export function UsersProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setUsers(Array.isArray(arr) ? arr : []);
    } catch { setUsers([]); }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch {}
  }, [users, loaded]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === USERS_KEY) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          setUsers(Array.isArray(arr) ? arr : []);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // APIs básicas (se você quiser manipular também por aqui)
  const addUser = (u) => setUsers(prev => [u, ...prev]);
  const updateUser = (id, patch) =>
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...patch } : u)));
  const removeUser = (id) => setUsers(prev => prev.filter(u => u.id !== id));

  return (
    <UsersContext.Provider value={{ users, loaded, addUser, updateUser, removeUser, setUsers }}>
      {children}
    </UsersContext.Provider>
  );
}

export const useUsers = () => {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within UsersProvider');
  return ctx;
};
