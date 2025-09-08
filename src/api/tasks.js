// src/api/tasks.js
import { api } from './http';

export const TASK_PATHS = [
  '/api/tasks',
  '/tasks',
  '/admin/tasks',
  '/dashboard/tasks',
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
      if (code === 401 || code === 403) throw e;
      if (code === 404) { lastErr = e; continue; }
      lastErr = e;
    }
  }
  throw lastErr || new Error('Tasks API not found');
}

/* ---------- normalizador ---------- */
const normTask = (t = {}) => ({
  id: String(t._id || t.id || ''),
  text: t.text ?? t.title ?? t.body ?? '',
  completed: Boolean(t.completed ?? t.done ?? (String(t.status).toLowerCase() === 'done')),
  status: (t.status || (t.completed ? 'done' : 'todo'))?.toLowerCase?.() || 'todo',
  createdAt: t.createdAt || t.created_at || new Date().toISOString(),
  createdBy: t.createdByName || t.createdBy || t.author || t.user || null,
});

/* ---------- API ---------- */
export async function listTasks({ page = 1, pageSize = 200, q, completed, status, assignedToId, includeTotal = 1 } = {}) {
  const params = { page, pageSize, includeTotal };
  if (q) params.q = q;
  if (typeof completed === 'boolean') params.completed = completed ? 1 : 0;
  if (status) params.status = status;
  if (assignedToId) params.assignedToId = assignedToId;

  const res = await tryFirst('get', TASK_PATHS, { params });
  const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
  return items.map(normTask);
}

export async function createTask({ text, priority, dueDate, assignedToId, assignedToName }) {
  const payload = { text, priority, dueDate, assignedToId, assignedToName };
  const created = await tryFirst('post', TASK_PATHS, payload);
  return normTask(created?.item || created);
}

export async function completeTask(id, done = true) {
  // Mantém compatibilidade: envia completed + status coerentes
  const body = { completed: !!done, status: done ? 'done' : 'in_progress' };
  const patched = await tryFirst('patch', TASK_PATHS.map(p => `${p}/${id}`), body);
  return normTask(patched?.item || patched);
}

export async function deleteTask(id) {
  await tryFirst('delete', TASK_PATHS.map(p => `${p}/${id}`));
  return { ok: true };
}
