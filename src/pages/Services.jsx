// src/pages/Services.jsx (Parte 1/8) — imports, helpers, wrappers, persistência e estados-base

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Settings, DollarSign, ShoppingCart, User, Calendar, Clock, Users, MapPin, Plus,
  Edit3, Trash2, RefreshCw, Save, AlertCircle, CheckCircle, Loader, Eye, Calculator,
  Building, Plane, Baby, Coffee, Car, Home, Globe, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, List, Download, Copy, X, AlertTriangle, Info,
  ChevronsLeft, ChevronsRight
} from 'lucide-react';
import '../styles/Services.css';
import { useCosts } from '../contexts/CostsContext';

// 🔌 API (seu backend via http.ts)
import {
  fetchServices,
  createServicesBulk,
  updateService,
  deleteService,
} from '../api/services';
import { fetchUsers as fetchUsersApi } from '../api/users';

/** =========================
 * Helpers gerais
 * ========================= */

// Evita off-by-one: força horário local 00:00:00 ao construir Date
const toLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const src = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const d = new Date(src);
  return isNaN(d.getTime()) ? null : d;
};
const formatDateSafe = (dateStr, opts = { month: '2-digit', day: '2-digit', year: 'numeric' }, locale = 'en-US') => {
  const d = toLocalDate(dateStr);
  return d ? d.toLocaleDateString(locale, opts) : '—';
};
const formatWeekday = (dateStr, locale = 'en-US') => {
  const d = toLocalDate(dateStr);
  return d ? d.toLocaleDateString(locale, { weekday: 'short' }) : '—';
};

const toNoonUTCISO = (ymd) => {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)).toISOString(); // 12:00Z
};
const startOfDayUTCISO = (ymd) => {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString(); // 00:00Z
};
const endOfDayUTCISO = (ymd) => {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).toISOString(); // 23:59:59.999Z
};

// Semana de pagamento: Quarta (3) → Terça
const getPaymentWeek = (date = new Date()) => {
  const now = new Date(date);
  const dow = now.getDay(); // 0=Dom .. 3=Qua
  const daysToSubtract = dow >= 3 ? (dow - 3) : (dow + 4);
  const start = new Date(now); start.setDate(now.getDate() - daysToSubtract); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end };
};
const getWeekNumber = (date) => {
  const d = new Date(date);
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = Math.floor((d.getTime() - firstDayOfYear.getTime()) / 86400000);
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

// ===== Helpers (pagamentos em localStorage para “vínculo” visual) =====
const PAYMENTS_KEYS = ['payments_v1', 'payments', 'generated_payments'];
const safeParse = (raw, fb = []) => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fb; } catch { return fb; } };
const loadFirstHit = (keys) => { for (const k of keys) { const raw = localStorage.getItem(k); if (raw) return safeParse(raw); } return []; };

// Para ícones dinamicamente salvos
const asIcon = (MaybeIcon) => (typeof MaybeIcon === 'function' ? MaybeIcon : Settings);

// === Wrappers presos ao backend (sem fallbacks para /api do frontend) ===
async function fetchServicesCompat(params) {
  const { page, pageSize, sortField, sortDirection, filters = {} } = params || {};
  // Mapeamento CONSERVADOR p/ API (sem q/search)
  return await fetchServices({
    page,
    pageSize,
    sortBy: sortField || 'serviceDate',
    sortDir: (sortDirection || 'desc').toLowerCase(),
    // ✅ nomes que o backend espera + datas como UTC “início/fim do dia”
    partner:     filters.partner     || undefined,
    serviceType: filters.serviceType || undefined,
    status:      filters.status      || undefined,
    team:        filters.team        || undefined,
    dateFrom:    filters.dateFrom ? startOfDayUTCISO(filters.dateFrom) : undefined,
    dateTo:      filters.dateTo   ? endOfDayUTCISO(filters.dateTo)     : undefined,
  });
}
async function createServicesBulkCompat(payloads) { return await createServicesBulk(payloads); }
async function updateServiceCompat(id, body) { return await updateService(id, body); }
async function deleteServiceCompat(id) { return await deleteService(id); }

// Persistência leve de estado da tela (para sobreviver a refresh/voltar)
const UI_STATE_KEY = 'services_ui_state_v3'; // v3: sem searchTerm

