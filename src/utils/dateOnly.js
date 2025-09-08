// src/api/users.js
import { api, toAbsoluteUrl } from "./http";

const LS_KEY = "users_store_v1";

/* ================= helpers localStorage ================= */
function loadLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveLS(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {}
}
function stableId(u) {
  const base = (u?._id || u?.id || u?.email || u?.login || "")
    .toString()
    .trim()
    .toLowerCase();
  return base
    ? ("uid_" + base.replace(/[^a-z0-9]+/g, "_")).replace(/_+$/, "")
    : "uid_" + Math.random().toString(36).slice(2, 10);
}

/* ============== normalização de avatar/url ============== */
function normalizeAvatarUrlLike(u) {
  if (!u || typeof u !== "object") return u;
  const raw =
    u.avatarUrl ||
    u.photoUrl ||
    u.imageUrl ||
    u.avatar ||
    u.url ||
    u.location ||
    u.secure_url ||
    u.path ||
    "";
  const avatarUrl = toAbsoluteUrl(raw);
  return { ...u, avatarUrl };
}

/* ================= normalização ================= */
function normalizeUser(u) {
  if (!u || typeof u !== "object") return u;
  const real = u._id || u.id;
  const id = real || stableId(u);
  return normalizeAvatarUrlLike({
    ...u,
    _id: real || id,
    id: real || id,
  });
}

function normalizeUsersResponse(res) {
  const itemsRaw = Array.isArray(res?.items)
    ? res.items
    : Array.isArray(res?.data)
    ? res.data
    : [];
  const items = itemsRaw.map(normalizeUser);
  const total = Number(res?.total ?? res?.totalRecords ?? res?.count ?? items.length);
  const page = Number(res?.page ?? 1);
  const pageSize = Number(res?.pageSize ?? res?.limit ?? items.length);
  return { items, total, page, pageSize };
}

function buildQS(obj = {}) {
  const qs = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  return qs.toString();
}

/* ============== GET /users (com variações) + fallback ============== */
export async function fetchUsers({
  role,
  status,
  page = 1,
  pageSize = 50,
  q,
  search,
} = {}) {
  try {
    const qs = buildQS({ role, status, page, pageSize, q, search });
    const res = await api(`/users?${qs}`);
    return normalizeUsersResponse(res);
  } catch (e1) {
    try {
      const limit = pageSize;
      const offset = (page - 1) * pageSize;
      const qs2 = buildQS({ role, status, limit, offset, q, search });
      const res2 = await api(`/users?${qs2}`);
      return normalizeUsersResponse(res2);
    } catch (e2) {
      try {
        const role2 = role === "partner" ? "Partner" : role;
        const qs3 = buildQS({ role: role2, page, pageSize, q, search });
        const res3 = await api(`/users?${qs3}`);
        return normalizeUsersResponse(res3);
      } catch {
        const all = loadLS();
        const filtered = all.filter((u) => {
          const okRole = role
            ? String(u.role).toLowerCase() === String(role).toLowerCase()
            : true;
          const okStatus = status
            ? String(u.status || "active").toLowerCase() === String(status).toLowerCase()
            : true;
          return okRole && okStatus;
        });
        return {
          items: filtered.map(normalizeUser),
          total: filtered.length,
          page: 1,
          pageSize: filtered.length,
        };
      }
    }
  }
}

