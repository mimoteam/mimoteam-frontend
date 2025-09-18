// src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import Services from './pages/Services';
import {
  Settings, DollarSign, CreditCard, Users as UsersIcon, LogOut, Loader, Eye, EyeOff,
  ChevronLeft, ChevronRight, LayoutDashboard, User, Wallet, CalendarDays, Zap,
} from 'lucide-react';

//Login
import './styles/Pages/Login.css';

// Providers / Pages
import { CostsProvider } from './contexts/CostsContext';
import { HandoverProvider } from './contexts/HandoverContext';
import { ServicesProvider } from './contexts/ServicesContext';
import { PaymentsProvider } from './contexts/PaymentsContext';
import Costs from './pages/Costs';

// 🔔 Notifications
import { NotificationsProvider, useNotifications } from './contexts/NotificationsContext';
import NotificationsBell from './components/NotificationsBell';

// Dados financeiros (para observar novos pagamentos)
import { useFinanceData } from './api/useFinanceData';

// Import flexível (default ou nomeado)
import * as PaymentsMod from './pages/Payments.jsx';
const Payments = PaymentsMod.default ?? PaymentsMod.Payments ?? (() => null);

// Admin / Finance
import UsersPage from './pages/Users';
import Dashboard from './pages/Dashboard.jsx';
import Capacity from './pages/Capacity.jsx';
import FinanceDashboard from './pages/FinanceDashboard.jsx';
import PartnerPayroll from './pages/PartnerPayroll.jsx';
import ClientOperations from './pages/ClientOperations.jsx';
import LightningLaneDashboard from './pages/LightningLaneDashboard.jsx';
import FinanceProfile from './pages/FinanceProfile.jsx';
import BillingDetails from './pages/BillingDetails.jsx';
import LightningLanes from './pages/LightningLanes.jsx';
import Team from './pages/Team.jsx';
import AdminBillingInput from './pages/AdminBillingInput.jsx';

// Partner pages
import PartnerProfile from './pages/PartnerProfile.jsx';
import PartnerWallet from './pages/PartnerWallet.jsx';
import PartnerCalendar from './pages/PartnerCalendar.jsx';
import PartnerReimbursements from './pages/PartnerReimbursements.jsx';
import PartnerLightningLanes from './pages/PartnerLightningLanes.jsx';

// Partner-only layout
import * as PartnerMobileLayoutMod from './components/partner/PartnerMobileLayout.jsx';
const PartnerMobileLayout = PartnerMobileLayoutMod.default ?? PartnerMobileLayoutMod.PartnerMobileLayout ?? (() => null);

// chamadas ao backend
import { loginApi } from './api/auth';
import { api } from './api/http';

const USERS_STORE_KEY = 'users_store_v1';
const CURRENT_USER_KEY = 'current_user_v1';
const LEGACY_CALENDAR_KEY = 'partner_calendar_v1';
const PAYMENTS_STORAGE_KEY = 'payments_v1';
const AUTH_TOKEN_KEY = 'auth_token_v1';

const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' ry='12' fill='%23E2E8F0'/><circle cx='32' cy='24' r='12' fill='%2394A3B8'/><path d='M10 56a22 22 0 0144 0' fill='%2394A3B8'/></svg>";

/* ====== Segurança (Idle + Refresh Token) ====== */
const IDLE_LIMIT_MS = 30 * 60 * 1000;    // 30 min
const WARN_BEFORE_MS = 5 * 60 * 1000;    // avisa 5 min antes
const REFRESH_EVERY_MS = 25 * 60 * 1000; // renova access ~a cada 25 min

