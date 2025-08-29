import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'handover_notes_v1';

const HandoverContext = createContext(null);

function safeParse(raw, fallback = []) {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function uid() {
  return (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
}

/**
 * Note shape:
 * {
 *   id: string,
 *   type: 'TO_KNOW'|'TO_DO'|'QUESTION'|'VIP'|'GUIDELINE'|'CS',
 *   tag: 'URGENT'|'PENDING'|'ROUTINE'|'INFO',
 *   body: string,
 *   createdAt: string (ISO),
 *   createdBy: { name: string, role?: string },
 *   comments: [{ id, body, authorName, createdAt }]
 * }
 */

export const HandoverProvider = ({ children }) => {
  const [notes, setNotes] = useState([]);

  // hydrate
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    setNotes(safeParse(raw, []));
  }, []);

  // persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch {}
  }, [notes]);

  const addNote = useCallback((payload) => {
    const now = new Date().toISOString();
    const note = {
      id: uid(),
      type: payload.type,
      tag: payload.tag,
      body: payload.body?.trim() || '',
      createdAt: now,
      createdBy: { name: payload.createdByName || 'System', role: payload.createdByRole || '' },
      comments: []
    };
    setNotes(prev => [note, ...prev]);
    return note.id;
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const updateNote = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const addComment = useCallback((noteId, body, authorName) => {
    const b = (body || '').trim();
    if (!b) return;
    const comment = { id: uid(), body: b, authorName: authorName || 'System', createdAt: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, comments: [...n.comments, comment] } : n));
  }, []);

  const value = useMemo(() => ({
    notes,
    addNote,
    deleteNote,
    updateNote,
    addComment
  }), [notes, addNote, deleteNote, updateNote, addComment]);

  return <HandoverContext.Provider value={value}>{children}</HandoverContext.Provider>;
};

export const useHandover = () => {
  const ctx = useContext(HandoverContext);
  if (!ctx) throw new Error('useHandover must be used within HandoverProvider');
  return ctx;
};
