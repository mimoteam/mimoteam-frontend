// src/pages/Payments.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, DollarSign, Users, Trash2, Edit3, Save, Loader, Filter, Info,
  Copy, ChevronDown, ChevronRight, Share2, RefreshCw, MapPin, Plus, X
} from 'lucide-react';
import {
  Eye, Calendar as CalIco, Building, Plane, Baby, Coffee, Car, Home,
  DollarSign as DollarIco
} from 'lucide-react';
import { api } from '../api/http';
import '../styles/Payments.css';
import { getServicesPayStatus } from "../api/payments";

const DEBUG_PAYSTATUS = false;

/** ===================== Tipos (para reidratar) ===================== */
const serviceTypes = [
  { id: 'IN_PERSON_TOUR', name: 'In-Person Tour', icon: Building, category: 'variable', basePrice: 150 },
  { id: 'VIRTUAL_TOUR',   name: 'Virtual Tour',   icon: Eye,      category: 'variable', basePrice: 80  },
  { id: 'COORDINATOR',    name: 'Coordinator',    icon: CalIco,   category: 'variable', basePrice: 200 },
  { id: 'CONCIERGE',      name: 'Concierge Service',              icon: Coffee,   category: 'fixed',  basePrice: 120 },
  { id: 'TICKET_DELIVERY',name: 'Ticket Delivery',                icon: Car,      category: 'fixed',  basePrice: 25  },
  { id: 'DELIVERY',       name: 'Delivery Service',               icon: Car,      category: 'fixed',  basePrice: 25  },
  { id: 'AIRPORT_ASSISTANCE', name: 'Airport Assistance',         icon: Plane,    category: 'fixed',  basePrice: 85  },
  { id: 'VACATION_HOME_ASSISTANCE', name: 'Vacation Home Assistance', icon: Home, category: 'fixed', basePrice: 75 },
  { id: 'HOTEL_ASSISTANCE', name: 'Hotel Assistance',             icon: Building, category: 'fixed',  basePrice: 65  },
  { id: 'ADJUSMENT',      name: 'Adjusment',                      icon: DollarIco,category: 'fixed',  basePrice: 10  },
  { id: 'REIMBURSEMENT',  name: 'Reimbursement',                  icon: DollarIco,category: 'fixed',  basePrice: 10  },
  { id: 'EXTRA HOUR',     name: 'Extra Hour',                     icon: DollarIco,category: 'fixed',  basePrice: 10  },
  { id: 'BABYSITTER',     name: 'Babysitter',                     icon: Baby,     category: 'hourly', basePrice: 35  },
  { id: 'TIP',            name: 'Tip',                            icon: Baby,     category: 'hourly', basePrice: 35  },
  { id: 'ASSISTANCE',     name: 'Assistance',                     icon: MapPin,   category: 'hourly', basePrice: 35  },
];

/** ===================== Helpers gerais ===================== */
const DAY_MS = 24 * 60 * 60 * 1000;

function getPaymentWeek(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay();         // 0=Dom ... 3=Qua
  const toWed = (dow >= 3) ? (dow - 3) : (dow + 4);
  const start = new Date(d); start.setDate(d.getDate() - toWed); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end, key: weekKey(start) };
}
function weekKey(startDate) {
  const y = startDate.getFullYear();
  const jan1 = new Date(y,0,1);
  const diffDays = Math.floor((startDate - jan1)/DAY_MS);
  const wk = Math.ceil((diffDays + jan1.getDay() + 1)/7);
  return `${y}-W${String(wk).padStart(2,'0')}`;
}
function build5Weeks(centerDate) {
  const center = getPaymentWeek(centerDate).start;
  const list = [];
  for (let i = -2; i <= 2; i++) {
    const s = new Date(center); s.setDate(s.getDate() + (i*7));
    const w = getPaymentWeek(s);
    list.push(w);
  }
  return list;
}
function within(dateIso, fromIso, toIso) {
  const t = new Date(dateIso).getTime();
  const f = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const tt = toIso ? new Date(toIso).getTime() : Infinity;
  return t >= f && t <= tt;
}
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');
const formatCurrency = (n) => `$${Number(n || 0).toFixed(2)}`;
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const arraysEqualAsSets = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map(String));
  for (const x of b) if (!sa.has(String(x))) return false;
  return true;
};
const fmtApiDate = (d) => { if (!d) return ''; const dd = new Date(d); return isNaN(dd) ? '' : dd.toISOString().slice(0, 10); };
const getErrorMessage = (e, fb = 'Unexpected error') =>
  e?.response?.data?.message || e?.response?.data?.error || e?.data?.message || e?.message || fb;

/** ===================== Status (Payments) ===================== */
const STATUS_META = {
  CREATING:  { name: 'creating',  color: '#6B7280' },
  SHARED:    { name: 'shared',    color: '#3B82F6' },
  APPROVED:  { name: 'approved',  color: '#10B981' },
  PENDING:   { name: 'pending',   color: '#F59E0B' },
  DECLINED:  { name: 'declined',  color: '#EF4444' },
  ON_HOLD:   { name: 'on hold',   color: '#9CA3AF' },
  PAID:      { name: 'paid',      color: '#0ea5e9' },
};
const StatusBadge = ({ status }) => {
  const s = STATUS_META[status] || STATUS_META.CREATING;
  return <span className="pay-status" style={{ backgroundColor: s.color }}>{s.name}</span>;
};

/** ===================== Service→Payment Status (UI) ===================== */
const SERVICE_STATUS_META = {
  'not linked': { label: 'not linked', color: '#9CA3AF' },
  pending:      { label: 'pending',    color: '#F59E0B' },
  paid:         { label: 'paid',       color: '#10B981' },
  declined:     { label: 'declined',   color: '#EF4444' },
};
const ServicePayStatus = ({ value }) => {
  const s = SERVICE_STATUS_META[value] || SERVICE_STATUS_META['not linked'];
  return <span className="pay-status" style={{ backgroundColor: s.color }}>{s.label}</span>;
};

