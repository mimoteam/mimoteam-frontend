// src/contexts/NotificationsContext.jsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const Ctx = createContext(null);

// chave por canal no localStorage
const keyFor = (channel) => `notif_inbox_v2_${channel || "global"}`;

function readChannel(channel) {
  try {
    const raw = localStorage.getItem(keyFor(channel));
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeChannel(channel, list) {
  try { localStorage.setItem(keyFor(channel), JSON.stringify(list)); } catch {}
}

// util
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function NotificationsProvider({ children }) {
  // canal “ativo” é decidido no hook useNotifications(channel)
  // aqui mantemos só helpers “multicanal”
  const addNotification = useCallback((n) => {
    const channel = n.channel || "global";
    const list = readChannel(channel);
    const item = {
      id: n.id || uid(),
      title: n.title || "Notice",
      message: n.message || "",
      kind: n.kind || "info",
      pageId: n.pageId || "",
      timestamp: n.timestamp || Date.now(),
      meta: n.meta || {},
      read: !!n.read,
    };
    writeChannel(channel, [item, ...list].slice(0, 500)); // keep last 500
    return item.id;
  }, []);

  // debug helper (mantém compat com seu __notify)
  useEffect(() => {
    const fn = (payload) => {
      if (typeof payload === "string") {
        addNotification({ title: "Notice", message: payload, channel: "global" });
      } else {
        addNotification(payload || {});
      }
    };
    try { window.__notify = fn; } catch {}
    return () => { try { if (window.__notify === fn) delete window.__notify; } catch {} };
  }, [addNotification]);

  const api = useMemo(() => ({ addNotification }), [addNotification]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// Hook por canal (default: “global”)
export function useNotifications(channel = "global") {
  const { addNotification } = useContext(Ctx) || {};
  const [list, setList] = useState(() => readChannel(channel));

  // carregar/atualizar quando canal muda
  useEffect(() => { setList(readChannel(channel)); }, [channel]);

  // reagir a alterações via “storage” (outras abas / código externo)
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || !e.key.startsWith('notif_inbox_v2_')) return;
      if (e.key === keyFor(channel)) setList(readChannel(channel));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [channel]);

  const markAllRead = useCallback(() => {
    const cur = readChannel(channel).map(n => ({ ...n, read: true }));
    writeChannel(channel, cur); setList(cur);
  }, [channel]);

  const removeNotification = useCallback((id) => {
    const cur = readChannel(channel).filter(n => n.id !== id);
    writeChannel(channel, cur); setList(cur);
  }, [channel]);

  const unread = useMemo(() => list.filter(n => !n.read).length, [list]);

  return { list, unread, addNotification, markAllRead, removeNotification };
}
