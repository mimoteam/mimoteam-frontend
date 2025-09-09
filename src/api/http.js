import axios from "axios";

/** =========================
 *  Config base
 *  ========================= */
const RAW_BASE = (import.meta?.env?.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");
export const API_URL = /\/api$/i.test(RAW_BASE) ? RAW_BASE : `${RAW_BASE}/api`;
const DEBUG = !!(import.meta?.env?.VITE_HTTP_DEBUG);

/** Utils */
const toAbsolutePath = (p) =>
  !p ? "/" : (/^https?:\/\//i.test(p) ? p : (p.startsWith("/") ? p : `/${p}`));

export function toAbsoluteUrl(u) {
  if (!u) return "";
  const s = String(u);
  if (/^(data:|https?:\/\/)/i.test(s)) return s;
  const base = API_URL.replace(/\/$/, "");
  const path = s.startsWith("/") ? s : `/${s}`;
  return `${base}${path}`;
}

const getPathname = (u) => {
  try { return new URL(u, API_URL).pathname || u; }
  catch { return u; }
};

/** =========================
 *  Token handling
 *  ========================= */
const TOKEN_KEY         = import.meta?.env?.VITE_AUTH_TOKEN_KEY || "auth_token_v1";
const LEGACY_TOKEN_KEY  = "auth_token";
const CANDIDATE_KEYS    = [TOKEN_KEY, LEGACY_TOKEN_KEY, "token", "access_token", "jwt", "id_token", "Authorization"];

function stripBearer(s) {
  return String(s || "").trim().replace(/^bearer\s+/i, "");
}
function fromMaybeJson(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  s = stripBearer(s);

  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      const o = JSON.parse(s);
      const v =
        o?.access_token ||
        o?.token ||
        o?.jwt ||
        o?.id_token ||
        o?.Authorization ||
        o?.data?.access_token || o?.data?.token || o?.data?.jwt || o?.data?.id_token || o?.data?.Authorization ||
        "";
      return stripBearer(v);
    } catch {
      // não era JSON válido; usa string bruta
    }
  }
  return s;
}

// Helpers extra (não interferem em outras páginas)
function readCookieToken() {
  try {
    if (typeof document === "undefined") return "";
    const jar = Object.fromEntries(
      document.cookie.split(";").map(s => s.trim()).filter(Boolean).map(kv => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i).trim(), decodeURIComponent(kv.slice(i + 1))];
      })
    );
    for (const k of CANDIDATE_KEYS) {
      const v = fromMaybeJson(jar[k]);
      if (v) return v;
    }
  } catch {}
  return "";
}
function readLocationToken() {
  try {
    if (typeof window === "undefined") return "";
    const sp = new URLSearchParams(window.location.search);
    const keys = ["token", "Authorization", "access_token", "jwt", "id_token"];
    for (const k of keys) {
      const v = fromMaybeJson(sp.get(k));
      if (v) return v;
    }
  } catch {}
  return "";
}

export const getToken = () => {
  try {
    for (const k of CANDIDATE_KEYS) {
      const raw = localStorage.getItem(k);
      const v = fromMaybeJson(raw);
      if (v) {
        if (DEBUG) console.log(`[http.js] token encontrado em '${k}':`, v.slice(0, 12) + "…");
        return v;
      }
    }
  } catch (e) {
    if (DEBUG) console.warn("[http.js] falha ao ler token:", e);
  }
  if (DEBUG) console.log("[http.js] nenhum token encontrado");
  return "";
};

export const setAuthToken = (token) => {
  try {
    let value = "";
    if (typeof token === "string") value = fromMaybeJson(token);
    else if (token && typeof token === "object") {
      value = fromMaybeJson(
        token.access_token || token.token || token.jwt || token.id_token || token.Authorization || token?.data?.token
      );
    }
    if (value) {
      localStorage.setItem(TOKEN_KEY, value);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      if (DEBUG) console.log(`[http.js] token salvo em '${TOKEN_KEY}'`);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      if (DEBUG) console.log("[http.js] token limpo");
    }
  } catch (e) {
    if (DEBUG) console.warn("[http.js] falha ao salvar token:", e);
  }
};
export const clearAuthToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    if (DEBUG) console.log("[http.js] token removido");
  } catch {}
};

// Bootstrap leve: só captura token de query/cookie se ainda não houver um salvo
try {
  if (typeof window !== "undefined") {
    const has = getToken();
    if (!has) {
      const fromQuery  = readLocationToken();
      const fromCookie = readCookieToken();
      const chosen = fromQuery || fromCookie;
      if (chosen) {
        setAuthToken(chosen);
        if (DEBUG) console.log("[http.js] token inicial capturado de", fromQuery ? "querystring" : "cookie");
        // limpa o token da URL para não poluir o histórico
        try {
          if (fromQuery) {
            const url = new URL(window.location.href);
            ["token", "Authorization", "access_token", "jwt", "id_token"].forEach((k) => url.searchParams.delete(k));
            window.history.replaceState({}, document.title, url.toString());
          }
        } catch {}
      }
    }
  }
} catch {}

/** =========================
 *  Paths e rotas especiais
 *  ========================= */
