// src/api/handover.js
import { api } from './http';

export const HN_PATHS = [
  '/api/handover',
  '/handover',
  '/handover-notes',
  '/shift-handover',
];

async function tryFirst(method, paths, dataOrConfig = {}) {
  let lastErr;
  for (const path of paths) {
    try {
      if (method === 'get')   return await api.get(path, dataOrConfig);
      if (method === 'post')  return await api.post(path, dataOrConfig);
      if (method === 'patch') return await api.patch(path, dataOrConfig);
      if (method === 'delete')return await api.delete(path, dataOrConfig);
      throw new Error(`Unsupported method: ${method}`);
    } catch (e) {
      const code = e?.status ?? e?.response?.status ?? 0;
      if (code === 401 || code === 403) throw e; // sem auth, não adianta tentar os outros
      if (code === 404) { lastErr = e; continue; } // tenta próximo caminho
      lastErr = e; // outro erro: guarda e tenta próximo; se acabar a lista, lança
    }
  }
  throw lastErr || new Error('Handover API not found');
}

/* ---------- normalizadores ---------- */
const normComment = (c = {}) => ({
  id: String(c._id || c.id || ''),
  body: c.body ?? c.text ?? '',
  author: c.authorName || c.author || c.createdByName || c.createdBy || '',
  createdAt: c.createdAt || c.created_at || new Date().toISOString(),
});

const normNote = (n = {}) => ({
  id: String(n._id || n.id || ''),
  type: n.type ?? n.noteType ?? 'To Know',
  tag: n.tag ?? n.colorTag ?? 'info',
  body: n.body ?? n.text ?? '',
  createdAt: n.createdAt || n.created_at || new Date().toISOString(),
  author: n.authorName || n.author || n.createdByName || n.createdBy || '',
  comments: Array.isArray(n.comments) ? n.comments.map(normComment) : [],
});

/* ---------- API ---------- */
export async function listNotes({ page = 1, pageSize = 200, q, type, tag, includeTotal = 1 } = {}) {
  const params = { page, pageSize, includeTotal };
  if (q) params.q = q;
  if (type) params.type = type;
  if (tag) params.tag = tag;

  const res = await tryFirst('get', HN_PATHS, { params });
  const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
  return items.map(normNote);
}

export async function createNote({ type, tag, body }) {
  const payload = { type, tag, body };
  const created = await tryFirst('post', HN_PATHS, payload);
  return normNote(created?.item || created);
}

export async function deleteNote(id) {
  await tryFirst('delete', HN_PATHS.map(p => `${p}/${id}`));
  return { ok: true };
}

export async function addComment(noteId, { body }) {
  // tenta rota dedicada de comentários
  try {
    const updated = await tryFirst('post', HN_PATHS.map(p => `${p}/${noteId}/comments`), { body });
    return updated?.comments ? normNote(updated) : updated;
  } catch (e) {
    // fallback: PATCH do note (para backends alternativos)
    const patched = await tryFirst('patch', HN_PATHS.map(p => `${p}/${noteId}`), { addComment: true, body });
    return patched?.comments ? normNote(patched) : patched;
  }
}