/* ====== Helpers WebAuthn (sem libs externas) ====== */
const b64urlToArrayBuffer = (b64url) => {
  if (!b64url) return new ArrayBuffer(0);
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const base64 = (b64url.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const str = atob(base64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
};
const arrayBufferToB64url = (buf) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const toCreationOptions = (raw) => {
  const o = raw?.publicKey ?? raw; // aceita {publicKey:{...}} ou direto
  if (!o) return null;
  const out = { ...o };
  out.challenge = b64urlToArrayBuffer(o.challenge);
  if (o.user?.id) out.user = { ...o.user, id: b64urlToArrayBuffer(o.user.id) };
  if (Array.isArray(o.excludeCredentials)) {
    out.excludeCredentials = o.excludeCredentials.map((c) => ({
      ...c,
      id: b64urlToArrayBuffer(c.id),
    }));
  }
  if (o.attestation === undefined) out.attestation = 'none';
  return { publicKey: out };
};

const toRequestOptions = (raw) => {
  const o = raw?.publicKey ?? raw;
  if (!o) return null;
  const out = { ...o };
  out.challenge = b64urlToArrayBuffer(o.challenge);
  if (Array.isArray(o.allowCredentials)) {
    out.allowCredentials = o.allowCredentials.map((c) => ({
      ...c,
      id: b64urlToArrayBuffer(c.id),
    }));
  }
  return { publicKey: out };
};

const credToJSON_Attestation = (cred) => ({
  id: cred.id,
  rawId: arrayBufferToB64url(cred.rawId),
  type: cred.type,
  response: {
    clientDataJSON: arrayBufferToB64url(cred.response.clientDataJSON),
    attestationObject: arrayBufferToB64url(cred.response.attestationObject),
    transports: cred.response.getTransports?.() ?? undefined,
  },
  clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
});

const credToJSON_Assertion = (cred) => ({
  id: cred.id,
  rawId: arrayBufferToB64url(cred.rawId),
  type: cred.type,
  response: {
    clientDataJSON: arrayBufferToB64url(cred.response.clientDataJSON),
    authenticatorData: arrayBufferToB64url(cred.response.authenticatorData),
    signature: arrayBufferToB64url(cred.response.signature),
    userHandle: cred.response.userHandle ? arrayBufferToB64url(cred.response.userHandle) : null,
  },
  clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
});

function ensureStableId(u) {
  if (u && u.id) return String(u.id);
  const base = (u?.email || u?.login || '').toString().trim();
  if (base) return ('uid_' + base.toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/_+$/, '');
  return 'uid_' + Math.random().toString(36).slice(2, 10);
}
function ensureDefaultAvatarForUser(userLike) {
  if (!userLike) return DEFAULT_AVATAR_URL;
  const id = ensureStableId(userLike);
  const key = `partner_avatar_${id}`;
  let stored = null;
  try { stored = localStorage.getItem(key); } catch {}
  if (!stored && !userLike.avatarUrl) {
    try { localStorage.setItem(key, DEFAULT_AVATAR_URL); } catch {}
    return DEFAULT_AVATAR_URL;
  }
  return stored || userLike.avatarUrl || DEFAULT_AVATAR_URL;
}
function getDepartment(u) {
  return u?.department || u?.function || u?.funcao || u?.departmentName || '';
}
function normalizeUsersStore() {
  let changed = false;
  let list = [];
  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    list = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch { list = []; }

  const seen = new Set();
  const normalized = list.map((u) => {
    const id = ensureStableId(u);
    const out = { ...u, id };
    if (u.id !== id) changed = true;

    if (seen.has(out.id)) {
      out.id = out.id + '_' + Math.random().toString(36).slice(2, 6);
      changed = true;
    }
    seen.add(out.id);
    return out;
  });

  if (changed) {
    try { localStorage.setItem(USERS_STORE_KEY, JSON.stringify(normalized)); } catch {}
  }
  return normalized;
}
function migrateCalendarForUser(userId) {
  if (!userId) return;
  const destKey = `${LEGACY_CALENDAR_KEY}_${userId}`;
  try { if (localStorage.getItem(destKey)) return; } catch {}
  let sourceObj = null;
  try {
    const raw = localStorage.getItem(LEGACY_CALENDAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') sourceObj = parsed;
    }
  } catch {}
  if (!sourceObj) return;
  try { localStorage.setItem(destKey, JSON.stringify(sourceObj)); } catch {}
}
function migratePaymentsForUser(user) {
  if (!user) return;
  const id = ensureStableId(user);
  const login = (user.login || user.email || '').trim().toLowerCase();
  const full = (user.fullName || '').trim().toLowerCase();

  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(PAYMENTS_STORAGE_KEY) || '[]'); } catch {}

  let changed = false;
  const next = (Array.isArray(arr) ? arr : []).map(p => {
    const partnerLogin = (p.partnerLogin || p.partnerEmail || '').trim().toLowerCase();
    const partnerName = (p.partnerName || '').trim().toLowerCase();
    const status = String(p.status || '').trim().toUpperCase();

    const hasPeriod = p.weekStart || p.periodFrom || p.periodTo;
    const weekStart = p.weekStart || (!hasPeriod && p.createdAt ? p.createdAt : p.weekStart);

    let partnerId = p.partnerId;
    if (!partnerId || partnerLogin === login || (partnerName && partnerName === full)) {
      partnerId = id;
    }

    const mutated =
      partnerId !== p.partnerId ||
      status !== p.status ||
      weekStart !== p.weekStart;

    if (mutated) changed = true;
    return { ...p, partnerId, status, weekStart };
  });

  if (changed) {
    try { localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(next)); } catch {}
  }
}

