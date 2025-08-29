import React, { createContext, useContext, useEffect, useState } from 'react';
import { TASKS_KEY } from '../constants/storageKeys';

const TasksContext = createContext(null);

export function TasksProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TASKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setTasks(Array.isArray(arr) ? arr : []);
    } catch { setTasks([]); }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {}
  }, [tasks, loaded]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === TASKS_KEY) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          setTasks(Array.isArray(arr) ? arr : []);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addTask = (text) =>
    setTasks(prev => [{ id: crypto?.randomUUID?.() || Date.now(), text, completed: false }, ...prev]);
  const toggleTask = (id) =>
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t)));
  const removeTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));
  const clearTasks = () => setTasks([]);

  return (
    <TasksContext.Provider value={{ tasks, loaded, addTask, toggleTask, removeTask, clearTasks, setTasks }}>
      {children}
    </TasksContext.Provider>
  );
}

export const useTasks = () => {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
};
