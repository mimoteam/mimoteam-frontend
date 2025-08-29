// frontend/src/api/availability.js
import { api } from "./http";

// GET /availability?partnerId=&dateFrom=&dateTo=
export async function getAvailability(partnerId, dateFrom, dateTo) {
  const qs = new URLSearchParams();
  if (partnerId) qs.set("partnerId", partnerId);
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo) qs.set("dateTo", dateTo);

  const res = await api(`/availability?${qs.toString()}`);
  // resposta: { items: [{date, state, by}], ... } ou array direto
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res)) return res;
  return [];
}

// PATCH /availability/:date  body:{ partnerId, state, actor }
export function setDayAvailability(partnerId, date, state, actor = "partner") {
  return api(`/availability/${date}`, {
    method: "PATCH",
    body: { partnerId, state, actor },
  });
}

// POST /availability/bulk  body:{ partnerId, from, to, weekdays?, state, actor }
export function bulkSetAvailability({
  partnerId,
  from,
  to,
  weekdays = [],
  state,
  actor = "partner",
}) {
  return api(`/availability/bulk`, {
    method: "POST",
    body: { partnerId, from, to, weekdays, state, actor },
  });
}

export default { getAvailability, setDayAvailability, bulkSetAvailability };
