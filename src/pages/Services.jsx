// src/pages/Services.jsx  (Parte 1/4)
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Settings, DollarSign, ShoppingCart, User, Calendar, Clock, Users, MapPin, Plus,
  Edit3, Trash2, RefreshCw, Save, AlertCircle, CheckCircle, Loader, Eye, Calculator,
  Building, Plane, Baby, Coffee, Car, Home, Globe, X, AlertTriangle, Info,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, List, Copy, Download
} from 'lucide-react';
import '../styles/Services.css';
import { useCosts } from '../contexts/CostsContext';
import { api as http } from '../api/http';

// 🔌 API (backend)
import {
  fetchServices,
  createServicesBulk,
  updateService,
  deleteService,
} from '../api/services';
import { fetchUsers as fetchUsersApi } from '../api/users';

/* ============================== DEBUG ============================== */
const DEBUG = (() => {
  try {
    return localStorage.getItem('debug_services') === '1' || localStorage.debug_services === '1';
  } catch { return false; }
})();
const dbg = (...args) => { if (DEBUG) console.log('[Services]', ...args); };

/* ============================== Helpers ============================== */

// Pagamentos armazenados no localStorage (para exibir vínculo visual)
const PAYMENTS_KEYS = ['payments_v1', 'payments', 'generated_payments'];
const safeParse = (raw, fb = []) => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fb; } catch { return fb; } };
const loadFirstHit = (keys) => { for (const k of keys) { const raw = localStorage.getItem(k); if (raw) return safeParse(raw); } return [];

// Ícone fallback
};
const asIcon = (MaybeIcon) => (typeof MaybeIcon === 'function' ? MaybeIcon : Settings);

// Padroniza: Primeira letra maiúscula, demais minúsculas
function titleCaseStrict(str = '') {
  return String(str).trim().toLowerCase().split(/\s+/)
    .map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(' ');
}

// Formata "YYYY-MM-DD" para data local (meio-dia local p/ evitar -1 dia)
function formatYmdToLocale(ymd, locale = 'en-US') {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  try {
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0) : new Date(ymd);
    return d.toLocaleDateString(locale, { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return String(ymd);
  }
}

// Parser de erro padronizado
function parseApiError(e) {
  const status = e?.status || e?.response?.status || null;
  const data = e?.data || e?.response?.data || {};
  const msgs = [];

  if (typeof data === 'string') msgs.push(data);
  if (data?.message) msgs.push(data.message);
  if (data?.error) msgs.push(data.error);
  if (data?.title) msgs.push(data.title);
  if (data?.detail) msgs.push(data.detail);

  if (Array.isArray(data?.errors)) {
    const list = data.errors.map(err =>
      typeof err === 'string' ? err : (err?.msg || err?.message || JSON.stringify(err))
    );
    if (list.length) msgs.push(list.join('; '));
  }
  if (data && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
    const list = [];
    for (const [k, v] of Object.entries(data.errors)) {
      if (Array.isArray(v)) list.push(`${k}: ${v.join(', ')}`);
      else if (v) list.push(`${k}: ${String(v)}`);
    }
    if (list.length) msgs.push(list.join(' | '));
  }

  if (!msgs.length) msgs.push(e?.message || 'Unknown error');
  return `${status ? `[${status}] ` : ''}${msgs.join(' | ')}`;
}

/* ========= Detector do bug do Mongoose (strict + upsert + "date") ========= */
function isStrictUpsertDateError(err) {
  try {
    const bag = [];
    if (err?.message) bag.push(String(err.message));
    const d = err?.data || err?.response?.data;
    if (d) {
      if (typeof d === 'string') bag.push(d);
      if (typeof d === 'object') {
        if (d.error) bag.push(String(d.error));
        if (d.message) bag.push(String(d.message));
        if (d.detail) bag.push(String(d.detail));
        if (Array.isArray(d.errors)) {
          for (const e of d.errors) {
            if (typeof e === 'string') bag.push(e);
            else if (e && typeof e === 'object') {
              if (e.error) bag.push(String(e.error));
              if (e.message) bag.push(String(e.message));
              if (e.detail) bag.push(String(e.detail));
            }
          }
        }
      }
    }
    const text = bag.join(' | ');
    return (
      /Path\s+"?date"?\s+is\s+not\s+in\s+schema/i.test(text) &&
      /upsert\s+is\s+`?true`?/i.test(text)
    );
  } catch { return false; }
}

/* ========= Mapa de ordenação (UI -> API) ========= */
const SORT_MAP = {
  client: 'firstName',
  partner: 'partnerName',
  serviceDate: 'serviceDate',
  finalValue: 'finalValue',
  team: 'team',
};

/* ============================== API Wrappers ============================== */

async function fetchServicesCompat(params) {
  const { page, pageSize, sortField, sortDirection, filters = {}, search } = params || {};

  const cleanFilters = Object.fromEntries(
    Object.entries(filters || {}).filter(([, v]) => v !== '' && v != null)
  );

  const sortBy = SORT_MAP[sortField] || sortField || 'serviceDate';
  const sortDir = (sortDirection || 'desc').toLowerCase();

  dbg('GET /services -> params', { page, pageSize, sortBy, sortDir, q: search, filters: cleanFilters });
  return await fetchServices({
    page,
    pageSize,
    sortBy,
    sortDir,
    q: search || undefined,
    filters: cleanFilters,
  });
}

// ---------- Bulk compat helpers ----------
const toSnakeKey = (k) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toSnakeArray = (arr) => arr.map((obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnakeKey(k), v]))
);

const isRetryableValidation = (err) => {
  const s = err?.status ?? err?.response?.status ?? null;
  return s === 400 || s === 404 || s === 415 || s === 422;
};

// POST /services (um por um) — fallback do bulk
async function createServicesOneByOne(items) {
  dbg('Fallback item-a-item: iniciando', items.length, 'itens');
  const results = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const res = await http.post('/services', items[i]);
      results.push(res?.data ?? res);
    } catch (e) {
      throw { ...e, index: i };
    }
  }
  dbg('Fallback item-a-item: concluído com sucesso', results.length, 'itens');
  return { saved: results.length, failed: 0, items: results };
}

// Tenta uma sequência de payloads diferentes até um passar
async function tryBulkVariants(items) {
  const variants = [
    { shape: '{items}', body: { items } },
    { shape: '[array]', body: items },
    { shape: '{data}', body: { data: items } },
    { shape: '{rows}', body: { rows: items } },
    { shape: '{services}', body: { services: items } },
  ];

  for (const v of variants) {
    try {
      const res = await createServicesBulk(v.body);
      return res?.data ?? res;
    } catch (e) {
      if (isStrictUpsertDateError(e)) return await createServicesOneByOne(items);
      const d = e?.data || e?.response?.data;
      if (e?.status === 400 && d && typeof d === 'object' && Number(d.saved) === 0 && Number(d.failed) > 0) {
        return await createServicesOneByOne(items);
      }
      // tenta próxima variante
    }
  }

  // Variante snake
  try {
    const snake = items.map((it) => {
      const { partnerId, serviceTypeId, ...rest } = it;
      const snakeRest = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), v])
      );
      return { ...snakeRest, partnerId, serviceTypeId };
    });
    const res = await createServicesBulk({ items: snake });
    return res?.data ?? res;
  } catch (e) {
    if (isStrictUpsertDateError(e)) return await createServicesOneByOne(items);
    const d = e?.data || e?.response?.data;
    if (e?.status === 400 && d && typeof d === 'object' && Number(d.saved) === 0 && Number(d.failed) > 0) {
      return await createServicesOneByOne(items);
    }
    throw e;
  }
}

async function createServicesBulkCompat(items) {
  try {
    const res = await tryBulkVariants(items);
    return res;
  } catch (e) {
    throw e;
  }
}

// UPDATE compat (tenta API service + PUT/PATCH variantes)
async function updateServiceCompat(id, payload) {
  try {
    const r = await updateService(id, payload);
    return r?.data ?? r;
  } catch (e1) {
    const variants = [
      { m: 'put',   url: `/services/${id}`, body: payload },
      { m: 'patch', url: `/services/${id}`, body: payload },
      { m: 'put',   url: `/services/${id}`, body: { data: payload } },
      { m: 'patch', url: `/services/${id}`, body: { data: payload } },
    ];
    for (const v of variants) {
      try {
        const res = await http[v.m](v.url, v.body);
        return res?.data ?? res;
      } catch {}
    }
    throw e1;
  }
}

/* ======================= DELETE compat (revisado e simplificado) ======================= */

// individual (usa somente a rota canônica)
async function deleteServiceCompat(id) {
  console.groupCollapsed('[Services] deleteServiceCompat', id);
  try {
    // wrapper já aponta para DELETE /services/:id
    const r = await deleteService(id);
    console.info('[Services] deleteService OK');
    return r;
  } catch (e) {
    const status = e?.response?.status || e?.status;
    if (DEBUG) console.warn('[Services] deleteService ERRO', status, e?.response?.data || e);
    if (status === 404) throw new Error('Service not found (404).');
    if (status === 400) throw new Error('Invalid service id (400).');
    throw new Error(parseApiError(e));
  } finally {
    console.groupEnd();
  }
}

