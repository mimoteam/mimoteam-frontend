// src/pages/Capacity.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  X,
  Lock,
  Users as UsersIcon,
} from "lucide-react";
import "../styles/Capacity.css";

import * as UsersApi from "../api/users";
import * as AvApi from "../api/availability";

/* ===== Helpers ===== */
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};
const addDays = (date, nd) => {
  const d = new Date(date);
  d.setDate(d.getDate() + nd);
  return d;
};
const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const buildMonthMatrix = (date) => {
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
};

const STATE = {
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  BUSY: "busy",
};

const normalizeEntry = (val) => {
  if (!val) return { state: STATE.AVAILABLE, by: "partner" };
  if (typeof val === "string") {
    const s = val.toLowerCase().trim();
    if (s === STATE.UNAVAILABLE) return { state: STATE.UNAVAILABLE, by: "partner" };
    if (s === STATE.BUSY) return { state: STATE.BUSY, by: "unknown" };
    return { state: STATE.AVAILABLE, by: "partner" };
  }
  if (typeof val === "object") {
    const state = (val.state || "").toLowerCase();
    const by = (val.by || "unknown").toLowerCase();
    if ([STATE.AVAILABLE, STATE.UNAVAILABLE, STATE.BUSY].includes(state)) {
      return { state, by };
    }
  }
  return { state: STATE.AVAILABLE, by: "partner" };
};
const statusOf = (map, key) => normalizeEntry(map?.[key]).state;
const metaOf   = (map, key) => normalizeEntry(map?.[key]);

function getTeam(u) {
  return u?.team || u?.Team || u?.group || u?.Group || "";
}
function unifyTeam(t) {
  const v = String(t || "").trim();
  if (!v) return "";
  const lc = v.toLocaleLowerCase();
  if (lc === "us team" || lc === "us-team" || lc === "us") return "US TEAM";
  if (lc === "brazil team" || lc === "brazil-team" || lc === "brasil team") return "Brazil Team";
  return v;
}
function toTitleCase(input) {
  const s = String(input || "");
  const lower = s.toLocaleLowerCase();
  return lower.replace(/(^|[\s\-\/\.])([\p{L}])/gu, (_, sep, chr) => sep + chr.toLocaleUpperCase());
}
const MONTHS_EN = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const fmtMMMdd = (keyOrDate) => {
  const d = typeof keyOrDate === "string" ? new Date(keyOrDate) : keyOrDate;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(keyOrDate);
  return `${MONTHS_EN[dt.getMonth()]}/${pad2(dt.getDate())}`;
};