// Util: estado -> storage
const saveUiState = (state) => {
  try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(state)); } catch {}
};
const loadUiState = () => {
  try { const raw = localStorage.getItem(UI_STATE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
};

// 🔁 Intervalo de atualização “ao vivo” (admins simultâneos)
const LIVE_REFRESH_MS = 15000;

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
    serviceValue: '' // valor final MANUAL obrigatório
  });

  /* ===== ESTADOS GERAIS ===== */
  const [cart, setCart] = useState([]);
  const [priceState, setPriceState] = useState({
    status: 'idle', // idle | loading | success | error
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
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('serviceDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    partner: '',
    serviceType: '',
    team: '',
    status: '',
  });
  const [viewMode, setViewMode] = useState('form'); // 'form' | 'list'

  // Parceiros ativos (via backend)
  const [activePartners, setActivePartners] = useState([]);

  // Pagamentos (para mostrar badge de vínculo)
  const [paymentsStore, setPaymentsStore] = useState([]);

  // Seleção em massa (lista)
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const isSelected = (id) => selectedIds.has(id);
  const clearSelection = () => setSelectedIds(new Set());

  // Auto-refresh leve ao ganhar foco / visibilidade
  const [autoRefresh, setAutoRefresh] = useState(true);

  /* ===== REFS ===== */
  const cancelTokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const firstNameRef = useRef(null);
  const serviceDateRef = useRef(null);
  const addToCartRef = useRef(() => {});
  const updatesChannelRef = useRef(null); // BroadcastChannel para “avisar” outras abas

  /* ===== NOTIFICAÇÕES ===== */
  const [notifications, setNotifications] = useState([]);
  const addNotification = (type, title, message) => {
    const id = (globalThis.crypto?.randomUUID?.() || `ntf_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    setNotifications(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => { setNotifications(prev => prev.filter(n => n.id !== id)); }, 5000);
  };
  const removeNotification = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

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
    { id: 'VIRTUAL_TOUR',   name: 'Virtual Tour',   icon: Eye,     category: 'variable', basePrice: 80,  requiredFields: ['team','park','location','guests'], description: 'Remote guided tour experience' },
    { id: 'COORDINATOR',    name: 'Coordinator',    icon: Calendar, category: 'variable', basePrice: 200, requiredFields: ['team','park','location','guests'], description: 'Event planning and coordination' },
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
    // Por hora
    { id: 'BABYSITTER', name: 'Babysitter', icon: Baby, category: 'hourly', basePrice: 35, requiredFields: ['serviceTime'], optionalFields: ['team'], description: 'Childcare services' }
  ]), []);

  /* ===== Localizações e PARQUES ===== */
  const locations = useMemo(() => (['Orlando','Califórnia']), []);
  const parksByLocation = useMemo(() => ({
    Orlando: ['Disney World','Universal Studios','Epic','SeaWorld','Busch Gardens','Legoland','Peppa Pig','Volcano Bay'],
    'Califórnia': ['Disneyland','Universal Hollywood','Six Flags']
  }), []);
  const availableParks = formData.location ? (parksByLocation[formData.location] || []) : [];

  const serviceStatuses = useMemo(() => ([
    { id: 'RECORDED', name: 'Recorded',   color: '#6B7280' },
    { id: 'IN_PAYMENT', name: 'In Payment', color: '#F59E0B' },
    { id: 'APPROVED', name: 'Approved',   color: '#3B82F6' },
    { id: 'PAID',     name: 'Paid',       color: '#10B981' }
  ]), []);

  // ===== Atalhos =====
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

  /* ===== Semana de pagamento (info UI) ===== */
  useEffect(() => {
    const now = new Date();
    const w = getPaymentWeek(now);
    setCurrentWeek({
      start: w.start,
      end: w.end,
      year: w.start.getFullYear(),
      month: w.start.getMonth() + 1,
      weekNumber: getWeekNumber(w.start)
    });
  }, []);

  /* ===== Carrega pagamentos (local) p/ badge de vínculo + auto refresh leve ===== */
  useEffect(() => { setPaymentsStore(loadFirstHit(PAYMENTS_KEYS)); }, []);
  useEffect(() => {
    const onStorage = (e) => { if (e.key && PAYMENTS_KEYS.includes(e.key)) setPaymentsStore(loadFirstHit(PAYMENTS_KEYS)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    const onFocus = () => { if (autoRefresh) { setPaymentsStore(loadFirstHit(PAYMENTS_KEYS)); if (viewMode === 'list') loadServices(); } };
    const onVis = () => { if (document.visibilityState === 'visible' && autoRefresh) { setPaymentsStore(loadFirstHit(PAYMENTS_KEYS)); if (viewMode === 'list') loadServices(); } };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); };
  }, [autoRefresh, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Util p/ mapear serviço -> pagamento mais recente
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
          idx.set(key, { paymentId: p.id || p.paymentId || null, status: (p.status || 'IN_PAYMENT'), weekKey: p.weekKey || null, ts });
        }
      });
    });
    return idx;
  }, [paymentsStore]);

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

  // ✅ Parceiros SEMPRE em ordem alfabética (pt-BR, case-insensitive)
  const sortedPartners = useMemo(() => {
    const list = Array.isArray(activePartners) ? [...activePartners] : [];
    return list.sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'pt-BR', { sensitivity: 'base' }));
  }, [activePartners]);

  // 🔔 Canal local p/ avisar outras abas/janelas da mesma origem
  useEffect(() => {
    try {
      updatesChannelRef.current = new BroadcastChannel('mimo_services_updates');
      const ch = updatesChannelRef.current;
      ch.onmessage = (evt) => {
        if (evt?.data === 'changed' && viewMode === 'list') {
          loadServices();
        }
      };
      return () => ch.close();
    } catch { /* sem suporte */ }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const notifyGlobalChange = () => {
    try { updatesChannelRef.current?.postMessage('changed'); } catch {}
  };

  /* ===== Normalização vinda do backend ===== */
  const normalizeFromApi = (it) => {
    const serviceTypeId = it.serviceTypeId || it.serviceType?.id || it.serviceType || null;
    const stHit = serviceTypes.find(s => s.id === serviceTypeId);

    // suporta: string id, objeto com _id, objeto com id
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

    const partnerHitList = sortedPartners.find(p => String(p.id) === String(partnerId));
    const partnerNorm = partnerHitDb || partnerHitList || (partnerId
      ? { id: String(partnerId), name: it.partnerName || '(partner)' }
      : null);

    const statusId = (typeof it.status === 'string' ? it.status : it.status?.id) || 'RECORDED';
    const statusHit = serviceStatuses.find(s => s.id === statusId) || { id: 'RECORDED', name: 'Recorded', color: '#6B7280' };

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
      status: statusHit, // ✅ status sempre do backend
      createdAt: it.createdAt || new Date().toISOString(),
    };
  };

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
      await new Promise(r => setTimeout(r, 250)); // simula latência
      if (cancelToken.cancelled) return;

      const serviceType = serviceTypes.find(s => s.id === data.serviceType);
      if (!serviceType) throw new Error('Service type not found');

      let price;

      // 1) tenta custos cadastrados
      const hit = (typeof lookupCost === 'function') ? lookupCost(data) : null;

      if (hit && typeof hit.amount === 'number') {
        price = hit.amount;

        if (serviceType.category === 'hourly') {
          const hours = parseInt(data.serviceTime) || 1;
          const keyHasHours = hit.keyFields?.includes?.('hours');
          if (!keyHasHours && hours > 1) price *= hours;
          if (hours > 4) price *= 0.9; // desconto volume
        }

        if (serviceType.category === 'variable') {
          const keyHasHopper = hit.keyFields?.includes?.('hopper');
          if (!keyHasHopper && data.hopper) price *= 2; // hopper dobra
        }
      } else {
        // 2) fallback – lógica original
        price = serviceType.basePrice;

        switch (serviceType.category) {
          case 'variable': {
            const guests = parseInt(data.guests) || 1;
            if (guests > 1) price *= Math.max(1, guests * 0.8);
            if (data.park && (data.park.includes('Universal') || data.park.includes('Epic'))) price *= 1.2;
            if (data.hopper) price *= 2;
            if (data.location === 'Califórnia') price *= 1.15;
            if (data.team === 'US') price *= 1.1;
            break;
          }
          case 'hourly': {
            const hours = parseInt(data.serviceTime) || 1;
            price *= hours;
            if (hours > 4) price *= 0.9;
            if (data.team === 'US') price *= 1.1;
            break;
          }
          case 'fixed':
          default:
            break;
        }
      }

      price = Math.round(price * 100) / 100;

      if (cancelToken.cancelled) return;
      if (requestId === requestIdRef.current) {
        setPriceState({
          status: 'success',
          data: { amount: price, ruleId: `RULE_${serviceType.category.toUpperCase()}_${Date.now()}` }, // sem breakdown
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
  function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }
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

    // Valor MANUAL obrigatório
    if (!formData.serviceValue || isNaN(formData.serviceValue) || parseFloat(formData.serviceValue) <= 0) {
      newErrors.serviceValue = 'Service value is required and must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* ===== INPUT CHANGE ===== */
  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));

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

    // Valor MANUAL obrigatório (não adicionamos automático)
    const manual = formData.serviceValue?.toString().trim();
    const finalValueNum = Number.parseFloat(manual);
    if (!manual || Number.isNaN(finalValueNum) || finalValueNum <= 0) {
      setErrors(prev => ({ ...prev, serviceValue: 'Enter a valid service value' }));
      addNotification('error', 'Missing value', 'Enter the service value (manual).');
      return;
    }

    const suggestedNum = (priceState.status === 'success' && priceState.data?.amount != null)
      ? Number(priceState.data.amount)
      : null;

    const serviceData = {
      id: editingId || `service-${Date.now()}`,
      firstName: formData.firstName,
      lastName: formData.lastName,
      client: `${formData.firstName} ${formData.lastName}`,
      serviceDate: formData.serviceDate, // YYYY-MM-DD string
      partner: sortedPartners.find(p => p.id === formData.partner) || { id: formData.partner, name: '(partner not found)' },
      team: formData.team || '',
      serviceType: serviceTypes.find(s => s.id === formData.serviceType),
      serviceTime: formData.serviceTime || '',
      park: formData.park || '',
      location: formData.location || '',
      hopper: !!formData.hopper,
      guests: formData.guests || '',
      observations: formData.observations || '',
      // preços
      finalValue: finalValueNum,               // SEMPRE manual
      suggestedValue: suggestedNum,            // apenas referência
      calculatedPrice: priceState.data || null,
      overrideValue: (suggestedNum != null && suggestedNum !== finalValueNum) ? finalValueNum : null,
      createdAt: new Date().toISOString(),
      paymentWeek: (() => {
        const w = getPaymentWeek(toLocalDate(formData.serviceDate) || new Date());
        return { start: w.start, end: w.end, weekNumber: getWeekNumber(w.start), year: w.start.getFullYear() };
      })()
    };

    if (editingId) {
      if (editSource === 'list') {
        const payload = {
          serviceDate: toNoonUTCISO(serviceData.serviceDate),
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
          finalValue: Number(serviceData.finalValue), // manual
          overrideValue: serviceData.overrideValue,   // se diferente do sugerido
          calculatedPrice: serviceData.calculatedPrice || null,
        };

        (async () => {
          try {
            await updateServiceCompat(editingId, payload);
            notifyGlobalChange();
            addNotification('success', 'Updated', 'Service updated successfully.');
            setEditingId(null);
            setEditSource(null);
            resetForm('soft');
            setViewMode('list');
            await loadServices();
          } catch (e) {
            console.error(e);
            addNotification('error', 'Update failed', 'Could not update service.');
          }
        })();
        return;
      }

      // edição vinda do CARRINHO
      setCart(prev => prev.map(item => item.id === editingId ? serviceData : item));
      setEditingId(null);
      setEditSource(null);
      addNotification('success', 'Updated', 'Service updated successfully.');
    } else {
      setCart(prev => [...prev, serviceData]);
      addNotification('success', 'Added', 'Service added to cart.');
    }

    resetForm('soft'); // mantém cliente
  }
  addToCartRef.current = addToCart;

  const editService = (service) => {
    setFormData({
      firstName: service.firstName,
      lastName: service.lastName,
      serviceDate: typeof service.serviceDate === 'string'
        ? service.serviceDate.slice(0,10)
        : (toLocalDate(service.serviceDate)?.toISOString().slice(0,10) ?? ''),
      partner: service.partner?.id || '',
      team: service.team || '',
      serviceType: service.serviceType.id,
      serviceTime: service.serviceTime || '',
      park: service.park || '',
      location: service.location || '',
      hopper: service.hopper || false,
      guests: service.guests || '',
      observations: service.observations || '',
      serviceValue: (service.overrideValue ?? service.finalValue ?? '').toString()
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
      firstName: service.firstName,
      lastName: service.lastName,
      serviceDate: typeof service.serviceDate === 'string'
        ? service.serviceDate.slice(0, 10)
        : (toLocalDate(service.serviceDate)?.toISOString().slice(0,10) ?? ''),
      partner: service.partner?.id || '',
      team: service.team || '',
      serviceType: service.serviceType.id,
      serviceTime: service.serviceTime || '',
      park: service.park || '',
      location: service.location || '',
      hopper: !!service.hopper,
      guests: service.guests || '',
      observations: service.observations || '',
      serviceValue: (service.overrideValue ?? service.finalValue ?? '').toString()
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
      notifyGlobalChange();
      addNotification('success', 'Deleted', 'Service removed.');
      await loadServices();
      setSelectedIds(prev => { const nx = new Set(prev); nx.delete(id); return nx; });
    } catch (e) {
      console.error(e);
      addNotification('error', 'Delete failed', 'Could not delete service.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected service(s)?`)) return;
    try {
      setLoading(true);
      // Executa em série de forma conservadora
      for (const id of selectedIds) {
        try { // falhas parciais não interrompem
          // eslint-disable-next-line no-await-in-loop
          await deleteServiceCompat(id);
        } catch (e) { console.error('Failed to delete', id, e); }
      }
      notifyGlobalChange();
      addNotification('success', 'Deleted', `Removed ${selectedIds.size} service(s).`);
      clearSelection();
      await loadServices();
    } catch (e) {
      console.error(e);
      addNotification('error', 'Bulk delete failed', 'Could not delete some services.');
    } finally {
      setLoading(false);
    }
  };

  const getTotalValue = () => cart.reduce((total, s) => total + (Number(s.finalValue) || 0), 0);

  /* ===== SALVAR (cart -> backend) ===== */
  const saveAllServices = async () => {
    if (cart.length === 0) { addNotification('error','No Services','No services to save'); return; }
    try {
      setLoading(true);
      const payloads = cart.map(s => ({
        serviceDate: toNoonUTCISO(s.serviceDate), // grava 12:00Z
        firstName: s.firstName,
        lastName: s.lastName,
        partnerId: s.partner.id,
        team: s.team || null,
        serviceTypeId: s.serviceType.id,
        serviceTime: s.serviceTime ? Number(s.serviceTime) : undefined,
        park: s.park || undefined,
        location: s.location || undefined,
        hopper: !!s.hopper,
        guests: s.guests ? Number(s.guests) : undefined,
        observations: s.observations || undefined,
        finalValue: Number(s.finalValue), // MANUAL
        // Se houver cálculo e o manual difere do sugerido, manda overrideValue
        overrideValue: (s.calculatedPrice?.amount != null && Number(s.finalValue) !== Number(s.calculatedPrice.amount))
          ? Number(s.finalValue)
          : undefined,
        calculatedPrice: s.calculatedPrice ?? undefined,
        status: 'RECORDED',
      }));
      await createServicesBulkCompat(payloads);

      notifyGlobalChange();
      addNotification('success', 'Serviços salvos!', `Salvamos ${cart.length} serviço(s) com sucesso.`);
      setCart([]);
      setPriceState({ status: 'idle', data: null, error: null, requestId: null });
      setFormData(prev => ({ ...prev, firstName: '', lastName: '' }));
      setViewMode('list');
      setCurrentPage(1);
      await loadServices();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (e) {
      console.error(e);
      addNotification('error','Save Failed','Error saving services. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ===== LISTAGEM (backend) ===== */
  // Debounced loader + persistência de estado da lista
  const loadServices = useCallback(
    debounce(async () => {
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
        setTotalPages(totalPages);
        setTotalRecords(totalRecords);

        // Persistir estado da lista (sem searchTerm)
        saveUiState({
          viewMode,
          currentPage: page,
          pageSize,
          sortField,
          sortDirection,
          filters
        });
      } catch (e) {
        console.error(e);
        setServices({ data: [], totalPages: 1, totalRecords: 0, currentPage: 1 });
        setTotalPages(1);
        setTotalRecords(0);
      } finally {
        setLoading(false);
      }
    }, 200),
    [currentPage, pageSize, sortField, sortDirection, filters, sortedPartners, serviceTypes, viewMode]
  );

  // Restaura estado salvo ao montar
  useEffect(() => {
    const saved = loadUiState();
    if (saved) {
      setViewMode(saved.viewMode || 'form');
      setCurrentPage(saved.currentPage || 1);
      setPageSize(saved.pageSize || 20);
      setSortField(saved.sortField || 'serviceDate');
      setSortDirection(saved.sortDirection || 'desc');
      setFilters(saved.filters || { dateFrom:'', dateTo:'', partner:'', serviceType:'', team:'', status:'' });
    }
  }, []);

  // Carrega quando entra em LIST
  useEffect(() => { if (viewMode === 'list') loadServices(); }, [viewMode, loadServices]);

  // Recarrega quando paginação/sort/filtros mudam
  useEffect(() => { if (viewMode === 'list') loadServices(); },
    [currentPage, pageSize, sortField, sortDirection, filters, viewMode, loadServices]);

  // 🔁 Polling leve para múltiplos admins (atualizações de status/itens)
  useEffect(() => {
    if (viewMode !== 'list' || !autoRefresh) return;
    const id = setInterval(() => { loadServices(); }, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [viewMode, autoRefresh, loadServices]);

  /* ===== Filtros e ordenação ===== */
  const handleSort = (field) => {
    // Mapear para API
    const apiField = field === 'client' ? 'firstName' : (field === 'partner' ? 'partnerName' : field);
    if (sortField === apiField) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(apiField); setSortDirection('asc'); }
    setCurrentPage(1);
  };
  const renderSortIcon = (field) => {
    const apiField = field === 'client' ? 'firstName' : (field === 'partner' ? 'partnerName' : field);
    if (sortField !== apiField) return <ArrowUpDown size={14} className="sort-icon inactive" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="sort-icon active" />
      : <ArrowDown size={14} className="sort-icon active" />;
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

   /* ===== RENDER ===== */
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
          <button className={`btn btn--outline ${viewMode === 'form' ? 'is-active' : ''}`} onClick={() => setViewMode('form')}>
            <Plus size={20} /> Add Services
          </button>
          <button className={`btn btn--outline ${viewMode === 'list' ? 'is-active' : ''}`} onClick={() => setViewMode('list')}>
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
            {currentWeek ? `${currentWeek.start.toLocaleDateString()} - ${currentWeek.end.toLocaleDateString()}` : 'Loading...'}
          </div>
          <div className="week-meta">
            {currentWeek && `Week ${currentWeek.weekNumber} • ${currentWeek.year}`}
          </div>
        </div>
      </div>
    </div>

    {viewMode === 'form' ? (
      /* ===== VIEW: FORM ===== */
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

                {/* Partner (ordenado alfabeticamente) */}
                <div className="field">
                  <label className="form-label"><User size={16} /> Partner</label>
                  <select
                    className={`form-select ${errors.partner ? 'error' : ''}`}
                    value={formData.partner}
                    onChange={(e) => handleInputChange('partner', e.target.value)}
                  >
                    <option value="">Select a partner</option>
                    {[...activePartners]
                      .sort((a,b) => a.name.localeCompare(b.name,'en',{sensitivity:'base'}))
                      .map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
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

                  {/* Park (por localização) */}
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

              {/* Hopper */}
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

              {/* Observations */}
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

              {/* PRICE SECTION (sem breakdown) */}
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
                  </div>
                  <div className="price-actions">
                    <button type="button" className="recalculate-btn" onClick={handleRecalculate} disabled={priceState.status === 'loading'} title="Recalculate price">
                      <RefreshCw size={16} className={priceState.status === 'loading' ? 'spinning' : ''} />
                    </button>
                    {priceState.status === 'success' && priceState.data && (
                      <button type="button" className="recalculate-btn" onClick={handleUseSuggested} title="Copy suggested to value">
                        <Copy size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <DollarSign size={16} /> Service Value (required)
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
                  <div className="form-hint">We won’t add any value automatically. Use the copy button to fill with the suggestion.</div>
                </div>

                {priceState.status === 'error' && (
                  <div className="price-error-details"><AlertCircle size={16} /><span>{priceState.error}</span></div>
                )}
              </div>

              <button type="button" className="btn btn--primary btn--block" onClick={addToCart} disabled={Object.keys(errors).length > 0}>
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
                                {formatDateSafe(service.serviceDate)}
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
                            <div className="service-value">${Number(service.finalValue).toFixed(2)}</div>
                            {service.suggestedValue != null && service.suggestedValue !== service.finalValue && (
                              <div className="value-note">(suggested ${Number(service.suggestedValue).toFixed(2)})</div>
                            )}
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

          {/* INFO CARD */}
          <div className="info-card">
            <div className="info-header"><AlertCircle size={20} /><h3>Service Categories</h3></div>
            <div className="info-content">
              <div className="info-item"><strong>Variable Price:</strong> Tours and coordination services with dynamic pricing based on guests, location, and extras.</div>
              <div className="info-item"><strong>Fixed Price:</strong> Standard services with consistent pricing regardless of parameters.</div>
              <div className="info-item"><strong>Hourly:</strong> Time-based services charged per hour of work.</div>
            </div>
            <div className="info-content">
              <h4>Keyboard Shortcuts</h4>
              <div className="info-item"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> — Add Service</div>
              <div className="info-item"><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>N</kbd> — Focus First Name</div>
              <div className="info-item"><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>D</kbd> — Focus Service Date</div>
            </div>
          </div>
        </div>
      </div>
    ) : (
      /* ===== VIEW: LIST ===== */
      <div className="services-list-container">
        {/* Filtros (sem busca) */}
        <div className="list-controls">
          <div className="filters-section">
            <div className="filter-group">
              <label>Partner:</label>
              <select value={filters.partner} onChange={(e) => handleFilterChange('partner', e.target.value)} className="filter-select">
                <option value="">All Partners</option>
                {[...activePartners]
                  .sort((a,b) => a.name.localeCompare(b.name,'en',{sensitivity:'base'}))
                  .map((partner) => (<option key={partner.id} value={partner.id}>{partner.name}</option>))}
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

            <div className="filter-group">
              <label>Date Range:</label>
              <div className="date-range-inputs">
                <input type="date" value={filters.dateFrom} onChange={(e) => handleFilterChange('dateFrom', e.target.value)} className="filter-input" />
                <span>to</span>
                <input type="date" value={filters.dateTo} onChange={(e) => handleFilterChange('dateTo', e.target.value)} className="filter-input" />
              </div>
            </div>

            <button
              className="clear-filters-btn"
              onClick={() => { setFilters({ partner: '', serviceType: '', status: '', team: '', dateFrom: '', dateTo: '' }); setCurrentPage(1); clearSelection(); }}
            >
              <X size={16} /> Clear Filters
            </button>
          </div>
        </div>

        {/* Ações da lista */}
        <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button className="btn btn--outline" onClick={() => loadServices()} title="Refresh list">
              <RefreshCw size={16} /> Refresh
            </button>
            <label className="checkbox-label" style={{ marginLeft:12 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <div className="checkbox-custom"></div>
              Auto refresh on focus
            </label>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="btn btn--danger" disabled={selectedIds.size === 0} onClick={handleBulkDelete} title="Delete selected">
              <Trash2 size={16} /> Delete selected ({selectedIds.size})
            </button>
          </div>
        </div>

        {/* Tabela de Serviços */}
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
                  <div className="header-cell center" style={{ width: 38 }}>
                    {/* Selecionar todos (página) */}
                    <input
                      type="checkbox"
                      checked={services.data.length > 0 && services.data.every(s => selectedIds.has(s.id))}
                      onChange={(e) => {
                        const all = new Set(selectedIds);
                        if (e.target.checked) services.data.forEach(s => all.add(s.id));
                        else services.data.forEach(s => all.delete(s.id));
                        setSelectedIds(all);
                      }}
                      title="Select all on page"
                    />
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
                  {/* Observations com tooltip e truncamento */}
                  <div className="header-cell"><AlertCircle size={16} /> Observations</div>
                  <div className="header-cell sortable" onClick={() => handleSort('finalValue')}>
                    <DollarSign size={16} /> Value {renderSortIcon('finalValue')}
                  </div>
                  <div className="header-cell"><AlertCircle size={16} /> Status</div>
                  <div className="header-cell"><Settings size={16} /> Actions</div>
                </div>

                <div className="table-body">
                  {services.data.map((service) => (
                    <div key={service.id} className="table-row">
                      <div className="table-cell center" style={{ width: 38 }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(service.id)}
                          onChange={(e) => {
                            const nx = new Set(selectedIds);
                            if (e.target.checked) nx.add(service.id); else nx.delete(service.id);
                            setSelectedIds(nx);
                          }}
                          title={`Select ${service.firstName} ${service.lastName}`}
                        />
                      </div>

                      <div className="table-cell">
                        <div className="date-info">
                          <div className="date-primary">
                            {formatDateSafe(service.serviceDate)}
                          </div>
                          <div className="date-secondary">
                            {formatWeekday(service.serviceDate)}
                          </div>
                        </div>
                      </div>

                      <div className="table-cell">
                        <div className="client-info">
                          <div className="client-name">{service.firstName} {service.lastName}</div>
                          <div className="client-meta">Added {formatDateSafe(service.createdAt)}</div>
                        </div>
                      </div>

                      <div className="table-cell">
                        <div className="partner-info">
                          <div className="partner-name">{service.partner?.name || '—'}</div>
                          {service.team ? (
                            <div className="partner-team"><Globe size={12} /> {service.team} Team</div>
                          ) : (<div className="no-team">—</div>)}
                        </div>
                      </div>

                      <div className="table-cell">
                        {service.team ? <span className={`team-badge ${service.team?.toLowerCase()}`}>{service.team}</span> : <span className="no-team">—</span>}
                      </div>

                      <div className="table-cell">
                        <div className="service-type-info">
                          <div className="service-type-name">
                            {(() => { const IconComp = asIcon(service.serviceType?.icon); return <IconComp size={14} />; })()}
                            {service.serviceType.name}
                          </div>
                          <div className="service-category">{service.serviceType.category}</div>
                        </div>
                      </div>

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

                      {/* Observations truncadas com tooltip */}
                      <div className="table-cell">
                        {service.observations ? (
                          <div
                            className="observations-ellipsis"
                            title={service.observations}
                            style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {service.observations}
                          </div>
                        ) : <span className="no-obs">—</span>}
                      </div>

                      <div className="table-cell">
                        <div className="value-info">
                          <div className="final-value">${Number(service.finalValue || 0).toFixed(2)}</div>
                          {service.overrideValue && (<div className="value-note"><Edit3 size={12} /> Custom</div>)}
                        </div>
                      </div>

                      {/* ✅ Status do serviço, sempre do backend; vínculo ao pagamento apenas como dica (title) */}
                      <div className="table-cell">
                        {(() => {
                          const st = service.status?.id || 'RECORDED';
                          const label = service.status?.name || 'Recorded';
                          const link = paymentIndex.get(service.id);
                          const title = link
                            ? `Linked to payment${link.paymentId ? ` #${link.paymentId}` : ''}${link.weekKey ? ` • ${link.weekKey}` : ''}`
                            : 'Service status';
                          return (
                            <span
                              className={`status-badge ${String(st).toLowerCase()}`}
                              title={title}
                              style={{ backgroundColor: (service.status?.color || undefined) }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="table-cell">
                        <div className="action-buttons">
                          <button className="btn btn--outline btn--sm" onClick={() => handleListEdit(service)} title="View details"><Eye size={14} /></button>
                          <button className="btn btn--outline btn--sm" onClick={() => handleListEdit(service)} title="Edit service"><Edit3 size={14} /></button>
                          <button className="btn btn--danger btn--sm" onClick={() => handleListDelete(service.id)} title="Delete service"><Trash2 size={14} /></button>
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
                      ? `Showing ${((currentPage - 1) * pageSize) + 1} to ${Math.min(currentPage * pageSize, services.totalRecords)} of ${services.totalRecords} services`
                      : 'Showing 0 to 0 of 0 services'}
                  </span>
                </div>

                <div className="pagination-controls">
                  <button className="pagination-btn" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} title="First page">
                    <ChevronsLeft size={16} />
                  </button>
                  <button className="pagination-btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} title="Previous page">
                    <ChevronLeft size={16} />
                  </button>

                  <div className="page-numbers">
                    {(() => {
                      const pages = [];
                      const total = services.totalPages;
                      const start = Math.max(1, currentPage - 2);
                      const end = Math.min(total, currentPage + 2);
                      for (let i = start; i <= end; i++) {
                        pages.push(
                          <button key={i} className={`page-number ${i === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(i)}>
                            {i}
                          </button>
                        );
                      }
                      return pages;
                    })()}
                  </div>

                  <button className="pagination-btn" onClick={() => setCurrentPage((p) => Math.min(services.totalPages, p + 1))} disabled={currentPage === services.totalPages} title="Next page">
                    <ChevronRight size={16} />
                  </button>
                  <button className="pagination-btn" onClick={() => setCurrentPage(services.totalPages)} disabled={currentPage === services.totalPages} title="Last page">
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
                  <div className="empty-icon"><Search size={48} /></div>
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