/* ===================== NotificationsBridge ===================== */
function NotificationsBridge({ currentUserId }) {
  const { addNotification } = useNotifications();
  const { payments = [], services = [] } = useFinanceData();
  const fmtMoney = (n) => {
    const v = Number(n || 0);
    if (!isFinite(v)) return '$0.00';
    return `$${v.toFixed(2)}`;
  };
  const partnerNameOf = (p) =>
    p?.partnerName || p?.partner?.fullName || p?.partner?.name || p?.partner?.displayName || 'Partner';

  const seenNewPaymentsRef = React.useRef(new Set());
  const statusMapRef       = React.useRef(new Map());
  const seenLLRef          = React.useRef(new Set());
  const seenBillingRef     = React.useRef(new Set());
  const hydratedRef        = React.useRef(false);

  React.useEffect(() => { hydratedRef.current = true; }, []);

  // PAYMENTS
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    const AWAITING = new Set(['PENDING', 'SHARED', 'AWAITING_APPROVAL']);
    const now = Date.now();

    payments.forEach(p => {
      const id = String(p?.id ?? '');
      if (!id || seenNewPaymentsRef.current.has(id)) return;
      const status = String(p?.status || '').toUpperCase();

      if (AWAITING.has(status)) {
        addNotification({
          channel: 'finance',
          kind: 'payment',
          title: 'New payment awaiting approval',
          message: `${partnerNameOf(p)} • ${fmtMoney(p.total)} • week ${p.weekKey || ''}`,
          pageId: 'payments',
          timestamp: now,
          meta: { paymentId: p.id, status: p.status, weekStart: p.weekStart || p.createdAt }
        });
      }

      const pid = String(p?.partnerId || p?.partner_id || p?.partner?._id || '');
      if (pid && AWAITING.has(status)) {
        addNotification({
          channel: `partner:${pid}`,
          kind: 'payment',
          title: 'New payment to approve',
          message: `You have a new payment to review • ${fmtMoney(p.total)}`,
          pageId: 'partner_wallet',
          timestamp: now,
          meta: { paymentId: p.id, status: p.status }
        });
      }

      seenNewPaymentsRef.current.add(id);
      statusMapRef.current.set(id, status);
    });

    payments.forEach(p => {
      const id = String(p?.id ?? '');
      if (!id) return;
      const prev = statusMapRef.current.get(id);
      const cur  = String(p?.status || '').toUpperCase();

      if (prev && prev !== cur) {
        addNotification({
          channel: 'admin',
          kind: 'payment',
          title: 'Payment status changed',
          message: `${partnerNameOf(p)} • ${prev} → ${cur} • ${fmtMoney(p.total)}`,
          pageId: 'payments',
          timestamp: Date.now(),
          meta: { paymentId: p.id, from: prev, to: cur }
        });

        if (['APPROVED', 'PAID'].includes(cur)) {
          addNotification({
            channel: 'finance',
            kind: 'payment',
            title: 'Payment accepted',
            message: `${partnerNameOf(p)} • ${fmtMoney(p.total)}`,
            pageId: 'payments',
            timestamp: Date.now(),
            meta: { paymentId: p.id, status: cur }
          });
        }
      }

      statusMapRef.current.set(id, cur);
    });
  }, [payments, addNotification]);

  // LIGHTNING LANE
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    const isLL = (s) => {
      const name = (s?.service || s?.serviceType?.name || s?.type || '').toString().toLowerCase();
      const origin = (s?.origin || s?.source || '').toString().toLowerCase();
      return origin.includes('lightning') || name.includes('lightning lane');
    };
    const now = Date.now();
    services.forEach(s => {
      const id = String(s?.id || s?._id || '');
      if (!id || seenLLRef.current.has(id)) return;
      if (!isLL(s)) return;

      addNotification({
        channel: 'finance',
        kind: 'lightning',
        title: 'New Lightning Lane item',
        message: `${s.client || s.clientName || 'Client'} • ${s.park || s.type || ''}`,
        pageId: 'finance_lightning',
        timestamp: now,
        meta: { serviceId: id }
      });
      addNotification({
        channel: 'admin',
        kind: 'lightning',
        title: 'New Lightning Lane item',
        message: `${s.client || s.clientName || 'Client'} • ${s.park || s.type || ''}`,
        pageId: 'lightning_lanes',
        timestamp: now,
        meta: { serviceId: id }
      });

      seenLLRef.current.add(id);
    });
  }, [services, addNotification]);

  // BILLING DETAILS
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    const KEY = "invoice_queue_v1";
    const readQueue = () => {
      try {
        const raw = localStorage.getItem(KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    };
    const normalize = (it) => ({
      id: it.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      client: it.client || '—',
      amount: Number(it.amount || 0),
      service: it.service || (it.origin === "admin" ? "Admin" : "Lightning Lane"),
    });
    const scan = () => {
      const now = Date.now();
      readQueue().map(normalize).forEach(r => {
        if (seenBillingRef.current.has(r.id)) return;
        addNotification({
          channel: 'finance',
          kind: 'billing',
          title: 'New item in Billing Details',
          message: `${r.client} • ${fmtMoney(r.amount)} • ${r.service}`,
          pageId: 'Billing_Details',
          timestamp: now,
          meta: { id: r.id }
        });
        seenBillingRef.current.add(r.id);
      });
    };
    scan();
    const onStorage = (e) => { if (e.key === KEY) scan(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [addNotification]);

  // CAPACITY (event bus)
  React.useEffect(() => {
    const onEvt = (e) => {
      const { type, payload } = e.detail || {};
      if (type === 'capacity:unavailable') {
        const name = payload?.partnerName || 'Partner';
        const range = payload?.range || '';
        addNotification({
          channel: 'admin',
          kind: 'capacity',
          title: 'Partner set unavailability',
          message: `${name} • ${range}`,
          pageId: 'capacity',
          timestamp: Date.now(),
          meta: payload || {}
        });
      }
    };
    window.addEventListener('mimo:event', onEvt);
    return () => window.removeEventListener('mimo:event', onEvt);
  }, [addNotification]);

  return null;
}
function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentPage, setCurrentPage] = useState('login');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [formData, setFormData] = useState({ user: '', password: '', email: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // ====== Auto-logout por inatividade ======
  const [showIdleWarn, setShowIdleWarn] = useState(false);
  const idleRef = useRef({ reset: () => {} });

  // ====== Passkeys (WebAuthn nativo) ======
  const [webauthnReady, setWebauthnReady] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState('');

  // Não força tema — deixa CSS decidir pela paleta do sistema
  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    try { root.style.removeProperty('color-scheme'); } catch {}
  }, []);

  useEffect(() => {
    setWebauthnReady(typeof window !== 'undefined' && 'PublicKeyCredential' in window);
  }, []);

  const SIDEBAR_W_OPEN = 289;
  const SIDEBAR_W_CLOSED = 95;

  useEffect(() => {
    if (currentPage !== 'login') {
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
    }
  }, [currentPage]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (passkeyMessage) setPasskeyMessage('');
  };

  useEffect(() => { normalizeUsersStore(); }, []);

  // ===== Helpers de sessão (reuso para senha e passkey)
  const onAuthSuccess = useCallback((user, token) => {
    const ensuredId = ensureStableId(user);
    const ensuredUser = {
      ...user,
      id: ensuredId,
      avatarUrl: ensureDefaultAvatarForUser({ ...user, id: ensuredId }),
      department: getDepartment(user),
    };
    if (token) {
      try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch {}
    }
    try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(ensuredUser)); } catch {}
    setCurrentUser(ensuredUser);

    migrateCalendarForUser(ensuredId);
    migratePaymentsForUser(ensuredUser);

    setFormData(prev => ({ ...prev, email: ensuredUser.email || '' }));
    const role = (ensuredUser.role || '').toLowerCase();

    if (role === 'partner') {
      setCurrentPage('partner_wallet');
      navigate('/partner', { replace: true });
    } else if (role === 'finance') {
      setCurrentPage('finance_home');
    } else {
      setCurrentPage('dashboard');
    }
  }, [navigate]);

  // ===== Login (senha)
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');
    try {
      const { token, user } = await loginApi(formData.user.trim(), formData.password.trim());
      onAuthSuccess(user, token);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ====== Passkeys (login)
  const loginWithPasskey = useCallback(async () => {
    setPasskeyMessage('');
    if (!webauthnReady) { setPasskeyMessage('Passkeys not supported on this device/browser.'); return; }
    setPasskeyBusy(true);
    try {
      // ⚠️ sem "/" → vai para /api/webauthn/login/options
      const options = await api('webauthn/login/options', {
        method: 'POST',
        body: { username: formData.user?.trim() || undefined },
      });
      const req = toRequestOptions(options);
      if (!req) throw new Error('Invalid WebAuthn request options');

      const cred = await navigator.credentials.get(req);
      const payload = credToJSON_Assertion(cred);

      const result = await api('webauthn/login/verify', {
        method: 'POST',
        body: payload,
      });
      if (result?.user) {
        onAuthSuccess(result.user, result.token);
      } else {
        setPasskeyMessage(result?.message || 'Could not sign in with passkey.');
      }
    } catch (e) {
      setPasskeyMessage(e?.message || 'Passkey sign-in failed.');
    } finally {
      setPasskeyBusy(false);
    }
  }, [formData.user, onAuthSuccess, webauthnReady]);

  // ====== Passkeys (registro)
  const registerPasskey = useCallback(async () => {
    setPasskeyMessage('');
    if (!webauthnReady) { setPasskeyMessage('Passkeys not supported on this device/browser.'); return; }
    setPasskeyBusy(true);
    try {
      const username = (currentUser?.email || currentUser?.login || formData.user || '').trim();
      const displayName = (currentUser?.fullName || username || 'User').trim();
      if (!username) {
        setPasskeyMessage('Type your username first to create a passkey.');
        setPasskeyBusy(false);
        return;
      }
      // ⚠️ sem "/" → vai para /api/webauthn/register/options
      const options = await api('webauthn/register/options', {
        method: 'POST',
        body: currentUser ? {
          userId: currentUser.id,
          username,
          displayName,
        } : { username, displayName },
      });

      const pubKey = toCreationOptions(options);
      if (!pubKey) throw new Error('Invalid WebAuthn creation options');

      const cred = await navigator.credentials.create(pubKey);
      const payload = credToJSON_Attestation(cred);

      const result = await api('webauthn/register/verify', {
        method: 'POST',
        body: payload,
      });
      if (result?.ok && result?.user) {
        onAuthSuccess(result.user, result.token);
        setPasskeyMessage('Passkey created and linked to your account.');
      } else if (result?.ok) {
        setPasskeyMessage('Passkey created. You can now sign in with “Sign in with Passkey”.');
      } else {
        setPasskeyMessage(result?.message || 'Could not complete passkey registration.');
      }
    } catch (e) {
      setPasskeyMessage(e?.message || 'Passkey registration failed.');
    } finally {
      setPasskeyBusy(false);
    }
  }, [currentUser, formData.user, onAuthSuccess, webauthnReady]);

  // ===== Logout helpers (encerra sessão servidor + client)
  const serverLogout = useCallback(async () => {
    try { await api('auth/logout', { method: 'POST' }); } catch {}
  }, []);
  const handleLogout = () => {
    setCurrentPage('login');
    setFormData({ user: '', password: '', email: '' });
    setError('');
    setSidebarOpen(true);
    setCurrentUser(null);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setMenuOpen(false);
    setShowIdleWarn(false);
    navigate('/', { replace: true });
  };
  const doLogout = useCallback(() => {
    serverLogout().finally(handleLogout);
  }, [serverLogout]);

  React.useEffect(() => {
    const onLogout = () => handleLogout();
    window.addEventListener("mimo:logout", onLogout);
    return () => window.removeEventListener("mimo:logout", onLogout);
  }, [handleLogout]);

  // ===== Idle timer (inatividade) — só quando logado
  useEffect(() => {
    if (!currentUser) return; // não ativa na tela de login
    let warnTimer, byeTimer;
    const reset = () => {
      clearTimeout(warnTimer);
      clearTimeout(byeTimer);
      setShowIdleWarn(false);
      warnTimer = setTimeout(() => setShowIdleWarn(true), Math.max(0, IDLE_LIMIT_MS - WARN_BEFORE_MS));
      byeTimer  = setTimeout(() => doLogout(), IDLE_LIMIT_MS);
    };
    idleRef.current.reset = reset;

    const onActivity = () => { setShowIdleWarn(false); reset(); };
    const events = ["click","keydown","mousemove","touchstart","visibilitychange"];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    reset();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      clearTimeout(warnTimer); clearTimeout(byeTimer);
    };
  }, [currentUser, doLogout]);

  // ===== Refresh silencioso
  const refreshAccessTokenSilently = useCallback(async () => {
    try {
      const res = await api('auth/refresh', { method: 'POST' });
      if (res?.accessToken) {
        try { localStorage.setItem(AUTH_TOKEN_KEY, res.accessToken); } catch {}
      }
    } catch {
      // falha de refresh: deixa o idle/401 cuidar
    }
  }, []);
  useEffect(() => {
    if (!currentUser) return;
    const t = setInterval(refreshAccessTokenSilently, REFRESH_EVERY_MS);
    return () => clearInterval(t);
  }, [currentUser, refreshAccessTokenSilently]);

  // ===== Re-hydrate sessão
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);

      if (token) {
        try {
          const { user } = await api('auth/me');
          onAuthSuccess(user, null); // token já está salvo
          return;
        } catch {
          localStorage.removeItem(AUTH_TOKEN_KEY);
        }
      }

      try {
        const raw = localStorage.getItem(CURRENT_USER_KEY);
        if (!raw) return;
        const user = JSON.parse(raw);
        const ensuredId = ensureStableId(user);
        const ensured = { ...user, id: ensuredId, avatarUrl: ensureDefaultAvatarForUser({ ...user, id: ensuredId }) };

        if (user.id !== ensuredId || !user.avatarUrl) {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(ensured));
        }

        normalizeUsersStore();

        setCurrentUser(ensured);

        migrateCalendarForUser(ensuredId);
        migratePaymentsForUser(ensured);

        const role = (ensured.role || '').toLowerCase();
        if (role === 'partner') {
          setCurrentPage('partner_wallet');
          if (!location.pathname.startsWith('/partner')) navigate('/partner', { replace: true });
        } else {
          setCurrentPage(role === 'finance' ? 'finance_home' : 'dashboard');
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isPartner = roleLower === 'partner';
  const isFinance = roleLower === 'finance';

  const partnerId = ensureStableId(currentUser || { email: 'anon@mimo' });
  const activeChannel = isFinance ? 'finance' : (isPartner ? `partner:${partnerId}` : 'admin');

  // Partner usa UI mobile; Admin/Finance desktop
  const isMobileUI = isPartner;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      setIsNarrowScreen(mq.matches);
      if ((currentUser?.role || '').toLowerCase() === 'partner') {
        setSidebarOpen(!mq.matches);
      }
    };
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, [currentUser]);

  // ===== ORDEM FIXA DO MENU ADMIN (sem position) =====
  const adminMenuItems = [
    { id: 'dashboard',       icon: LayoutDashboard, label: 'Dashboard',       description: 'Overview & Analytics' },
    { id: 'services',        icon: Settings,        label: 'Services',        description: 'Manage Partner Services' },
    { id: 'payments',        icon: CreditCard,      label: 'Payments',        description: 'Payment Processing' },
    { id: 'lightning_lanes', icon: Zap,             label: 'Lightning Lanes', description: 'LL viewer' },
    { id: 'billing_input',   icon: DollarSign,      label: 'Billing Input',   description: 'Send costs to Finance' },
    { id: 'team',            icon: UsersIcon,       label: 'Team',            description: 'Team directory' },
    { id: 'capacity',        icon: CalendarDays,    label: 'Capacity',        description: 'Partners availability' },
    { id: 'costs',           icon: DollarSign,      label: 'Costs',           description: 'Cost Management' },
    { id: 'users',           icon: UsersIcon,       label: 'User Management' },
  ];

  // ===== MENU FINANCE (sem position) =====
  const financeMenuItems = [
    { id: 'finance_home',      icon: LayoutDashboard, label: 'Home',                     description: 'Finance overview' },
    { id: 'finance_payroll',   icon: DollarSign,      label: 'Partner Payroll',          description: 'Approved/Shared/Paid' },
    { id: 'finance_ops',       icon: UsersIcon,       label: 'Client Costs',             description: 'Weekly costs' },
    { id: 'finance_lightning', icon: Zap,             label: 'Lightning Lane Dashboard', description: 'LL readings' },
    { id: 'Billing_Details',   icon: DollarSign,      label: 'Billing Details',          description: 'Invoice Entry' },
    { id: 'finance_profile',   icon: User,            label: 'Profile',                  description: 'Your profile' },
  ];

  const partnerMenuItems = [
    { id: 'partner_profile',        icon: User,         label: 'Profile',        description: 'Your data & settings' },
    { id: 'partner_wallet',         icon: Wallet,       label: 'Wallet',         description: 'Payments & approvals' },
    { id: 'partner_reimbursements', icon: DollarSign,   label: 'Reimbursements', description: 'Request reimbursements' },
    { id: 'partner_calendar',       icon: CalendarDays, label: 'Calendar',       description: 'Your upcoming tasks' },
    { id: 'partner_lightning_lanes',icon: Zap,          label: 'Lightning Lanes',description: 'LL manager' },
  ];

  const menuItems = isPartner ? partnerMenuItems : (isFinance ? financeMenuItems : adminMenuItems);

  const allMenusForHeader = [
    ...adminMenuItems,
    { id: 'finance_home',      label: 'Home' },
    { id: 'finance_payroll',   label: 'Partner Payroll' },
    { id: 'finance_ops',       label: 'Client Operations' },
    { id: 'finance_lightning', label: 'Lightning Lane Dashboard' },
    { id: 'Billing_Details',   label: 'Billing Details' },
    { id: 'finance_profile',   label: 'Profile' },
    { id: 'finance_center',    label: 'Home' }, // compat
    { id: 'partner_profile',         label: 'Profile' },
    { id: 'partner_wallet',          label: 'Wallet' },
    { id: 'partner_reimbursements',  label: 'Reimbursements' },
    { id: 'partner_calendar',        label: 'Calendar' },
    { id: 'partner_lightning_lanes', label: 'Lightning Lanes' },
  ];
  const pageLabel = (allMenusForHeader.find(i => i.id === currentPage)?.label) || (isPartner ? 'Wallet' : 'Dashboard');

  const handleUserUpdate = useCallback((patchOrUser) => {
    setCurrentUser(prev => {
      const next = { ...(prev || {}), ...(patchOrUser || {}) };
      try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ====== LOGIN SCREEN (global) ======
  if (currentPage === 'login') {
    return (
      <div className="login-container">
        <div className="animated-bg"></div>
        <div className="login-card glass-card">
          <h1 className="login-title">MIMO TEAM</h1>
          <p className="login-subtitle">Team Management and Performance Portal</p>

          {(error || passkeyMessage) && (
            <div className="error-message" style={{ whiteSpace: 'pre-wrap' }}>
              {error || passkeyMessage}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <input
                type="text"
                placeholder="Username"
                className="login-input"
                value={formData.user}
                onChange={(e) => updateField('user', e.target.value)}
                required
                disabled={isLoggingIn || passkeyBusy}
                autoComplete="username"
              />
            </div>

            <div className="input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                className="login-input"
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
                disabled={isLoggingIn || passkeyBusy}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle"
                disabled={isLoggingIn || passkeyBusy}
                aria-label="Toggle password"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <button
              type="submit"
              className="login-button modern-button"
              disabled={isLoggingIn || passkeyBusy}
            >
              {isLoggingIn ? (
                <>
                  <Loader size={20} className="animate-spin" style={{ marginRight: '8px' }} />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* —— Passkeys —— */}
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={loginWithPasskey}
              disabled={!webauthnReady || passkeyBusy}
              className="login-button passkey-login"
              title={webauthnReady ? 'Use a Passkey (FaceID/TouchID/Windows Hello)' : 'Passkeys not supported in this browser'}
            >
              {passkeyBusy ? 'Please wait…' : 'Sign in with Passkey'}
            </button>
            <button
              type="button"
              onClick={registerPasskey}
              disabled={!webauthnReady || passkeyBusy}
              className="login-button passkey-create"
              title="Create a Passkey for 1-tap login"
            >
              {passkeyBusy ? 'Please wait…' : 'Create a Passkey'}
            </button>
            {!webauthnReady && (
              <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                Your browser/device does not support Passkeys (WebAuthn).
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  const appLayoutClass = `app-layout ${isPartner && isMobileUI ? 'partner-mobile' : ''}`;
  const sidebarClass = (() => {
    const cls = ['sidebar'];
    if (isMobileUI) {
      if (sidebarOpen) cls.push('sidebar-open');
    } else {
      if (!sidebarOpen) cls.push('sidebar-closed');
    }
    return cls.join(' ');
  })();
  const mainContentClass = (() => {
    const cls = ['main-content'];
    if (!isMobileUI && !sidebarOpen) cls.push('sidebar-closed');
    return cls.join(' ');
  })();

  const currentUserId = ensureStableId(currentUser || { email: 'anon@mimo' });

  return (
    <NotificationsProvider>
      <NotificationsBridge currentUserId={currentUserId} />

      {/* Idle warning modal */}
      {showIdleWarn && (
        <div
          role="dialog"
          aria-modal="true"
          className="idle-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 9999
          }}
        >
          <div
            className="idle-modal"
            style={{
              background: 'var(--surface-1)', borderRadius: 12, padding: 20, width: 360, boxShadow: '0 12px 28px rgba(0,0,0,.25)'
            }}
          >
            <h3 style={{ marginTop: 0 }}>Still there?</h3>
            <p>You’ll be signed out soon due to inactivity.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                className="btn btn--outline"
                onClick={() => { setShowIdleWarn(false); idleRef.current.reset?.(); refreshAccessTokenSilently(); }}
              >
                Stay signed in
              </button>
              <button className="btn btn--primary" onClick={doLogout}>Sign out now</button>
            </div>
          </div>
        </div>
      )}

      <CostsProvider>
        <ServicesProvider>
          <PaymentsProvider>
            <HandoverProvider>

              {/* ======= PARTNER AREA ======= */}
              {isPartner ? (
                <Routes>
                  <Route path="/partner" element={<PartnerMobileLayout />}>
                    {/* Home = Wallet */}
                    <Route index element={<PartnerWallet currentUser={currentUser} coloredCards filtersOnTop />} />
                    <Route path="wallet" element={<PartnerWallet currentUser={currentUser} />} />
                    <Route path="reimbursements" element={<PartnerReimbursements currentUser={currentUser} />} />
                    <Route path="calendar" element={<PartnerCalendar currentUser={currentUser} />} />
                    <Route path="lightning-lanes" element={<PartnerLightningLanes currentUser={currentUser} />} />
                    <Route path="profile" element={
                      <PartnerProfile currentUser={currentUser} onUserUpdate={handleUserUpdate} />
                    } />
                  </Route>

                  {/* fallback partner */}
                  <Route path="*" element={<Navigate to="/partner" replace />} />
                </Routes>
              ) : (
                /* ======= ADMIN / FINANCE ======= */
                <div className={appLayoutClass}>
                  {/* Sidebar */}
                  <div
                    className={sidebarClass}
                    style={!isMobileUI ? { width: sidebarOpen ? SIDEBAR_W_OPEN : SIDEBAR_W_CLOSED } : undefined}
                  >
                    <div className="sidebar-header">
                      <div className="sidebar-logo">
                        <h2 className="logo-text">MIMO</h2>
                        {!isMobileUI && sidebarOpen && <span className="logo-subtitle">TEAM</span>}
                      </div>
                      <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label="Toggle sidebar"
                        aria-expanded={sidebarOpen}
                      >
                        {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                      </button>
                    </div>

                    <nav className="sidebar-nav">
                      {menuItems.map((item) => {
                        const IconComponent = item.icon;
                        const handleClick = () => {
                          setCurrentPage(item.id);
                        };
                        return (
                          <button
                            key={item.id}
                            data-key={item.id}
                            onClick={handleClick}
                            className={`nav-item ${currentPage === item.id ? 'nav-item-active' : ''}`}
                          >
                            <div className="nav-icon">
                              <IconComponent size={22} />
                            </div>
                            {sidebarOpen && (
                              <div className="nav-content">
                                <span className="nav-label">{item.label}</span>
                                <span className="nav-description">{item.description}</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </nav>

                    {(!isMobileUI && sidebarOpen) && (
                      <div className="sidebar-footer">
                        <div className="sidebar-footer-content">
                          <p className="footer-text">Mimo Team Portal</p>
                          <p className="footer-version">v2.0.1</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Main Content */}
                  <div className={mainContentClass}>
                    {/* Header */}
                    <header className={`app-header neumorphic`}>
                      <div className="header-left">
                        <div className="page-info">
                          <h1 className="page-title">{pageLabel}</h1>
                          <p className="page-subtitle">
                            {`Welcome — ${currentTime.toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}`}
                          </p>

                          <p className="page-userline" style={{ marginTop: 4, color:'var(--muted)' }}>
                            {(currentUser?.fullName || formData.user || '—')} — {currentUser?.department || (isFinance ? 'Finance' : 'Administrator')}
                          </p>
                        </div>
                      </div>

                      <div className="header-right">
                        <NotificationsBell
                          channel={activeChannel}
                          onNavigate={(pageId)=>setCurrentPage(pageId)}
                        />

                        <div className="user-profile">
                          <div className="user-avatar">
                            <User size={18} />
                          </div>
                          <div className="user-info">
                            <span className="user-name">{currentUser?.fullName || formData.user || 'User'}</span>
                            <span className="user-role">{currentUser?.department || (isFinance ? 'Finance' : 'Administrator')}</span>
                          </div>
                        </div>

                        <button className="logout-btn" onClick={doLogout} title="Sign Out">
                          <LogOut size={18} />
                        </button>
                      </div>
                    </header>

                    {/* Page Content */}
                    <div className="page-content">
                      {/* Admin */}
                      {currentPage === 'dashboard' && !isFinance && <Dashboard currentUserName={formData.user || 'Admin User'} currentUserRole="Administrator" />}
                      {currentPage === 'services' && !isFinance && <Services currentUser={currentUser} />}
                      {currentPage === 'payments' && !isFinance && <Payments />}
                      {currentPage === 'costs' && !isFinance && <Costs />}
                      {currentPage === 'capacity' && !isFinance && <Capacity />}
                      {currentPage === 'users' && !isFinance && <UsersPage />}

                      {/* Admin novas */}
                      {currentPage === 'lightning_lanes' && !isFinance && <LightningLanes />}
                      {currentPage === 'team'            && !isFinance && <Team />}
                      {currentPage === 'billing_input'   && !isFinance && <AdminBillingInput />}

                      {/* Finance */}
                      {isFinance && (currentPage === 'finance_home' || currentPage === 'finance_center') && <FinanceDashboard />}
                      {isFinance && currentPage === 'finance_payroll'   && <PartnerPayroll />}
                      {isFinance && currentPage === 'finance_ops'       && <ClientOperations />}
                      {isFinance && currentPage === 'finance_lightning' && <LightningLaneDashboard />}
                      {isFinance && currentPage === 'Billing_Details'   && <BillingDetails />}
                      {isFinance && currentPage === 'finance_profile'   && (
                        <FinanceProfile currentUser={currentUser} onUserUpdate={handleUserUpdate} />
                      )}
                    </div>
                  </div>
                </div>
              )}

            </HandoverProvider>
          </PaymentsProvider>
        </ServicesProvider>
      </CostsProvider>
    </NotificationsProvider>
  );
}
export default App;