// bulk (ordem: POST /services/bulk-delete -> DELETE /services (body) -> DELETE /services?ids=csv)
async function deleteServicesBulk(ids) {
  const list = Array.from(new Set((ids || []).map(String))).filter(Boolean);
  if (!list.length) return;

  const CHUNK = 200;
  const chunks = Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) =>
    list.slice(i * CHUNK, i * CHUNK + CHUNK)
  );

  for (const part of chunks) {
    let ok = false;

    // 1) POST /services/bulk-delete
    try {
      await http.post('/services/bulk-delete', { ids: part });
      ok = true;
    } catch (e1) {
      if (DEBUG) console.warn('[Services] bulk-delete POST falhou', e1?.response?.status, e1?.response?.data || e1);

      // 2) DELETE /services com body { ids: [] }
      try {
        await http.delete('/services', { data: { ids: part } });
        ok = true;
      } catch (e2) {
        if (DEBUG) console.warn('[Services] bulk DELETE(body) falhou', e2?.response?.status, e2?.response?.data || e2);

        // 3) DELETE /services?ids=a,b,c
        try {
          await http.delete('/services', { params: { ids: part.join(',') } });
          ok = true;
        } catch (e3) {
          if (DEBUG) console.warn('[Services] bulk DELETE(query) falhou', e3?.response?.status, e3?.response?.data || e3);
          const msg = parseApiError(e3 || e2 || e1) || 'Bulk delete failed';
          throw new Error(msg);
        }
      }
    }

    if (DEBUG && ok) console.info(`[Services] bulk delete OK (${part.length} itens)`);
  }
}
// src/pages/Services.jsx  (Parte 2/4)
const Services = () => {
  /* ===== ESTADOS DO FORM ===== */
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    serviceDate: '',
    partner: '',
    team: '',
    serviceType: '',
    serviceTime: '',
    park: '',
    location: '',
    hopper: false,
    guests: '',
    observations: '',
    serviceValue: '' // override manual
  });

  /* ===== ESTADOS GERAIS ===== */
  const [cart, setCart] = useState([]);
  const [priceState, setPriceState] = useState({
    status: 'idle',
    data: null,
    error: null,
    requestId: null
  });
  const { lookupCost } = useCosts();

  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editSource, setEditSource] = useState(null); // 'cart' | 'list'
  const [currentWeek, setCurrentWeek] = useState(null);

  // ===== LISTAGEM (via backend) =====
  const [services, setServices] = useState({ data: [], totalPages: 1, totalRecords: 0, currentPage: 1 });
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('serviceDate');
  const [sortDirection, setSortDirection] = useState('desc');

  // Filtros
  const [filters, setFilters] = useState({
    partner: '',
    serviceType: '',
    team: '',
    status: '',
  });

  // Inline edit (valor) + seleção para bulk delete
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // View inicial
  const [viewMode, setViewMode] = useState('list'); // 'form' | 'list'

  // Parceiros ativos (via backend)
  const [activePartners, setActivePartners] = useState([]);

  // Pagamentos (para mostrar badge de vínculo)
  const [paymentsStore, setPaymentsStore] = useState([]);

  /* ===== REFS ===== */
  const cancelTokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const firstNameRef = useRef(null);
  const serviceDateRef = useRef(null);
  const addToCartRef = useRef(() => {});

  /* ===== NOTIFICAÇÕES ===== */
  const [notifications, setNotifications] = useState([]);
  const addNotification = (type, title, message) => {
    const id = (globalThis.crypto?.randomUUID?.() || `ntf_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    setNotifications(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => { setNotifications(prev => prev.filter(n => n.id !== id)); }, 5000);
  };
  const removeNotification = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  /* ===== Select options ===== */
  const guestOptions = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({ value: i + 1, label: `${i + 1} ${i === 0 ? 'guest' : 'guests'}` })),
    []
  );
  const timeOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} ${i === 0 ? 'hour' : 'hours'}` })),
    []
  );

  /* ===== Teams, Types ===== */
  const teams = useMemo(() => ([
    { id: 'US', name: 'US Team' },
    { id: 'BR', name: 'Brazil Team' }
  ]), []);

  const serviceTypes = useMemo(() => ([
    // Variável
    { id: 'IN_PERSON_TOUR', name: 'In-Person Tour', icon: MapPin,  category: 'variable', basePrice: 150, requiredFields: ['team','park','location','guests'], description: 'Guided tour with physical presence' },
    { id: 'VIRTUAL_TOUR',   name: 'Virtual Tour',   icon: MapPin,  category: 'variable', basePrice: 80,  requiredFields: ['team','park','location','guests'], description: 'Remote guided tour experience' },
    { id: 'COORDINATOR',    name: 'Coordinator',    icon: MapPin,  category: 'variable', basePrice: 200, requiredFields: ['team','park','location','guests'], description: 'Event planning and coordination' },
    { id: 'ASSISTANCE',     name: 'Assistance',     icon: MapPin,  category: 'variable', basePrice: 200, requiredFields: ['team','park','location','guests'], description: 'General assistance' },

    // Fixo
    { id: 'CONCIERGE', name: 'Concierge Service', icon: Coffee,   category: 'fixed', basePrice: 120, requiredFields: [], description: 'General assistance and recommendations' },
    { id: 'TICKET_DELIVERY', name: 'Ticket Delivery', icon: Car,  category: 'fixed', basePrice: 25, requiredFields: [], description: 'Ticket delivery service' },
    { id: 'DELIVERY', name: 'Delivery Service', icon: Car,        category: 'fixed', basePrice: 25, requiredFields: [], description: 'General delivery service' },
    { id: 'AIRPORT_ASSISTANCE', name: 'Airport Assistance', icon: Plane, category: 'fixed', basePrice: 85, requiredFields: [], description: 'Airport assistance and transportation' },
    { id: 'VACATION_HOME_ASSISTANCE', name: 'Vacation Home Assistance', icon: Home, category: 'fixed', basePrice: 75, requiredFields: [], description: 'Vacation rental assistance' },
    { id: 'HOTEL_ASSISTANCE', name: 'Hotel Assistance', icon: Building, category: 'fixed', basePrice: 65, requiredFields: [], description: 'Hotel-related assistance' },
    { id: 'ADJUSTMENT', name: 'Adjustment', icon: DollarSign, category: 'fixed', basePrice: 10, requiredFields: [], description: 'Adjustment' },
    { id: 'REIMBURSEMENT', name: 'Reimbursement', icon: DollarSign, category: 'fixed', basePrice: 10, requiredFields: [], description: 'Reimbursement' },
    { id: 'EXTRA_HOUR', name: 'Extra Hour', icon: DollarSign, category: 'fixed', basePrice: 10, requiredFields: [], description: 'Extra Hour' },
    { id: 'TIP', name: 'Tip', icon: DollarSign, category: 'fixed', basePrice: 10, requiredFields: [], description: 'Tip' },

    // Por hora
    { id: 'BABYSITTER', name: 'Babysitter', icon: Baby, category: 'hourly', basePrice: 35, requiredFields: ['serviceTime'], optionalFields: ['team'], description: 'Childcare services' }
  ]), []);

  /* ===== Localizações e Parques ===== */
  const locations = useMemo(() => (['Orlando','Califórnia']), []);
  const parksByLocation = useMemo(() => ({
    Orlando: [
      'Disney World','Universal Studios','Epic','SeaWorld','Busch Gardens','Legoland','Peppa Pig','Volcano Bay'
    ],
    'Califórnia': [
      'Disneyland','Universal Hollywood','Six Flags'
    ]
  }), []);
  const availableParks = formData.location ? (parksByLocation[formData.location] || []) : [];

  // Backend usa (provável): RECORDED / IN_PAYMENT / APPROVED / PAID / DENIED.
  const serviceStatuses = useMemo(() => ([
    { id: 'RECORDED', name: 'Pending',   color: '#6B7280' },
    { id: 'IN_PAYMENT', name: 'Waiting to approve', color: '#F59E0B' },
    { id: 'DENIED', name: 'Denied',   color: '#EF4444' },
    { id: 'APPROVED', name: 'Paid',   color: '#10B981' },
    { id: 'PAID', name: 'Paid', color: '#10B981' }
  ]), []);

  /* ===== Atalhos ===== */
  useEffect(() => {
    if (viewMode === 'form') {
      setTimeout(() => firstNameRef.current?.focus(), 60);
    }
  }, [viewMode]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isTextarea = tag === 'textarea';
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!isTextarea) addToCartRef.current(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); firstNameRef.current?.focus(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); serviceDateRef.current?.focus(); return; }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ===== Semana de pagamento ===== */
  useEffect(() => {
    const calculatePaymentWeek = () => {
      const now = new Date();
      const currentDay = now.getDay(); // 0=Dom, 3=Qua
      let weekStart = new Date(now);
      const daysToSubtract = currentDay >= 3 ? currentDay - 3 : currentDay + 4;
      weekStart.setDate(now.getDate() - daysToSubtract);
      weekStart.setHours(0,0,0,0);
      let weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23,59,59,999);
      setCurrentWeek({
        start: weekStart,
        end: weekEnd,
        year: weekStart.getFullYear(),
        month: weekStart.getMonth() + 1,
        weekNumber: getWeekNumber(weekStart)
      });
    };
    const getWeekNumber = (date) => {
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
      return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    };
    calculatePaymentWeek();
  }, []);

  const normalizePaymentStatus = (s) => {
    const v = String(s || '').toUpperCase();
    if (v === 'PAID') return 'PAID';
    if (v === 'APPROVED') return 'APPROVED';
    if (v === 'IN_PAYMENT' || v === 'PENDING') return 'PENDING';
    return 'PENDING';
  };

  /* ===== Carrega pagamentos (local) p/ badge de vínculo ===== */
  useEffect(() => { setPaymentsStore(loadFirstHit(PAYMENTS_KEYS)); }, []);
  useEffect(() => {
    const onStorage = (e) => { if (e.key && PAYMENTS_KEYS.includes(e.key)) setPaymentsStore(loadFirstHit(PAYMENTS_KEYS)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Mapa serviceId -> pagamento mais recente
  function extractServiceIds(payment) {
    const out = new Set();
    if (Array.isArray(payment.serviceIds)) payment.serviceIds.forEach(id => id && out.add(id));
    if (Array.isArray(payment.services)) {
      payment.services.forEach(s => { const id = (s && (s.id || s.serviceId)) || s; if (id) out.add(id); });
    }
    if (Array.isArray(payment.items)) {
      payment.items.forEach(it => { const id = it?.service?.id || it?.serviceId || it?.id; if (id) out.add(id); });
    }
    return Array.from(out);
  }
  const paymentIndex = useMemo(() => {
    const idx = new Map();
    (paymentsStore || []).forEach(p => {
      const ids = extractServiceIds(p);
      const ts = new Date(p.updatedAt || p.createdAt || 0).getTime();
      ids.forEach(id => {
        const key = String(id);
        const prev = idx.get(key);
        if (!prev || ts >= prev.ts) {
          idx.set(key, {
            paymentId: p.id || p.paymentId || null,
            status: normalizePaymentStatus(p.status),
            weekKey: p.weekKey || null,
            ts
          });
        }
      });
    });
    return idx;
  }, [paymentsStore]);

  const paymentStorageKey = PAYMENTS_KEYS.find(k => localStorage.getItem(k)) || 'generated_payments';

  const currentWeekKey = (cw) =>
    cw ? `${cw.year}-W${String(cw.weekNumber).padStart(2, '0')}` : null;

  const upsertServiceIntoPaymentLocal = (payment, serviceId) => {
    const key = paymentStorageKey;
    const all = loadFirstHit([key]);

    const targetId = payment.id || payment.paymentId;
    const target = all.find(p => (p.id || p.paymentId) === targetId);
    if (!target) return false;

    if (!Array.isArray(target.services)) target.services = [];
    const already = extractServiceIds(target).some(id => String(id) === String(serviceId));
    if (!already) target.services.push({ serviceId });

    target.updatedAt = new Date().toISOString();

    const updated = all.map(p => ((p.id || p.paymentId) === targetId ? target : p));
    localStorage.setItem(key, JSON.stringify(updated));
    return updated;
  };

  /* ===== Carrega parceiros (backend) ===== */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchUsersApi({ role: 'partner', status: 'active', page: 1, pageSize: 1000 });
        const arr = Array.isArray(res.items) ? res.items : (Array.isArray(res.data) ? res.data : []);
        const mapped = arr.map(u => ({
          id: String(u._id || u.id),
          name: u.fullName || u.login || '(no name)',
          email: u.email || '',
          role: u.role,
          funcao: u.funcao || null,
        }));
        setActivePartners(mapped);
      } catch {
        try {
          const raw = localStorage.getItem('users_store_v1');
          const arr = raw ? JSON.parse(raw) : [];
          const mapped = (Array.isArray(arr) ? arr : [])
            .filter(u => (u.role?.toLowerCase() === 'partner') && ((u.status || 'active').toLowerCase() === 'active'))
            .map(u => ({
              id: String(u._id || u.id),
              name: u.fullName || u.login || '(no name)',
              email: u.email || '',
              role: u.role,
              funcao: u.funcao || null,
            }));
          setActivePartners(mapped);
        } catch { setActivePartners([]); }
      }
    })();
  }, []);

  /* ===== Normalização vinda do backend ===== */
  const normalizeFromApi = (it) => {
    const serviceTypeId = it.serviceTypeId || it.serviceType?.id || it.serviceType || null;
    const stHit = serviceTypes.find(s => s.id === serviceTypeId);

    const rawPartner = it.partner;
    const partnerId =
      it.partnerId ||
      (rawPartner && (rawPartner._id || rawPartner.id)) ||
      (typeof rawPartner === 'string' ? rawPartner : null);

    const partnerHitDb = rawPartner && typeof rawPartner === 'object'
      ? {
          id: String(rawPartner._id || rawPartner.id),
          name: rawPartner.fullName || rawPartner.login || '(no name)',
          email: rawPartner.email || '',
          role: rawPartner.role,
        }
      : null;

    const partnerHitList = activePartners.find(p => String(p.id) === String(partnerId));
    const partnerNorm = partnerHitDb || partnerHitList || (partnerId
      ? { id: String(partnerId), name: it.partnerName || '(partner)' }
      : null);

    const statusId = (typeof it.status === 'string' ? it.status : it.status?.id) || 'RECORDED';
    const statusHit = serviceStatuses.find(s => s.id === statusId) || { id: 'RECORDED', name: 'Pending', color: '#6B7280' };

    return {
      id: String(it._id || it.id),
      serviceDate: it.serviceDate,
      firstName: it.firstName,
      lastName: it.lastName,
      partner: partnerNorm,
      team: it.team || '',
      serviceType: stHit
        ? { id: stHit.id, name: stHit.name, icon: stHit.icon, category: stHit.category }
        : { id: serviceTypeId, name: it.serviceTypeName || (serviceTypeId || 'Unknown'), icon: Settings, category: it.category || 'fixed' },
      serviceTime: it.serviceTime ?? '',
      park: it.park || '',
      location: it.location || '',
      hopper: !!it.hopper,
      guests: it.guests ?? '',
      observations: it.observations || '',
      finalValue: Number(it.finalValue ?? it.value ?? 0),
      overrideValue: it.overrideValue ?? null,
      calculatedPrice: it.calculatedPrice || null,
      status: statusHit,
      createdAt: it.createdAt || new Date().toISOString(),
    };
  };
