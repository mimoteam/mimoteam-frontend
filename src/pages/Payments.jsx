// src/pages/Payments.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, DollarSign, Users, Trash2, Edit3, Save, Loader, Filter, Info,
  Copy, ChevronDown, ChevronRight, Share2, PlusCircle
} from 'lucide-react';
import {
  Eye, Calendar as CalIco, Building, Plane, Baby, Coffee, Car, Home,
  DollarSign as DollarIco
} from 'lucide-react';
import { api } from '../api/http';
import '../styles/Payments.css';

// ===== Tipos (mantidos só para reidratar caso o backend mande id simples) =====
const serviceTypes = [
  { id: 'IN_PERSON_TOUR', name: 'In-Person Tour', icon: Building, category: 'variable', basePrice: 150 },
  { id: 'VIRTUAL_TOUR',   name: 'Virtual Tour',   icon: Eye,      category: 'variable', basePrice: 80  },
  { id: 'COORDINATOR',    name: 'Coordinator',    icon: CalIco,   category: 'variable', basePrice: 200 },
  { id: 'CONCIERGE', name: 'Concierge Service',              icon: Coffee,   category: 'fixed',  basePrice: 120 },
  { id: 'TICKET_DELIVERY', name: 'Ticket Delivery',          icon: Car,      category: 'fixed',  basePrice: 25  },
  { id: 'DELIVERY', name: 'Delivery Service',                icon: Car,      category: 'fixed',  basePrice: 25  },
  { id: 'AIRPORT_ASSISTANCE', name: 'Airport Assistance',    icon: Plane,    category: 'fixed',  basePrice: 85  },
  { id: 'VACATION_HOME_ASSISTANCE', name: 'Vacation Home Assistance', icon: Home, category: 'fixed', basePrice: 75 },
  { id: 'HOTEL_ASSISTANCE', name: 'Hotel Assistance',        icon: Building, category: 'fixed',  basePrice: 65  },
  { id: 'ADJUSMENT', name: 'Adjusment',                      icon: DollarIco,category: 'fixed',  basePrice: 10  },
  { id: 'REIMBURSEMENT', name: 'Reimbursement',              icon: DollarIco,category: 'fixed',  basePrice: 10  },
  { id: 'EXTRA HOUR', name: 'Extra Hour',                    icon: DollarIco,category: 'fixed',  basePrice: 10  },
  { id: 'BABYSITTER', name: 'Babysitter',                    icon: Baby,     category: 'hourly', basePrice: 35  },
];

// ===== Helpers de semana (Qua→Ter) =====
function getPaymentWeek(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay();
  const toWed = (dow >= 3) ? (dow - 3) : (dow + 4);
  const start = new Date(d); start.setDate(d.getDate() - toWed); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end, key: weekKey(start) };
}
function weekKey(startDate) {
  const y = startDate.getFullYear();
  const jan1 = new Date(y,0,1);
  const diffDays = Math.floor((startDate - jan1)/86400000);
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

// ===== Month anchor (mês com maioria dos dias no range) =====
function anchorYYYYMMForRange(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso);
  const e = new Date(endIso);
  const count = new Map();
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    count.set(key, (count.get(key) || 0) + 1);
  }
  let best = null, bestN = -1;
  for (const [k, n] of count) if (n > bestN) { best = k; bestN = n; }
  return best;
}

// ===== Status =====
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

// ===== Hook: parceiros ativos (API) =====
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
        }));
      if (alive) setList(active.sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        try {
          const raw = localStorage.getItem('users_store_v1');
          const arr = raw ? JSON.parse(raw) : [];
          const active = (Array.isArray(arr) ? arr : [])
            .filter(u =>
              (u.role === 'partner' || u.role === 'Partner') &&
              (u.status === 'active' || u.status === 'Active')
            )
            .map(u => ({
              id: u.id,
              name: u.fullName || u.login || '(sem nome)',
              email: u.email || '',
              role: u.role
            }));
  if (alive) setList(active.sort((a, b) => a.name.localeCompare(b.name)));
        } catch { if (alive) setList([]); }
      }
    })();
    return () => { alive = false; };
  }, []);
  return list;
};

