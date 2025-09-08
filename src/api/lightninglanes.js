// src/api/lightninglanes.js
import { api, getToken } from "./http";

/** Remove undefined/null/"" dos params */
function cleanParams(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Lista Lightning Lanes.
 * Se `mine` não for informado, decide automaticamente:
 *  - logado (tem token) => mine=true
 *  - sem token          => mine=false
 */
export async function listLanes({ month, page = 1, pageSize = 50, status, mine } = {}) {
  if (mine === undefined) mine = !!getToken();
  const params = cleanParams({ month, page, pageSize, status, mine });
  return api("/lanes", { method: "GET", params, headers: { ...authHeaders() } });
}

export async function createLane(body) {
  return api("/lanes", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
}

export async function updateLane(id, body) {
  return api(`/lanes/${id}`, {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
}

export async function deleteLane(id) {
  return api(`/lanes/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
}

export async function uploadLaneReceipts(laneId, files = []) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return api(`/lanes/${laneId}/receipts`, {
    method: "POST",
    body: fd,
    headers: { ...authHeaders() }, // não setar Content-Type com FormData
  });
}

export async function deleteLaneReceipt(laneId, url) {
  return api(`/lanes/${laneId}/receipts`, {
    method: "DELETE",
    params: { url },
    headers: { ...authHeaders() },
  });
}
