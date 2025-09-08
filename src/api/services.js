// src/api/services.js
import { api } from './http';

/** Constrói a query string aceitando:
 * - paginação: page/pageSize (e compat limit/offset)
 * - sort: sortBy / sortDir
 * - filtros livres (partner / partnerId, serviceType / serviceTypeId, team, status, dateFrom/dateTo, etc.)
 * - busca textual: q (ou search)
 * - ids: array ou csv
 * - debug (liga via localStorage.debug_services = "1")
 */
function buildQuery(params = {}) {
  const { page, pageSize, sortBy, sortDir, filters = {}, search, q, ids } = params;
  const qs = new URLSearchParams();

  // paginação
  if (page != null) qs.set("page", String(page));
  if (pageSize != null) {
    qs.set("pageSize", String(pageSize));
    const p = Math.max(1, Number(page || 1));
    qs.set("limit", String(pageSize));
    qs.set("offset", String((p - 1) * Number(pageSize)));
  }

  // ordenação
  if (sortBy) qs.set("sortBy", String(sortBy));
  if (sortDir) qs.set("sortDir", String(sortDir).toLowerCase());

  // filtros simples (somente se vierem dentro de "filters")
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) qs.set(k, String(v));
  });

  // busca textual
  const text = (q ?? search);
  if (text) qs.set("q", String(text).trim());

  // seleção por ids
  if (Array.isArray(ids) && ids.length) {
    qs.set("ids", ids.map(String).join(","));
  } else if (typeof ids === "string" && ids.trim()) {
    qs.set("ids", ids.trim());
  }

  // debug
  try {
    if (localStorage.getItem("debug_services") === "1") qs.set("debug", "1");
  } catch {}

  // cache-buster
  qs.set("_ts", Date.now().toString());

  return qs.toString();
}

/* =========================
 * REST
 * ========================= */

export function fetchServices(params = {}) {
  const qs = buildQuery(params);
  // `api.get` já retorna JSON (não use .data)
  return api.get(`/services?${qs}`);
}

export function getService(id) {
  return api.get(`/services/${id}`);
}

export function createService(body) {
  return api.post(`/services`, body);
}

/**
 * Bulk create — sempre envia { items: [...] }
 * Aceita:
 *  - array puro
 *  - { items: [...] } / { services: [...] } / { rows: [...] } / { data: [...] }
 */
export async function createServicesBulk(input) {
  let arr = [];

  if (Array.isArray(input)) {
    arr = input;
  } else if (input && typeof input === 'object') {
    if (Array.isArray(input.items)) arr = input.items;
    else if (Array.isArray(input.services)) arr = input.services;
    else if (Array.isArray(input.rows)) arr = input.rows;
    else if (Array.isArray(input.data)) arr = input.data;
  }

  if (!Array.isArray(arr) || arr.length === 0) {
    // deixa explícito para facilitar debug
    throw new Error('createServicesBulk: items[] vazio ou ausente');
  }

  const body = { items: arr };

  try {
    if (localStorage.getItem('debug_services') === '1') {
      // ajuda a confirmar o formato antes de mandar
      console.debug('[createServicesBulk] POST /services/bulk body:', body);
    }
  } catch {}

  return api.post(`/services/bulk`, body);
}

export function updateService(id, body) {
  return api.patch(`/services/${id}`, body);
}

export function deleteService(id) {
  return api.delete(`/services/${id}`);
}

/* ---------- aliases ---------- */
export const listServices = fetchServices;

export default {
  fetchServices,
  listServices,
  getService,
  createService,
  createServicesBulk,
  updateService,
  deleteService,
};