const Payments = () => {
  const [loading, setLoading] = useState(false);

  // parceiros ativos
  const partnersList = useActivePartners();

  // ===== Filtros (Services)
  const [selectedPartner, setSelectedPartner] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Semana
  const [assignWeekKey, setAssignWeekKey] = useState('');
  const [weekOptions, setWeekOptions] = useState(build5Weeks(new Date()));

  // Fonte: services do backend
  const [services, setServices] = useState([]);

  // Pagamentos (backend)
  const [payments, setPayments] = useState([]);

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [editingPaymentId, setEditingPaymentId] = useState(null);

  // Paginação (payments & services) — no cliente
  const [payPage, setPayPage] = useState(1);
  const [payPageSize, setPayPageSize] = useState(10);
  const [servPage, setServPage] = useState(1);
  const [servPageSize, setServPageSize] = useState(10);

  const [expanded, setExpanded] = useState(() => new Set());
  const [noteDrafts, setNoteDrafts] = useState({});
  const [savingNoteFor, setSavingNoteFor] = useState(null);

  // Filtros (payments)
  const [payFilterPartner, setPayFilterPartner] = useState('');
  const [payFilterMonth, setPayFilterMonth] = useState('');
  const [payFilterWeek, setPayFilterWeek] = useState('');

  // ===== estado para edição de itens em DECLINED =====
  const [eligibleMap, setEligibleMap] = useState({});     // paymentId -> [{id, ...}]
  const [eligibleLoading, setEligibleLoading] = useState({}); // paymentId -> boolean
  const [eligibleSel, setEligibleSel] = useState({});     // paymentId -> Set<string>

  const setEligLoading = (pid, v) => setEligibleLoading(m => ({ ...m, [pid]: v }));
  const setEligItems   = (pid, items) => setEligibleMap(m => ({ ...m, [pid]: Array.isArray(items) ? items : [] }));
  const toggleEligSel  = (pid, sid) => setEligibleSel(m => {
    const cur = new Set(m[pid] || []);
    if (cur.has(sid)) cur.delete(sid); else cur.add(sid);
    return { ...m, [pid]: cur };
  });
  const clearEligSel   = (pid) => setEligibleSel(m => ({ ...m, [pid]: new Set() }));

  // ======= helpers de fetch =======
  const refetchPayments = async () => {
    try {
      const pay = await api.get('/payments', { params: { pageSize: 500 } });
      const pItems = Array.isArray(pay?.items) ? pay.items : (Array.isArray(pay) ? pay : []);
      setPayments(pItems.map(p => ({ ...p, id: p._id || p.id })));
    } catch {
      // opcional: toast
    }
  };

  // ======= Carregar dados iniciais do backend =======
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const serv = await api.get('/services', { params: { limit: 500 } });
        const sItems = Array.isArray(serv?.items) ? serv.items : (Array.isArray(serv) ? serv : []);
        const rehydrated = sItems.map(item => {
          const st =
            (item.serviceType && item.serviceType.id)
              ? item.serviceType
              : serviceTypes.find(t => t.id === (item.serviceTypeId ?? item.serviceType)) || (item.serviceType ? { id: item.serviceType, name: item.serviceType } : null);

          const partner =
            (item.partner && item.partner.id)
              ? item.partner
              : (item.partnerId ? { id: item.partnerId } : item.partner || null);

          return { ...item, id: item._id || item.id, serviceType: st, partner };
        });
        if (alive) setServices(rehydrated);
      } catch {
        if (alive) setServices([]);
      }

      try {
        await refetchPayments();
      } catch {
        if (alive) setPayments([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ===== Recarregar services quando filtros mudarem =====
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = { limit: 500 };
        if (selectedPartner) params.partnerId = selectedPartner;
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (search?.trim()) params.search = search.trim();

        const serv = await api.get('/services', { params });
        const sItems = Array.isArray(serv?.items) ? serv.items : (Array.isArray(serv) ? serv : []);
        const rehydrated = sItems.map(item => {
          const st =
            (item.serviceType && item.serviceType.id)
              ? item.serviceType
              : serviceTypes.find(t => t.id === (item.serviceTypeId ?? item.serviceType)) || (item.serviceType ? { id: item.serviceType, name: item.serviceType } : null);

          const partner =
            (item.partner && item.partner.id)
              ? item.partner
              : (item.partnerId ? { id: item.partnerId } : item.partner || null);

          return { ...item, id: item._id || item.id, serviceType: st, partner };
        });
        if (alive) setServices(rehydrated);
        setServPage(1);
      } catch {
        if (alive) setServices([]);
      }
    })();
    return () => { alive = false; };
  }, [selectedPartner, dateFrom, dateTo, search]);

  // ====== Mapa id->serviço ======
  const serviceById = useMemo(() => {
    const map = new Map();
    (services || []).forEach(s => map.set(s.id, s));
    return map;
  }, [services]);

  // ====== Lista filtrada de services (no cliente para seleção) ======
  const filteredServices = useMemo(() => {
    let arr = Array.isArray(services) ? [...services] : [];
    if (selectedPartner) arr = arr.filter(s => (s.partner?.id || s.partnerId) === selectedPartner);
    if (dateFrom || dateTo) arr = arr.filter(s => within(s.serviceDate, dateFrom, dateTo));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(s => (`${s.firstName} ${s.lastName}`).toLowerCase().includes(q));
    }
    arr.sort((a,b) => new Date(a.serviceDate) - new Date(b.serviceDate));
    return arr;
  }, [services, selectedPartner, dateFrom, dateTo, search]);

  // ===== Semanas sugeridas com base na seleção =====
  useEffect(() => {
    let ref = new Date();
    const chosen = filteredServices.filter(s => selectedServiceIds.includes(s.id));
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

  // ===== Reset paginação de services ao mudar filtros =====
  useEffect(() => { setServPage(1); }, [selectedPartner, dateFrom, dateTo, search, servPageSize]);

  // ===== Pagamentos por serviceId =====
  const paymentIndexByServiceId = useMemo(() => {
    const map = new Map();
    payments.forEach(p => (p.serviceIds || []).forEach(id => map.set(id, p)));
    return map;
  }, [payments]);

  // ===== Totais selecionados =====
  const totalSelected = useMemo(() => {
    const setSel = new Set(selectedServiceIds);
    return filteredServices
      .filter(s => setSel.has(s.id))
      .reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0);
  }, [filteredServices, selectedServiceIds]);

  // ===== Seleção =====
  const toggleSelectAll = () => {
    if (selectedServiceIds.length === filteredServices.length && filteredServices.length > 0) {
      setSelectedServiceIds([]);
    } else {
      setSelectedServiceIds(filteredServices.map(s => s.id));
    }
  };
  const toggleSelectOne = (id) => {
    setSelectedServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ===== CRUD (Payments) =====
  const generatePayment = async () => {
    if (!selectedPartner) { alert('Selecione um partner.'); return; }
    if (selectedServiceIds.length === 0) { alert('Selecione pelo menos um serviço.'); return; }

    try {
      setLoading(true);

      const partner = partnersList.find(p => p.id === selectedPartner);
      const selected = filteredServices.filter(s => selectedServiceIds.includes(s.id));
      const total = selected.reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0);

      const pickedWeek = weekOptions.find(w => w.key === assignWeekKey);
      const weekStartISO = pickedWeek ? new Date(pickedWeek.start).toISOString() : null;
      const weekEndISO   = pickedWeek ? new Date(pickedWeek.end).toISOString()   : null;

      const payload = {
        partnerId: partner.id,
        partnerName: partner.name,
        periodFrom: dateFrom || null,
        periodTo: dateTo || null,
        weekKey: assignWeekKey || null,
        weekStart: weekStartISO,
        weekEnd: weekEndISO,
        serviceIds: selected.map(s => String(s.id)),
        extraIds: [],
        total: Math.round(total * 100) / 100,
        status: 'PENDING',
        notes: '',
      };

      await api.post('/payments', payload);
      await refetchPayments();
      setSelectedServiceIds([]);
      setPayPage(1);
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const setPaymentStatus = async (id, status) => {
    try {
      await api.patch(`/payments/${id}`, { status });
      await refetchPayments();
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to update status');
    }
  };

  const removePayment = async (id) => {
    if (!window.confirm('Excluir este pagamento?')) return;
    try {
      await api.delete(`/payments/${id}`);
      await refetchPayments();
      setExpanded(prev => { const nx = new Set(prev); nx.delete(id); return nx; });
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to delete payment');
    }
  };

  const startEditPayment = id => setEditingPaymentId(id);
  const cancelEditPayment = () => setEditingPaymentId(null);

  const saveEditPayment = async (id, patch) => {
    try {
      await api.patch(`/payments/${id}`, patch);
      await refetchPayments();
      setEditingPaymentId(null);
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to save payment');
    }
  };

  // ===== Notes =====
  const addNoteToPayment = async (paymentId) => {
    const text = (noteDrafts[paymentId] || '').trim();
    if (!text) return;

    try {
      setSavingNoteFor(paymentId);
      await api.patch(`/payments/${paymentId}`, {
        notes: text,
        appendNote: true,
      });
      await refetchPayments();
      setNoteDrafts(d => ({ ...d, [paymentId]: '' }));
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to save note');
    } finally {
      setSavingNoteFor(null);
    }
  };

  // ====== Edição de itens quando DECLINED ======
  const canEditItems = (p) => p.status === 'DECLINED';
  const canShare = (p) => p.status === 'PENDING' || p.status === 'ON_HOLD' || p.status === 'DECLINED';

  const loadEligibleFor = async (p) => {
    const pid = p.id || p._id;
    if (!pid || !p.partnerId) return;
    try {
      setEligLoading(pid, true);
      const params = {
        partner: p.partnerId,
        serviceType: 'ALL',
        anyDate: 1, // pega todos os serviços não usados, de qualquer data
      };
      const resp = await api.get('/payments/eligible', { params });
      const items = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp) ? resp : []);
      setEligItems(pid, items.map(s => ({ ...s, id: s.id || s._id })));
      clearEligSel(pid);
    } catch {
      setEligItems(pid, []);
    } finally {
      setEligLoading(pid, false);
    }
  };

  const addSelectedToPayment = async (p) => {
    const pid = p.id || p._id;
    const sel = Array.from(eligibleSel[pid] || []);
    if (!sel.length) return;

    try {
      setEligLoading(pid, true);
      for (const sid of sel) {
        await api.post(`/payments/${pid}/items`, { serviceId: sid });
      }
      await refetchPayments();
      await loadEligibleFor({ ...p, id: pid }); // recarrega elegíveis
      clearEligSel(pid);
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to add services');
    } finally {
      setEligLoading(pid, false);
    }
  };

  const removeServiceFromPayment = async (p, serviceId) => {
    const pid = p.id || p._id;
    try {
      await api.delete(`/payments/${pid}/items/${serviceId}`);
      await refetchPayments();
      setEligItems(pid, [ ...(eligibleMap[pid] || []), serviceById.get(serviceId) ].filter(Boolean));
    } catch (e) {
      alert(e?.data?.message || e.message || 'Failed to remove service');
    }
  };

  // ===== Utils =====
  const formatCurrency = (n) => `$${Number(n || 0).toFixed(2)}`;
  const currentPartnerName = selectedPartner
    ? (partnersList.find(p => p.id === selectedPartner)?.name)
    : 'All Partners';

  const renderWeekRange = (p) => {
    if (p.weekStart && p.weekEnd) {
      return `${new Date(p.weekStart).toLocaleDateString()} – ${new Date(p.weekEnd).toLocaleDateString()}`;
    }
    if (p.periodFrom || p.periodTo) {
      const from = p.periodFrom ? new Date(p.periodFrom).toLocaleDateString() : '…';
      const to = p.periodTo ? new Date(p.periodTo).toLocaleDateString() : '…';
      return `${from} – ${to}`;
    }
    return '—';
  };

  // ====== Weeks dropdown baseado no mês-âncora ======
  const weeksForSelectedMonth = useMemo(() => {
    if (!payFilterMonth) return [];
    const [y, m] = payFilterMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const map = new Map();
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      const w = getPaymentWeek(d);
      const anchor = anchorYYYYMMForRange(w.start.toISOString(), w.end.toISOString());
      if (anchor === payFilterMonth && !map.has(w.key)) {
        map.set(w.key, { key: w.key, start: w.start.toISOString(), end: w.end.toISOString() });
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [payFilterMonth]);

  useEffect(() => { setPayFilterWeek(''); }, [payFilterMonth]);

  // ====== FILTROS: Generated Payments ======
  const filteredPayments = useMemo(() => {
    let arr = payments.slice();
    if (payFilterPartner) arr = arr.filter(p => p.partnerId === payFilterPartner);
    if (payFilterMonth) {
      arr = arr.filter(p => {
        const anchor = (p.weekStart && p.weekEnd)
          ? anchorYYYYMMForRange(p.weekStart, p.weekEnd)
          : (p.periodFrom && p.periodTo ? anchorYYYYMMForRange(p.periodFrom, p.periodTo) : null);
        return anchor === payFilterMonth;
      });
    }
    if (payFilterWeek) arr = arr.filter(p => p.weekKey === payFilterWeek);
    return arr;
  }, [payments, payFilterPartner, payFilterMonth, payFilterWeek]);

  // Paginação (payments)
  const totalPaymentsPages = Math.max(1, Math.ceil((filteredPayments.length || 0) / payPageSize));
  const paginatedPayments = useMemo(() => {
    const start = (payPage - 1) * payPageSize;
    return filteredPayments.slice(start, start + payPageSize);
  }, [filteredPayments, payPage, payPageSize]);

  // Paginação (services)
  const totalServicesPages = Math.max(1, Math.ceil((filteredServices.length || 0) / servPageSize));
  const startServIndex = (servPage - 1) * servPageSize;
  const paginatedServices = useMemo(() => {
    return filteredServices.slice(startServIndex, startServIndex + servPageSize);
  }, [filteredServices, startServIndex, servPageSize]);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id); else nx.add(id);
      return nx;
    });
  };

  const sharePayment = (p) => { if (canShare(p)) setPaymentStatus(p.id, 'SHARED'); };

  // ===== Render =====
  return (
    <div className="payments-page">
      {/* HEADER */}
      <div className="pay-header">
        <div className="pay-title">
          <h1>Weekly Payments</h1>
          <p>Filter services by partner & period. Select services → assign to week → generate payments.</p>
        </div>
        <div className="wk-chip"><Calendar size={14}/><span>Wed → Tue</span></div>
      </div>

      {/* FILTERS + ACTIONS (SERVICES) */}
      <div className="filters-card">
        <div className="filters-row">
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
          <div className="filter">
            <label><Filter size={13}/> Search client</label>
            <input type="text" placeholder="Type client name..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="actions-row">
          <div className="total-pill">
            <DollarSign size={16}/> <span>Total selected: <strong>{formatCurrency(totalSelected)}</strong></span>
          </div>

          <div className="assign-wrap">
            <span>Assign to week:</span>
            <select value={assignWeekKey} onChange={(e) => setAssignWeekKey(e.target.value)}>
              {weekOptions.map(w => (
                <option key={w.key} value={w.key}>
                  {new Date(w.start).toLocaleDateString()} – {new Date(w.end).toLocaleDateString()} ({w.key})
                </option>
              ))}
            </select>
          </div>

          <button className="btn btn--outline btn--sm" onClick={toggleSelectAll}>
            <Copy size={16}/> {selectedServiceIds.length === filteredServices.length && filteredServices.length > 0 ? 'Unselect all' : 'Select all'}
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

        <div className="table table--selection">
          <div className="thead">
            <div className="th center">#</div>
            <div className="th">Date</div>
            <div className="th">Client</div>
            <div className="th">Service</div>
            <div className="th">Park</div>
            <div className="th">Guests</div>
            <div className="th">Hopper</div>
            <div className="th right">Amount</div>
            <div className="th center">Pay Status</div>
            <div className="th center">Assigned Week</div>
          </div>
          <div className="tbody">
            {filteredServices.length === 0 ? (
              <div className="empty-row">No services for this filter.</div>
            ) : paginatedServices.map(s => {
              const paid = paymentIndexByServiceId.get(s.id);
              const checked = selectedServiceIds.includes(s.id);
              const serviceName =
                s?.serviceType?.name ||
                serviceTypes.find(t => t.id === (s?.serviceTypeId ?? s?.serviceType))?.name ||
                '—';

              return (
                <div key={s.id} className="tr">
                  <div className="td center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectOne(s.id)}
                      disabled={!!paid && paid.partnerId === selectedPartner}
                    />
                  </div>
                  <div className="td">{s.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}</div>
                  <div className="td">{s.firstName} {s.lastName}</div>
                  <div className="td">{serviceName}</div>
                  <div className="td">{s.park || ''}</div>
                  <div className="td">{s.guests || ''}</div>
                  <div className="td">{s.hopper ? 'Yes' : ''}</div>
                  <div className="td right">{formatCurrency(s.finalValue)}</div>
                  <div className="td center">
                    {paid ? <StatusBadge status={paid.status}/> : <span className="pay-status" style={{ background:'#9CA3AF' }}>—</span>}
                  </div>
                  <div className="td center">
                    {paid ? (
                      <span className="wk-chip">
                        <Calendar size={12}/>
                        {paid.weekKey || '—'}
                      </span>
                    ) : '—'}
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
                {weeksForSelectedMonth.map(w => (
                  <option key={w.key} value={w.key}>
                    {new Date(w.start).toLocaleDateString()} – {new Date(w.end).toLocaleDateString()} ({w.key})
                  </option>
                ))}
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
              const editing = editingPaymentId === p.id;
              const isOpen = expanded.has(p.id);

              const lines = (p.serviceIds || []).map(id => serviceById.get(id)).filter(Boolean);
              const subtotal = lines.reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0);

              return (
                <div key={p.id} className="tr">
                  <div className="td center">
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={async () => {
                        toggleExpand(p.id);
                        if (!expanded.has(p.id) && canEditItems(p)) {
                          await loadEligibleFor(p);
                        }
                      }}
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
                    {p.weekKey && <div style={{fontSize:12, color:'#6b7280', marginTop:2}}>{p.weekKey}</div>}
                  </div>

                  <div className="td">
                    <div style={{display:'inline-flex', alignItems:'center', gap:6}}>
                      <Users size={14}/><span>{p.partnerName}</span>
                    </div>
                  </div>

                  <div className="td center">{(p.serviceIds || []).length}</div>
                  <div className="td right"><strong>{formatCurrency(p.total)}</strong></div>
                  <div className="td center"><StatusBadge status={p.status}/></div>

                  <div className="td">
                    {!editing ? (
                      <>
                        <button
                          className="btn btn--outline btn--sm"
                          title="Edit notes"
                          onClick={() => startEditPayment(p.id)}
                        >
                          <Edit3 size={16}/> Edit
                        </button>

                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => sharePayment(p)}
                          disabled={!canShare(p)}
                          title={canShare(p) ? (p.status === 'DECLINED' ? 'Share again' : 'Share with partner') : 'Cannot share in current status'}
                        >
                          <Share2 size={16}/> {p.status === 'DECLINED' ? 'Share again' : 'Share'}
                        </button>

                        <button
                          className="btn btn--danger btn--sm"
                          title="Delete"
                          onClick={() => removePayment(p.id)}
                        >
                          <Trash2 size={16}/> Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--primary btn--sm" title="Save" onClick={() => saveEditPayment(p.id, p)}>
                          <Save size={16}/> Save
                        </button>
                        <button className="btn btn--outline btn--sm" title="Cancel" onClick={cancelEditPayment}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  {isOpen && (
                    <div className="payment-breakdown">
                      <div className="receipt-title">Receipt • {p.partnerName}</div>

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
                            {canEditItems(p) && <div className="th center"> </div>}
                          </div>
                          <div className="tbody">
                            {lines.map(s => (
                              <div key={s.id} className="tr">
                                <div className="td">{`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}</div>
                                <div className="td">
                                  {s.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}
                                </div>
                                <div className="td">{s?.serviceType?.name || '—'}</div>
                                <div className="td">{s.park || '—'}</div>
                                <div className="td">{s.location || '—'}</div>
                                <div className="td center">{s.team || '—'}</div>
                                <div className="td center">{s.guests ?? '—'}</div>
                                <div className="td center">{s.hopper ? 'Yes' : 'No'}</div>
                                <div className="td right">{formatCurrency(s.finalValue)}</div>
                                {canEditItems(p) && (
                                  <div className="td center">
                                    <button
                                      className="btn btn--danger btn--sm"
                                      title="Remove from payment"
                                      onClick={() => removeServiceFromPayment(p, s.id)}
                                    >
                                      <Trash2 size={14}/>
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                            <div className="tr">
                              <div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td right" style={{ fontWeight: 300 }}>Subtotal</div><div className="td right" style={{ fontWeight: 300 }}>{formatCurrency(subtotal)}</div>{canEditItems(p) && <div className="td" />}
                            </div>
                            <div className="tr">
                              <div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td" /><div className="td right" style={{ fontWeight: 800, color: '#111827' }}>Total</div><div className="td right" style={{ fontWeight: 800, color: '#111827' }}>{formatCurrency(p.total)}</div>{canEditItems(p) && <div className="td" />}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bloco: adicionar serviços quando DECLINED */}
                      {canEditItems(p) && (
                        <div className="eligible-box" style={{ marginTop: 14 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                            <h4 style={{ margin:0, fontSize:14, fontWeight:600 }}>Add services to this payment</h4>
                            <button
                              className="btn btn--outline btn--sm"
                              onClick={() => loadEligibleFor(p)}
                              disabled={eligibleLoading[p.id]}
                              title="Reload eligible services (not in any payment)"
                            >
                              {eligibleLoading[p.id] ? <Loader size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                              Reload list
                            </button>
                            <span className="muted" style={{ fontSize:12 }}>
                              Period: {renderWeekRange(p)} • Partner: {p.partnerName}
                            </span>
                          </div>

                          <div className="table table--selection" style={{ border:'1px dashed #e5e7eb' }}>
                            <div className="thead">
                              <div className="th center">#</div>
                              <div className="th">Date</div>
                              <div className="th">Client</div>
                              <div className="th">Service</div>
                              <div className="th right">Amount</div>
                            </div>
                            <div className="tbody">
                              {(eligibleMap[p.id] || []).length === 0 ? (
                                <div className="empty-row">No eligible services for this period.</div>
                              ) : (
                                (eligibleMap[p.id] || []).map(s => {
                                  const checked = (eligibleSel[p.id] || new Set()).has(s.id);
                                  const svcName =
                                    serviceTypes.find(t => t.id === (s.serviceTypeId ?? s.serviceType))?.name ||
                                    s?.serviceType?.name ||
                                    s.serviceTypeId || '—';
                                  return (
                                    <div key={s.id} className="tr">
                                      <div className="td center">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleEligSel(p.id, s.id)}
                                        />
                                      </div>
                                      <div className="td">{s.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}</div>
                                      <div className="td">{`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}</div>
                                      <div className="td">{svcName}</div>
                                      <div className="td right">{formatCurrency(s.finalValue)}</div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, gap:8 }}>
                            <button
                              className="btn btn--outline btn--sm"
                              onClick={() => clearEligSel(p.id)}
                              disabled={!(eligibleSel[p.id] && eligibleSel[p.id].size)}
                            >
                              Clear selection
                            </button>
                            <button
                              className="btn btn--primary btn--sm"
                              onClick={() => addSelectedToPayment(p)}
                              disabled={eligibleLoading[p.id] || !(eligibleSel[p.id] && eligibleSel[p.id].size)}
                              title="Add selected services to this payment"
                            >
                              {eligibleLoading[p.id] ? <Loader size={14} className="animate-spin" /> : <PlusCircle size={14}/>}
                              Add selected
                            </button>
                          </div>
                        </div>
                      )}

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

        {filteredPayments.length > 0 && (
          <div className="pagination" style={{ marginTop: 12 }}>
            <div className="pagination-info">
              Showing {(payPage - 1) * payPageSize + 1}–{Math.min(payPage * payPageSize, filteredPayments.length)} of {filteredPayments.length} payments
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

        {/* Painel de edição (fallback) */}
        {editingPaymentId && (() => {
          const pay = payments.find(pp => (pp.id || pp._id) === editingPaymentId);
          if (!pay) return null;
          return (
            <div className="edit-panel">
              <div className="edit-head"><Info size={16}/><span>Edit payment notes • {pay.partnerName} • {pay.weekKey || renderWeekRange(pay)}</span></div>
              <textarea
                value={pay.notes || ''}
                onChange={(e) =>
                  setPayments(prev =>
                    prev.map(p => (p.id === pay.id) ? { ...p, notes: e.target.value } : p)
                  )
                }
                rows={3}
                placeholder="Add internal notes about this payment..."
              />
              <div className="edit-actions">
                <button className="btn btn--outline" onClick={cancelEditPayment}>Cancel</button>
                <button className="btn btn--primary" onClick={() => saveEditPayment(pay.id, pay)}><Save size={16}/> Save</button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default Payments;
