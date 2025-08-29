// src/api/http.js
import axios from "axios";

/** Base da API (Vite) */
export const API_URL = (import.meta?.env?.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

/** Transforma caminho relativo em URL absoluta (mantém http/https/data:) */
export function toAbsoluteUrl(u) {
  if (!u) return "";
  const s = String(u);
  if (/^(data:|https?:\/\/)/i.test(s)) return s; // já absoluta (ou base64)
  const base = API_URL.replace(/\/$/, "");
  const path = s.startsWith("/") ? s : `/${s}`;
  return `${base}${path}`;
}

/** Chave do token (alinha com App.jsx) */
const TOKEN_KEY = import.meta?.env?.VITE_AUTH_TOKEN_KEY || "auth_token_v1";
const LEGACY_TOKEN_KEY = "auth_token"; // compat antigo

/** --- Helpers de URL/Token --- */
const toAbsolutePath = (p) => {
  if (!p) return "/";
  if (/^https?:\/\//i.test(p)) return p; // já é URL completa
  return p.startsWith("/") ? p : `/${p}`;
};

/** Extrai somente o pathname, mesmo se vier URL absoluta */
const getPathname = (u) => {
  try {
    return new URL(u, API_URL).pathname || u;
  } catch {
    return u;
  }
};

/** Lê o token salvo (se existir) — primeiro a chave nova, depois a legada */
export const getToken = () => {
  try {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      localStorage.getItem(LEGACY_TOKEN_KEY) ||
      ""
    );
  } catch {
    return "";
  }
};

/** Monta URL + query params (suporta array => ?tag=a&tag=b) */
function buildUrl(path, params) {
  if (path === "/users/me" && import.meta?.env?.VITE_API_ME_PATH) {
    path = import.meta.env.VITE_API_ME_PATH;
  }

  const url = new URL(toAbsolutePath(path), API_URL);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      if (Array.isArray(v)) {
        v.forEach((item) => {
          if (item !== undefined && item !== null && item !== "") {
            url.searchParams.append(k, String(item));
          }
        });
      } else {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url;
}

/** Rotas de auth que **não** devem receber Authorization */
const AUTH_FREE_RX = /^(\/login|\/auth\/login)$/i;

/**
 * Wrapper baseado em fetch
 *   import { api } from "./http";
 *   const data = await api("/users", { params: { page: 1 } });
 *
 * Extra:
 *   - passe { auth:false } para forçar remover Authorization em qualquer rota.
 */
export async function api(
  path,
  { method = "GET", params, body, headers, timeout = 30000, auth = true } = {}
) {
  const url = buildUrl(path, params);
  const token = getToken();

  // Detecta corpo "bruto": FormData, Blob ou URLSearchParams (x-www-form-urlencoded)
  const isFormData   = typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob       = typeof Blob !== "undefined" && body instanceof Blob;
  const isUrlEncoded = typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams;
  const isRawBody    = isFormData || isBlob || isUrlEncoded;

  // não anexar Authorization se rota for de auth ou se o chamador desabilitar
  const pathname = getPathname(toAbsolutePath(path));
  const shouldSendAuth = !!(auth && token && !AUTH_FREE_RX.test(pathname));

  const finalHeaders = {
    ...(isRawBody ? {} : { "Content-Type": "application/json" }),
    ...(shouldSendAuth ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers || {}),
  };

  // Timeout com AbortController
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("Request timeout")), timeout);

  try {
    const res = await fetch(url.toString(), {
      method,
      credentials: "include",
      headers: finalHeaders,
      body: body
        ? (isRawBody ? body : JSON.stringify(body))
        : undefined,
      signal: ctrl.signal,
    });

    if (!res.ok) {
      let data;
      try { data = await res.json(); } catch { /* ignore */ }
      const err = new Error(data?.message || `HTTP ${res.status}`);
      err.status = res.status;
      if (data) err.data = data;
      throw err;
    }

    if (res.status === 204) return {};

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    if (ct.includes("application/problem+json")) return res.json(); // RFC 7807
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Cliente Axios (útil para endpoints estilo REST tradicional) */
export const httpClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
});

/** Interceptor: injeta Authorization se ainda não tiver (exceto rotas de auth) */
httpClient.interceptors.request.use((config) => {
  try {
    // Pode vir absoluto ou relativo; normalizamos para pathname
    const pathname = getPathname(config.url ? String(config.url) : "");
    if (AUTH_FREE_RX.test(pathname)) return config; // não enviar Authorization nas rotas de auth

    const token = getToken();
    if (token && !config.headers?.Authorization) {
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
    }
    return config;
  } catch {
    return config;
  }
});

/** Interceptor de resposta: lança erros já “limpos” */
httpClient.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const msg =
      data?.message ||
      error?.message ||
      (status ? `HTTP ${status}` : "Network error");
    const err = new Error(msg);
    err.status = status;
    err.data = data;
    throw err;
  }
);

/** Atalhos de conveniência (compat com estilo Axios-like) */
api.get    = (path, opts = {})          => api(path, { ...opts, method: "GET" });
api.post   = (path, body, opts = {})    => api(path, { ...opts, method: "POST",  body });
api.put    = (path, body, opts = {})    => api(path, { ...opts, method: "PUT",   body });
api.patch  = (path, body, opts = {})    => api(path, { ...opts, method: "PATCH", body });
api.delete = (path, opts = {})          => api(path, { ...opts, method: "DELETE" });

/** Helpers de token exportados para outras APIs (ex.: auth.js) */
export const setAuthToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      // remove legado para evitar enviar Authorization errado
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {}
};
export const clearAuthToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {}
};

/* opcional: export default agregando, sem interferir nas nomeadas */
export default {
  api,
  API_URL,
  httpClient,
  toAbsoluteUrl,
  getToken,
  setAuthToken,
  clearAuthToken,
};
