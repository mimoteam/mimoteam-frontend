// src/pages/FinanceDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Clock3, CalendarDays, DollarSign,
  Cloud, CloudDrizzle, SunMedium, Wind, Droplets,
} from "lucide-react";
import "../styles/pages/FinanceDashboard.css";

const PAYMENTS_KEY = "payments_v1";
const SERVICES_KEY = "services_store_v1";
const TODOS_KEY    = "finance_todos_v1";

/* ------------------------ helpers ------------------------ */
const read = (k) => {
  try {
    const raw = localStorage.getItem(k);
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const shallowEqualJSON = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
};

function sameYYYYMM(iso, ym) {
  if (!iso || !ym) return false;
  const d = new Date(iso);
  const [y, m] = ym.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m;
}
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

/* ---------- índices auxiliares ---------- */
function makeServicesMap(services) {
  const map = new Map();
  (services || []).forEach(s => map.set(s.id, s));
  return map;
}
// partnerId -> último team visto (ordena por serviceDate/updatedAt)
function makePartnerIdToTeamMap(services) {
  const byPid = new Map(); // pid -> { team, at }
  (services || []).forEach(s => {
    const pid = s.partnerId || s.partner?.id || s.partner?._id;
    if (!pid) return;
    const team = s.team;
    const at = s.serviceDate || s.updatedAt || s.createdAt || null;
    if (!team) return;
    const prev = byPid.get(pid);
    if (prev == null || (at && new Date(at) > new Date(prev.at || 0))) {
      byPid.set(pid, { team, at });
    }
  });
  const out = new Map();
  byPid.forEach((v, k) => out.set(k, v.team));
  return out;
}

/* Nome do parceiro/guia com fallbacks fortes */
function guideNameForPayment(p, servicesMap, allServices, pidTeamIndex) {
  // 1) direto do payment
  if (p?.partnerName) return p.partnerName;
  if (p?.partner && (p.partner.name || p.partner.fullName || p.partner.displayName)) {
    return p.partner.name || p.partner.fullName || p.partner.displayName;
  }
  // 2) via serviceIds -> team
  const ids = Array.isArray(p?.serviceIds) ? p.serviceIds : [];
  for (const id of ids) {
    const s = servicesMap.get(id);
    if (s?.team) return s.team;
  }
  // 3) serviços embutidos no próprio payment
  if (Array.isArray(p?.services) && p.services.length) {
    const s0 = p.services[0];
    if (s0?.team) return s0.team;
  }
  // 4) índice global partnerId -> team
  const pid = p?.partnerId || p?.partner?.id || p?.partner?._id;
  if (pid && pidTeamIndex?.get(pid)) return pidTeamIndex.get(pid);
  // 5) procurar no range da semana (último recurso)
  if (pid && p?.weekStart && p?.weekEnd) {
    const ws = new Date(p.weekStart);
    const we = new Date(p.weekEnd);
    const hit = (allServices || []).find(s => {
      const spid = s.partnerId || s.partner?.id || s.partner?._id;
      if (spid !== pid) return false;
      const d = s.serviceDate ? new Date(s.serviceDate) : null;
      return d && d >= ws && d <= we && s.team;
    });
    if (hit?.team) return hit.team;
  }
  return "—";
}

/* =========================================================
   Widgets
   ========================================================= */
function OrlandoClockCard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "2-digit", weekday: "long" }).format(now);
  return (
    <div className="fin-card widget widget-clock">
      <div className="fin-head" style={{ marginBottom: 8 }}>
        <h3 className="title--dashboard">Local Time</h3>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="time">{time}</div>
        <div className="kpi-title">Orlando, FL — {date}</div>
      </div>
    </div>
  );
}