/** ===================== Hook: parceiros ativos ===================== */
const useActivePartners = () => {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.get('/users', { params: { role: 'partner', status: 'active', pageSize: 1000 } });
        const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
        const active = items.map(u => ({
          id: u._id || u.id,
          name: u.fullName || u.login || u.name || '(sem nome)',
          email: u.email || '',
          role: u.role
        })).sort((a, b) => a.name.localeCompare(b.name));
        if (alive) setList(active);
      } catch {
        try {
          const raw = localStorage.getItem('users_store_v1');
          const arr = raw ? JSON.parse(raw) : [];
          const active = (Array.isArray(arr) ? arr : [])
            .filter(u => (String(u.role).toLowerCase() === 'partner') && (String(u.status).toLowerCase() === 'active'))
            .map(u => ({ id: u.id, name: u.fullName || u.login || '(sem nome)', email: u.email || '', role: u.role }))
            .sort((a, b) => a.name.localeCompare(b.name));
          if (alive) setList(active);
        } catch { if (alive) setList([]); }
      }
    })();
    return () => { alive = false; };
  }, []);
  return list;
};

/** ===================== Fetch paginado (helpers) ===================== */
async function fetchAllPages(path, { pageSize = 200, params = {} } = {}) {
  let page = 1;
  let acc = [];
  let guard = 0;
  while (true) {
    const res = await api.get(path, { params: { ...params, page, pageSize } });
    const payload = res?.data ?? res;
    const items = Array.isArray(payload?.items) ? payload.items
               : Array.isArray(res?.items) ? res.items
               : Array.isArray(res) ? res
               : [];
    acc = acc.concat(items);
    const hasMore =
      payload?.hasMore ??
      payload?.nextPage ??
      (items && items.length === pageSize);
    page += 1;
    guard += 1;
    if (!hasMore || !items || items.length === 0 || guard > 100) break;
  }
  return acc;
}
async function fetchAllServices() {
  const raw = await fetchAllPages('/services', { pageSize: 200 });
  return raw.map(item => {
    const st = (item.serviceType && item.serviceType.id)
      ? item.serviceType
      : serviceTypes.find(t => t.id === (item.serviceTypeId ?? item.serviceType)) || (item.serviceType ? { id: item.serviceType, name: item.serviceType } : null);
    const partner = (item.partner && item.partner.id) ? item.partner : (item.partnerId ? { id: item.partnerId } : item.partner || null);
    return { ...item, id: item._id || item.id, serviceType: st, partner };
  });
}
async function fetchAllPayments() {
  const raw = await fetchAllPages('/payments', { pageSize: 200 });
  return raw.map(p => ({ ...p, id: p._id || p.id }));
}

