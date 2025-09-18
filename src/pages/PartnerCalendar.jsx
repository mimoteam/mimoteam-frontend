import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Lock,
  Plus,
  XCircle,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import "../styles/pages/PartnerCalendar.css";
import * as AvApi from "../api/availability";

/** Local storage base key (apenas para compat em cache leve) */
const CALENDAR_STORE_KEY = "partner_calendar_v1";

/** Helpers */
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};
const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

function buildMonthMatrix(date) {
  const start = monthStart(date);
  const end = monthEnd(date);
  const startOffset = start.getDay();
  const daysInMonth = end.getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push({ type: "void", key: `void-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(date.getFullYear(), date.getMonth(), d);
    cells.push({ type: "day", date: day, key: ymd(day) });
  }
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < tail; i++) cells.push({ type: "void", key: `void-tail-${i}` });
  return cells;
}

/** Estados */
const STATE = {
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  BUSY: "busy",
};

const LEGEND = [
  { key: STATE.AVAILABLE, icon: Check, className: "leg leg-available", label: "Available" },
  { key: STATE.BUSY, icon: Lock, className: "leg leg-busy", label: "Scheduled" },
  { key: STATE.UNAVAILABLE, icon: X, className: "leg leg-unavailable", label: "Unavailable" },
];

/** (Opcional) migração local simples */
function migrateCalendarForUser(userId) {
  if (!userId) return null;
  const targetKey = `${CALENDAR_STORE_KEY}_${userId}`;
  try {
    const existing = localStorage.getItem(targetKey);
    if (existing) return JSON.parse(existing);
  } catch {}
  try {
    const legacy = localStorage.getItem(CALENDAR_STORE_KEY);
    if (legacy) {
      const found = JSON.parse(legacy);
      try { localStorage.setItem(targetKey, JSON.stringify(found)); } catch {}
      return found;
    }
  } catch {}
  return null;
}

export default function PartnerCalendar({ currentUser }) {
  const [baseMonth, setBaseMonth] = useState(monthStart(new Date()));
  const [avail, setAvail] = useState({});         // { 'YYYY-MM-DD': 'busy' | 'unavailable' }
  const [fetching, setFetching] = useState(false);

  // requisições em andamento por dia (evita duplo clique/race)
  const [pending, setPending] = useState(() => new Set());

  // Bulk
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFrom, setBulkFrom] = useState(ymd(new Date()));
  const [bulkTo, setBulkTo] = useState(ymd(addMonths(new Date(), 1)));
  const [bulkWeekdays, setBulkWeekdays] = useState(new Set()); // 0..6
  const [bulkState, setBulkState] = useState(STATE.UNAVAILABLE); // só A/U — sem BUSY
  const [bulkLoading, setBulkLoading] = useState(false);

  // Feedback rápido ao usuário
  const [flash, setFlash] = useState(null); // {type:'ok'|'err', text:string}

  // 🔐 partnerId robusto
  const userId = useMemo(() => {
    const u = currentUser || {};
    const id =
      u.id ||
      u._id ||
      u.userId ||
      (u.user && (u.user.id || u.user._id)) ||
      (u.profile && (u.profile.id || u.profile._id));
    const s = String(id || "").trim();
    return s ? s : null;
  }, [currentUser]);

  const STORE_KEY = userId ? `${CALENDAR_STORE_KEY}_${userId}` : null;

  /** Carrega do backend para o mês visível */
  const loadFromServer = async () => {
    if (!userId) { setAvail({}); return; }
    const start = monthStart(baseMonth);
    const end = monthEnd(baseMonth);
    const dateFrom = ymd(start);
    const dateTo = ymd(end);

    setFetching(true);
    try {
      const items = await AvApi.getAvailability(userId, dateFrom, dateTo);
      const map = {};
      for (const it of items || []) {
        if (it?.date && (it.state === "busy" || it.state === "unavailable")) {
          map[it.date] = it.state;
        }
      }
      setAvail(map);
      if (STORE_KEY) try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch {}
    } catch {
      const migrated = migrateCalendarForUser(userId);
      setAvail((migrated && typeof migrated === "object") ? migrated : {});
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { loadFromServer(); /* eslint-disable-next-line */ }, [userId, baseMonth]);

  /** Toggle de dia (AVAILABLE ⇄ UNAVAILABLE; BUSY é bloqueado pelo admin) */
  const toggleDay = async (date) => {
    if (!userId) return;
    const k = ymd(date);
    if (pending.has(k)) return; // já salvando
    const cur = avail[k]; // undefined => available
    if (cur === STATE.BUSY) return; // 🔒 não altera

    const nextState = !cur || cur === STATE.AVAILABLE ? STATE.UNAVAILABLE : STATE.AVAILABLE;

    // otimista
    setAvail((m) => {
      const n = { ...m };
      if (nextState === STATE.AVAILABLE) delete n[k];
      else n[k] = STATE.UNAVAILABLE;
      return n;
    });
    setPending((s) => new Set([...s, k]));

    try {
      const resp = await AvApi.setDayAvailability(userId, k, nextState, "partner");
      // aplica exatamente o estado retornado pela API
      setAvail((m) => {
        const n = { ...m };
        const st = resp?.state;
        if (st === STATE.AVAILABLE) delete n[k];
        else if (st === STATE.UNAVAILABLE) n[k] = STATE.UNAVAILABLE;
        else if (st === STATE.BUSY) n[k] = STATE.BUSY;
        return n;
      });

      if (resp?.unchanged && resp?.state === STATE.BUSY) {
        setFlash({ type: "err", text: "Date is already booked by admin." });
      } else {
        setFlash({ type: "ok", text: nextState === STATE.UNAVAILABLE ? "Day blocked." : "Day unblocked." });
      }
      // ressincroniza com o backend
      await loadFromServer();
    } catch {
      // rollback
      setAvail((m) => {
        const n = { ...m };
        if (cur) n[k] = cur; else delete n[k];
        return n;
      });
      setFlash({ type: "err", text: "Could not update this day." });
    } finally {
      setPending((s) => {
        const n = new Set(s); n.delete(k); return n;
      });
      window.clearTimeout(toggleDay._t || 0);
      toggleDay._t = window.setTimeout(() => setFlash(null), 2400);
    }
  };
  toggleDay._t = 0;

  /** Bulk / Smart Rules (sem BUSY; mantém BUSY existentes sem sobrescrever) */
  const applyBulk = async () => {
    if (!userId) return;
    const from = bulkFrom;
    const to = bulkTo;
    if (!from || !to) return;

    setBulkLoading(true);
    try {
      const weekdaysArg = bulkWeekdays.size ? Array.from(bulkWeekdays.values()) : [0,1,2,3,4,5,6];
      await AvApi.bulkSetAvailability({
        partnerId: userId,
        from,
        to,
        weekdays: weekdaysArg,
        state: bulkState,
        actor: "partner",
      });
      await loadFromServer();
      setShowBulk(false);
      setFlash({ type: "ok", text: "Smart rule applied." });
    } catch {
      setFlash({ type: "err", text: "Could not apply smart rule." });
    } finally {
      setBulkLoading(false);
      window.clearTimeout(applyBulk._t || 0);
      applyBulk._t = window.setTimeout(() => setFlash(null), 2400);
    }
  };
  applyBulk._t = 0;

  const matrix = useMemo(() => buildMonthMatrix(baseMonth), [baseMonth]);
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const monthTitle = monthFormatter.format(baseMonth);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayKey = ymd(new Date());

  return (
    <div className="cal-page">
      {/* Header */}
      <div className="cal-header">
        <div className="cal-title" title="Availability Calendar">
          <CalendarIcon size={16} />
          <span>Availability</span>
          {fetching && <span className="spinner" aria-label="Loading" />}
        </div>

        <div className="cal-legend" aria-label="Legend">
          {LEGEND.map(({ key, icon: Icon, className, label }) => (
            <span key={key} className={className} title={label} aria-label={label}>
              <Icon size={14} />
            </span>
          ))}
        </div>

        <div className="cal-actions">
          <button
            className="bulk-btn"
            onClick={() => setShowBulk(true)}
            title="Smart rules (every Monday, etc.)"
            type="button"
          >
            <Plus size={14} />
            <span className="btn-label">Smart rules</span>
          </button>
        </div>
      </div>

      {/* Toast (alto contraste) */}
      {flash && (
        <div role="alert" className={`cal-toast ${flash.type === "ok" ? "ok" : "err"}`}>
          <div className="cal-toast-ic">
            {flash.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          </div>
          <div className="cal-toast-text">{flash.text}</div>
          <button
            className="cal-toast-close"
            onClick={() => setFlash(null)}
            aria-label="Close notification"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Month bar */}
      <div className="cal-monthbar">
        <button
          className="nav-btn"
          onClick={() => setBaseMonth(addMonths(baseMonth, -1))}
          aria-label="Previous month"
          type="button"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="month-title" aria-live="polite">{monthTitle}</div>

        <button
          className="nav-btn"
          onClick={() => setBaseMonth(addMonths(baseMonth, +1))}
          aria-label="Next month"
          type="button"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday row */}
      <div className="cal-grid cal-grid-head">
        {weekdays.map((w) => (
          <div className="cell" key={w}>{w}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="cal-grid cal-grid-body">
        {matrix.map((c) =>
          c.type === "void" ? (
            <div className="cell void" key={c.key} aria-hidden="true" />
          ) : (
            (() => {
              const k = c.key;
              const st = avail[k] || STATE.AVAILABLE;
              const Icon = st === STATE.BUSY ? Lock : st === STATE.UNAVAILABLE ? X : Check;
              const isPending = pending.has(k);

              return (
                <button
                  key={k}
                  className={[
                    "cell","day",st, k === todayKey ? "today" : "", isPending ? "updating" : ""
                  ].join(" ")}
                  onClick={() => toggleDay(c.date)}
                  aria-label={`${k} – ${st}${isPending ? " (saving…)" : ""}`}
                  type="button"
                  disabled={st === STATE.BUSY || isPending}
                  title={st === STATE.BUSY ? "Booked by admin" : (isPending ? "Saving…" : undefined)}
                >
                  <div className="daytop">
                    <span className="num">{c.date.getDate()}</span>
                  </div>

                  <span
                    className={[
                      "state-icon",
                      st === STATE.BUSY ? "busy" : st === STATE.UNAVAILABLE ? "unavail" : "ok",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {isPending ? <span className="mini-spinner" /> : <Icon size={12} />}
                  </span>

                  <div className="dayfoot" />
                </button>
              );
            })()
          )
        )}
      </div>

      {/* Bulk / Smart Rules modal (somente Available/Unavailable) */}
      {showBulk && (
        <div className="cal-overlay" onClick={() => !bulkLoading && setShowBulk(false)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Smart rules</strong>
              <button className="icon-btn" onClick={() => setShowBulk(false)} aria-label="Close" type="button" disabled={bulkLoading}>
                <XCircle size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="field twocols">
                <div>
                  <label>From</label>
                  <input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} disabled={bulkLoading} />
                </div>
                <div>
                  <label>To</label>
                  <input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} disabled={bulkLoading} />
                </div>
              </div>

              <div className="field">
                <label>Apply on weekdays</label>
                <div className="weekdays">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
                    const on = bulkWeekdays.has(i);
                    return (
                      <button
                        key={d}
                        className={`wk ${on ? "on" : ""}`}
                        onClick={() => {
                          const next = new Set(bulkWeekdays);
                          on ? next.delete(i) : next.add(i);
                          setBulkWeekdays(next);
                        }}
                        type="button"
                        disabled={bulkLoading}
                        title="If none selected, all days will be used"
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <label>Set state</label>
                <div className="segmented">
                  <button
                    className={bulkState === STATE.AVAILABLE ? "on" : ""}
                    onClick={() => setBulkState(STATE.AVAILABLE)}
                    type="button"
                    title="Available"
                    disabled={bulkLoading}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className={bulkState === STATE.UNAVAILABLE ? "on" : ""}
                    onClick={() => setBulkState(STATE.UNAVAILABLE)}
                    type="button"
                    title="Unavailable"
                    disabled={bulkLoading}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-outline" onClick={() => setShowBulk(false)} type="button" disabled={bulkLoading}>Cancel</button>
                <button className="btn-primary" onClick={applyBulk} type="button" disabled={bulkLoading}>
                  {bulkLoading ? "Applying…" : "Apply rules"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
