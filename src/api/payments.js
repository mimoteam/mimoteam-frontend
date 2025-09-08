// src/api/payments.js
import { httpClient as api } from "./http";

/* ----------------- helpers ----------------- */
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

const getOnePayment = async (id) => {
  const { data } = await api.get(`/payments/${id}`);
  return data;
};

const listServices = async (params = {}) => {
  const { data } = await api.get("/services", { params });
  return normalize(data).items.map((s) => ({ ...s, id: String(s._id || s.id) }));
};

const listPaymentsRaw = async (params = {}) => {
  const { data } = await api.get("/payments", { params });
  const norm = normalize(data);
  return {
    ...norm,
    items: norm.items.map((p) => ({
      ...p,
      id: String(p._id || p.id),
      serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds.map(String) : [],
    })),
  };
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as <= be && bs <= ae;
};

/* ----------------- payments (padrão) ----------------- */
export const listPayments = async (params = {}) => {
  const { data } = await api.get("/payments", { params });
  const norm = normalize(data);
  return {
    ...norm,
    items: norm.items.map((p) => ({
      ...p,
      id: String(p._id || p.id),
      serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds.map(String) : [],
    })),
  };
};

export const createPayment = async (payload) => {
  const { data } = await api.post("/payments", payload);
  return { ...data, id: String(data._id || data.id) };
};

export const updatePayment = async (id, payload) => {
  try {
    const { data } = await api.patch(`/payments/${id}`, payload);
    return { ...data, id: String(data._id || data.id) };
  } catch {
    const { data } = await api.put(`/payments/${id}`, payload);
    return { ...data, id: String(data._id || data.id) };
  }
};

export const deletePayment = async (id) => {
  const { data } = await api.delete(`/payments/${id}`);
  return data;
};

export const listEligibleServices = async (params = {}) => {
  const { partnerId, dateFrom, dateTo, page = 1, pageSize = 500 } = params;

  try {
    const { data } = await api.get("/payments/eligible", {
      params: { partnerId, dateFrom, dateTo, page, pageSize },
    });
    const norm = normalize(data);
    return norm.items.map((s) => ({ ...s, id: String(s._id || s.id) }));
  } catch {
    try {
      const services = await listServices({
        partner: partnerId,
        dateFrom,
        dateTo,
        page,
        pageSize,
        sortBy: "serviceDate",
        sortDir: "asc",
      });
      const pay = await listPaymentsRaw({ partnerId, page: 1, pageSize: 1000 });

      const usedIds = new Set();
      for (const p of pay.items) {
        const pStart = p.periodFrom || p.weekStart;
        const pEnd   = p.periodTo   || p.weekEnd;
        if (overlaps(pStart, pEnd, dateFrom, dateTo)) {
          (p.serviceIds || []).forEach((sid) => usedIds.add(String(sid)));
        }
      }
      return services.filter((s) => !usedIds.has(String(s.id)));
    } catch {
      return [];
    }
  }
};

export const addServiceToPayment = async (paymentId, serviceId) => {
  try {
    const { data } = await api.post(`/payments/${paymentId}/items`, { serviceId });
    return { ...data, id: String(data._id || data.id) };
  } catch {
    const current = await getOnePayment(paymentId);
    const curIds = Array.isArray(current.serviceIds)
      ? current.serviceIds.map(String)
      : [];
    if (!curIds.includes(String(serviceId))) curIds.push(String(serviceId));
    return updatePayment(paymentId, { serviceIds: curIds });
  }
};

export const removeServiceFromPayment = async (paymentId, serviceId) => {
  try {
    const { data } = await api.delete(`/payments/${paymentId}/items/${serviceId}`);
    return { ...data, id: String(data._id || data.id) };
  } catch {
    const current = await getOnePayment(paymentId);
    const curIds = Array.isArray(current.serviceIds)
      ? current.serviceIds.map(String)
      : [];
    const next = curIds.filter((id) => String(id) !== String(serviceId));
    return updatePayment(paymentId, { serviceIds: next });
  }
};

/* -------- service → payment status (batched + robusto) -------- */
const normalizeSvcPayStatus = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (!s || s === 'not linked') return 'not linked';
  if (s.includes('paid')) return 'paid';
  if (s.includes('declin')) return 'declined';
  if (s.includes('pend') || s.includes('shar') || s.includes('approv') || s.includes('hold')) return 'pending';
  return s;
};

const _chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Retorna Map(serviceId -> { status: 'not linked'|'pending'|'paid'|'declined', paymentId })
 */
export const getServicesPayStatus = async (ids = []) => {
  const unique = Array.from(new Set((ids || []).map(String))).filter(Boolean);
  if (unique.length === 0) return new Map();

  const map = new Map();
  for (const part of _chunk(unique, 150)) {
    const { data } = await api.get('/payments/service-status', {
      params: { ids: part.join(',') }
    });

    const payload = data ?? {};
    const items = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.data?.items)
      ? payload.data.items
      : [];

    items.forEach((it) => {
      const sid =
        it?.serviceId ?? it?.sid ?? it?._id ?? it?.service ?? it?.sId ?? null;
      const st =
        it?.status ?? it?.paymentStatus ?? it?.state ?? 'not linked';
      const pid =
        it?.paymentId ?? it?.pid ?? it?.payment ?? it?.pId ?? null;

      if (!sid) return;
      map.set(String(sid), {
        status: normalizeSvcPayStatus(st),
        paymentId: pid ? String(pid) : null,
      });
    });
  }
  return map;
};

/* ---------- compat para Dashboard ---------- */
export const fetchPayments = listPayments;

export default {
  listPayments,
  fetchPayments, // alias no default
  createPayment,
  updatePayment,
  deletePayment,
  listEligibleServices,
  addServiceToPayment,
  removeServiceFromPayment,
  getServicesPayStatus, // <- novo
};