/** ===================== Componente ===================== */
const Payments = () => {
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const notify = (type, text, ttl = 2500) => {
    setFlash({ type, text });
    if (ttl) setTimeout(() => setFlash(null), ttl);
  };

  const partnersList = useActivePartners();

  /** ===== Filtros (Services) */
  const [selectedPartner, setSelectedPartner] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  /** Semana */
  const [assignWeekKey, setAssignWeekKey] = useState('');
  const [weekOptions, setWeekOptions] = useState(build5Weeks(new Date()));

  /** Catálogos */
  const [allServices, setAllServices] = useState([]);
  const [payments, setPayments] = useState([]);

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  /** Paginação (cliente) */
  const [payPage, setPayPage] = useState(1);
  const [payPageSize, setPayPageSize] = useState(10);
  const [servPage, setServPage] = useState(1);
  const [servPageSize, setServPageSize] = useState(10);

  const [expanded, setExpanded] = useState(() => new Set());

  // edição de valores por linha
  const [lineEditOn, setLineEditOn] = useState(null);
  const [lineDrafts, setLineDrafts] = useState({});

  // picker para ADICIONAR serviços ao pagamento
  const [addPicker, setAddPicker] = useState({
    paymentId: null,
    items: [],
    selected: new Set(),
    loading: false,
  });

  /** Filtros (payments) */
  const [payFilterPartner, setPayFilterPartner] = useState('');
  const [payFilterMonth, setPayFilterMonth] = useState('');
  const [payFilterWeek, setPayFilterWeek] = useState('');

  // mapa: serviceId -> {status, paymentId}
  const [servicePayStatus, setServicePayStatus] = useState(new Map());

  /** ===== Carga inicial */
  const refreshAll = async () => {
    try {
      setLoading(true);
      const [s, p] = await Promise.all([fetchAllServices(), fetchAllPayments()]);
      setAllServices(s);
      setPayments(p);
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refreshAll(); }, []);

  /** ===== Derivações de Services (só no cliente) */
  const serviceById = useMemo(() => {
    const map = new Map();
    (allServices || []).forEach(s => map.set(String(s.id), s));
    return map;
  }, [allServices]);

  const filteredServices = useMemo(() => {
    let arr = Array.isArray(allServices) ? [...allServices] : [];
    if (selectedPartner) arr = arr.filter(s => (s.partner?.id || s.partnerId) === selectedPartner);
    if (dateFrom || dateTo) arr = arr.filter(s => within(s.serviceDate, dateFrom, dateTo));
    if ((search || '').trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(s => (`${s.firstName || ''} ${s.lastName || ''}`).toLowerCase().includes(q));
    }
    arr.sort((a,b) => new Date(a.serviceDate) - new Date(b.serviceDate));
    return arr;
  }, [allServices, selectedPartner, dateFrom, dateTo, search]);

  /** ===== Semanas sugeridas (para gerar pagamento) */
  useEffect(() => {
    let ref = new Date();
    const setSel = new Set(selectedServiceIds.map(String));
    const chosen = filteredServices.filter(s => setSel.has(String(s.id)));
    if (chosen.length) {
      const max = chosen.reduce((m, s) => Math.max(m, new Date(s.serviceDate).getTime()), 0);
      ref = new Date(max);
    }
    const opts = build5Weeks(ref);
    setWeekOptions(opts);
    if (!assignWeekKey || !opts.find(o => o.key === assignWeekKey)) {
      setAssignWeekKey(opts[2]?.key || opts[0]?.key || '');
    }
  }, [filteredServices, selectedServiceIds, assignWeekKey]);

  /** ===== Reset paginação de services ao mudar filtros */
  useEffect(() => { setServPage(1); }, [selectedPartner, dateFrom, dateTo, search, servPageSize]);

  /** ===== Índice: pagamento por serviceId (bloquear seleção de já usados) */
  const paymentIndexByServiceId = useMemo(() => {
    const map = new Map();
    payments.forEach(p => (p.serviceIds || []).forEach(id => map.set(String(id), p)));
    return map;
  }, [payments]);

  /** ===== Totais selecionados (antes de gerar pagamento) */
  const totalSelected = useMemo(() => {
    const setSel = new Set(selectedServiceIds.map(String));
    return filteredServices
      .filter(s => setSel.has(String(s.id)))
      .reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0);
  }, [filteredServices, selectedServiceIds]);

  /** ===== Seleção na tabela de serviços */
  const toggleSelectAll = () => {
    const available = filteredServices.filter(s => !paymentIndexByServiceId.has(String(s.id)));
    if (selectedServiceIds.length === available.length && available.length > 0) {
      setSelectedServiceIds([]);
    } else {
      setSelectedServiceIds(available.map(s => String(s.id)));
    }
  };
  const toggleSelectOne = (id) => {
    const sid = String(id);
    setSelectedServiceIds(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]);
  };

  /** ===== Helpers payload/idempotência ===== */
  const clean = (obj) => {
    const out = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v == null || v === '') return;
      out[k] = v;
    });
    return out;
  };

  async function findJustCreatedPayment({ partnerId, weekKey: wkKey, weekStart, weekEnd, serviceIds }) {
    const list = await fetchAllPayments();
    setPayments(list);
    const found = list.find(p => {
      if (p.partnerId !== partnerId) return false;
      const pKey = p.week?.key || p.weekKey || '';
      if (wkKey && pKey && pKey !== wkKey) return false;
      const ids = (p.serviceIds || []).map(String);
      return arraysEqualAsSets(ids, serviceIds.map(String));
    });
    return found || null;
  }

  /** ===================== CRUD (Payments) ===================== */
  const generatePayment = async () => {
    if (!selectedPartner) { alert('Selecione um partner.'); return; }
    if (selectedServiceIds.length === 0) { alert('Selecione pelo menos um serviço.'); return; }
    if (!assignWeekKey) { alert('Selecione a semana.'); return; }

    try {
      setLoading(true);

      const partnerId = selectedPartner;
      const partnerName = partnersList.find(p => String(p.id) === String(partnerId))?.name || '';

      const selected = Array.from(new Set(selectedServiceIds.map(String)))
        .map(id => serviceById.get(id))
        .filter(Boolean);

      // sanidade
      const wrongPartner = selected.filter(s => (s.partner?.id || s.partnerId) !== partnerId);
      if (wrongPartner.length) {
        alert(`Há serviços de outro partner na seleção (${wrongPartner.length}). Ajuste a seleção/filtro.`);
        return;
      }
      const alreadyUsed = selected.filter(s => paymentIndexByServiceId.has(String(s.id)));
      if (alreadyUsed.length) {
        const sample = alreadyUsed.slice(0, 5).map(s => `${s.firstName || ''} ${s.lastName || ''}`.trim() || String(s.id)).join(', ');
        alert(`Alguns serviços já estão em um pagamento (${alreadyUsed.length}): ${sample}${alreadyUsed.length > 5 ? '…' : ''}`);
        return;
      }

      const pickedWeek = weekOptions.find(w => w.key === assignWeekKey);
      const weekKeySel = assignWeekKey;
      const weekStartISO = pickedWeek ? new Date(pickedWeek.start).toISOString() : undefined;
      const weekEndISO   = pickedWeek ? new Date(pickedWeek.end).toISOString()   : undefined;

      const payload = clean({
        partnerId,
        partnerName,
        serviceIds: selected.map(s => String(s.id)),
        weekKey: weekKeySel,
        weekStart: weekStartISO,
        weekEnd: weekEndISO,
      });

      const opts = { headers: { 'X-Idempotency-Key': uuid() } };

      try {
        await api.post('/payments', payload, opts);
      } catch (err) {
        const created = await findJustCreatedPayment({
          partnerId,
          weekKey: weekKeySel,
          weekStart: weekStartISO,
          weekEnd: weekEndISO,
          serviceIds: payload.serviceIds
        });
        if (!created) {
          throw new Error(getErrorMessage(err, 'Failed to create payment'));
        }
      }

      await refreshAll();
      setSelectedServiceIds([]);
      setPayPage(1);
      notify('success', 'Payment generated successfully.');
    } catch (e) {
      notify('error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const setPaymentStatus = async (id, status) => {
    try {
      await api.patch(`/payments/${id}`, { status });
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to update status'));
      return;
    }
    const list = await fetchAllPayments();
    setPayments(list);
    notify('success', status === 'SHARED' ? 'Payment shared with partner.' : 'Status updated.');
  };

  const canModifyPayment = (p) =>
    p.status === 'PENDING' || p.status === 'ON_HOLD' || p.status === 'DECLINED';

  const removePayment = async (id) => {
    if (!window.confirm('Excluir este pagamento?')) return;
    try {
      await api.delete(`/payments/${id}`);
      setPayments(prev => prev.filter(p => (p.id || p._id) !== id));
      setExpanded(prev => { const nx = new Set(prev); nx.delete(id); return nx; });
      notify('success', 'Payment deleted.');
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to delete payment'));
    }
  };

  /** ===================== Notes ===================== */
  const [noteDrafts, setNoteDrafts] = useState({});
  const [savingNoteFor, setSavingNoteFor] = useState(null);
  const addNoteToPayment = async (paymentId) => {
    const text = (noteDrafts[paymentId] || '').trim();
    if (!text) return;
    try {
      setSavingNoteFor(paymentId);
      await api.patch(`/payments/${paymentId}`, { notes: text, appendNote: true });
      const list = await fetchAllPayments();
      setPayments(list);
      setNoteDrafts(d => ({ ...d, [paymentId]: '' }));
      notify('success', 'Note added.');
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to save note'));
    } finally {
      setSavingNoteFor(null);
    }
  };

  // ====== Line edit helpers
  const getDraftOrValue = (sid, val) =>
    (lineDrafts[sid] !== undefined && lineDrafts[sid] !== null)
      ? Number(lineDrafts[sid])
      : Number(val || 0);

  const calcSubtotalWithDrafts = (lines) =>
    lines.reduce((sum, s) => sum + getDraftOrValue(String(s.id), s.finalValue), 0);

  const beginLineEdit = (pid) => { setLineEditOn(pid); setLineDrafts({}); };
  const cancelLineEdit = () => { setLineEditOn(null); setLineDrafts({}); };
  const changeLineAmount = (sid, v) => {
    const num = Number(v);
    setLineDrafts(prev => ({ ...prev, [String(sid)]: isNaN(num) ? 0 : num }));
  };

  const saveLineEdits = async (p) => {
    try {
      const updates = Object.entries(lineDrafts)
        .filter(([sid, val]) => {
          const s = serviceById.get(String(sid));
          return s && Number(s.finalValue) !== Number(val);
        })
        .map(([sid, val]) => api.patch(`/services/${sid}`, { finalValue: Number(val) }));
      if (updates.length) await Promise.all(updates);
      await api.post(`/payments/${p.id}/recalc`);
      await refreshAll();
      setLineEditOn(null);
      setLineDrafts({});
      notify('success', 'Line amounts saved.');
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to save line edits'));
    }
  };

  // ====== Add service (picker)
  const openAddService = async (p) => {
    try {
      const start = p.week?.start || p.weekStart || null;
      const end   = p.week?.end   || p.weekEnd   || null;
      const dateFrom = fmtApiDate(start);
      const dateTo   = fmtApiDate(end);
      setAddPicker({ paymentId: p.id, items: [], selected: new Set(), loading: true });

      const res = await api.get('/payments/eligible', { params: {
        partnerId: p.partnerId,
        dateFrom,
        dateTo
      }});

      const items = Array.isArray(res?.items) ? res.items
                  : Array.isArray(res?.data?.items) ? res.data.items
                  : [];
      setAddPicker({ paymentId: p.id, items, selected: new Set(), loading: false });
    } catch (e) {
      setAddPicker({ paymentId: p.id, items: [], selected: new Set(), loading: false });
      notify('error', getErrorMessage(e, 'Failed to load eligible services (check date format).'));
    }
  };

  const togglePick = (sid) => {
    setAddPicker(prev => {
      const sel = new Set(prev.selected);
      const k = String(sid);
      sel.has(k) ? sel.delete(k) : sel.add(k);
      return { ...prev, selected: sel };
    });
  };

  const confirmAddServices = async (p) => {
    try {
      const sel = Array.from(addPicker.selected || []);
      if (sel.length === 0) {
        setAddPicker({ paymentId: null, items: [], selected: new Set(), loading: false });
        return;
      }
      const newIds = Array.from(new Set([...(p.serviceIds || []).map(String), ...sel.map(String)]));
      await api.patch(`/payments/${p.id}`, { serviceIds: newIds });
      await api.post(`/payments/${p.id}/recalc`);
      await refreshAll();
      setAddPicker({ paymentId: null, items: [], selected: new Set(), loading: false });
      setExpanded(prev => new Set(prev).add(p.id));
      notify('success', 'Service(s) added to payment.');
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to add services'));
    }
  };

  const cancelAddServices = () => {
    setAddPicker({ paymentId: null, items: [], selected: new Set(), loading: false });
  };

  /** ===== Paginação (payments/services) */
  const totalPaymentsPages = useMemo(() => Math.max(1, Math.ceil((payments.length || 0) / payPageSize)), [payments.length, payPageSize]);
  const paginatedPayments = useMemo(() => {
    let arr = payments.slice();

    const isSameYYYYMM = (iso, ym) => {
      if (!iso || !ym) return false;
      const d = new Date(iso);
      const [y, m] = ym.split('-').map(Number);
      return d.getFullYear() === y && (d.getMonth() + 1) === m;
    };

    if (payFilterPartner) arr = arr.filter(p => p.partnerId === payFilterPartner);
    if (payFilterMonth) {
      arr = arr.filter(p => {
        const wk = p.week || {};
        const start = wk.start || p.weekStart;
        return (start && isSameYYYYMM(start, payFilterMonth)) ||
               (!start && (isSameYYYYMM(p.periodFrom, payFilterMonth) || isSameYYYYMM(p.periodTo, payFilterMonth)));
      });
    }
    if (payFilterWeek) arr = arr.filter(p => (p.week?.key || p.weekKey) === payFilterWeek);

    const start = (payPage - 1) * payPageSize;
    return arr.slice(start, start + payPageSize);
  }, [payments, payFilterPartner, payFilterMonth, payFilterWeek, payPage, payPageSize]);

  const totalServicesPages = Math.max(1, Math.ceil((filteredServices.length || 0) / servPageSize));
  const startServIndex = (servPage - 1) * servPageSize;
  const paginatedServices = useMemo(() => {
    return filteredServices.slice(startServIndex, startServIndex + servPageSize);
  }, [filteredServices, startServIndex, servPageSize]);

  /** ===== Busca do status por serviço (com debug e fallback) ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = paginatedServices.map(s => String(s.id));
      if (!ids.length) { if (alive) setServicePayStatus(new Map()); return; }
      try {
        const map = await getServicesPayStatus(ids);
        if (alive) setServicePayStatus(map);
        if (DEBUG_PAYSTATUS) {
          console.debug('[paystatus] req ids:', ids);
          console.debug('[paystatus] result entries:', Array.from(map.entries()));
        }
      } catch (err) {
        if (DEBUG_PAYSTATUS) console.error('[paystatus] error:', err);
        if (alive) setServicePayStatus(new Map()); // cai no fallback via payments[]
      }
    })();
    return () => { alive = false; };
  }, [paginatedServices, payments]);

  /** ===== Resolver combinado: rota + fallback local ===== */
  const resolveServicePayInfo = (serviceId) => {
    const id = String(serviceId);
    const fromApi = servicePayStatus.get(id);
    if (fromApi) {
      const p = fromApi.paymentId
        ? payments.find(pp => String(pp.id || pp._id) === String(fromApi.paymentId))
        : null;
      return { status: fromApi.status, payment: p || null };
    }
    const p = paymentIndexByServiceId.get(id) || null;
    if (!p) return { status: 'not linked', payment: null };
    const raw = String(p.status || '').toLowerCase();
    const status =
      raw.includes('paid') ? 'paid'
      : raw.includes('declin') ? 'declined'
      : 'pending';
    return { status, payment: p };
  };

  /** ===================== Render ===================== */
  const currentPartnerName = selectedPartner
    ? (partnersList.find(p => p.id === selectedPartner)?.name)
    : 'All Partners';

  const renderWeekRange = (p) => {
    const wk = p.week || {};
    const start = wk.start || p.weekStart;
    const end = wk.end || p.weekEnd;
    if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
    if (p.periodFrom || p.periodTo) return `${p.periodFrom ? formatDate(p.periodFrom) : '…'} – ${p.periodTo ? formatDate(p.periodTo) : '…'}`;
    return '—';
  };

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id); else nx.add(id);
      return nx;
    });
  };

  const canShare = (p) => p.status === 'PENDING' || p.status === 'ON_HOLD' || p.status === 'DECLINED';
  const sharePayment = (p) => { if (canShare(p)) setPaymentStatus(p.id, 'SHARED'); };

  return (
    <div className="payments-page">
      {/* Banner de feedback */}
      {flash && (
        <div
          className={`flash flash--${flash.type}`}
          style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8 }}
        >
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <span>{flash.text}</span>
            <button className="btn btn--outline btn--sm" onClick={() => setFlash(null)}><X size={14}/></button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="pay-header">
        <div className="pay-title">
          <h1>Weekly Payments</h1>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <div className="wk-chip"><Calendar size={14}/><span>Wed → Tue</span></div>
          <div className="muted" style={{fontSize:12}}>Select services → assign week → generate payment.</div>
        </div>
      </div>

      {/* FILTERS + ACTIONS (SERVICES) */}
      <div className="filters-card">
        <div className="filters-row" style={{ flexWrap: 'wrap' }}>
          <div className="filter">
            <label><Users size={13}/> Partner</label>
            <select
              value={selectedPartner}
              onChange={(e) => { setSelectedPartner(e.target.value); setSelectedServiceIds([]); }}
            >
              <option value="">All</option>
              {partnersList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="filter">
            <label><Calendar size={13}/> Date from</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="filter">
            <label><Calendar size={13}/> Date to</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="filter" style={{ minWidth: 240 }}>
            <label><Filter size={13}/> Search client</label>
            <input type="text" placeholder="Type client name..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'flex-end', marginLeft: 'auto' }}>
            <button className="btn btn--outline btn--sm" onClick={refreshAll} title="Refresh data">
              <RefreshCw size={16}/> Refresh
            </button>
            <button
              className="btn btn--outline btn--sm"
              onClick={() => { setSelectedPartner(''); setDateFrom(''); setDateTo(''); setSearch(''); setSelectedServiceIds([]); }}
              title="Clear filters"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="actions-row" style={{ flexWrap: 'wrap' }}>
          <div className="total-pill">
            <DollarSign size={16}/> <span>Total selected: <strong>{formatCurrency(totalSelected)}</strong></span>
          </div>

          <div className="assign-wrap">
            <span>Assign to week:</span>
            <select value={assignWeekKey} onChange={(e) => setAssignWeekKey(e.target.value)}>
              {weekOptions.map(w => (
                <option key={w.key} value={w.key}>
                  {formatDate(w.start)} – {formatDate(w.end)} ({w.key})
                </option>
              ))}
            </select>
          </div>

          <button className="btn btn--outline btn--sm" onClick={toggleSelectAll}>
            <Copy size={16}/> {selectedServiceIds.length > 0 &&
              selectedServiceIds.length === filteredServices.filter(s => !paymentIndexByServiceId.has(String(s.id))).length
              ? 'Unselect all' : 'Select all'}
          </button>

          <button
            className="btn btn--primary"
            onClick={generatePayment}
            disabled={loading || !selectedPartner || selectedServiceIds.length === 0 || !assignWeekKey}
            title={!selectedPartner ? 'Selecione um partner' : (!assignWeekKey ? 'Selecione a semana' : 'Generate Payment')}
          >
            {loading ? <Loader size={16} className="animate-spin" /> : <Share2 size={16}/>}
            Generate Payment
          </button>
        </div>
      </div>

      {/* SERVICES SELECTION TABLE */}
      <div className="selection-card">
        <div className="selection-header" style={{ justifyContent:'space-between', gap:10 }}>
          <h3>Services (filtered)</h3>

          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span className="wk-chip"><Users size={14}/><b>{currentPartnerName}</b></span>

            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <label className="muted">Show</label>
              <select
                value={servPageSize}
                onChange={(e) => setServPageSize(Number(e.target.value))}
                style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px' }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="muted">per page</span>
            </div>
          </div>
        </div>

        {/* select/date/client/service/park/guests/observation/amount/paystatus/week */}
        <div className="table table--selection">
          <div className="thead">
            <div className="th center">#</div>
            <div className="th">Date</div>
            <div className="th">Client</div>
            <div className="th">Service</div>
            <div className="th">Park</div>
            <div className="th">Guests</div>
            <div className="th">Observation</div>
            <div className="th right">Amount</div>
            <div className="th center">Pay Status</div>
            <div className="th center">Assigned Week</div>
          </div>

          <div className="tbody">
            {filteredServices.length === 0 ? (
              <div className="empty-row">No services for this filter.</div>
            ) : paginatedServices.map(s => {
              const checked = selectedServiceIds.map(String).includes(String(s.id));
              const serviceName =
                s?.serviceType?.name ||
                serviceTypes.find(t => t.id === (s?.serviceTypeId ?? s?.serviceType))?.name ||
                '—';
              const observation = s.observation || s.observations || s.note || s.notes || s.comment || s.comments || '';

              const info = resolveServicePayInfo(s.id);
              const val = info.status; // 'not linked' | 'pending' | 'paid' | 'declined'
              const paidWeekKey = info.payment?.week?.key || info.payment?.weekKey || '';

              return (
                <div key={String(s.id)} className="tr">
                  <div className="td center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectOne(String(s.id))}
                      disabled={val !== 'not linked'}
                      title={val !== 'not linked' ? 'This service is already in a payment' : 'Select service'}
                    />
                  </div>
                  <div className="td">{formatDate(s.serviceDate)}</div>
                  <div className="td">{`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}</div>
                  <div className="td">{serviceName}</div>
                  <div className="td">{s.park || '—'}</div>
                  <div className="td">{s.guests ?? '—'}</div>
                  <div className="td" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={observation || '—'}>
                    {observation || '—'}
                  </div>
                  <div className="td right">{formatCurrency(s.finalValue)}</div>

                  <div className="td center">
                    <ServicePayStatus value={val} />
                  </div>
                  <div className="td center">
                    {info.payment ? <span className="wk-chip"><Calendar size={12}/>{paidWeekKey || '—'}</span> : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {filteredServices.length > 0 && (
          <div className="pagination" style={{ marginTop: 12 }}>
            <div className="pagination-info">
              Showing {filteredServices.length === 0 ? 0 : (startServIndex + 1)}–
              {Math.min(startServIndex + servPageSize, filteredServices.length)} of {filteredServices.length} services
            </div>
            <div className="pagination-controls">
              <button className="pg-btn" onClick={() => setServPage(1)} disabled={servPage === 1}>«</button>
              <button className="pg-btn" onClick={() => setServPage(p => Math.max(1, p - 1))} disabled={servPage === 1}>‹</button>
              <div className="pg-pages">
                {Array.from({ length: totalServicesPages }, (_, i) => i + 1)
                  .slice(Math.max(0, servPage - 3), Math.max(0, servPage - 3) + 5)
                  .map(n => (
                    <button key={n} className={`pg-num ${servPage === n ? 'active' : ''}`} onClick={() => setServPage(n)}>{n}</button>
                  ))
                }
              </div>
              <button className="pg-btn" onClick={() => setServPage(p => Math.min(totalServicesPages, p + 1))} disabled={servPage === totalServicesPages}>›</button>
              <button className="pg-btn" onClick={() => setServPage(totalServicesPages)} disabled={servPage === totalServicesPages}>»</button>
            </div>
          </div>
        )}
      </div>

      {/* GENERATED PAYMENTS */}
      <div className="payments-list">
        <div className="list-header" style={{ gap: 12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <h3>Generated Payments</h3>
            <span className="muted"><Info size={14}/> From API</span>
          </div>

        {/* Filtros (PARTNER / MÊS / SEMANA) */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <div className="filter" style={{ minWidth: 220 }}>
              <label><Users size={13}/> Partner</label>
              <select
                value={payFilterPartner}
                onChange={e => { setPayFilterPartner(e.target.value); setPayPage(1); }}
              >
                <option value="">All</option>
                {partnersList.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="filter" style={{ minWidth: 160 }}>
              <label><Calendar size={13}/> Month</label>
              <input
                type="month"
                value={payFilterMonth}
                onChange={e => { setPayFilterMonth(e.target.value); setPayPage(1); }}
              />
            </div>

            <div className="filter" style={{ minWidth: 220 }}>
              <label><Calendar size={13}/> Week</label>
              <select
                value={payFilterWeek}
                onChange={e => { setPayFilterWeek(e.target.value); setPayPage(1); }}
                disabled={!payFilterMonth}
              >
                <option value="">{payFilterMonth ? 'All weeks' : 'Select a month first'}</option>
                {(() => {
                  const isSameYYYYMM = (iso, ym) => {
                    if (!iso || !ym) return false;
                    const d = new Date(iso);
                    const [y, m] = ym.split('-').map(Number);
                    return d.getFullYear() === y && (d.getMonth() + 1) === m;
                  };
                  const set = new Map();
                  payments.forEach(p => {
                    if (payFilterPartner && p.partnerId !== payFilterPartner) return;
                    const start = p.week?.start || p.weekStart;
                    const end = p.week?.end || p.weekEnd;
                    const key = p.week?.key || p.weekKey;
                    if (payFilterMonth && start && isSameYYYYMM(start, payFilterMonth)) {
                      if (!set.has(key)) set.set(key, { key, start, end });
                    }
                  });
                  return Array.from(set.values())
                    .sort((a, b) => new Date(a.start) - new Date(b.start))
                    .map(w => (
                      <option key={w.key} value={w.key}>
                        {formatDate(w.start)} – {formatDate(w.end)} ({w.key})
                      </option>
                    ));
                })()}
              </select>
            </div>

            {/* Paginação: qtd por página */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <label className="muted">Show</label>
              <select
                value={payPageSize}
                onChange={(e) => { setPayPageSize(Number(e.target.value)); setPayPage(1); }}
                style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px' }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
              <span className="muted">per page</span>
            </div>
          </div>
        </div>

        {/* Tabela de pagamentos */}
        <div className="table table--payments">
          <div className="thead">
            <div className="th center"> </div>
            <div className="th">Week / Period</div>
            <div className="th">Partner</div>
            <div className="th center"># Services</div>
            <div className="th right">Total</div>
            <div className="th center">Status</div>
            <div className="th">Actions</div>
          </div>
          <div className="tbody">
            {paginatedPayments.length === 0 ? (
              <div className="empty-row">No payments for these filters.</div>
            ) : paginatedPayments.map(p => {
              const isOpen = expanded.has(p.id);
              const lines = (p.serviceIds || []).map(id => serviceById.get(String(id))).filter(Boolean);
              const subtotal = calcSubtotalWithDrafts(lines);
              const serverTotal = Number(p.total || 0);
              const displayTotal = (lineEditOn === p.id)
                ? subtotal
                : (serverTotal > 0 ? serverTotal : subtotal);

              const wkKey = p.week?.key || p.weekKey;
              const partnerDisplayName =
                p.partnerName ||
                partnersList.find(pt => String(pt.id) === String(p.partnerId))?.name ||
                '—';

              return (
                <div key={p.id} className="tr">
                  <div className="td center">
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={() => toggleExpand(p.id)}
                      title={isOpen ? 'Hide breakdown' : 'Show breakdown'}
                    >
                      {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </button>
                  </div>

                  <div className="td">
                    <div className="wk-chip">
                      <Calendar size={14}/>
                      <span>{renderWeekRange(p)}</span>
                    </div>
                    {wkKey && <div style={{fontSize:12, color:'#6b7280', marginTop:2}}>{wkKey}</div>}
                  </div>

                  <div className="td">
                    <div style={{display:'inline-flex', alignItems:'center', gap:6}}>
                      <Users size={14}/><span>{partnerDisplayName}</span>
                    </div>
                  </div>

                  <div className="td center">{(p.serviceIds || []).length}</div>

                  <div className="td right">
                    <strong>{formatCurrency(displayTotal)}</strong>
                    {serverTotal === 0 && subtotal > 0 && lineEditOn !== p.id && (
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>estimado</span>
                    )}
                  </div>

                  <div className="td center"><StatusBadge status={p.status}/></div>

                  <div className="td">
                    <div className="action-bar">
                      {canModifyPayment(p) && (
                        lineEditOn === p.id ? (
                          <>
                            <button className="btn btn--primary btn--sm" onClick={() => saveLineEdits(p)} title="Save line amounts">
                              <Save size={16}/> Save lines
                            </button>
                            <button className="btn btn--outline btn--sm" onClick={cancelLineEdit} title="Cancel line editing">
                              <X size={16}/> Cancel
                            </button>
                          </>
                        ) : (
                          <button className="btn btn--outline btn--sm" onClick={() => beginLineEdit(p.id)} title="Edit line amounts">
                            <Edit3 size={16}/> Edit lines
                          </button>
                        )
                      )}

                      {canShare(p) && (
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => sharePayment(p)}
                          title={p.status === 'DECLINED' ? 'Share again' : 'Share with partner'}
                        >
                          <Share2 size={16}/> {p.status === 'DECLINED' ? 'Share again' : 'Share'}
                        </button>
                      )}

                      <button
                        className="btn btn--danger btn--sm"
                        title="Delete payment"
                        onClick={() => removePayment(p.id)}
                      >
                        <Trash2 size={16}/> Delete
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="payment-breakdown">
                      <div className="receipt-title">Receipt • {partnerDisplayName}</div>

                      {lines.length === 0 ? (
                        <div className="empty-row" style={{ margin: 0 }}>
                          No service details available.
                        </div>
                      ) : (
                        <div className="table table--breakdown">
                          <div className="thead">
                            <div className="th">Client</div>
                            <div className="th">Date</div>
                            <div className="th">Service Type</div>
                            <div className="th">Park</div>
                            <div className="th">Location</div>
                            <div className="th center">Team</div>
                            <div className="th center">Guests</div>
                            <div className="th center">Hopper</div>
                            <div className="th right">Amount</div>
                          </div>
                          <div className="tbody">
                            {lines.map(s => (
                              <div key={String(s.id)} className="tr">
                                <div className="td">{`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}</div>
                                <div className="td">{formatDate(s.serviceDate)}</div>
                                <div className="td">{s?.serviceType?.name || '—'}</div>
                                <div className="td">{s.park || '—'}</div>
                                <div className="td">{s.location || '—'}</div>
                                <div className="td center">{s.team || '—'}</div>
                                <div className="td center">{s.guests ?? '—'}</div>
                                <div className="td center">{s.hopper ? 'Yes' : 'No'}</div>

                                <div className="td right">
                                  {lineEditOn === p.id ? (
                                    <input
                                      className="amount-input"
                                      type="number"
                                      step="0.01"
                                      value={lineDrafts[String(s.id)] ?? Number(s.finalValue || 0)}
                                      onChange={(e) => changeLineAmount(String(s.id), e.target.value)}
                                      aria-label="Amount"
                                    />
                                  ) : (
                                    formatCurrency(s.finalValue)
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="tr">
                              <div className="td" /><div className="td" /><div className="td" />
                              <div className="td" /><div className="td" /><div className="td" />
                              <div className="td" /><div className="td right" style={{ fontWeight: 300 }}>Subtotal</div>
                              <div className="td right" style={{ fontWeight: 300 }}>{formatCurrency(subtotal)}</div>
                            </div>
                            <div className="tr">
                              <div className="td" /><div className="td" /><div className="td" />
                              <div className="td" /><div className="td" /><div className="td" />
                              <div className="td" /><div className="td right" style={{ fontWeight: 800, color: '#111827' }}>Total</div>
                              <div className="td right" style={{ fontWeight: 800, color: '#111827' }}>
                                {formatCurrency(displayTotal)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ADICIONAR serviços ao pagamento */}
                      {canModifyPayment(p) && (
                        <>
                          {addPicker.paymentId !== p.id ? (
                            <div style={{ marginTop: 10 }}>
                              <button className="btn btn--outline btn--sm" onClick={() => openAddService(p)}>
                                <Plus size={16}/> Add service
                              </button>
                            </div>
                          ) : (
                            <div className="addsvc-panel" style={{ marginTop: 10 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                                <strong>Select services to add</strong>
                                <button className="btn btn--outline btn--sm" onClick={cancelAddServices}><X size={16}/> Close</button>
                              </div>

                              {addPicker.loading ? (
                                <div className="empty-row">Loading eligible services...</div>
                              ) : (addPicker.items.length === 0 ? (
                                <div className="empty-row">No eligible services found for this period.</div>
                              ) : (
                                <div className="addsvc-list">
                                  {addPicker.items.map(it => (
                                    <label key={it.id} className="addsvc-row">
                                      <input
                                        type="checkbox"
                                        checked={addPicker.selected.has(String(it.id))}
                                        onChange={() => togglePick(String(it.id))}
                                      />
                                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {formatDate(it.serviceDate)} — {`${it.firstName || ''} ${it.lastName || ''}`.trim()} — {it.serviceTypeId || it.serviceType?.name || 'Service'} — {formatCurrency(it.finalValue)}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              ))}

                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button className="btn btn--outline btn--sm" onClick={cancelAddServices}>Cancel</button>
                                <button className="btn btn--primary btn--sm" onClick={() => confirmAddServices(p)} disabled={(addPicker.selected?.size || 0) === 0}>
                                  <Plus size={16}/> Add {(addPicker.selected?.size || 0)} service(s)
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* NOTAS */}
                      <div className="notes" style={{ marginTop: 14 }}>
                        <label>Notes</label>
                        <textarea
                          value={noteDrafts[p.id] ?? ''}
                          onChange={(e) => setNoteDrafts(d => ({ ...d, [p.id]: e.target.value }))}
                          rows={2}
                          placeholder="Add an internal note about this payment..."
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                          <button className="btn btn--outline btn--sm" onClick={() => setNoteDrafts(d => ({ ...d, [p.id]: '' }))} disabled={!noteDrafts[p.id]} title="Clear">Clear</button>
                          <button className="btn btn--primary btn--sm" onClick={() => addNoteToPayment(p.id)} disabled={savingNoteFor === p.id || !(noteDrafts[p.id] || '').trim()} title="Save note">
                            {savingNoteFor === p.id ? <Loader size={16} className="animate-spin" /> : <Save size={16} />} Save
                          </button>
                        </div>

                        {(p.notesLog && p.notesLog.length > 0) && (
                          <div className="notes-list">
                            {[...p.notesLog].reverse().map(n => (
                              <div key={n.id || n._id} className="note-item">
                                <div className="note-meta">{new Date(n.at).toLocaleString()}</div>
                                <div className="note-text">{n.text}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {payments.length > 0 && (
          <div className="pagination" style={{ marginTop: 12 }}>
            <div className="pagination-info">
              Showing {(payPage - 1) * payPageSize + 1}–{Math.min(payPage * payPageSize, payments.length)} of {payments.length} payments
            </div>
            <div className="pagination-controls">
              <button className="pg-btn" onClick={() => setPayPage(1)} disabled={payPage === 1}>«</button>
              <button className="pg-btn" onClick={() => setPayPage(p => Math.max(1, p - 1))} disabled={payPage === 1}>‹</button>
              <div className="pg-pages">
                {Array.from({ length: totalPaymentsPages }, (_, i) => i + 1)
                  .slice(Math.max(0, payPage - 3), Math.max(0, payPage - 3) + 5)
                  .map(n => (
                    <button key={n} className={`pg-num ${payPage === n ? 'active' : ''}`} onClick={() => setPayPage(n)}>{n}</button>
                  ))
                }
              </div>
              <button className="pg-btn" onClick={() => setPayPage(p => Math.min(totalPaymentsPages, p + 1))} disabled={payPage === totalPaymentsPages}>›</button>
              <button className="pg-btn" onClick={() => setPayPage(totalPaymentsPages)} disabled={payPage === totalPaymentsPages}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Payments;
