import React, { createContext, useContext, useEffect, useState } from 'react';
import { PAYMENTS_KEY } from '../constants/storageKeys';

const PaymentsContext = createContext(null);

export function PaymentsProvider({ children }) {
  const [payments, setPayments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PAYMENTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setPayments(Array.isArray(arr) ? arr : []);
    } catch { setPayments([]); }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments)); } catch {}
  }, [payments, loaded]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PAYMENTS_KEY) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          setPayments(Array.isArray(arr) ? arr : []);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // APIs simples (compatível com o que você já faz no Payments.jsx)
  const upsertPayment = (payment) => {
    setPayments(prev => {
      const idx = prev.findIndex(p => p.id === payment.id);
      if (idx === -1) return [payment, ...prev];
      const next = [...prev]; next[idx] = { ...prev[idx], ...payment }; return next;
    });
  };
  const removePayment = (id) => setPayments(prev => prev.filter(p => p.id !== id));
  const replaceAll = (arr) => setPayments(Array.isArray(arr) ? arr : []);

  return (
    <PaymentsContext.Provider value={{ payments, loaded, upsertPayment, removePayment, replaceAll, setPayments }}>
      {children}
    </PaymentsContext.Provider>
  );
}

export const usePayments = () => {
  const ctx = useContext(PaymentsContext);
  if (!ctx) throw new Error('usePayments must be used within PaymentsProvider');
  return ctx;
};
