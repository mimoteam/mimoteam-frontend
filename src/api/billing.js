// billing.js
const API_BASE = import.meta.env.VITE_API_URL ?? `${window.location.origin}/api`;

const join = (base, p) =>
  `${String(base).replace(/\/+$/, "")}/${String(p).replace(/^\/+/, "")}`;

// ✅ tolerante a 204 e body vazio
async function asJson(res) {
  const status = res.status;

  // 204 = No Content
  if (status === 204) {
    if (!res.ok) throw new Error(`${status} ${res.statusText}`);
    return { ok: true };
  }

  // lê como texto para poder testar vazio
  const text = await res.text();

  // erro HTTP: tenta extrair mensagem do JSON, senão usa status
  if (!res.ok) {
    let msg = `${status} ${res.statusText}`;
    try {
      const j = text ? JSON.parse(text) : null;
      msg = j?.error || j?.message || msg;
    } catch {}
    const err = new Error(msg);
    err.status = status;
    throw err;
  }

  // sucesso: se não veio nada, devolve {ok:true}
  if (!text) return { ok: true };

  // se veio algo, tenta parsear; se não for JSON, devolve bruto
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

/* --- chamadas --- */
export async function listBilling({ page = 1, pageSize = 10, onlyPending = false } = {}) {
  const url = new URL(join(API_BASE, "billing"));
  url.searchParams.set("page", page);
  url.searchParams.set("pageSize", pageSize);
  url.searchParams.set("onlyPending", String(!!onlyPending));
  const res = await fetch(url.toString(), { credentials: "include" });
  return asJson(res);
}

export async function createBilling(payload) {
  const res = await fetch(join(API_BASE, "billing"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return asJson(res);
}

export async function updateBillingStatus(id, status) {
  const res = await fetch(join(API_BASE, `billing/${id}/status`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  return asJson(res);
}

export async function removeBilling(id) {
  const res = await fetch(join(API_BASE, `billing/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  return asJson(res); // agora lida com 204/vazio
}

export async function clearBilling() {
  const res = await fetch(join(API_BASE, "billing"), {
    method: "DELETE",
    credentials: "include",
  });
  return asJson(res);
}
