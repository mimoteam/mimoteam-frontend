// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Activity,
  BarChart3,
  CheckSquare,
  Plus,
  DollarSign,
  Clock,
  CalendarDays,
  Users,
  Tag,
  MessageSquarePlus,
  Filter,
  Trash2
} from 'lucide-react';

import '../styles/pages/Dashboard.css';
/* ===== API imports (robustos a nomes diferentes) ===== */
import * as servicesApi from '../api/services';
import * as paymentsApi from '../api/payments';
import * as usersApi from '../api/users';
import * as costsApi from '../api/costs';
import * as tasksApi from '../api/tasks';
import * as handoverApi from '../api/handover';

const listServicesFn = servicesApi.listServices || servicesApi.fetchServices;
const listPaymentsFn = paymentsApi.listPayments || paymentsApi.fetchPayments;
const listUsersFn    = usersApi.fetchUsers   || usersApi.listUsers;   // seu users.js expõe fetchUsers
const listCostsFn    = costsApi.listCosts    || costsApi.fetchCosts;

/* ====== STORAGE KEYS (apenas fallback) ================================ */
const SERVICES_KEYS = ['services_store_v1', 'services_v1', 'services'];
const PAYMENTS_KEYS = ['payments_v1', 'payments', 'generated_payments'];
const USERS_KEYS    = ['users_store_v1', 'users_v1', 'users'];
const COSTS_KEYS    = ['costs_store_v1', 'costs_v1', 'costs'];
const TASKS_KEY     = 'dashboard_tasks_v1';
const HANDOVER_KEY  = 'handover_notes_v1';

/* ====== HELPERS ======================================================== */
const safeParse = (raw, fallback = []) => {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
};
const loadFirstHit = (keys) => {
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (raw) return safeParse(raw);
  }
  return [];
};
const newId = (prefix = 'id') =>
  (crypto?.randomUUID?.() || `${prefix}_${Date.now()}_${Math.floor(Math.random()*1e6)}`);

/* Paginador genérico: busca várias páginas até terminar (com limite de segurança) */
async function fetchAllPages(fn, { pageSize = 200, maxPages = 10, params = {} } = {}) {
  let page = 1;
  const all = [];
  while (page <= maxPages) {
    const res = await fn({ page, pageSize, ...params });
    const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
    all.push(...items);
    if (items.length < pageSize) break;
    page += 1;
  }
  return all;
}