function OrlandoWeatherCard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60 * 1000); return () => clearInterval(id); }, []);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(now));
  const curve = [62,62,61,61,61,62,64,68,72,77,81,84,86,88,89,89,88,86,83,79,75,72,68,64];
  const tempF = curve[hour] ?? 86;
  const humidity = 55 + Math.round(Math.abs(Math.sin((hour / 24) * Math.PI * 2)) * 20);
  const windMph  = 4 + Math.round(Math.abs(Math.cos((hour / 24) * Math.PI * 2)) * 6);
  const cond = hour >= 7 && hour <= 10 ? "Partly Cloudy" : hour >= 11 && hour <= 16 ? "Sunny" : hour >= 17 && hour <= 19 ? "Cloudy" : "Clear";
  const Icon = cond === "Sunny" ? SunMedium : cond === "Partly Cloudy" ? CloudDrizzle : Cloud;
  return (
    <div className="fin-card widget widget-weather">
      <div className="fin-head" style={{ marginBottom: 8 }}>
        <h3 className="title--dashboard">Weather — Orlando, FL</h3>
      </div>
      <div className="row">
        <div className="cond"><Icon size={18} /><span>{cond}</span></div>
        <div className="temp">{tempF}°F</div>
      </div>
      <div className="mini">
        <div className="mini-item"><div className="label">Humidity</div><div className="val"><Droplets size={14}/> {humidity}%</div></div>
        <div className="mini-item"><div className="label">Wind</div><div className="val"><Wind size={14}/> {windMph} mph</div></div>
        <div className="mini-item"><div className="label">Updated</div><div className="val">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }).format(now)}</div></div>
      </div>
    </div>
  );
}