// src/pages/Services.jsx  (Parte 3/4)
/* ===== PRICE ===== */
const canCalculate = (data) => {
  if (!data?.serviceType || !data?.partner) return false;
  const st = serviceTypes.find(s => s.id === data.serviceType);
  if (!st) return false;
  if (st.category === 'variable') return !!(data.team && data.park && data.location && data.guests !== '' && data.guests !== null);
  if (st.category === 'hourly')   return !!(data.serviceTime && parseInt(data.serviceTime) > 0);
  return true;
};

const validatePriceParams = (data) => {
  if (!data.serviceType || !data.partner) return { valid: false, reason: 'Missing service type or partner' };
  const serviceType = serviceTypes.find(s => s.id === data.serviceType);
  if (!serviceType) return { valid: false, reason: 'Invalid service type' };
  switch (serviceType.category) {
    case 'variable':
      if (!data.team || !data.park || !data.location || data.guests === null || data.guests === '') {
        return { valid: false, reason: 'Missing required fields for variable service' };
      }
      break;
    case 'hourly':
      if (!data.serviceTime || parseInt(data.serviceTime) < 1) {
        return { valid: false, reason: 'Invalid service time for hourly service' };
      }
      break;
    default: break;
  }
  return { valid: true };
};

const calculateServicePrice = useCallback(async (data) => {
  if (cancelTokenRef.current) cancelTokenRef.current.cancelled = true;

  const validation = validatePriceParams(data);
  if (!validation.valid) { setPriceState({ status: 'idle', data: null, error: null, requestId: null }); return; }

  const requestId = ++requestIdRef.current;
  const cancelToken = { cancelled: false };
  cancelTokenRef.current = cancelToken;
  setPriceState({ status: 'loading', data: null, error: null, requestId });

  try {
    await new Promise(r => setTimeout(r, 250));
    if (cancelToken.cancelled) return;

    const serviceType = serviceTypes.find(s => s.id === data.serviceType);
    if (!serviceType) throw new Error('Service type not found');

    let price;
    const breakdown = { basePrice: 0, adjustments: [], finalPrice: 0 };

    const hit = typeof lookupCost === 'function' ? lookupCost(data) : null;

    if (hit && typeof hit.amount === 'number') {
      price = hit.amount;
      breakdown.basePrice = hit.amount;

      if (serviceType.category === 'hourly') {
        const hours = parseInt(data.serviceTime) || 1;
        const keyHasHours = hit.keyFields?.includes?.('hours');
        if (!keyHasHours && hours > 1) {
          price *= hours;
          breakdown.adjustments.push({ type: 'hours', description: `${hours} hours`, multiplier: hours });
        }
        if (hours > 4) {
          price *= 0.9;
          breakdown.adjustments.push({ type: 'bulk_discount', description: '4+ hours discount', multiplier: 0.9 });
        }
      }

      if (serviceType.category === 'variable') {
        const keyHasHopper = hit.keyFields?.includes?.('hopper');
        if (!keyHasHopper && data.hopper) {
          price *= 2;
          breakdown.adjustments.push({ type: 'hopper', description: 'Park hopper (x2)', multiplier: 2 });
        }
      }
    } else {
      price = serviceType.basePrice;
      breakdown.basePrice = serviceType.basePrice;

      switch (serviceType.category) {
        case 'variable': {
          const guests = parseInt(data.guests) || 1;
          if (guests > 1) {
            const guestMultiplier = Math.max(1, guests * 0.8);
            price *= guestMultiplier;
            breakdown.adjustments.push({ type: 'guests', description: `${guests} guests`, multiplier: 0.8 * guests });
          }
          if (data.park && (data.park.includes('Universal') || data.park.includes('Epic'))) {
            price *= 1.2;
            breakdown.adjustments.push({ type: 'premium_park', description: 'Premium park surcharge', multiplier: 1.2 });
          }
          if (data.hopper) {
            price *= 2;
            breakdown.adjustments.push({ type: 'hopper', description: 'Park hopper (x2)', multiplier: 2 });
          }
          if (data.location === 'Califórnia') {
            price *= 1.15;
            breakdown.adjustments.push({ type: 'location', description: 'California location', multiplier: 1.15 });
          }
          if (data.team === 'US') {
            price *= 1.1;
            breakdown.adjustments.push({ type: 'team', description: 'US Team premium', multiplier: 1.1 });
          }
          break;
        }
        case 'hourly': {
          const hours = parseInt(data.serviceTime) || 1;
          price *= hours;
          breakdown.adjustments.push({ type: 'hours', description: `${hours} hours`, multiplier: hours });
          if (hours > 4) {
            price *= 0.9;
            breakdown.adjustments.push({ type: 'bulk_discount', description: '4+ hours discount', multiplier: 0.9 });
          }
          if (data.team === 'US') {
            price *= 1.1;
            breakdown.adjustments.push({ type: 'team', description: 'US Team premium', multiplier: 1.1 });
          }
          break;
        }
        case 'fixed':
        default:
          break;
      }
    }

    price = Math.round(price * 100) / 100;
    breakdown.finalPrice = price;

    if (cancelToken.cancelled) return;
    if (requestId === requestIdRef.current) {
      setPriceState({
        status: 'success',
        data: { amount: price, breakdown, ruleId: `RULE_${serviceType.category.toUpperCase()}_${Date.now()}` },
        error: null,
        requestId
      });
    }
  } catch (err) {
    if (!cancelToken.cancelled && requestId === requestIdRef.current) {
      setPriceState({ status: 'error', data: null, error: err.message || 'Failed to calculate price', requestId });
    }
  }
}, [serviceTypes, lookupCost]);