/* Semanas (Qua→Ter), igual Payments.jsx */
function getPaymentWeek(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay(); // 0..6
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
const within = (dateIso, from, to) => {
  const t = new Date(dateIso).getTime();
  return t >= from.getTime() && t <= to.getTime();
};
const currency = (n) => `$${Number(n || 0).toFixed(2)}`;

/* ====== CLOCK HELPERS (TZ offsets simples) ============================ */
const tzConfigs = [
  { id:'orl', label:'Orlando (ET)',     offsetMinutes: -4 * 60 },
  { id:'la',  label:'Los Angeles (PT)', offsetMinutes: -7 * 60 },
  { id:'bsb', label:'Brasília (BRT)',   offsetMinutes: -3 * 60 },
];
function timeWithOffset(now, offsetMinutes) {
  const localOffset = now.getTimezoneOffset(); // minutos
  const ms = now.getTime() + (offsetMinutes + localOffset) * 60 * 1000;
  return new Date(ms);
}

/* ====== SHIFT HANDOVER MODEL ========================================== */
const NOTE_TYPES = [
  'To Know', 'To Do', 'Question', 'VIP Client', 'Guideline', 'Customer Service'
];
const COLOR_TAGS = [
  { id:'urgent',  label:'Urgent',       emoji:'🔴' },
  { id:'pending', label:'Pending',      emoji:'🟡' },
  { id:'routine', label:'Routine',      emoji:'🟢' },
  { id:'info',    label:'Informational',emoji:'🔵' },
];

/* ====== NORMALIZAÇÕES PARA NOME/ID E LABELS ====== */
const idOf = (obj) => (obj && (obj._id || obj.id)) || obj || "";
const toTitle = (s) =>
  String(s || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      const acronyms = new Set(["vip", "us", "usa", "uk"]);
      return acronyms.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
const prettyLabel = (raw) => toTitle(String(raw || "").replace(/[_\-]+/g, " "));
const getPartnerId = (s) =>
  String(
    idOf(s?.partner) ||
    s?.partnerId ||
    s?.partner_id ||
    s?.partnerUserId ||
    s?.userId ||
    ""
  );
const serviceTypeOf = (s) =>
  prettyLabel(
    s?.serviceType?.name || s?.serviceTypeName || s?.serviceTypeId || s?.type || "Other"
  );
const getPartnerNameFromService = (s, usersMap) => {
  const inline = s?.partner?.name || s?.partner?.fullName || s?.partnerName;
  const pid = getPartnerId(s);
  return inline || usersMap.get(pid) || "Unknown Partner";
};
const getPartnerNameFromPayment = (p, usersMap) => {
  const pid = String(p?.partnerId || p?.partner_id || idOf(p?.partner) || "");
  const inline = p?.partnerName || p?.partner?.name || p?.partner?.fullName;
  return inline || usersMap.get(pid) || "Unknown Partner";
};

const Dashboard = ({ currentUserName = 'Admin User', currentUserRole = 'Administrator' }) => {
  /* ====== CLOCK ====== */
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ====== LOAD DATA (BACKEND + FALLBACK) ====== */
  const [services, setServices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [users, setUsersState]  = useState([]);
  const [costs, setCosts]       = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // Serviços: últimos 6 meses
        const since = new Date(); since.setMonth(since.getMonth() - 6);
        const servicesAll = listServicesFn
          ? await fetchAllPages(
              ({ page, pageSize }) =>
                listServicesFn({
                  page, pageSize,
                  sortBy: 'serviceDate', sortDir: 'desc',
                  dateFrom: since.toISOString().slice(0,10),
                }),
              { pageSize: 200, maxPages: 10 }
            )
          : [];

        // Pagamentos
        const paymentsAll = listPaymentsFn
          ? await fetchAllPages(
              ({ page, pageSize }) => listPaymentsFn({ page, pageSize }),
              { pageSize: 200, maxPages: 10 }
            )
          : [];

        // Usuários (parceiros ativos)
        const usersRes = listUsersFn
          ? await listUsersFn({ role: 'partner', status: 'active', pageSize: 500 })
          : { items: [] };
        const usersAll = Array.isArray(usersRes?.items) ? usersRes.items : (Array.isArray(usersRes) ? usersRes : []);

        // Custos
        const costsRes = listCostsFn
          ? await listCostsFn({ pageSize: 500 })
          : { items: [] };
        const costsAll = Array.isArray(costsRes?.items) ? costsRes.items : (Array.isArray(costsRes) ? costsRes : []);

        setServices(servicesAll);
        setPayments(paymentsAll);
        setUsersState(usersAll);
        setCosts(costsAll);
      } catch (e) {
        console.error('Dashboard: backend fetch failed, using localStorage fallback', e);
        setServices(loadFirstHit(SERVICES_KEYS));
        setPayments(loadFirstHit(PAYMENTS_KEYS));
        setUsersState(loadFirstHit(USERS_KEYS));
        setCosts(loadFirstHit(COSTS_KEYS));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ====== MAPA DE USUÁRIOS POR ID (para resolver Unknown Partner) ====== */
  const usersMap = useMemo(() => {
    const m = new Map();
    (users || []).forEach((u) => {
      const id = String(idOf(u));
      const name = u?.fullName || u?.name || u?.login || u?.email || "Unknown Partner";
      if (id) m.set(id, name);
    });
    return m;
  }, [users]);

  /* ====== TASKS (compartilhadas) ====== */
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [taskPage, setTaskPage] = useState(1);
  const TASKS_PER_PAGE = 5;
  const [completingTaskId, setCompletingTaskId] = useState(null);

  // Carrega tasks do backend; fallback para LS
  useEffect(() => {
    (async () => {
      try {
        const items = await tasksApi.listTasks({ pageSize: 200, includeTotal: 1 });
        setTasks(items);
      } catch (e) {
        console.warn('[Tasks] usando fallback localStorage', e);
        const raw = localStorage.getItem(TASKS_KEY);
        setTasks(raw ? safeParse(raw, []) : [
          { id: 1, text: 'Review pending services', completed: false },
          { id: 2, text: 'Process weekly payments', completed: true },
          { id: 3, text: 'Update cost structures', completed: false }
        ]);
      }
    })();
  }, []);

  // Persistência local para fallback offline
  useEffect(() => { try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
    setTaskPage(p => Math.min(p, totalPages));
  }, [tasks]);
  const totalTaskPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
  const paginatedTasks = useMemo(() => {
    const start = (taskPage - 1) * TASKS_PER_PAGE;
    return tasks.slice(start, start + TASKS_PER_PAGE);
  }, [tasks, taskPage]);

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      const created = await tasksApi.createTask({ text: newTask.trim() });
      setTasks(prev => [created, ...prev]);
      setNewTask('');
      setTaskPage(1);
    } catch (e) {
      // fallback local
      const t = { id: Date.now(), text: newTask.trim(), completed: false };
      setTasks(prev => [t, ...prev]);
      setNewTask('');
      setTaskPage(1);
    }
  };

  const toggleTask = async (id) => {
    setCompletingTaskId(id);
    try {
      await tasksApi.completeTask(id, true);
      setTimeout(() => {
        setTasks(prev => prev.filter(t => String(t.id) !== String(id)));
        setCompletingTaskId(null);
      }, 320);
    } catch (e) {
      // fallback local: marcar como done e remover
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== id));
        setCompletingTaskId(null);
      }, 320);
    }
  };

  /* ====== HANDOVER NOTES (compartilhadas) ============================ */
  const [notes, setNotes] = useState([]);
  const [filters, setFilters] = useState({ type: '', tag: '', search: '' });
  const [form, setForm] = useState({ type: '', tag: '', body: '' });
  const [commentInputs, setCommentInputs] = useState({});

  // Carrega notas do backend; fallback para LS
  useEffect(() => {
    (async () => {
      try {
        const items = await handoverApi.listNotes({ pageSize: 200, includeTotal: 1 });
        setNotes(items);
      } catch (e) {
        console.warn('[Handover] usando fallback localStorage', e);
        const raw = localStorage.getItem(HANDOVER_KEY);
        const arr = raw ? safeParse(raw, []) : [];
        setNotes(arr.map(n => ({ ...n, comments: Array.isArray(n.comments) ? n.comments : [] })));
      }
    })();
  }, []);

  // Persistência local para fallback offline
  useEffect(() => { try { localStorage.setItem(HANDOVER_KEY, JSON.stringify(notes)); } catch {} }, [notes]);

  const addNote = async () => {
    if (!form.type || !form.tag || !form.body.trim()) return;
    try {
      const created = await handoverApi.createNote({ type: form.type, tag: form.tag, body: form.body.trim() });
      setNotes(prev => [created, ...prev]);
      setForm({ type:'', tag:'', body:'' });
      setNotePage(1);
    } catch (e) {
      // fallback local
      const n = {
        id: newId('note'),
        type: form.type,
        tag: form.tag,
        body: form.body.trim(),
        createdAt: new Date().toISOString(),
        author: `${currentUserName} • ${currentUserRole}`,
        comments: []
      };
      setNotes(prev => [n, ...prev]);
      setForm({ type:'', tag:'', body:'' });
      setNotePage(1);
    }
  };

  const removeNote = async (id) => {
    try {
      await handoverApi.deleteNote(id);
      setNotes(prev => prev.filter(n => String(n.id) !== String(id)));
    } catch (e) {
      // fallback local
      setNotes(prev => prev.filter(n => n.id !== id));
    }
  };

  const addComment = async (noteId) => {
    const text = (commentInputs[noteId] || '').trim();
    if (!text) return;
    try {
      const updated = await handoverApi.addComment(noteId, { body: text });
      if (updated?.comments) {
        setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
      } else {
        const cmt = { id: newId('cmt'), body: text, createdAt: new Date().toISOString(), author: `${currentUserName} • ${currentUserRole}` };
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, comments: [...(n.comments||[]), cmt] } : n));
      }
      setCommentInputs(prev => ({ ...prev, [noteId]: '' }));
    } catch (e) {
      // fallback local
      const cmt = { id: newId('cmt'), body: text, createdAt: new Date().toISOString(), author: `${currentUserName} • ${currentUserRole}` };
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, comments: [...(n.comments||[]), cmt] } : n));
      setCommentInputs(prev => ({ ...prev, [noteId]: '' }));
    }
  };

  const filteredNotes = useMemo(() => {
    let arr = [...notes];
    if (filters.type) arr = arr.filter(n => n.type === filters.type);
    if (filters.tag)  arr = arr.filter(n => n.tag === filters.tag);
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      arr = arr.filter(n =>
        (n.body || '').toLowerCase().includes(q) ||
        (n.comments||[]).some(c => (c.body || '').toLowerCase().includes(q))
      );
    }
    return arr;
  }, [notes, filters]);

  const NOTES_PER_PAGE = 10;
  const [notePage, setNotePage] = useState(1);
  const totalNotePages = Math.max(1, Math.ceil(filteredNotes.length / NOTES_PER_PAGE));
  useEffect(() => { setNotePage(p => Math.min(p, totalNotePages)); }, [totalNotePages]);
  const paginatedNotes = useMemo(() => {
    const start = (notePage - 1) * NOTES_PER_PAGE;
    return filteredNotes.slice(start, start + NOTES_PER_PAGE);
  }, [filteredNotes, notePage]);
  const pageRange = (cur, total, max = 5) => {
    const half = Math.floor(max / 2);
    let start = Math.max(1, cur - half);
    let end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  /* ====== DERIVED METRICS ============================================= */
  const currentWeek = useMemo(() => getPaymentWeek(new Date()), []);
  const weekStart = currentWeek.start;
  const weekEnd   = currentWeek.end;

  const weeklyServices = useMemo(
    () => (services || []).filter(s => s?.serviceDate && within(s.serviceDate, weekStart, weekEnd)),
    [services, weekStart, weekEnd]
  );
  const weeklyRevenue = useMemo(
    () => weeklyServices.reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0),
    [weeklyServices]
  );
  const weeklyActivePartners = useMemo(() => {
    const setIds = new Set();
    weeklyServices.forEach(s => {
      const pid = getPartnerId(s);
      if (pid) setIds.add(pid);
    });
    return setIds.size;
  }, [weeklyServices]);

  // Pagamentos na semana corrente (usa weekKey quando existir; senão calcula pela data)
  const weeklyPayments = useMemo(() => {
    return (payments || []).filter(p => {
      if (p.weekKey) return p.weekKey === currentWeek.key;
      const d = p.weekStart ? new Date(p.weekStart) :
                p.createdAt ? new Date(p.createdAt) : null;
      if (!d || isNaN(d)) return false;
      const k = weekKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      return k === currentWeek.key;
    });
  }, [payments, currentWeek.key]);

  const weeklyPendingAmount = useMemo(
    () => weeklyPayments
      .filter(p => ['PENDING', 'SHARED', 'APPROVED', 'ON_HOLD'].includes(p.status))
      .reduce((sum, p) => sum + (Number(p.total) || 0), 0),
    [weeklyPayments]
  );

  const monthKeyStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const weeklyTotal = useMemo(
    () => weeklyPayments.reduce((sum, p) => sum + (Number(p.total) || 0), 0),
    [weeklyPayments]
  );
  const monthlyTotal = useMemo(() => (payments || []).reduce((sum, p) => {
    const d = p.weekStart ? new Date(p.weekStart) : (p.createdAt ? new Date(p.createdAt) : null);
    if (!d) return sum;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return key === monthKeyStr ? sum + (Number(p.total) || 0) : sum;
  }, 0), [payments, monthKeyStr]);

  /* ====== RANKINGS e TIPOS (COM NORMALIZAÇÃO) ====== */
  const serviceRankings = useMemo(() => {
    const map = new Map();
    (services || []).forEach(s => {
      const pid = getPartnerId(s) || 'unknown';
      const pname = getPartnerNameFromService(s, usersMap);
      const revenue = Number(s.finalValue) || 0;
      const entry = map.get(pid) || { partner: pname, services: 0, revenue: 0 };
      entry.partner = pname; // mantém nome mais recente/preciso
      entry.services += 1;
      entry.revenue += revenue;
      map.set(pid, entry);
    });
    return [...map.values()]
      .sort((a, b) => b.services - a.services || b.revenue - a.revenue)
      .slice(0, 5)
      .map(x => ({ partner: x.partner, services: x.services, revenue: currency(x.revenue) }));
  }, [services, usersMap]);

  const serviceTypes = useMemo(() => {
    const total = (services || []).length || 1;
    const counts = new Map();
    (services || []).forEach(s => {
      const name = serviceTypeOf(s); // IN_PERSON_TOUR -> In Person Tour
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const arr = [...counts.entries()].map(([type, count]) => ({
      type, count, percentage: Math.round((count / total) * 100)
    }));
    arr.sort((a,b) => b.count - a.count);
    return arr.slice(0, 6);
  }, [services]);

  const paymentRankings = useMemo(() => {
    const byPartner = new Map();
    (payments || []).forEach(p => {
      const pid = String(p?.partnerId || p?.partner_id || idOf(p?.partner) || "");
      const name = getPartnerNameFromPayment(p, usersMap);
      const entry = byPartner.get(pid) || { name, total: 0, lastUpdated: 0, lastStatus: p.status };
      entry.name = name; // garante nome atual
      entry.total += Number(p.total) || 0;
      const ts = new Date(p.updatedAt || p.createdAt || Date.now()).getTime();
      if (ts >= entry.lastUpdated) { entry.lastUpdated = ts; entry.lastStatus = p.status; }
      byPartner.set(pid, entry);
    });
    return [...byPartner.values()]
      .sort((a,b) => b.total - a.total)
      .slice(0, 5)
      .map(x => ({
        partner: x.name,
        amount: currency(x.total),
        status: (x.lastStatus || 'pending').toLowerCase()
      }));
  }, [payments, usersMap]);

  const totalUsers  = users.length;
  const totalCosts  = costs.length;

  /* ======================= UI ========================== */
  return (
    <div className="dashboard">
      {/* ===== GLASS CLOCK STRIP ===== */}
      <div className="glass-strip" style={{ display:'flex', gap:12, justifyContent:'center', alignItems:'stretch', flexWrap:'wrap', marginBottom:14 }}>
        {tzConfigs.map(tz => { const t = timeWithOffset(now, tz.offsetMinutes); return (
          <div key={tz.id} className="glass-card" style={{ minWidth: 220, padding:'10px 12px', borderRadius: 14, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, fontSize:12, color:'#6b7280' }}><Clock size={16} /><span>{tz.label}</span></div>
            <div style={{ fontSize:22, fontWeight:800, lineHeight:1 }}>{t.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true })}</div>
            <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{t.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'2-digit', year:'numeric' })}</div>
          </div>
        );})}
      </div>

      <div className="dashboard-content">
        {/* 1. Top Partners by Services */}
        <div className="dashboard-card neumorphic">
          <div className="card-content">
            <div className="card-header"><div className="card-icon"><TrendingUp /></div><h3 className="card-title">Top Partners by Services</h3></div>
            {loading ? <div className="empty">Loading…</div> : (
              <div className="ranking-list">
                {serviceRankings.map((item, index) => (
                  <div key={index} className="ranking-item">
                    <div className="rank-number">#{index + 1}</div>
                    <div className="rank-info"><span className="rank-name">{item.partner}</span><span className="rank-details">{item.services} services</span></div>
                    <div className="rank-value">{item.revenue}</div>
                  </div>
                ))}
                {serviceRankings.length === 0 && <div className="empty">No services yet.</div>}
              </div>
            )}
          </div>
        </div>

        {/* 2. Services by Type */}
        <div className="dashboard-card neumorphic">
          <div className="card-content">
            <div className="card-header"><div className="card-icon"><BarChart3 /></div><h3 className="card-title">Services by Type</h3></div>
            {loading ? <div className="empty">Loading…</div> : (
              <div className="service-types">
                {serviceTypes.map((service, index) => (
                  <div key={index} className="service-type-item">
                    <div className="service-info"><span className="service-name">{service.type}</span><span className="service-count">{service.count} services</span></div>
                    <div className="service-bar"><div className="service-progress" style={{ width: `${service.percentage}%` }} /></div>
                    <span className="service-percentage">{service.percentage}%</span>
                  </div>
                ))}
                {serviceTypes.length === 0 && <div className="empty">No services yet.</div>}
              </div>
            )}
          </div>
        </div>

        {/* 3. Payment Rankings */}
        <div className="dashboard-card neumorphic">
          <div className="card-content">
            <div className="card-header"><div className="card-icon"><DollarSign /></div><h3 className="card-title">Payment Rankings</h3></div>
            {loading ? <div className="empty">Loading…</div> : (
              <>
                <div className="payment-summary">
                  <div className="summary-item"><span className="summary-label">Weekly Total</span><span className="summary-value">{currency(weeklyTotal)}</span></div>
                  <div className="summary-item"><span className="summary-label">Monthly Total</span><span className="summary-value">{currency(monthlyTotal)}</span></div>
                  <div className="summary-item"><span className="summary-label">Users</span><span className="summary-value">{totalUsers}</span></div>
                  <div className="summary-item"><span className="summary-label">Costs</span><span className="summary-value">{totalCosts}</span></div>
                </div>
                <div className="ranking-list">
                  {paymentRankings.map((item, index) => (
                    <div key={index} className="ranking-item">
                      <div className="rank-number">#{index + 1}</div>
                      <div className="rank-info"><span className="rank-name">{item.partner}</span><span className={`payment-status status-${item.status}`}>{item.status}</span></div>
                      <div className="rank-value">{item.amount}</div>
                    </div>
                  ))}
                  {paymentRankings.length === 0 && <div className="empty">No payments yet.</div>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 4 + 5: Tasks & Weekly */}
        <div style={{ display: 'grid', gridColumn: '1 / -1', gridTemplateColumns: 'minmax(520px, 1fr) minmax(420px, 1fr)', alignItems: 'stretch', gap: 24, width: '100%' }}>
          {/* 4. Tasks */}
          <div className="dashboard-card neumorphic" style={{ minHeight: 360 }}>
            <div className="card-content" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
              <div className="card-header"><div className="card-icon"><CheckSquare /></div><h3 className="card-title">Tasks & To-Do</h3></div>
              <div className="task-input"><input type="text" placeholder="Add new task..." value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} className="task-input-field" /><button onClick={addTask} className="add-task-btn" title="Add Task"><Plus size={16} /></button></div>
              <div className="task-list" style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8, flex: 1, overflowY:'auto' }}>
                {paginatedTasks.map((task) => { const isCompleting = completingTaskId === task.id || task.completed; return (
                  <div key={task.id} className={`task-item ${isCompleting ? 'task--completing' : ''}`} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input type="checkbox" className="task-checkbox" checked={isCompleting} onChange={() => toggleTask(task.id)} title="Mark as done (will be removed)" />
                    <span className={`task-text ${isCompleting ? 'completed' : ''}`}>{task.text}</span>
                    <button className="btn btn--outline btn--sm" style={{ marginLeft:'auto' }} onClick={() => toggleTask(task.id)} title="Complete">Complete</button>
                  </div>
                );})}
                {paginatedTasks.length === 0 && <div className="empty">No tasks.</div>}
              </div>
              {tasks.length > 0 && (
                <div className="pagination" style={{ marginTop:10, display:'flex', justifyContent:'flex-end', gap:6 }}>
                  <button className="pg-btn" onClick={() => setTaskPage(1)} disabled={taskPage===1}>«</button>
                  <button className="pg-btn" onClick={() => setTaskPage(p => Math.max(1, p-1))} disabled={taskPage===1}>‹</button>
                  <div className="pg-pages" style={{ display:'flex', gap:6 }}>
                    {Array.from({ length: totalTaskPages }, (_, i) => i+1).slice(Math.max(0, taskPage-3), Math.max(0, taskPage-3)+5).map(n => (
                      <button key={n} className={`pg-num ${taskPage===n?'active':''}`} onClick={() => setTaskPage(n)}>{n}</button>
                    ))}
                  </div>
                  <button className="pg-btn" onClick={() => setTaskPage(p => Math.min(totalTaskPages, p+1))} disabled={taskPage===totalTaskPages}>›</button>
                  <button className="pg-btn" onClick={() => setTaskPage(totalTaskPages)} disabled={taskPage===totalTaskPages}>»</button>
                </div>
              )}
            </div>
          </div>

          {/* 5. Weekly */}
          <div className="dashboard-card neumorphic" style={{ minHeight: 360 }}>
            <div className="card-content" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
              <div className="card-header"><div className="card-icon"><Activity /></div><h3 className="card-title">Weekly Context</h3></div>
              {loading ? <div className="empty">Loading…</div> : (
                <>
                  <div className="performance-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(160px, 1fr))', gap:10, flex:1 }}>
                    <div className="performance-item"><span className="performance-label">Total Services</span><span className="performance-value">{weeklyServices.length}</span></div>
                    <div className="performance-item"><span className="performance-label">Revenue</span><span className="performance-value">{currency(weeklyRevenue)}</span></div>
                    <div className="performance-item"><span className="performance-label">Active Partners</span><span className="performance-value">{weeklyActivePartners}</span></div>
                    <div className="performance-item"><span className="performance-label">Pending Payments</span><span className="performance-value">{currency(weeklyPendingAmount)}</span></div>
                  </div>
                  <div style={{ marginTop:8, fontSize:12, color:'#6b7280' }}>Window: {weekStart.toLocaleDateString()} – {weekEnd.toLocaleDateString()} • {currentWeek.key}</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 6. SHIFT HANDOVER */}
        <div className="dashboard-card neumorphic full-width">
          <div className="card-content">
            <div className="card-header"><div className="card-icon"><MessageSquarePlus /></div><h3 className="card-title">SHIFT HANDOVER</h3></div>

            {/* ADD NEW NOTE */}
            <div className="handover-form" style={{ display:'grid', gap:10, gridTemplateColumns:'minmax(160px, 220px) minmax(160px, 220px) 1fr', alignItems:'end' }}>
              <div className="filter"><label>Note Type</label><select value={form.type} onChange={(e) => setForm(f => ({...f, type:e.target.value}))}><option value="">Select</option>{NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="filter"><label>Color Tag</label><select value={form.tag} onChange={(e) => setForm(f => ({...f, tag:e.target.value}))}><option value="">Select</option>{COLOR_TAGS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</select></div>
              <div className="filter" style={{ display:'flex', gap:8 }}>
                <input type="text" placeholder='Note body (e.g. "VIP Client #2015...")' value={form.body} onChange={(e) => setForm(f => ({...f, body:e.target.value}))} />
                <button className="btn btn--primary" onClick={addNote} title="Add Note"><Plus size={16}/> Add Note</button>
              </div>
            </div>

            {/* FILTERS */}
            <div className="filters-row" style={{ marginTop:8, gridTemplateColumns:'minmax(180px, 240px) minmax(220px, 320px) 1fr', alignItems:'end' }}>
              <div className="filter"><label>Filter by Type</label><select value={filters.type} onChange={(e)=>setFilters(p=>({...p, type:e.target.value}))}><option value="">All</option>{NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="filter"><label>Filter by Tag</label><select value={filters.tag} onChange={(e)=>setFilters(p=>({...p, tag:e.target.value}))}><option value="">All</option>{COLOR_TAGS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</select></div>
              <div className="filter" style={{ position:'relative' }}>
                <input type="text" placeholder="Search in notes..." value={filters.search} onChange={(e)=>setFilters(p=>({...p, search:e.target.value}))} style={{ paddingLeft:36 }} />
                <Filter size={16} style={{ position:'absolute', left:12, top:12, opacity:.7 }} />
              </div>
            </div>

            {/* RESUMO */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12}}>
              <div style={{fontSize:12, color:'#64748B'}}>
                {filteredNotes.length === 0 ? 'No notes.' : (() => {
                  const start = (notePage - 1) * NOTES_PER_PAGE + 1;
                  const end = Math.min(notePage * NOTES_PER_PAGE, filteredNotes.length);
                  return `Showing ${start}–${end} of ${filteredNotes.length}`;
                })()}
              </div>
            </div>

            {/* TIMELINE */}
            <div className="handover-table" style={{ marginTop:10, overflowX:'auto' }}>
              <div className="thead">
                <div className="th"><CalendarDays size={14}/> Date/Time</div>
                <div className="th"><Users size={14}/> Logged by</div>
                <div className="th"><MessageSquarePlus size={14}/> Content</div>
                <div className="th"><Tag size={14}/> Tag</div>
                <div className="th center">Actions</div>
              </div>
              <div className="tbody">
                {paginatedNotes.length === 0 ? (
                  <div className="empty-row">No notes yet.</div>
                ) : paginatedNotes.map(n => {
                  const dt = new Date(n.createdAt);
                  const tagMeta = COLOR_TAGS.find(t => t.id === n.tag);
                  const comments = Array.isArray(n.comments) ? n.comments : [];
                  return (
                    <div key={n.id} className="tr">
                      <div className="td">{dt.toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' })}</div>
                      <div className="td">{n.author || n.authorName || ''}</div>

                      {/* CONTENT + COMMENTS */}
                      <div className="td content-td">
                        <details className="note-details">
                          <summary
                            className="note-summary"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                            title={n.body}
                          >
                            {n.body}
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
                              • {comments.length} comment{comments.length === 1 ? '' : 's'}
                            </span>
                          </summary>

                          <div className="note-full">
                            <div style={{ fontSize:12, color:'#6b7280', margin:'4px 0 8px' }}>
                              Type: {n.type}
                            </div>

                            <div className="handover-comments">
                              {comments.map(c => (
                                <div key={c.id} className="handover-comment">
                                  <div className="handover-comment-meta">
                                    {new Date(c.createdAt).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' })} • {c.author || c.authorName || ''}
                                  </div>
                                  <div>{c.body}</div>
                                </div>
                              ))}

                              <div className="handover-add-comment">
                                <input
                                  type="text"
                                  placeholder="Add a comment..."
                                  value={commentInputs[n.id] || ''}
                                  onChange={(e)=>setCommentInputs(prev=>({ ...prev, [n.id]: e.target.value }))}
                                  onKeyDown={(e)=>{ if(e.key==='Enter') addComment(n.id); }}
                                />
                                <button className="btn btn--outline btn--sm" onClick={()=>addComment(n.id)} title="Add Comment">
                                  <Plus size={14}/>
                                </button>
                              </div>
                            </div>
                          </div>
                        </details>
                      </div>

                      <div className="td">
                        <span className="wk-chip" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', whiteSpace:'nowrap' }}>
                          <span style={{ fontSize:14 }}>{tagMeta?.emoji}</span>
                          <b>{tagMeta?.label || n.tag}</b>
                        </span>
                      </div>
                      <div className="td center">
                        <button className="icon-btn danger" title="Delete" onClick={() => removeNote(n.id)}><Trash2 size={16}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PAGINAÇÃO */}
            {filteredNotes.length > 0 && (
              <div className="pagination" style={{ marginTop:12, display:'flex', justifyContent:'flex-end', gap:6 }}>
                <button className="pg-btn" onClick={() => setNotePage(1)} disabled={notePage === 1}>«</button>
                <button className="pg-btn" onClick={() => setNotePage(p => Math.max(1, p - 1))} disabled={notePage === 1}>‹</button>
                {pageRange(notePage, totalNotePages, 5).map(n => (
                  <button key={n} className={`pg-num ${notePage === n ? 'active' : ''}`} onClick={() => setNotePage(n)}>{n}</button>
                ))}
                <button className="pg-btn" onClick={() => setNotePage(p => Math.min(totalNotePages, p + 1))} disabled={notePage === totalNotePages}>›</button>
                <button className="pg-btn" onClick={() => setNotePage(totalNotePages)} disabled={notePage === totalNotePages}>»</button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