/* ============== ME / BY ID (normalizados) ============== */
export async function getMe() {
  try {
    const r = await api("/auth/me");
    const user = normalizeUser(r?.user || r);
    return user;
  } catch (e1) {
    try {
      const r2 = await api("/users/me");
      return normalizeUser(r2?.user || r2);
    } catch {
      try {
        const raw = localStorage.getItem("current_user_v1");
        return raw ? normalizeUser(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    }
  }
}

export async function getUserById(id) {
  try {
    const r = await api(`/users/${id}`);
    if (Array.isArray(r?.items)) return normalizeUser(r.items[0] || null);
    return normalizeUser(r);
  } catch {
    const all = loadLS();
    const found = all.find((u) => (u._id || u.id) === id) || null;
    return normalizeUser(found);
  }
}

/* ============== POST /users + fallback LS ============== */
export async function createUser(payload) {
  try {
    const created = await api("/users", { method: "POST", body: payload });
    return normalizeUser(created?.user || created);
  } catch {
    const all = loadLS();
    const id = stableId(payload);
    const now = new Date().toISOString();
    const user = normalizeUser({
      _id: id,
      id,
      fullName: payload.fullName,
      email: String(payload.email || "").toLowerCase(),
      login: String(payload.login || "").toLowerCase(),
      password: payload.password || "",
      role: payload.role || "partner",
      funcao: payload.funcao || "",
      team: payload.team || "",
      status: payload.status || "active",
      createdAt: now,
      updatedAt: now,
    });
    all.unshift(user);
    saveLS(all);
    return user;
  }
}

/* ============== PATCH/PUT /users/:id (com fallbacks) ============== */
async function tryUpdateRoutes(id, patch) {
  const body = { ...patch, _id: id, id };

  try {
    const r = await api(`/users/${id}`, { method: "PATCH", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  try {
    const r = await api(`/users/${id}`, { method: "PUT", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  try {
    const r = await api(`/users/me`, { method: "PATCH", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  try {
    const r = await api(`/users/me`, { method: "PUT", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  try {
    const r = await api(`/users/${id}`, { method: "POST", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  try {
    const r = await api(`/users`, { method: "PATCH", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  try {
    const r = await api(`/users`, { method: "PUT", body });
    return r?.user ? normalizeUser(r.user) : normalizeUser(r);
  } catch {}

  throw new Error("UPDATE_ROUTES_NOT_AVAILABLE");
}

export async function updateUser(idParam, patch) {
  const id = String(idParam || patch?._id || patch?.id || "").trim();
  if (!id) {
    const merged = await updateLocalUser(stableId(patch), patch);
    return merged;
  }
  const body = { ...patch };
  try {
    const updated = await tryUpdateRoutes(id, body);
    return updated;
  } catch {
    const merged = await updateLocalUser(id, { ...patch, _id: id, id });
    return merged;
  }
}

async function updateLocalUser(id, patch) {
  const all = loadLS();
  const next = all.map((u) => {
    if ((u._id || u.id) === id) {
      return normalizeUser({
        ...u,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    }
    return u;
  });
  saveLS(next);
  return next.find((u) => (u._id || u.id) === id) || normalizeUser({ ...patch, _id: id, id });
}

/* ============== Troca de senha ============== */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const body = { userId, currentPassword, newPassword };

  try {
    return await api("/auth/change-password", { method: "POST", body });
  } catch {}

  try {
    return await api(`/users/${userId}/password`, { method: "POST", body: { currentPassword, newPassword } });
  } catch {}

  try {
    return await api(`/users/me/password`, { method: "POST", body: { currentPassword, newPassword } });
  } catch {}

  const all = loadLS();
  const idx = all.findIndex((u) => (u._id || u.id) === userId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], password: newPassword };
    saveLS(all);
  }
  return { ok: true, local: true };
}

/* ============== Upload de avatar (enxuto e robusto) ============== */
export async function uploadAvatar(userId, file) {
  // Tenta /upload/avatar com FormData: { file, userId }
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("userId", userId);
    const r = await api("/upload/avatar", { method: "POST", body: fd });
    const url = toAbsoluteUrl(
      r?.avatarUrl || r?.url || r?.location || r?.secure_url || r?.path || ""
    );
    if (url) return { avatarUrl: url };
  } catch {}

  // Tenta /users/:id/avatar com FormData: { file }
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await api(`/users/${userId}/avatar`, { method: "POST", body: fd });
    const url = toAbsoluteUrl(
      r?.avatarUrl || r?.url || r?.location || r?.secure_url || r?.path || ""
    );
    if (url) return { avatarUrl: url };
  } catch {}

  // Fallback: devolve um dataURL para o front pré-visualizar e cachear localmente
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { avatarUrl: String(dataUrl) };
}

/* ============== Remover avatar (PATCH determinístico) ============== */
export async function deleteAvatar(userId) {
  try {
    const r = await api(`/users/${userId}`, {
      method: "PATCH",
      body: { avatarUrl: "", photoUrl: "", imageUrl: "", avatar: null, photo: null, image: null },
    });
    const maybe = r?.user || r;
    return { ok: true, user: normalizeUser(maybe), avatarUrl: "" };
  } catch {
    // Mesmo sem endpoint, devolvemos ok:true para permitir limpeza local no front
    return { ok: true, local: true, avatarUrl: "" };
  }
}

/* ============== DELETE /users/:id + fallback LS ============== */
export async function deleteUser(id) {
  try {
    return await api(`/users/${id}`, { method: "DELETE" });
  } catch {
    const all = loadLS().filter((u) => (u._id || u.id) !== id);
    saveLS(all);
    return { deleted: true };
  }
}

/* ============== exports de compatibilidade ============== */
export const listUsers = fetchUsers;
export const createUserApi = createUser;
export const updateUserApi = updateUser;
export const deleteUserApi = deleteUser;

/* default */
export default {
  fetchUsers,
  listUsers,
  getMe,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  uploadAvatar,
  deleteAvatar,
  deleteUser,
};
