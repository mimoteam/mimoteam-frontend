// frontend/src/api/costs.js
import { httpClient as api } from "./http";

/* ---------------- helpers ---------------- */
const normalize = (res) => {
  const items = Array.isArray(res?.items)
    ? res.items
    : Array.isArray(res?.data)
    ? res.data
    : Array.isArray(res)
    ? res
    : [];

  const total    = Number(res?.total ?? res?.totalRecords ?? res?.count ?? items.length);
  const page     = Number(res?.page ?? 1);
  const pageSize = Number(res?.pageSize ?? res?.limit ?? items.length);

  return { items, total, page, pageSize };
};

const normId = (x) => ({ ...x, id: String(x?._id ?? x?.id) });

/* ---------------- list ------------------- */
// GET /costs  (retorna { items, total, page, pageSize })
export const listCosts = async (params = {}) => {
  const { data } = await api.get("/costs", { params });
  const norm = normalize(data);
  return { ...norm, items: norm.items.map(normId) };
};

/* ---------------- create ----------------- */
// POST /costs
export const createCost = async (payload) => {
  const { data } = await api.post("/costs", payload);
  return normId(data);
};

/* ---------------- update ----------------- */
// PATCH /costs/:id  (fallback para PUT)
export const updateCost = async (id, payload) => {
  try {
    const { data } = await api.patch(`/costs/${id}`, payload);
    return normId(data);
  } catch {
    const { data } = await api.put(`/costs/${id}`, payload);
    return normId(data);
  }
};

/* ---------------- delete ----------------- */
// DELETE /costs/:id
export const deleteCost = async (id) => {
  const { data } = await api.delete(`/costs/${id}`);
  return data;
};

/* ---------------- import ----------------- */
// POST /costs/import  { items: [...] }
// Fallback: tenta /costs/bulk; se não existir, faz POST item a item.
export const importCosts = async (items) => {
  try {
    const { data } = await api.post("/costs/import", { items });
    return data;
  } catch (e1) {
    try {
      const { data } = await api.post("/costs/bulk", { items });
      return data;
    } catch (e2) {
      // fallback simples
      const created = [];
      // sequencial para manter simplicidade (pode paralelizar se preferir)
      for (const it of items) {
        const c = await createCost(it);
        created.push(c);
      }
      return { inserted: created.length, items: created };
    }
  }
};

/* ---------------- export ----------------- */
// GET /costs/export → array
// Fallback: usa listCosts(pageSize alto) e devolve apenas os items
export const exportCosts = async (params = {}) => {
  try {
    const { data } = await api.get("/costs/export", { params });
    return Array.isArray(data) ? data.map(normId) : normalize(data).items.map(normId);
  } catch {
    const res = await listCosts({ page: 1, pageSize: 5000, ...params });
    return res.items;
  }
};

/* ---------------- clear all -------------- */
// DELETE /costs  (apaga tudo)
// Fallback: lista e deleta um a um
export const clearAllCosts = async () => {
  try {
    const { data } = await api.delete("/costs");
    return data;
  } catch {
    const res = await listCosts({ page: 1, pageSize: 5000 });
    for (const r of res.items) {
      // ignore erros individuais
      try { await deleteCost(r.id); } catch {}
    }
    return { ok: true, deleted: res.items.length };
  }
};

export default {
  listCosts,
  createCost,
  updateCost,
  deleteCost,
  importCosts,
  exportCosts,
  clearAllCosts,
};