export default function Capacity() {
  const [partnersAll, setPartnersAll] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  /* ===== Carrega parceiros do backend ===== */
  useEffect(() => {
    (async () => {
      setLoadingUsers(true);
      try {
        const { items } = await UsersApi.fetchUsers({
          role: "partner",
          status: "active",
          page: 1,
          pageSize: 500,
        });
        const arr = (Array.isArray(items) ? items : []).map((u) => ({
          ...u,
          id: String(u.id || u._id || ""),
          fullName: u.fullName || u.name || u.login || u.email || "",
          team: unifyTeam(getTeam(u)),
        }));
        arr.sort((a, b) =>
          String(a.fullName || a.login || "").localeCompare(
            String(b.fullName || b.login || "")
          )
        );
        setPartnersAll(arr);
      } catch {
        // fallback vazio se backend off
        setPartnersAll([]);
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, []);

  // ===== Teams =====
  const BASE_TEAMS = ["All Teams", "US TEAM", "Brazil Team"];
  const teams = useMemo(() => {
    const extra = new Set();
    partnersAll.forEach((p) => {
      const t = unifyTeam(getTeam(p));
      if (t && !BASE_TEAMS.includes(t)) extra.add(t);
    });
    return [...BASE_TEAMS, ...Array.from(extra)];
  }, [partnersAll]);
  const displayTeam = (t) => (t === "US TEAM" ? "US TEAM" : toTitleCase(t));

  const [teamFilter, setTeamFilter] = useState("All Teams");
  const partnersFiltered = useMemo(() => {
    if (teamFilter === "All Teams") return partnersAll;
    return partnersAll.filter((p) => unifyTeam(getTeam(p)) === teamFilter);
  }, [partnersAll, teamFilter]);

  const [partnerId, setPartnerId] = useState("");
  useEffect(() => {
    if (!partnersFiltered.length) { setPartnerId(""); return; }
    if (!partnerId || !partnersFiltered.find((p) => p.id === partnerId)) {
      setPartnerId(partnersFiltered[0]?.id || "");
    }
  }, [partnersFiltered, partnerId]);

  /* ===== Disponibilidade ===== */
  const [baseMonth, setBaseMonth] = useState(monthStart(new Date()));
  const months = useMemo(
    () => [baseMonth, addMonths(baseMonth, 1), addMonths(baseMonth, 2)],
    [baseMonth]
  );
  const fmMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // disponibilidade do parceiro selecionado (calendários 3 meses)
  const [avail, setAvail] = useState({}); // { 'YYYY-MM-DD': 'busy'|'unavailable' } (available = ausência)
  const [loadingAvailSel, setLoadingAvailSel] = useState(false);

  const loadSelectedPartnerAvail = async () => {
    if (!partnerId) { setAvail({}); return; }
    // buscar do primeiro dia do mês base até o último dia do 3º mês
    const start = monthStart(baseMonth);
    const end = monthEnd(addMonths(baseMonth, 2));
    const from = ymd(start);
    const to = ymd(end);
    setLoadingAvailSel(true);
    try {
      const items = await AvApi.getAvailability(partnerId, from, to);
      const map = {};
      for (const it of items || []) {
        if (it?.date && (it.state === "busy" || it.state === "unavailable")) {
          // se backend retornar "by", podemos guardar objeto
          map[it.date] = it.by ? { state: it.state, by: it.by } : it.state;
        }
      }
      setAvail(map);
    } catch {
      setAvail({});
    } finally {
      setLoadingAvailSel(false);
    }
  };

  useEffect(() => { loadSelectedPartnerAvail(); }, [partnerId, baseMonth]);

  // mapa de disponibilidade para capacity (todos os parceiros filtrados num range rolante)
  const [rangeDays, setRangeDays] = useState(90);
  const nextDays = useMemo(() => {
    const arr = [];
    const start = new Date();
    for (let i = 0; i < rangeDays; i++) {
      const d = addDays(start, i);
      arr.push({ date: d, key: ymd(d) });
    }
    return arr;
  }, [rangeDays]);

  const [calByPartner, setCalByPartner] = useState({}); // { partnerId: { 'YYYY-MM-DD': 'busy'|'unavailable' } }
  const [loadingCap, setLoadingCap] = useState(false);

  const loadCapacityAvail = async () => {
    if (!partnersFiltered.length) { setCalByPartner({}); return; }
    const start = nextDays[0]?.key;
    const end = nextDays[nextDays.length - 1]?.key;
    if (!start || !end) { setCalByPartner({}); return; }

    setLoadingCap(true);
    try {
      // carrega em paralelo
      const results = await Promise.all(
        partnersFiltered.map(async (p) => {
          try {
            const items = await AvApi.getAvailability(p.id, start, end);
            const m = {};
            for (const it of items || []) {
              if (it?.date && (it.state === "busy" || it.state === "unavailable")) {
                m[it.date] = it.state; // não precisamos do "by" para capacidade
              }
            }
            return [p.id, m];
          } catch {
            return [p.id, {}];
          }
        })
      );
      const merged = {};
      results.forEach(([pid, m]) => { merged[pid] = m; });
      // mantém coerência com o selecionado
      if (partnerId) {
        merged[partnerId] = { ...(merged[partnerId] || {}), ...Object.fromEntries(Object.entries(avail).map(([k,v]) => [k, typeof v === 'string' ? v : v?.state])) };
      }
      setCalByPartner(merged);
    } finally {
      setLoadingCap(false);
    }
  };

  useEffect(() => { loadCapacityAvail(); }, [partnersFiltered, rangeDays]); // recarrega quando muda filtro/tamanho de janela

  /* ===== Seleção e ações do admin ===== */
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const selectedMeta = selectedDayKey ? metaOf(avail, selectedDayKey) : null;
  const selectedStatus = selectedMeta?.state || null;

  const onDayClick = (date) => {
    const k = ymd(date);
    setSelectedDayKey(k);
  };

  // Admin marca booked (by: 'admin') se não for indisponível
  const bookSelectedDay = async () => {
    if (!selectedDayKey || !partnerId) return;
    const cur = metaOf(avail, selectedDayKey);
    if (cur.state === STATE.UNAVAILABLE) return;

    // otimista
    setAvail((m) => ({ ...m, [selectedDayKey]: { state: STATE.BUSY, by: "admin" } }));
    setCalByPartner((m) => ({
      ...m,
      [partnerId]: { ...(m[partnerId] || {}), [selectedDayKey]: STATE.BUSY },
    }));

    try {
      await AvApi.setDayAvailability(partnerId, selectedDayKey, STATE.BUSY, "admin");
    } catch {
      // rollback simples
      setAvail((m) => {
        const n = { ...m };
        delete n[selectedDayKey];
        return n;
      });
      setCalByPartner((m) => {
        const n = { ...(m || {}) };
        if (n[partnerId]) {
          const mm = { ...n[partnerId] };
          delete mm[selectedDayKey];
          n[partnerId] = mm;
        }
        return n;
      });
    }
  };

  // Admin só remove booking que ELE mesmo fez → volta a AVAILABLE
  const unbookSelectedDay = async () => {
    if (!selectedDayKey || !partnerId) return;
    const cur = metaOf(avail, selectedDayKey);
    if (cur.state !== STATE.BUSY || cur.by !== "admin") return;

    // otimista
    setAvail((m) => {
      const n = { ...m };
      delete n[selectedDayKey];
      return n;
    });
    setCalByPartner((m) => {
      const n = { ...(m || {}) };
      if (n[partnerId]) {
        const mm = { ...n[partnerId] };
        delete mm[selectedDayKey];
        n[partnerId] = mm;
      }
      return n;
    });

    try {
      await AvApi.setDayAvailability(partnerId, selectedDayKey, STATE.AVAILABLE, "admin");
    } catch {
      // rollback
      setAvail((m) => ({ ...m, [selectedDayKey]: { state: STATE.BUSY, by: "admin" } }));
      setCalByPartner((m) => ({
        ...m,
        [partnerId]: { ...(m[partnerId] || {}), [selectedDayKey]: STATE.BUSY },
      }));
    }
  };

  // roster modal
  const [showRoster, setShowRoster] = useState(false);
  const [rosterDayKey, setRosterDayKey] = useState("");
  const openRosterForDay = (key) => { setRosterDayKey(key); setSelectedDayKey(key); setShowRoster(true); };
  const closeRoster = () => setShowRoster(false);
  const calOf = (pid) => (pid === partnerId ? avail : (calByPartner[pid] || {}));

  const setDayForPartner = async (pid, key, state) => {
    // otimista
    setCalByPartner((m) => ({
      ...m,
      [pid]: { ...(m[pid] || {}), ...(state === STATE.AVAILABLE ? {} : { [key]: state }) },
    }));
    if (pid === partnerId) {
      setAvail((m) => (state === STATE.AVAILABLE
        ? (() => { const n = { ...m }; delete n[key]; return n; })()
        : ({ ...m, [key]: { state, by: "admin" } })
      ));
    }
    try {
      await AvApi.setDayAvailability(pid, key, state, "admin");
    } catch {
      // rollback básico: recarrega janelas atuais
      if (pid === partnerId) await loadSelectedPartnerAvail();
      await loadCapacityAvail();
    }
  };

  /* ===== Capacity (agregação) ===== */
  const capacity = useMemo(() => {
    const result = {};
    const totalPartners = partnersFiltered.length;
    nextDays.forEach(({ key }) => {
      let available = 0, busy = 0, unavailable = 0;
      partnersFiltered.forEach((p) => {
        const cal = p.id === partnerId ? avail : (calByPartner[p.id] || {});
        const st = statusOf(cal, key);
        if (st === STATE.BUSY) busy += 1;
        else if (st === STATE.UNAVAILABLE) unavailable += 1;
        else available += 1;
      });
      result[key] = {
        available, busy, unavailable,
        total: totalPartners,
        ratio: totalPartners > 0 ? available / totalPartners : 0,
      };
    });
    return result;
  }, [nextDays, partnersFiltered, calByPartner, partnerId, avail]);

  // pagination (styled)
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [rangeDays, rowsPerPage, teamFilter, partnerId]);

  const totalRows = nextDays.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const idxStart = (page - 1) * rowsPerPage;
  const sliceDays = nextDays.slice(idxStart, idxStart + rowsPerPage);

  const capClass = (ratio) => {
    if (ratio >= 0.75) return "cap-high";
    if (ratio >= 0.5) return "cap-med";
    if (ratio >= 0.25) return "cap-low";
    return "cap-crit";
  };

  return (
    <div className="capacity-page">

      {/* Header */}
      <div className="cap-header">
        <div className="cap-title pill">
          <span className="cap-title-icon">
            <CalendarDays size={18} />
          </span>
          <span className="cap-title-text">
            Availability {loadingUsers || loadingCap ? "• syncing…" : ""}
          </span>
        </div>

        <div className="cap-controls">
          <div className="cap-select">
            <label htmlFor="teamSel">Team</label>
            <select id="teamSel" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              {teams.map((t) => (
                <option key={t} value={t}>{displayTeam(t)}</option>
              ))}
            </select>
          </div>

          <div className="cap-select">
            <label htmlFor="partnerSel">Partner</label>
            <select
              id="partnerSel"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              disabled={!partnersFiltered.length}
            >
              {partnersFiltered.map((p) => (
                <option key={p.id} value={p.id}>
                  {toTitleCase(p.fullName || p.login || p.email || p.id)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ==== 3 Calendars (90 days) ==== */}
      <div className="tri-head">
        <button
          className="nav-btn icon"
          onClick={() => setBaseMonth(addMonths(baseMonth, -3))}
          type="button"
          aria-label="Previous 3 months"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="tri-title">
          Next 90 days {loadingAvailSel ? "• loading…" : ""}
        </div>

        <button
          className="nav-btn icon"
          onClick={() => setBaseMonth(addMonths(baseMonth, +3))}
          type="button"
          aria-label="Next 3 months"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="tri-grid">
        {months.map((m) => {
          const matrix = buildMonthMatrix(m);
          const monthTitle = fmMonth.format(m);
          return (
            <div className="month-card" key={m.toISOString()}>
              <div className="month-title">{monthTitle}</div>
              <div className="cal-grid cal-grid-head">
                {weekdays.map((w) => (<div className="cell" key={w}>{w}</div>))}
              </div>
              <div className="cal-grid cal-grid-body">
                {matrix.map((c) =>
                  c.type === "void" ? (
                    <div className="cell void" key={c.key} aria-hidden="true" />
                  ) : (() => {
                      const k = c.key;
                      const meta = metaOf(avail, k);
                      const st = meta.state;
                      const isSelected = k === selectedDayKey;
                      const Icon = st === STATE.BUSY ? Lock : st === STATE.UNAVAILABLE ? X : Check;
                      return (
                        <button
                          key={k}
                          className={[
                            "cell","day",st,
                            k === ymd(new Date()) ? "today" : "",
                            isSelected ? "selected" : ""
                          ].join(" ")}
                          onClick={() => onDayClick(c.date)} // apenas seleciona
                          aria-label={`${k} – ${st}${meta.by ? ` (${meta.by})` : ""}`}
                          aria-pressed={isSelected}
                          type="button"
                        >
                          <div className="daytop">
                            <span className="num">{c.date.getDate()}</span>
                          </div>
                          <span
                            className={[
                              "state-icon",
                              st === STATE.BUSY ? "busy" : st === STATE.UNAVAILABLE ? "unavail" : "ok"
                            ].join(" ")}
                            aria-hidden="true"
                            title={meta.by ? `by ${meta.by}` : ""}
                          >
                            <Icon size={12} />
                          </span>
                          <div className="dayfoot" />
                        </button>
                      );
                    })()
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="cap-actions">
        <button
          className="btn-primary btn btn--primary"
          type="button"
          disabled={
            !selectedDayKey ||
            !partnerId ||
            selectedStatus === STATE.UNAVAILABLE ||
            selectedStatus === STATE.BUSY
          }
          onClick={bookSelectedDay}
          title="Book selected date"
        >
          <Lock size={14} /><span>Book date</span>
        </button>
        <button
          className="btn-outline btn btn--outline"
          type="button"
          disabled={
            !selectedDayKey ||
            !partnerId ||
            selectedStatus !== STATE.BUSY ||
            (selectedMeta?.by !== "admin")
          }
          onClick={unbookSelectedDay}
          title="Unbook selected date"
        >
          <X size={14} /><span>Unbook</span>
        </button>
      </div>

      {/* ==== Capacity Overview ==== */}
      <div className="cap-overview">
        <div className="ov-header">
          <div className="ov-title"><UsersIcon size={16} /><span>Capacity Overview</span></div>
          <div className="range-switch">
            {[15, 30, 60, 90, 120].map((n) => (
              <button key={n} type="button" className={`chip ${rangeDays === n ? "on" : ""}`} onClick={() => setRangeDays(n)}>
                Next {n}d
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        {(() => {
          let av = 0, bz = 0, un = 0;
          const totalDays = nextDays.length;
          nextDays.forEach(({ key }) => {
            const c = capacity[key] || { available: 0, busy: 0, unavailable: 0 };
            av += c.available; bz += c.busy; un += c.unavailable;
          });
          const teamSize = partnersFiltered.length || 1;
          const pct = totalDays > 0 ? Math.round(((av / totalDays) / teamSize) * 100) : 0;

          return (
            <div className="stat-cards">
              <div className="stat-card ok"><div className="sc-value">{av}</div><div className="sc-label">Available slots (sum)</div></div>
              <div className="stat-card busy"><div className="sc-value">{bz}</div><div className="sc-label">Booked (sum)</div></div>
              <div className="stat-card unavail"><div className="sc-value">{un}</div><div className="sc-label">Unavailable (sum)</div></div>
              <div className="stat-card pct"><div className="sc-value">{pct}%</div><div className="sc-label">Avg. availability</div></div>
            </div>
          );
        })()}

        {/* Heat strip */}
        <div className="heat-strip" aria-label="Daily capacity">
          {nextDays.map(({ key }) => {
            const c = capacity[key]; const ratio = c?.ratio ?? 0;
            const cls = capClass(ratio);
            const label = `${fmtMMMdd(key)} • ${c?.available || 0}/${c?.total || 0} free`;
            return (
              <button
                key={key}
                className={`hs-cell ${cls}`}
                title={label}
                onClick={() => setPage(Math.max(1, Math.ceil((nextDays.findIndex(d => d.key === key)+1)/rowsPerPage)))}
                type="button"
              />
            );
          })}
        </div>

        {/* Table */}
        <div className="ov-table-wrap">
          <div className="ov-table-title">
            Capacity per day {loadingCap ? "• loading…" : ""}
          </div>
          <div className="ov-table-scroll">
            <table className="ov-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>TOTAL PARTNERS</th>
                  <th>AVAILABLE</th>
                  <th>BOOKED</th>
                  <th>VIEW</th>
                </tr>
              </thead>
              <tbody>
                {sliceDays.map(({ key }) => {
                  const c = capacity[key] || { total: 0, available: 0, busy: 0 };
                  const low = c.available < 2;
                  return (
                    <tr key={key} className={low ? "row-low" : ""}>
                      <td className="td-date">{fmtMMMdd(key)}</td>
                      <td className="td-center"><span className="badge total">{c.total}</span></td>
                      <td className="td-center"><span className={`badge ${low ? "ok low-blink" : "ok"}`}>{c.available}</span></td>
                      <td className="td-center"><span className="badge busy">{c.busy}</span></td>
                      <td className="td-center">
                        <button
                          className="mini-btn btn btn--outline btn--sm"
                          onClick={() => openRosterForDay(key)}
                          type="button"
                          title="View available partners for this day"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!sliceDays.length && (
                  <tr><td colSpan={5} className="td-empty">No data for the selected range.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pager">
            <div className="pager-left">
              <span className="pager-info">
                Showing <strong>{idxStart + 1}</strong>–<strong>{Math.min(idxStart + rowsPerPage, totalRows)}</strong> of <strong>{totalRows}</strong> days
              </span>
              <label className="rowsel">
                Rows:
                <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))}>
                  {[10, 15, 20, 30, 60].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="pager-buttons">
              <button
                className="pg-btn icon"
                onClick={() => setPage(1)}
                disabled={page === 1}
                type="button"
                aria-label="First page"
              >
                <ChevronsLeft size={18} />
              </button>
              <button
                className="pg-btn icon"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                type="button"
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>

              <span className="pg-sep">Page <b>{page}</b> / {totalPages}</span>

              <button
                className="pg-btn icon"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                type="button"
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="pg-btn icon"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                type="button"
                aria-label="Last page"
              >
                <ChevronsRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Roster ===== */}
      {showRoster && (
        <div className="cap-overlay" onClick={closeRoster}>
          <div className="cap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>
                Available partners — {fmtMMMdd(rosterDayKey)}
              </strong>
              <button className="icon-btn" onClick={closeRoster} type="button" aria-label="Close">✕</button>
            </div>

            <div className="modal-body">
              {(() => {
                const availPartners = partnersFiltered.filter((p) => {
                  const st = statusOf(calOf(p.id), rosterDayKey);
                  return st === STATE.AVAILABLE;
                });

                if (!availPartners.length) {
                  return (
                    <div className="ro-empty">
                      No available partners for {fmtMMMdd(rosterDayKey)}.
                    </div>
                  );
                }

                return availPartners.map((p) => (
                  <div key={p.id} className="ro-row available">
                    <div className="ro-name">
                      <span className="ro-dot" />
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {toTitleCase(p.fullName || p.login || p.email || p.id)}
                        </div>
                        <div className="ro-team">{displayTeam(unifyTeam(getTeam(p)) || "Unassigned")}</div>
                      </div>
                    </div>

                    <div className="btn-group">
                      <button
                        className="btn btn--primary btn--sm"
                        type="button"
                        onClick={() => setDayForPartner(p.id, rosterDayKey, STATE.BUSY)}
                        title="Book this partner for the selected day"
                      >
                        Book
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
