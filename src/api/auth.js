import { api, httpClient, setAuthToken, clearAuthToken } from "./http";

const AUTH_TOKEN_KEY = "auth_token";           // compat antiga
const CURRENT_USER_KEY = "current_user_v1";

let HAS_AUTH_ME = null;
let HAS_USERS_ME = null;

/* ===== Helpers ===== */
function saveTokenEverywhere(token) {
  try {
    if (token && token !== "undefined" && token !== "null") {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {}
  try { setAuthToken?.(token || ""); } catch {}
}
function clearAllTokens() {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch {}
  try { setAuthToken?.(""); clearAuthToken?.(); } catch {}
}
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null"); } catch { return null; }
}
export function saveStoredUser(user) {
  try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user || null)); } catch {}
}

/* ===== LOGIN: usa só /auth/login, decide email vs login pelo input ===== */
export async function loginApi(userLike, password) {
  clearAllTokens(); // garante que não mandaremos Authorization

  const u = String(userLike || "").trim();
  const p = String(password || "");

  // 1ª tentativa: decide pelo que foi digitado
  const firstBody = u.includes("@")
    ? { email: u, password: p }
    : { login: u, password: p };

  // 2ª tentativa (fallback): troca o campo
  const secondBody = firstBody.email
    ? { login: u, password: p }
    : { email: u, password: p };

  async function tryOnce(body) {
    const r = await api("/auth/login", { method: "POST", body, auth: false });
    const token =
      r?.token || r?.accessToken || r?.jwt ||
      r?.data?.token || r?.data?.accessToken || "";

    const inlineUser =
      r?.user || r?.data?.user || r?.profile ||
      (r && (r.email || r.login || r.fullName) ? r : null) || null;

    if (!token) {
      const e = new Error("Missing token from /auth/login response");
      e.status = 401;
      throw e;
    }

    saveTokenEverywhere(token);

    let user = inlineUser;
    if (!user) user = await getCurrentUser({ force: true });
    if (user) saveStoredUser(user);

    return { token, user };
  }

  try {
    return await tryOnce(firstBody);
  } catch (e1) {
    // Se for 400 com mensagem de campo inválido/ausente, tenta o outro corpo
    const s = e1?.status;
    const msg = (e1?.data?.message || e1?.message || "").toLowerCase();
    const looksLikeWrongField =
      s === 400 &&
      (msg.includes("email") || msg.includes("login") || msg.includes("username") || msg.includes("missing"));

    if (looksLikeWrongField) {
      return await tryOnce(secondBody);
    }
    // 401 aqui significa credencial inválida de fato
    throw e1;
  }
}

/* ===== LOGOUT ===== */
export function logout() {
  clearAllTokens();
  saveStoredUser(null);
}

/* ===== CURRENT USER ===== */
export async function getCurrentUser({ force = false } = {}) {
  if (HAS_AUTH_ME !== false || force) {
    try {
      const r = await api("/auth/me", { method: "GET" });
      HAS_AUTH_ME = true;
      const user = r?.user || r || null;
      if (user) saveStoredUser(user);
      return user;
    } catch (err) {
      if (err?.status === 404) HAS_AUTH_ME = false;
      else if (err?.status === 401) {
        clearAllTokens();
        return getStoredUser();
      }
    }
  }

  if (HAS_USERS_ME !== false || force) {
    try {
      const r2 = await api("/users/me", { method: "GET" });
      HAS_USERS_ME = true;
      const user2 = r2?.user || r2 || null;
      if (user2) saveStoredUser(user2);
      return user2;
    } catch (err2) {
      if (err2?.status === 404) HAS_USERS_ME = false;
      else if (err2?.status === 401) {
        clearAllTokens();
        return getStoredUser();
      }
    }
  }

  return getStoredUser();
}

// Reexport
export { api, httpClient };