const ME_CANONICALS = ["/auth/me", "/users/me", "/me"];
function buildUrl(path, params) {
  const normalized = getPathname(toAbsolutePath(path || "/"));
  if (ME_CANONICALS.includes(normalized)) {
    path = import.meta?.env?.VITE_API_ME_PATH || "/api/auth/me";
  }

  const url = new URL(toAbsolutePath(path), API_URL);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      if (Array.isArray(v)) {
        v.forEach((item) => item !== undefined && item !== null && item !== "" && url.searchParams.append(k, String(item)));
      } else {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url;
}

/** Rotas que **não** devem receber Authorization (com ou sem /api) */
const AUTH_FREE_RX = /^\/(?:api\/)?(?:login|auth\/login|auth\/refresh|health(?:\/.*)?|public(?:\/.*)?)$/i;

/** =========================
 *  Fetch wrapper
 *  ========================= */
export async function api(
  path,
  {
    method = "GET",
    params,
    body,
    json,
    data,
    headers,
    timeout = 30000,
    auth = true,
  } = {}
) {
  const url = buildUrl(path, params);
  const payload = body ?? json ?? data;

  const isFormData   = typeof FormData        !== "undefined" && payload instanceof FormData;
  const isBlob       = typeof Blob            !== "undefined" && payload instanceof Blob;
  const isUrlEncoded = typeof URLSearchParams !== "undefined" && payload instanceof URLSearchParams;
  const isRawBody    = isFormData || isBlob || isUrlEncoded;
  const isString     = typeof payload === "string";

  const pathname = getPathname(toAbsolutePath(path));
  const token = getToken();
  const shouldSendAuth = !!(auth && token && !AUTH_FREE_RX.test(pathname));
  const tokenHeader = token ? `Bearer ${token}` : "";

  const finalHeaders = {
    ...(payload ? (isRawBody || isString ? {} : { "Content-Type": "application/json" }) : {}),
    ...(shouldSendAuth ? { Authorization: tokenHeader } : {}),
    Accept: "application/json, application/problem+json;q=0.9, */*;q=0.1",
    ...(headers || {}),
  };

  if (DEBUG) {
    console.log(`[http.js] → ${method} ${url.toString()}`, {
      auth: shouldSendAuth, hasToken: !!token,
      headers: { ...finalHeaders, Authorization: finalHeaders.Authorization ? "Bearer ***" : undefined }
    });
  }

  async function doFetch(u) {
    const ctrl = new AbortController();
    const to = setTimeout(() => { try { ctrl.abort("Request timeout"); } catch {} }, timeout);
    try {
      const res = await fetch(u.toString(), {
        method,
        credentials: "include",
        headers: finalHeaders,
        body: payload ? (isRawBody || isString ? payload : JSON.stringify(payload)) : undefined,
        signal: ctrl.signal,
      });
      return res;
    } finally {
      clearTimeout(to);
    }
  }

  let res = await doFetch(url);

  // Em dev: se 401 e tínhamos Authorization, tenta retry com ?token=
  const isDev = typeof import.meta !== "undefined" && import.meta?.env?.MODE !== "production";
  if (res.status === 401 && isDev && shouldSendAuth && token) {
    try {
      const retryUrl = new URL(url.toString());
      if (!retryUrl.searchParams.has("token")) {
        retryUrl.searchParams.set("token", token);
        if (DEBUG) console.warn("[http.js] 401 → retry com ?token=…");
        res = await doFetch(retryUrl);
      }
    } catch {}
  }

  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    let data = null;
    try {
      const text = await res.text();
      try { data = text ? JSON.parse(text) : null; }
      catch { data = text ? { message: text } : null; }
    } catch {}
    const msg = data?.message || data?.title || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data || undefined;
    err.url = url.toString();
    if (DEBUG) console.error("[http.js] ✖ erro:", err);
    throw err;
  }

  if (res.status === 204) return {};
  if (ct.includes("application/json") || ct.includes("application/problem+json")) return res.json();

  const txt = await res.text();
  try { return txt ? JSON.parse(txt) : {}; }
  catch { return txt; }
}

/** =========================
 *  Axios client (compat)
 *  ========================= */
export const httpClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
});

/** Interceptor request: injeta Authorization (exceto rotas livres) */
httpClient.interceptors.request.use((config) => {
  try {
    const pathname = getPathname(config.url ? String(config.url) : "");
    if (AUTH_FREE_RX.test(pathname)) {
      config.headers = {
        Accept: "application/json, application/problem+json;q=0.9, */*;q=0.1",
        ...(config.headers || {})
      };
      if (DEBUG) console.log(`[http.js][axios] rota livre: ${pathname}`);
      return config;
    }
    const token = getToken();
    const headers = { ...(config.headers || {}) };
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    headers.Accept = headers.Accept || "application/json, application/problem+json;q=0.9, */*;q=0.1";
    config.headers = headers;
    if (DEBUG) console.log(`[http.js][axios] header Authorization aplicado em ${pathname}`);
    return config;
  } catch {
    return config;
  }
});

/** Interceptor response: normaliza erros */
httpClient.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const msg =
      (data && (data.message || data.title)) ||
      error?.message ||
      (status ? `HTTP ${status}` : "Network error");
    const err = new Error(msg);
    err.status = status;
    err.data = data;
    err.url = error?.config?.url;
    if (DEBUG) console.error("[http.js][axios] ✖ erro:", err);
    throw err;
  }
);

/** Atalhos */
api.get    = (path, opts = {})       => api(path, { ...opts, method: "GET" });
api.post   = (path, body, opts = {}) => api(path, { ...opts, method: "POST",  body });
api.put    = (path, body, opts = {}) => api(path, { ...opts, method: "PUT",   body });
api.patch  = (path, body, opts = {}) => api(path, { ...opts, method: "PATCH", body });
api.delete = (path, opts = {})       => api(path, { ...opts, method: "DELETE" });

export default { api, API_URL, httpClient, toAbsoluteUrl, getToken, setAuthToken, clearAuthToken };
