// frontend/src/api/services.js
import { httpClient as api } from './http';

function buildQuery(params = {}) {
  const { page, pageSize, sortBy, sortDir, filters = {}, search } = params;
  const qs = new URLSearchParams();
  if (page) qs.set("page", page);
  if (pageSize) {
    qs.set("pageSize", pageSize);
    qs.set("limit", pageSize);
    qs.set("offset", String((Math.max(1, Number(page || 1)) - 1) * Number(pageSize)));
  }
  if (sortBy) qs.set("sortBy", sortBy);
  if (sortDir) qs.set("sortDir", String(sortDir).toLowerCase());
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) qs.set(k, v);
  });
  if (search) qs.set("q", search);
  return qs.toString();
}

export function fetchServices(params = {}) {
  const qs = buildQuery(params);
  return api.get(`/services?${qs}`).then(r => r.data);
}

export function createService(body) {
  return api.post(`/services`, body).then(r => r.data);
}

export async function createServicesBulk(items) {
  try {
    return await api.post(`/services/bulk`, { items }).then(r => r.data);
  } catch {
    // compat antigo
    return api.post(`/services`, items).then(r => r.data);
  }
}

export function updateService(id, body) {
  // backend espera PATCH
  return api.patch(`/services/${id}`, body).then(r => r.data);
}

export function deleteService(id) {
  return api.delete(`/services/${id}`).then(r => r.data);
}

export default { fetchServices, createService, createServicesBulk, updateService, deleteService };
