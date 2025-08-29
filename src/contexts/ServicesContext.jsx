import React, { createContext, useContext, useEffect, useState } from 'react';
import { SERVICES_KEY } from '../constants/storageKeys';

const ServicesContext = createContext(null);

export function ServicesProvider({ children }) {
  const [services, setServices] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SERVICES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setServices(Array.isArray(arr) ? arr : []);
    } catch { setServices([]); }
    setLoaded(true);
  }, []);

  // persist
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(SERVICES_KEY, JSON.stringify(services)); } catch {}
  }, [services, loaded]);

  // sync cross-tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SERVICES_KEY) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          setServices(Array.isArray(arr) ? arr : []);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // helpers (opcional): você já cria/edita serviços em Services.jsx
  const setAllServices = (arr) => setServices(Array.isArray(arr) ? arr : []);

  return (
    <ServicesContext.Provider value={{ services, loaded, setAllServices }}>
      {children}
    </ServicesContext.Provider>
  );
}

export const useServices = () => {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used within ServicesProvider');
  return ctx;
};