// debounce helper
function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
const debouncedCalculatePrice = useCallback(debounce(calculateServicePrice, 350), [calculateServicePrice]);

const handleRecalculate = () => { calculateServicePrice(formData); };
const handleUseSuggested = () => {
  if (priceState.status === 'success' && priceState.data) {
    setFormData(prev => ({ ...prev, serviceValue: priceState.data.amount.toString() }));
  }
};

/* ===== VALIDAÇÃO FORM ===== */
const validateForm = () => {
  const newErrors = {};
  if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
  if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
  if (!formData.serviceDate) newErrors.serviceDate = 'Service date is required';
  if (!formData.partner) newErrors.partner = 'Partner is required';
  if (!formData.serviceType) newErrors.serviceType = 'Service type is required';

  const selectedServiceType = serviceTypes.find(s => s.id === formData.serviceType);
  if (selectedServiceType) {
    selectedServiceType.requiredFields?.forEach(field => {
      const v = formData[field];
      const isMissing =
        v === undefined || v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (Array.isArray(v) && v.length === 0);
      if (isMissing) {
        const names = { team:'Team', park:'Park', location:'Location', guests:'Number of guests', serviceTime:'Service time', hopper:'Park hopper option' };
        newErrors[field] = `${names[field] || field} is required`;
      }
    });

    if (selectedServiceType.category === 'variable' && !formData.team) {
      newErrors.team = 'Team is required for variable price services';
    }
  }

  if (formData.serviceValue && (isNaN(formData.serviceValue) || parseFloat(formData.serviceValue) < 0)) {
    newErrors.serviceValue = 'Service value must be a valid positive number';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

/* ===== INPUT CHANGE ===== */
const handleInputChange = (field, value) => {
  setFormData(prev => {
    const next = { ...prev, [field]: value };
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));

    if (field === 'firstName') next.firstName = titleCaseStrict(value);
    if (field === 'lastName') next.lastName = titleCaseStrict(value);

    if (field === 'serviceType' && value) {
      const st = serviceTypes.find(s => s.id === value);
      if (st?.category === 'variable') {
        setTimeout(() => {
          const teamSelect = document.querySelector('select[data-field="team"]');
          teamSelect?.focus();
        }, 100);
      }
    }

    const priceFields = new Set(['serviceType','partner','team','park','location','guests','serviceTime','hopper']);
    if (priceFields.has(field)) {
      if (canCalculate(next)) debouncedCalculatePrice(next);
      else setPriceState(ps => ({ ...ps, status: 'idle', data: null, error: null }));
    }

    if (field === 'location') {
      const parksHere = parksByLocation[value] || [];
      if (next.park && !parksHere.includes(next.park)) next.park = '';
    }

    return next;
  });
};

