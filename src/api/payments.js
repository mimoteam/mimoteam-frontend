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

/* ----------------- API ----------------- */
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
};