function CalendarCard() {
  const [base, setBase] = useState(() => new Date());
  const y = base.getFullYear();
  const m = base.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const startWeekday = (first.getDay() + 6) % 7; // 0=Mon
  const totalDays = last.getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  const monthName = base.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="fin-card widget">
      <div className="fin-head" style={{ marginBottom: 8 }}>
        <h3 className="title--dashboard">Calendar</h3>
        <div className="fin-inline">
          <button className="btn btn--outline btn--sm" onClick={() => setBase(new Date(y, m - 1, 1))}>‹</button>
          <span style={{ fontWeight: 800, color: "var(--ink)" }}>{monthName}</span>
          <button className="btn btn--outline btn--sm" onClick={() => setBase(new Date(y, m + 1, 1))}>›</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="kpi-title" style={{ textAlign: "center", fontWeight: 700 }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const isToday = d && new Date().getDate() === d && new Date().getMonth() === m && new Date().getFullYear() === y;
          return (
            <div key={i} style={{
              height: 38, display: "grid", placeItems: "center",
              border: "1px solid var(--line)", borderRadius: 10, background: "#fff",
              fontWeight: isToday ? 900 : 700, color: isToday ? "var(--brand-700)" : "var(--ink)",
            }}>
              {d ?? ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToDoCard() {
  const [items, setItems] = useState(() => {
    try { const raw = localStorage.getItem(TODOS_KEY); const arr = JSON.parse(raw || "[]"); return Array.isArray(arr) ? arr : []; }
    catch { return []; }
  });
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => { try { localStorage.setItem(TODOS_KEY, JSON.stringify(items)); } catch {} }, [items]);

  const add = (e) => {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t) return;
    setItems(prev => [{ id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`, text: t }, ...prev]);
    setText(""); setPage(1);
  };
  const complete = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const remove   = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  useEffect(() => { setPage(1); }, [pageSize]);

  const startIndex = (page - 1) * pageSize;
  const slice = items.slice(startIndex, startIndex + pageSize);

  return (
    <div className="fin-card widget">
      <div className="fin-head" style={{ marginBottom: 8 }}>
        <h3 className="title--dashboard">To-Do</h3>
      </div>

      <form onSubmit={add} style={{ display:"flex", gap:8, marginBottom:10 }}>
        <input className="todo-input" placeholder="Add a task…" value={text} onChange={(e)=>setText(e.target.value)} />
        <button type="submit" className="btn btn--outline btn--sm" title="Add">+</button>
      </form>

      {total === 0 ? (
        <div className="fin-empty">No tasks.</div>
      ) : (
        <>
          <div className="todo-list">
            {slice.map(it => (
              <div className="todo-row" key={it.id}>
                <button className="todo-check" onClick={()=>complete(it.id)} title="Complete">✓</button>
                <div className="todo-text">{it.text}</div>
                <button className="todo-del" onClick={()=>remove(it.id)} title="Delete">×</button>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginTop:10 }}>
            <div className="kpi-title" style={{ fontWeight: 700 }}>
              Showing {total === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, total)} of {total}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <label className="kpi-title" style={{ fontWeight:700 }}>Show</label>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ padding: "6px 10px", border:'1px solid var(--line)', borderRadius:10 }}>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
              <span className="kpi-title" style={{ fontWeight:700 }}>per page</span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <div className="kpi-title" style={{ fontWeight:900 }}>{page}/{totalPages}</div>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* =========================================================
   Principal (aceita props + fallback LS)
   ========================================================= */
export default function FinanceDashboard({ payments: paymentsProp, services: servicesProp }) {
  const [payments, setPayments] = useState(() => paymentsProp ?? read(PAYMENTS_KEY));
  const [services, setServices] = useState(() => servicesProp ?? read(SERVICES_KEY));

  const servicesMap     = useMemo(() => makeServicesMap(services), [services]);
  const pidTeamIndex    = useMemo(() => makePartnerIdToTeamMap(services), [services]);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  /* ---------- sincronização reativa: props ---------- */
  useEffect(() => { if (paymentsProp && !shallowEqualJSON(payments, paymentsProp)) setPayments(paymentsProp); }, [paymentsProp]); // eslint-disable-line
  useEffect(() => { if (servicesProp && !shallowEqualJSON(services, servicesProp)) setServices(servicesProp); }, [servicesProp]); // eslint-disable-line

  /* ---------- warm-up (LS) ---------- */
  useEffect(() => {
    if (paymentsProp) return;
    const sync = () => { const next = read(PAYMENTS_KEY); setPayments(prev => shallowEqualJSON(prev, next) ? prev : next); };
    sync(); const t1 = setTimeout(sync, 250); const t2 = setTimeout(sync, 1000); const t3 = setTimeout(sync, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [paymentsProp]);

  useEffect(() => {
    if (servicesProp) return;
    const sync = () => { const next = read(SERVICES_KEY); setServices(prev => shallowEqualJSON(prev, next) ? prev : next); };
    sync(); const t1 = setTimeout(sync, 250); const t2 = setTimeout(sync, 1000); const t3 = setTimeout(sync, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [servicesProp]);

  /* ---------- storage / focus / vis ---------- */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PAYMENTS_KEY && !paymentsProp) setPayments(prev => {
        const next = read(PAYMENTS_KEY); return shallowEqualJSON(prev, next) ? prev : next;
      });
      if (e.key === SERVICES_KEY && !servicesProp) setServices(prev => {
        const next = read(SERVICES_KEY); return shallowEqualJSON(prev, next) ? prev : next;
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [paymentsProp, servicesProp]);

  useEffect(() => {
    const syncAll = () => {
      if (!paymentsProp) { const nextP = read(PAYMENTS_KEY); setPayments(prev => shallowEqualJSON(prev, nextP) ? prev : nextP); }
      if (!servicesProp) { const nextS = read(SERVICES_KEY); setServices(prev => shallowEqualJSON(prev, nextS) ? prev : nextS); }
    };
    const onFocus = () => syncAll();
    const onVis = () => { if (document.visibilityState === "visible") syncAll(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [paymentsProp, servicesProp]);

  useEffect(() => {
    if (paymentsProp && servicesProp) return;
    const id = setInterval(() => {
      if (!paymentsProp) { const nextP = read(PAYMENTS_KEY); setPayments(prev => shallowEqualJSON(prev, nextP) ? prev : nextP); }
      if (!servicesProp) { const nextS = read(SERVICES_KEY); setServices(prev => shallowEqualJSON(prev, nextS) ? prev : nextS); }
    }, 5000);
    return () => clearInterval(id);
  }, [paymentsProp, servicesProp]);

  /* ---------- derivadores ---------- */
  const sumServices = (p) => {
    const ids = Array.isArray(p?.serviceIds) ? p.serviceIds : [];
    if (ids.length === 0) return Number(p?.total || 0); // sem detalhes -> usa total
    return ids.reduce((sum, id) => sum + Number(servicesMap.get(id)?.finalValue || 0), 0);
  };

  const safePayments = Array.isArray(payments) ? payments : [];

  const toBePaidRows = useMemo(
    () => safePayments.filter((p) => (p.status || "").toUpperCase() === "APPROVED"),
    [safePayments]
  );
  const awaitingRows = useMemo(
    () => safePayments.filter((p) => {
      const s = (p.status || "").toUpperCase();
      return s === "SHARED" || s === "AWAITING";
    }),
    [safePayments]
  );

  const monthlyCost = useMemo(() => {
    let total = 0;
    safePayments.forEach((p) => {
      const anchor = p.weekStart || p.createdAt || p.paidAt;
      if (!sameYYYYMM(anchor, month)) return;
      total += sumServices(p);
    });
    return total;
  }, [safePayments, servicesMap, month]);

  const toBePaidSorted = useMemo(
    () => [...toBePaidRows].sort((a, b) => sumServices(b) - sumServices(a)),
    [toBePaidRows, servicesMap]
  );
  const awaitingSorted = useMemo(
    () => [...awaitingRows].sort((a, b) => sumServices(b) - sumServices(a)),
    [awaitingRows, servicesMap]
  );

  return (
    <div className="finance-page">
      {/* Header */}
      <div className="fin-head" style={{ marginBottom: 6 }}>
        <h3 className="title--dashboard">Overview</h3>
        <div className="fin-inline">
          <span>Month:</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {/* KPIs */}
      <section className="fin-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <Kpi icon={<DollarSign size={18} />} title="Monthly Costs" value={money(monthlyCost)} />
        <Kpi icon={<CheckCircle2 size={18} />} title="To be Paid" value={toBePaidRows.length} />
        <Kpi icon={<Clock3 size={18} />} title="Awaiting Approval" value={awaitingRows.length} />
        <Kpi icon={<CalendarDays size={18} />} title="Month Services" value={safePayments.length} />
      </section>

      {/* Clock + Weather */}
      <section className="fin-grid-2">
        <OrlandoClockCard />
        <OrlandoWeatherCard />
      </section>

      {/* Calendar + To be Paid */}
      <section className="fin-grid-2">
        <CalendarCard />
        <PaginatedListCard
          title="To be Paid"
          titleClass="title--paid"
          rows={toBePaidSorted}
          getLeft={(p) => guideNameForPayment(p, servicesMap, services, pidTeamIndex)}
          getRight={(p) => money(sumServices(p))}
          defaultPageSize={5}
        />
      </section>

      {/* Awaiting + To-Do */}
      <section className="fin-grid-2">
        <PaginatedListCard
          title="Awaiting Approval"
          titleClass="title--awaiting"
          rows={awaitingSorted}
          getLeft={(p) => guideNameForPayment(p, servicesMap, services, pidTeamIndex)}
          getRight={(p) => money(sumServices(p))}
          defaultPageSize={5}
        />
        <ToDoCard />
      </section>
    </div>
  );
}

/* =========================================================
   Auxiliares de UI
   ========================================================= */
function Kpi({ icon, title, value }) {
  return (
    <div className="kpi">
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-info">
        <div className="kpi-title">{title}</div>
        <div className="kpi-value">{value}</div>
      </div>
    </div>
  );
}

/* Card reutilizável com paginação — corrigido */
function PaginatedListCard({ title, titleClass, rows = [], getLeft, getRight, defaultPageSize = 5 }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(1); }, [pageSize, title, total]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const startIndex = (page - 1) * pageSize;
  const slice = rows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="fin-card">
      {/* Cabeçalho do card */}
      <div className="fin-head" style={{ marginBottom: 8 }}>
        <h3 className={titleClass || ''}>{title}</h3>
        <div className="fin-inline">
          <span>{total} items</span>
        </div>
      </div>

      {/* Lista */}
      {total === 0 ? (
        <div className="fin-empty">No items.</div>
      ) : (
        <>
          <div className="table">
            <div className="thead">
              <div className="th">Partner / Team</div>
              <div className="th right">Total</div>
            </div>

            {slice.map((row, i) => (
              <div className="tr" key={row?.id ?? `row_${i}`}>
                <div className="td">{typeof getLeft === 'function' ? getLeft(row) : '—'}</div>
                <div className="td right">{typeof getRight === 'function' ? getRight(row) : '—'}</div>
              </div>
            ))}
          </div>

          {/* Footer: paginação e page size */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
            <div className="kpi-title" style={{ fontWeight: 700 }}>
              Showing {total === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, total)} of {total}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <label className="kpi-title" style={{ fontWeight:700 }}>Show</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ padding: "6px 10px", border:'1px solid var(--line)', borderRadius:10 }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
              <span className="kpi-title" style={{ fontWeight:700 }}>per page</span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <div className="kpi-title" style={{ fontWeight:900 }}>{page}/{totalPages}</div>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className="btn btn--outline btn--sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