// dispara cálculo quando possível; zera se não der
useEffect(() => {
  if (canCalculate(formData)) debouncedCalculatePrice(formData);
  else {
    setPriceState(prev => {
      if (prev.status === 'idle' && prev.data == null && prev.error == null) return prev;
      return { status:'idle', data:null, error:null, requestId: prev?.requestId ?? null };
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [formData]);

/* ===== CARRINHO ===== */
function resetForm(mode = 'soft') {
  if (mode === 'hard') {
    setFormData({
      firstName: '', lastName: '', serviceDate: '', partner: '', team: '',
      serviceType: '', serviceTime: '', park: '', location: '', hopper: false,
      guests: '', observations: '', serviceValue: ''
    });
  } else {
    setFormData(prev => ({
      firstName: prev.firstName, lastName: prev.lastName,
      serviceDate: '', partner: '', team: '',
      serviceType: '', serviceTime: '', park: '', location: '',
      hopper: false, guests: '', observations: '', serviceValue: ''
    }));
  }
  setErrors({});
  setEditingId(null);
  setEditSource(null);
  setPriceState({ status: 'idle', data: null, error: null, requestId: null });
}

function addToCart() {
  const ok = validateForm();
  if (!ok) {
    addNotification('error', 'Please fix the form', 'Preencha os campos obrigatórios antes de adicionar.');
    return;
  }
  if (priceState.status === 'loading') {
    addNotification('warning', 'Calculating price…', 'Aguarde o cálculo do preço antes de adicionar.');
    return;
  }

  const manual = formData.serviceValue?.toString().trim();
  const hasManual = manual && !isNaN(parseFloat(manual));
  const hasSuggested = priceState.status === 'success' && priceState.data?.amount != null;
  if (!hasManual && !hasSuggested) {
    setErrors(prev => ({ ...prev, serviceValue: 'Enter a value or wait for the suggested price' }));
    addNotification('error', 'Missing value', 'Enter service value or wait the auto calculation.');
    return;
  }

  const finalValue = hasManual ? parseFloat(manual) : priceState.data.amount;

  const serviceData = {
    id: editingId || `service-${Date.now()}`,
    firstName: titleCaseStrict(formData.firstName),
    lastName: titleCaseStrict(formData.lastName),
    client: `${titleCaseStrict(formData.firstName)} ${titleCaseStrict(formData.lastName)}`,
    serviceDate: formData.serviceDate,
    partner: activePartners.find(p => p.id === formData.partner) || { id: formData.partner, name: '(partner não encontrado)' },
    team: formData.team || '',
    serviceType: serviceTypes.find(s => s.id === formData.serviceType),
    serviceTime: formData.serviceTime || '',
    park: formData.park || '',
    location: formData.location || '',
    hopper: !!formData.hopper,
    guests: formData.guests || '',
    observations: formData.observations || '',
    suggestedValue: finalValue,
    calculatedPrice: priceState.data,
    overrideValue: hasManual ? parseFloat(manual) : null,
    createdAt: new Date().toISOString(),
    paymentWeek: currentWeek
  };

  if (editingId) {
    if (editSource === 'list') {
      const payload = {
        serviceDate: serviceData.serviceDate,
        firstName: serviceData.firstName,
        lastName: serviceData.lastName,
        partnerId: serviceData.partner.id,
        team: serviceData.team || null,
        serviceTypeId: serviceData.serviceType.id,
        serviceTime: serviceData.serviceTime ? Number(serviceData.serviceTime) : null,
        park: serviceData.park || null,
        location: serviceData.location || null,
        hopper: !!serviceData.hopper,
        guests: serviceData.guests ? Number(serviceData.guests) : null,
        observations: serviceData.observations || null,
        finalValue: serviceData.suggestedValue,
        overrideValue: serviceData.overrideValue || null,
        calculatedPrice: serviceData.calculatedPrice || null
      };

      (async () => {
        try {
          await updateServiceCompat(editingId, payload);
          setServices(prev => ({
            ...prev,
            data: prev.data.map(s => s.id === editingId ? {
              ...s,
              ...normalizeFromApi({ ...payload, _id: editingId, id: editingId, serviceType: { id: payload.serviceTypeId, name: serviceData.serviceType.name, category: serviceData.serviceType.category } }),
              partner: serviceData.partner
            } : s)
          }));
          addNotification('success', 'Updated', 'Service updated successfully.');
          setEditingId(null);
          setEditSource(null);
          resetForm('soft');
          setViewMode('list');
          setTimeout(loadServices, 50);
        } catch (e) {
          addNotification('error', 'Update failed', 'Could not update service.');
        }
      })();
      return;
    }

    setCart(prev => prev.map(item => item.id === editingId ? serviceData : item));
    setEditingId(null);
    setEditSource(null);
    addNotification('success', 'Updated', 'Service updated successfully.');
  } else {
    setCart(prev => [...prev, serviceData]);
    addNotification('success', 'Added', 'Service added to cart.');
  }
  resetForm('soft');
}
addToCartRef.current = addToCart;

const editService = (service) => {
  setFormData({
    firstName: titleCaseStrict(service.firstName),
    lastName: titleCaseStrict(service.lastName),
    serviceDate: typeof service.serviceDate === 'string'
      ? service.serviceDate.slice(0,10)
      : new Date(service.serviceDate).toISOString().slice(0,10),
    partner: service.partner?.id || '',
    team: service.team || '',
    serviceType: service.serviceType.id,
    serviceTime: service.serviceTime || '',
    park: service.park || '',
    location: service.location || '',
    hopper: service.hopper || false,
    guests: service.guests || '',
    observations: service.observations || '',
    serviceValue: service.overrideValue ? service.overrideValue.toString() : ''
  });
  setEditingId(service.id);
  setEditSource('cart');
  debouncedCalculatePrice({ ...service, serviceType: service.serviceType.id, partner: service.partner?.id || '' });
};

const removeService = (serviceId) => setCart(prev => prev.filter(item => item.id !== serviceId));

const handleListEdit = (service) => {
  setEditingId(service.id);
  setEditSource('list');
  const next = {
    firstName: titleCaseStrict(service.firstName),
    lastName: titleCaseStrict(service.lastName),
    serviceDate:
      typeof service.serviceDate === 'string'
        ? service.serviceDate.slice(0, 10)
        : new Date(service.serviceDate).toISOString().slice(0, 10),
    partner: service.partner?.id || '',
    team: service.team || '',
    serviceType: service.serviceType.id,
    serviceTime: service.serviceTime || '',
    park: service.park || '',
    location: service.location || '',
    hopper: !!service.hopper,
    guests: service.guests || '',
    observations: service.observations || '',
    serviceValue: service.overrideValue ? String(service.overrideValue) : ''
  };
  setFormData(next);
  setViewMode('form');
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  debouncedCalculatePrice(next);
};

const handleListDelete = async (id) => {
  if (!window.confirm('Are you sure you want to delete this service?')) return;
  try {
    await deleteServiceCompat(id);
    setServices(prev => ({ ...prev, data: prev.data.filter(s => s.id !== id) })); // smooth
    addNotification('success', 'Deleted', 'Service removed.');
    setTimeout(loadServices, 50);
  } catch (e) {
    addNotification('error', 'Delete failed', parseApiError(e));
  }
};

const handleAddServiceToPayment = (service) => {
  const wk = service.paymentWeek
    ? `${service.paymentWeek.year}-W${String(service.paymentWeek.weekNumber).padStart(2,'0')}`
    : currentWeekKey(currentWeek);

  const candidates = (paymentsStore || []).filter(
    (p) => p.weekKey === wk && normalizePaymentStatus(p.status) !== 'PAID'
  );

  if (candidates.length === 0) {
    addNotification('error', 'Nenhum pagamento encontrado', 'Gere o pagamento da semana antes de adicionar.');
    return;
  }

  const target = candidates[0];
  const nextStore = upsertServiceIntoPaymentLocal(target, service.id);
  if (nextStore) {
    setPaymentsStore(nextStore);
    addNotification(
      'success',
      'Adicionado ao pagamento',
      `Service #${service.id} vinculado ao pagamento ${(target.id || target.paymentId)}.`
    );
  } else {
    addNotification('error', 'Falha ao adicionar', 'Não foi possível vincular o serviço ao pagamento.');
  }
};

const getTotalValue = () => cart.reduce((total, s) => total + (Number(s.suggestedValue) || 0), 0);

/* ===== SALVAR (cart -> backend) ===== */
const saveAllServices = async () => {
  if (loading) return;

  if (cart.length === 0) {
    addNotification('error', 'No Services', 'No services to save');
    return;
  }

  const toTitle = (s) => {
    const str = (s ?? '').toString().trim().toLowerCase();
    return str.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
  };
  const toYMD = (d) => {
    const s = String(d || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const compact = (obj) =>
    Object.fromEntries(
      Object.entries(obj).filter(
        ([, v]) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
      )
    );

  const sanitizeItem = (s) => {
    const amount = Number(s.suggestedValue ?? s.finalValue ?? s.overrideValue ?? 0);
    const base = {
      serviceDate: toYMD(s.serviceDate),
      firstName: toTitle(s.firstName),
      lastName: toTitle(s.lastName),
      partnerId: String(s.partner?.id || s.partnerId || ''),
      serviceTypeId: String(s.serviceType?.id || s.serviceTypeId || ''),
      team: s.team || undefined,
      park: s.park || undefined,
      location: s.location || undefined,
      hopper: !!s.hopper,
      guests: s.guests != null && s.guests !== '' ? Number(s.guests) : undefined,
      observations: s.observations || undefined,

      value: amount,
      finalValue: amount,

      overrideValue:
        s.overrideValue != null && s.overrideValue !== '' ? Number(s.overrideValue) : undefined,

      status: 'RECORDED',
    };

    if (String(s.serviceType?.category || '').toLowerCase() === 'hourly') {
      base.serviceTime = Math.max(1, Number(s.serviceTime || 1));
    }
    return compact(base);
  };

  // verificação de campos mínimos
  const preview = cart.map((s) => ({
    partnerId: String(s.partner?.id || s.partnerId || ''),
    serviceTypeId: String(s.serviceType?.id || s.serviceTypeId || ''),
    serviceDate: toYMD(s.serviceDate),
  }));
  const broken = preview.findIndex(p => !p.partnerId || !p.serviceTypeId || !p.serviceDate);
  if (broken >= 0) {
    addNotification(
      'error',
      'Campos obrigatórios faltando',
      'Cada item precisa de: Partner, Service Type e Service Date (YYYY-MM-DD).'
    );
    return;
  }

  try {
    setLoading(true);
    const items = cart.map(sanitizeItem);
    await createServicesBulkCompat(items);

    addNotification('success', 'Serviços salvos!', `Salvamos ${cart.length} serviço(s) com sucesso.`);
    setCart([]);
    setPriceState({ status: 'idle', data: null, error: null, requestId: null });
    setFormData((prev) => ({ ...prev, firstName: '', lastName: '' }));
    setViewMode('list');
    setCurrentPage(1);
    await loadServices();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  } catch (e) {
    addNotification('error', 'Save Failed', parseApiError(e));
  } finally {
    setLoading(false);
  }
};

/* ===== LISTAGEM (backend) ===== */
const loadServices = useCallback(
  (function () {
    const debounced = (fn, wait) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };
    return debounced(async () => {
      setLoading(true);
      try {
        const res = await fetchServicesCompat({
          page: currentPage,
          pageSize,
          sortField,
          sortDirection,
          filters
        });

        const rawItems = Array.isArray(res.items) ? res.items : (Array.isArray(res.data) ? res.data : []);
        const items = rawItems.map(normalizeFromApi);

        const totalRecords = Number(res.total ?? res.totalRecords ?? res.count ?? items.length);
        const totalPages = Number(res.totalPages ?? Math.max(1, Math.ceil(totalRecords / pageSize)));
        const page = Number(res.page ?? currentPage);

        setServices({ data: items, totalPages, totalRecords, currentPage: page });
      } catch (e) {
        setServices({ data: [], totalPages: 1, totalRecords: 0, currentPage: 1 });
      } finally {
        setLoading(false);
      }
    }, 200);
  })(),
  [currentPage, pageSize, sortField, sortDirection, filters, activePartners, serviceTypes]
);

useEffect(() => { if (viewMode === 'list') loadServices(); }, [viewMode, loadServices]);
useEffect(() => { if (viewMode === 'list') loadServices(); },
  [currentPage, pageSize, sortField, sortDirection, filters, viewMode, loadServices]);

/* ===== Filtros e ordenação ===== */
const handleSort = (field) => {
  const apiField = SORT_MAP[field] || (field === 'client' ? 'firstName' : field);
  if (sortField === apiField) {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
  } else {
    setSortField(apiField);
    setSortDirection('asc');
  }
  setCurrentPage(1);
};
const renderSortIcon = (field) => {
  const apiField = SORT_MAP[field] || (field === 'client' ? 'firstName' : field);
  if (sortField !== apiField) return <ArrowUpDown size={14} className="sort-icon inactive" />;
  return sortDirection === 'asc'
    ? <ArrowUp size={14} className="sort-icon active" />
    : <ArrowDown size={14} className="sort-icon active" />;
};
const handleFilterChange = (field, value) => {
  setFilters(prev => ({ ...prev, [field]: value }));
  setCurrentPage(1);
};

/* ===== Inline edit (valor) ===== */
const startInlineEdit = (service) => {
  const base = Number(service.overrideValue ?? service.finalValue ?? 0);
  setInlineEditId(service.id);
  setInlineEditValue(base.toFixed(2));
};
const cancelInlineEdit = () => {
  setInlineEditId(null);
  setInlineEditValue('');
};
const saveInlineEdit = async () => {
  const id = inlineEditId;
  if (!id) return;
  const n = Number(inlineEditValue);
  if (!Number.isFinite(n) || n < 0) {
    addNotification('error', 'Invalid value', 'Please enter a valid positive number.');
    return;
  }
  try {
    await updateServiceCompat(id, { finalValue: n, overrideValue: n });
    setServices(prev => ({
      ...prev,
      data: prev.data.map(s => s.id === id ? { ...s, finalValue: n, overrideValue: n } : s)
    }));
    addNotification('success', 'Value updated', 'Service value changed successfully.');
    cancelInlineEdit();
    setTimeout(loadServices, 50);
  } catch (e) {
    addNotification('error', 'Update failed', parseApiError(e));
  }
};

/* ===== Bulk selection/delete ===== */
const toggleSelect = (id) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};
const toggleSelectAllOnPage = () => {
  setSelectedIds(prev => {
    const curIds = services.data.map(s => s.id);
    const allSelected = curIds.every(id => prev.has(id));
    const next = new Set(prev);
    if (allSelected) {
      curIds.forEach(id => next.delete(id));
    } else {
      curIds.forEach(id => next.add(id));
    }
    return next;
  });
};
const bulkDeleteSelected = async () => {
  const ids = services.data.map(s => s.id).filter(id => selectedIds.has(id));
  if (ids.length === 0) return;
  if (!window.confirm(`Delete ${ids.length} selected service(s)?`)) return;
  try {
    const res = await deleteServicesBulk(ids);
    // sucesso total OU parcial — remove o que sumiu com certeza
    const successSet = new Set(ids); // assumimos sucesso total quando bulk passou
    // se houve fallback com relatório, filtra pelos que falharam
    if (Array.isArray(res)) {
      // múltiplos chunks — cada item pode ser {ok, failed, failedItems}
      res.forEach((r) => {
        if (r && r.failedItems && r.failedItems.length) {
          r.failedItems.forEach(fi => successSet.delete(fi.id));
        }
      });
    }
    setServices(prev => ({ ...prev, data: prev.data.filter(s => !successSet.has(s.id)) }));
    setSelectedIds(new Set());
    const totalFailed = (Array.isArray(res) ? res.reduce((acc, r) => acc + (r?.failed || 0), 0) : 0);
    if (totalFailed > 0) {
      addNotification('warning', 'Partial delete', `${ids.length - totalFailed} deleted, ${totalFailed} failed.`);
    } else {
      addNotification('success', 'Deleted', `${ids.length} service(s) removed.`);
    }
    setTimeout(loadServices, 50);
  } catch (e) {
    addNotification('error', 'Delete failed', parseApiError(e));
  }
};

/* ===== Status helpers ===== */
const statusLabel = (raw) => {
  const id = normalizePaymentStatus(raw);
  if (id === 'APPROVED') return 'Approved';
  if (id === 'PAID') return 'Paid';
  return 'Pending';
};
// src/pages/Services.jsx  (Parte 4/4)
  return (
    <div className="services-page">
      {/* HEADER */}
      <div className="services-header">
        <div className="header-info">
          <h1>Services Management</h1>
          <p>Manage and track all service records</p>
        </div>

        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`btn btn--outline ${viewMode === 'form' ? 'is-active' : ''}`}
              onClick={() => setViewMode('form')}
            >
              <Plus size={20} /> Add Services
            </button>
            <button
              className={`btn btn--outline ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={20} /> View Services
            </button>
          </div>

          <button className="btn btn--outline" onClick={() => window.print()}>
            <Download size={18}/> Export
          </button>
        </div>

        <div className="payment-week-info">
          <div className="week-badge"><Calendar size={18} /> Payment Week</div>
          <div className="week-details">
            <div className="week-period">
              {currentWeek
                ? `${currentWeek.start.toLocaleDateString()} - ${currentWeek.end.toLocaleDateString()}`
                : 'Loading...'}
            </div>
            <div className="week-meta">
              {currentWeek && `Week ${currentWeek.weekNumber} • ${currentWeek.year}`}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'form' ? (
        /* ===================== VIEW: FORM ===================== */
        <div className="services-container">
          {/* COLUNA DO FORM */}
          <div className="services-form-column">
            <div className="form-card">
              <div className="form-header">
                <div className="form-icon"><Plus size={24} /></div>
                <h2 className="form-title">{editingId ? 'Edit Service' : 'Add New Service'}</h2>
                <p className="form-subtitle">Fill in the service details below</p>
              </div>

              <form className="service-form" onSubmit={(e) => e.preventDefault()}>
                {/* Cliente */}
                <div className="form-group">
                  <label className="form-label"><User size={16} /> Client Information</label>
                  <div className="form-group-row">
                    <div>
                      <input
                        ref={firstNameRef}
                        type="text"
                        className={`form-input ${errors.firstName ? 'error' : ''}`}
                        placeholder="First Name"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                      />
                      {errors.firstName && <div className="error-text">{errors.firstName}</div>}
                    </div>
                    <div>
                      <input
                        type="text"
                        className={`form-input ${errors.lastName ? 'error' : ''}`}
                        placeholder="Last Name"
                        value={formData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                      />
                      {errors.lastName && <div className="error-text">{errors.lastName}</div>}
                    </div>
                  </div>
                </div>

                <div className="form-row-compact-4">
                  {/* Service Date */}
                  <div className="field">
                    <label className="form-label"><Calendar size={16} /> Service Date</label>
                    <input
                      ref={serviceDateRef}
                      type="date"
                      className={`form-input ${errors.serviceDate ? 'error' : ''}`}
                      value={formData.serviceDate}
                      onChange={(e) => handleInputChange('serviceDate', e.target.value)}
                    />
                    {errors.serviceDate && <div className="error-text">{errors.serviceDate}</div>}
                  </div>

                  {/* Partner */}
                  <div className="field">
                    <label className="form-label"><User size={16} /> Partner</label>
                    <select
                      className={`form-select ${errors.partner ? 'error' : ''}`}
                      value={formData.partner}
                      onChange={(e) => handleInputChange('partner', e.target.value)}
                    >
                      <option value="">Select a partner</option>
                      {activePartners.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                    {errors.partner && <div className="error-text">{errors.partner}</div>}
                  </div>

                  {/* Team */}
                  <div className="field">
                    <label className="form-label">
                      <Globe size={16} /> Team {formData.serviceType && (serviceTypes.find(s=>s.id===formData.serviceType)?.category==='variable') && <span className="required">*</span>}
                    </label>
                    <select
                      data-field="team"
                      className={`form-select ${errors.team ? 'error' : ''}`}
                      value={formData.team}
                      onChange={(e) => handleInputChange('team', e.target.value)}
                    >
                      <option value="">Select team</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {errors.team && <div className="error-text">{errors.team}</div>}
                  </div>

                  {/* Service Type */}
                  <div className="field">
                    <label className="form-label"><Settings size={16} /> Service Type</label>
                    <select
                      className={`form-select ${errors.serviceType ? 'error' : ''}`}
                      value={formData.serviceType}
                      onChange={(e) => handleInputChange('serviceType', e.target.value)}
                    >
                      <option value="">Select service type</option>
                      <optgroup label="Variable Price">
                        {serviceTypes.filter(t => t.category === 'variable').map(type => (<option key={type.id} value={type.id}>{type.name}</option>))}
                      </optgroup>
                      <optgroup label="Fixed Price">
                        {serviceTypes.filter(t => t.category === 'fixed').map(type => (<option key={type.id} value={type.id}>{type.name}</option>))}
                      </optgroup>
                      <optgroup label="Hourly">
                        {serviceTypes.filter(t => t.category === 'hourly').map(type => (<option key={type.id} value={type.id}>{type.name}</option>))}
                      </optgroup>
                    </select>
                    {errors.serviceType && <div className="error-text">{errors.serviceType}</div>}
                  </div>
                </div>

                {/* Hours (hourly) */}
                {(serviceTypes.find(s=>s.id===formData.serviceType)?.category === 'hourly') && (
                  <div className="form-group">
                    <label className="form-label"><Clock size={16} /> Service Time (Hours)</label>
                    <select
                      className={`form-select ${errors.serviceTime ? 'error' : ''}`}
                      value={formData.serviceTime}
                      onChange={(e) => handleInputChange('serviceTime', e.target.value)}
                    >
                      <option value="">Select hours</option>
                      {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {errors.serviceTime && <div className="error-text">{errors.serviceTime}</div>}
                  </div>
                )}

                {/* Campos “variable” */}
                {(serviceTypes.find(s=>s.id===formData.serviceType)?.category === 'variable') && (
                  <div className="form-row-compact-4">
                    {/* Location */}
                    <div className="field">
                      <label className="form-label"><MapPin size={16} /> Location</label>
                      <select
                        className={`form-select ${errors.location ? 'error' : ''}`}
                        value={formData.location}
                        onChange={(e) => handleInputChange('location', e.target.value)}
                      >
                        <option value="">Select location</option>
                        {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      </select>
                      {errors.location && <div className="error-text">{errors.location}</div>}
                    </div>

                    {/* Park */}
                    <div className="field">
                      <label className="form-label"><Building size={16} /> Park</label>
                      <select
                        className={`form-select ${errors.park ? 'error' : ''}`}
                        value={formData.park}
                        onChange={(e) => handleInputChange('park', e.target.value)}
                      >
                        <option value="">Select a park</option>
                        {formData.location
                          ? (parksByLocation[formData.location] || []).map(pk => <option key={pk} value={pk}>{pk}</option>)
                          : (
                            <>
                              <optgroup label="Orlando">
                                {parksByLocation['Orlando'].map(pk => <option key={`orl-${pk}`} value={pk}>{pk}</option>)}
                              </optgroup>
                              <optgroup label="Califórnia">
                                {parksByLocation['Califórnia'].map(pk => <option key={`ca-${pk}`} value={pk}>{pk}</option>)}
                              </optgroup>
                            </>
                          )
                        }
                      </select>
                      {errors.park && <div className="error-text">{errors.park}</div>}
                    </div>

                    {/* Guests */}
                    <div className="field">
                      <label className="form-label"><Users size={16} /> Number of Guests</label>
                      <select
                        className={`form-select ${errors.guests ? 'error' : ''}`}
                        value={formData.guests}
                        onChange={(e) => handleInputChange('guests', e.target.value)}
                      >
                        <option value="">Select number of guests</option>
                        {guestOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {errors.guests && <div className="error-text">{errors.guests}</div>}
                    </div>
                  </div>
                )}

                {/* Hopper + Observations */}
                <div className="field">
                  <label className="form-label" style={{opacity:0}}>Spacer</label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.hopper}
                      onChange={(e) => handleInputChange('hopper', e.target.checked)}
                    />
                    <div className="checkbox-custom"></div>
                    Park Hopper Option
                  </label>
                  <div className="form-hint">Visit multiple parks (extra cost)</div>
                </div>

                <div className="form-group">
                  <label className="form-label"><AlertCircle size={16} /> Observations (Optional)</label>
                  <textarea
                    className="form-textarea"
                    rows="3"
                    placeholder="Additional notes or special requirements..."
                    value={formData.observations}
                    onChange={(e) => handleInputChange('observations', e.target.value)}
                  />
                </div>

                {/* PRICE SECTION */}
                <div className="price-section">
                  <div className="price-display">
                    <div className="price-icon">
                      {priceState.status === 'loading' ? <Loader size={20} className="spinning" /> : <Calculator size={20} />}
                    </div>
                    <div className="price-info">
                      <span className="price-label">Suggested Value</span>
                      <div className="price-value">
                        {priceState.status === 'loading' && <span className="calculating">Calculating...</span>}
                        {priceState.status === 'success' && priceState.data && <span className="price-amount">${priceState.data.amount.toFixed(2)}</span>}
                        {priceState.status === 'error' && <span className="price-error">Error calculating price</span>}
                        {priceState.status === 'idle' && <span className="price-idle">Select service details</span>}
                      </div>
                      {formData.serviceValue && priceState.data && parseFloat(formData.serviceValue) !== priceState.data.amount && (
                        <div className="price-override">Override: ${parseFloat(formData.serviceValue).toFixed(2)}</div>
                      )}
                    </div>
                    <div className="price-actions">
                      <button type="button" className="recalculate-btn" onClick={handleRecalculate} disabled={priceState.status === 'loading'} title="Recalculate price">
                        <RefreshCw size={16} className={priceState.status === 'loading' ? 'spinning' : ''} />
                      </button>
                      {priceState.status === 'success' && priceState.data && (
                        <button type="button" className="recalculate-btn" onClick={handleUseSuggested} title="Use suggested value">
                          <Copy size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <DollarSign size={16} /> Service Value
                      {priceState.status === 'success' && priceState.data && (
                        <span className="suggested-hint"> (Suggested: ${priceState.data.amount.toFixed(2)})</span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`form-input ${errors.serviceValue ? 'error' : ''}`}
                      placeholder="Enter service value"
                      value={formData.serviceValue}
                      onChange={(e) => handleInputChange('serviceValue', e.target.value)}
                    />
                    {errors.serviceValue && <div className="error-text">{errors.serviceValue}</div>}
                    <div className="form-hint">Leave empty to use calculated value. Use suggested button to copy calculated value.</div>
                  </div>

                  {priceState.status === 'error' && (
                    <div className="price-error-details"><AlertCircle size={16} /><span>{priceState.error}</span></div>
                  )}
                </div>

                <button type="button" className="btn btn--primary btn--block" onClick={addToCart}>
                  <ShoppingCart size={20} />
                  {editingId ? 'Update Service' : 'Add to Cart'}
                </button>
              </form>
            </div>
          </div>

          {/* COLUNA DO CARRINHO */}
          <div className="services-cart-column">
            <div className="cart-card">
              <div className="cart-header">
                <div className="cart-icon"><ShoppingCart size={24} /></div>
                <div className="cart-title-section">
                  <h2 className="cart-title">Services Cart</h2>
                  <div className="cart-meta">
                    <span className="cart-count">{cart.length} items</span>
                    <span className="cart-total-preview">${getTotalValue().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="cart-content">
                {cart.length === 0 ? (
                  <div className="empty-cart">
                    <ShoppingCart size={48} />
                    <p>No services added yet</p>
                    <span>Add services using the form on the left</span>
                  </div>
                ) : (
                  <>
                    <div className="cart-table">
                      <div className="cart-table-header">
                        <div className="col-service">Service</div>
                        <div className="col-partner">Partner</div>
                        <div className="col-parameters">Parameters</div>
                        <div className="col-value">Value</div>
                        <div className="col-obs">Obs.</div>
                        <div className="col-actions">Actions</div>
                      </div>
                      <div className="cart-table-body">
                        {cart.map((service) => (
                          <div key={service.id} className="cart-row">
                            <div className="col-service">
                              <div className="service-info">
                                <div className="service-type">
                                  {(() => { const IconComp = service.serviceType?.icon || Settings; return <IconComp size={14} />; })()}
                                  <span>{service.serviceType.name}</span>
                                </div>
                                <div className="service-client">{service.client}</div>
                                <div className="service-date">
                                  {formatYmdToLocale(service.serviceDate, 'en-US')}
                                </div>
                              </div>
                            </div>
                            <div className="col-partner">
                              <div className="partner-info">
                                <div className="partner-name">{service.partner.name}</div>
                                {service.team && <div className="partner-team">{service.team} Team</div>}
                              </div>
                            </div>
                            <div className="col-parameters">
                              <div className="parameters-list">
                                {(() => {
                                  const params = [];
                                  if (service.serviceTime) params.push(`${service.serviceTime}h`);
                                  if (service.park) params.push(service.park);
                                  if (service.location) params.push(service.location);
                                  if (service.guests) params.push(`${service.guests} guests`);
                                  if (service.hopper) params.push('Hopper');
                                  return params.length > 0 ? params.join(', ') : 'No parameters';
                                })()}
                              </div>
                            </div>
                            <div className="col-value">
                              <div className="service-value">${Number(service.suggestedValue).toFixed(2)}</div>
                            </div>
                            <div className="col-obs">
                              {service.observations ? (
                                <div className="observations" title={service.observations}><AlertCircle size={14} /><span>Yes</span></div>
                              ) : (<span className="no-obs">-</span>)}
                            </div>
                            <div className="col-actions">
                              <button className="action-btn edit-btn" onClick={() => editService(service)} title="Edit service"><Edit3 size={14} /></button>
                              <button className="action-btn remove-btn" onClick={() => removeService(service.id)} title="Remove service"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="cart-footer">
                      <div className="cart-summary">
                        <div className="summary-row"><span>Total Services:</span><span>{cart.length}</span></div>
                        <div className="summary-row"><span>Payment Week:</span><span>{currentWeek ? `Week ${currentWeek.weekNumber}/${currentWeek.year}` : 'Loading...'}</span></div>
                        <div className="summary-row total-row"><span>Total Value:</span><span className="total-amount">${getTotalValue().toFixed(2)}</span></div>
                      </div>
                      <div className="cart-actions">
                        <button className="clear-cart-btn" onClick={() => { if (window.confirm('Clear all services from cart?')) { setCart([]); resetForm(); } }}>
                          <Trash2 size={16} /> Clear Cart
                        </button>
                        <button className="save-all-btn" onClick={saveAllServices} disabled={loading}>
                          {loading ? <Loader size={20} className="spinning" /> : <Save size={20} />} Save All Services
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ===================== VIEW: LIST ===================== */
        <div className="services-list-container">
          {/* Filtros */}
          <div className="list-controls">
            <div className="filters-section">
              <div className="filter-group">
                <label>Partner:</label>
                <select value={filters.partner} onChange={(e) => handleFilterChange('partner', e.target.value)} className="filter-select">
                  <option value="">All Partners</option>
                  {activePartners.map((partner) => (<option key={partner.id} value={partner.id}>{partner.name}</option>))}
                </select>
              </div>

              <div className="filter-group">
                <label>Service Type:</label>
                <select value={filters.serviceType} onChange={(e) => handleFilterChange('serviceType', e.target.value)} className="filter-select">
                  <option value="">All Types</option>
                  <optgroup label="Variable Price">
                    {serviceTypes.filter((t) => t.category === 'variable').map((type) => (<option key={type.id} value={type.id}>{type.name}</option>))}
                  </optgroup>
                  <optgroup label="Fixed Price">
                    {serviceTypes.filter((t) => t.category === 'fixed').map((type) => (<option key={type.id} value={type.id}>{type.name}</option>))}
                  </optgroup>
                  <optgroup label="Hourly">
                    {serviceTypes.filter((t) => t.category === 'hourly').map((type) => (<option key={type.id} value={type.id}>{type.name}</option>))}
                  </optgroup>
                </select>
              </div>

              <div className="filter-group">
                <label>Status:</label>
                <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="filter-select">
                  <option value="">All Status</option>
                  {serviceStatuses.map((status) => (<option key={status.id} value={status.id}>{status.name}</option>))}
                </select>
              </div>

              <div className="filter-group">
                <label>Team:</label>
                <select value={filters.team} onChange={(e) => handleFilterChange('team', e.target.value)} className="filter-select">
                  <option value="">All Teams</option>
                  {teams.map((team) => (<option key={team.id} value={team.id}>{team.name}</option>))}
                </select>
              </div>

              <button
                className="clear-filters-btn"
                onClick={() => { setFilters({ partner: '', serviceType: '', status: '', team: '' }); setCurrentPage(1); }}
              >
                <X size={16} /> Clear Filters
              </button>
            </div>

            {/* Bulk actions */}
            <div className="bulk-actions">
              <span>{Array.from(selectedIds).filter(id => services.data.some(s => s.id === id)).length} selected</span>
              <button className="btn btn--danger btn--sm" onClick={bulkDeleteSelected} disabled={Array.from(selectedIds).filter(id => services.data.some(s => s.id === id)).length === 0}>
                <Trash2 size={14} /> Delete selected
              </button>
            </div>
          </div>

          {/* Tabela */}
          <div className="services-table-container">
            {loading ? (
              <div className="loading-state">
                <Loader size={32} className="spinning" />
                <p>Loading services...</p>
              </div>
            ) : (
              <>
                <div className="services-table">
                  <div className="table-header">
                    <div className="header-cell checkbox-col">
                      <label className="checkbox-label compact">
                        <input
                          type="checkbox"
                          onChange={toggleSelectAllOnPage}
                          checked={services.data.length > 0 && services.data.every(s => selectedIds.has(s.id))}
                        />
                        <div className="checkbox-custom"></div>
                      </label>
                    </div>
                    <div className="header-cell sortable" onClick={() => handleSort('serviceDate')}>
                      <Calendar size={16} /> Date {renderSortIcon('serviceDate')}
                    </div>
                    <div className="header-cell sortable" onClick={() => handleSort('client')}>
                      <User size={16} /> Client {renderSortIcon('client')}
                    </div>
                    <div className="header-cell sortable" onClick={() => handleSort('partner')}>
                      <Users size={16} /> Partner {renderSortIcon('partner')}
                    </div>
                    <div className="header-cell sortable" onClick={() => handleSort('team')}>
                      <Globe size={16} /> Team {renderSortIcon('team')}
                    </div>
                    <div className="header-cell"><Settings size={16} /> Service Type</div>
                    <div className="header-cell"><List size={16} /> Parameters</div>
                    <div className="header-cell"><AlertCircle size={16} /> Observations</div>
                    <div className="header-cell amount sortable" onClick={() => handleSort('finalValue')}>
                      <DollarSign size={16} /> Amount {renderSortIcon('finalValue')}
                    </div>
                    <div className="header-cell"><AlertCircle size={16} /> Status</div>
                    <div className="header-cell" style={{ minWidth: 140 }}><Settings size={16} /> Actions</div>
                  </div>

                  <div className="table-body">
                    {services.data.map((service) => (
                      <div key={service.id} className="table-row">
                        {/* checkbox */}
                        <div className="table-cell checkbox-col">
                          <label className="checkbox-label compact">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(service.id)}
                              onChange={() => toggleSelect(service.id)}
                            />
                            <div className="checkbox-custom"></div>
                          </label>
                        </div>

                        {/* Date */}
                        <div className="table-cell amount">
                          <div className="date-info">
                            <div className="date-primary">
                              {formatYmdToLocale(service.serviceDate, 'en-US')}
                            </div>
                            <div className="date-secondary">
                              {(() => {
                                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(service.serviceDate));
                                const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0) : new Date(service.serviceDate);
                                return d.toLocaleDateString('en-US', { weekday: 'short' });
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Client */}
                        <div className="table-cell">
                          <div className="client-info">
                            <div className="client-name">
                              {titleCaseStrict(service.firstName)} {titleCaseStrict(service.lastName)}
                            </div>
                            <div className="client-meta">Added {new Date(service.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>

                        {/* Partner */}
                        <div className="table-cell">
                          <div className="partner-info">
                            <div className="partner-name">{service.partner?.name || '—'}</div>
                            {service.team ? (
                              <div className="partner-team"><Globe size={12} /> {service.team} Team</div>
                            ) : (<div className="no-team">—</div>)}
                          </div>
                        </div>

                        {/* Team */}
                        <div className="table-cell">
                          {service.team ? <span className={`team-badge ${service.team?.toLowerCase()}`}>{service.team}</span> : <span className="no-team">—</span>}
                        </div>

                        {/* Service type */}
                        <div className="table-cell">
                          <div className="service-type-info">
                            <div className="service-type-name">
                              {(() => { const IconComp = asIcon(service.serviceType?.icon); return <IconComp size={14} />; })()}
                              {service.serviceType.name}
                            </div>
                            <div className="service-category">{service.serviceType.category}</div>
                          </div>
                        </div>

                        {/* Parameters */}
                        <div className="table-cell">
                          {(() => {
                            const params = [];
                            if (service.serviceTime) params.push(`${service.serviceTime}h`);
                            if (service.park) params.push(service.park);
                            if (service.location) params.push(service.location);
                            if (service.guests) params.push(`${service.guests} guests`);
                            if (service.hopper) params.push('Hopper');
                            return params.length ? <div className="parameters">{params.join(', ')}</div> : <span className="no-params">-</span>;
                          })()}
                        </div>

                        {/* Observations */}
                        <div className="table-cell">
                          {service.observations
                            ? <span title={service.observations} className="obs-flag"><AlertCircle size={14}/> Yes</span>
                            : <span className="no-obs">—</span>
                          }
                        </div>

                        {/* Amount (inline edit) */}
                        <div className={`table-cell value-cell ${inlineEditId === service.id ? 'is-editing' : ''}`}>
                          {inlineEditId === service.id ? (
                            <div className="inline-edit">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="form-input inline"
                                value={inlineEditValue}
                                onChange={(e) => setInlineEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveInlineEdit();
                                  if (e.key === 'Escape') cancelInlineEdit();
                                }}
                                autoFocus
                              />
                              <button className="btn btn--sm btn--primary" onClick={saveInlineEdit}>Save</button>
                              <button className="btn btn--sm btn--outline" onClick={cancelInlineEdit}>Cancel</button>
                            </div>
                          ) : (
                            <div className="value-info">
                              <div className="final-value">${Number(service.finalValue || 0).toFixed(2)}</div>
                              <button className="btn btn--outline btn--xs" onClick={() => startInlineEdit(service)} title="Edit amount inline">
                                <Edit3 size={12}/> Edit
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Status */}
                        <div className="table-cell">
                          {(() => {
                            const link = paymentIndex.get(service.id);
                            const raw = link?.status || service.status?.id || 'RECORDED';
                            const label = statusLabel(raw);
                            const cls = `status-badge ${normalizePaymentStatus(raw).toLowerCase()}`;
                            return <span className={cls} title={link?.paymentId ? `Payment #${link.paymentId}` : ''}>{label}</span>;
                          })()}
                        </div>

                        {/* Actions */}
                        <div className="table-cell">
                          <div className="action-buttons" style={{ minWidth: 140 }}>
                            <button className="btn btn--outline btn--sm" onClick={() => handleListEdit(service)} title="View/Edit">
                              <Eye size={14} />
                            </button>
                            <button className="btn btn--outline btn--sm" onClick={() => handleListEdit(service)} title="Edit service">
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="btn btn--outline btn--sm"
                              onClick={() => handleAddServiceToPayment(service)}
                              title={paymentIndex.get(service.id) ? 'Já vinculado a um pagamento' : 'Adicionar ao pagamento'}
                              disabled={!!paymentIndex.get(service.id)}
                            >
                              <DollarSign size={14} />
                            </button>
                            <button className="btn btn--danger btn--sm" onClick={() => handleListDelete(service.id)} title="Delete service">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Paginação */}
                <div className="pagination-container">
                  <div className="pagination-info">
                    <span>
                      {services.totalRecords > 0
                        ? `Showing ${((services.currentPage - 1) * pageSize) + 1} to ${Math.min(services.currentPage * pageSize, services.totalRecords)} of ${services.totalRecords} services`
                        : 'Showing 0 to 0 of 0 services'}
                    </span>
                  </div>

                  <div className="pagination-controls">
                    <button className="pagination-btn" onClick={() => setCurrentPage(1)} disabled={services.currentPage === 1} title="First page">
                      <ChevronsLeft size={16} />
                    </button>
                    <button className="pagination-btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={services.currentPage === 1} title="Previous page">
                      <ChevronLeft size={16} />
                    </button>

                    <div className="page-numbers">
                      {(() => {
                        const pages = [];
                        const total = services.totalPages || 1;
                        const cur = services.currentPage || 1;
                        const start = Math.max(1, cur - 2);
                        const end = Math.min(total, cur + 2);
                        for (let i = start; i <= end; i++) {
                          pages.push(
                            <button key={i} className={`page-number ${i === cur ? 'active' : ''}`} onClick={() => setCurrentPage(i)}>
                              {i}
                            </button>
                          );
                        }
                        return pages;
                      })()}
                    </div>

                    <button className="pagination-btn" onClick={() => setCurrentPage((p) => Math.min(services.totalPages, p + 1))} disabled={services.currentPage === services.totalPages} title="Next page">
                      <ChevronRight size={16} />
                    </button>
                    <button className="pagination-btn" onClick={() => setCurrentPage(services.totalPages)} disabled={services.currentPage === services.totalPages} title="Last page">
                      <ChevronsRight size={16} />
                    </button>
                  </div>

                  <div className="page-size-selector">
                    <span>Show:</span>
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span>per page</span>
                  </div>
                </div>

                {/* Estado vazio */}
                {services.data.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon"><Info size={48} /></div>
                    <h3>No services found</h3>
                    <p>
                      {Object.values(filters).some((f) => f)
                        ? 'Try adjusting your filters.'
                        : 'No services have been added yet. Switch to the form view to add your first service.'}
                    </p>
                    {!Object.values(filters).some((f) => f) && (
                      <button className="add-first-service-btn" onClick={() => setViewMode('form')}>
                        <Plus size={20} /> Add First Service
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resumo da Lista */}
          {services.data.length > 0 && (
            <div className="list-summary">
              <div className="summary-cards">
                <div className="summary-card">
                  <div className="summary-icon"><List size={24} /></div>
                  <div className="summary-content">
                    <div className="summary-value">{services.totalRecords}</div>
                    <div className="summary-label">Total Services</div>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-icon"><DollarSign size={24} /></div>
                  <div className="summary-content">
                    <div className="summary-value">
                      ${services.data.reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0).toFixed(2)}
                    </div>
                    <div className="summary-label">Page Total</div>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-icon"><Users size={24} /></div>
                  <div className="summary-content">
                    <div className="summary-value">{new Set(services.data.map((s) => s.partner?.id).filter(Boolean)).size}</div>
                    <div className="summary-label">Active Partners</div>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-icon"><Calendar size={24} /></div>
                  <div className="summary-content">
                    <div className="summary-value">{currentWeek ? `Week ${currentWeek.weekNumber}` : 'Loading...'}</div>
                    <div className="summary-label">Payment Week</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Notifications */}
      {notifications.length > 0 && (
        <div className="toast-container">
          {notifications.map((notification, idx) => (
            <div key={notification.id} className={`toast-notification ${notification.type}`} style={{ bottom: `${20 + idx * 70}px` }}>
              <div className="toast-icon">
                {notification.type === 'success' && <CheckCircle size={20} />}
                {notification.type === 'error' && <AlertCircle size={20} />}
                {notification.type === 'warning' && <AlertTriangle size={20} />}
                {notification.type === 'info' && <Info size={20} />}
              </div>
              <div className="toast-content">
                <div className="toast-title">{notification.title}</div>
                {notification.message && (<div className="toast-message">{notification.message}</div>)}
              </div>
              <button className="toast-close" onClick={() => removeNotification(notification.id)} title="Close">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default Services;
