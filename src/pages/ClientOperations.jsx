// src/pages/ClientOperations.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useFinanceData } from "../api/useFinanceData.js";
import "../styles/pages/ClientOperations.css";
import { SectionWeeklyClientCosts } from "./parts.jsx";

/* ===== Helpers (iguais ao FinanceCenter) ===== */
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
function sameYYYYMM(iso, ym) {
  if (!iso || !ym) return false;
  const d = new Date(iso);
  const [y, m] = ym.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m;
}
function isWithinISO(iso, fromIso, toIso){
  if(!iso) return false; const t = new Date(iso).getTime();
  const f = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const tt = toIso ? new Date(toIso).getTime() : Infinity;
  return t>=f && t<=tt;
}
function weeksForMonth(ym){
  if(!ym) return [];
  const [y,m] = ym.split('-').map(Number);
  const first = new Date(y, m-1, 1);
  const last  = new Date(y, m, 0);
  const map = new Map();
  for(let d = new Date(first); d <= last; d.setDate(d.getDate()+1)){
    const w = getPaymentWeek(d);
    const startIso = w.start.toISOString();
    if(sameYYYYMM(startIso, ym) && !map.has(w.key)){
      map.set(w.key, { key: w.key, start: startIso, end: w.end.toISOString() });
    }
  }
  return Array.from(map.values()).sort((a,b)=> new Date(a.start) - new Date(b.start));
}

/* ===== Normalização e chaves robustas para agrupar clientes/serviços ===== */
function cleanName(s){
  return String(s||"")
    .normalize("NFD").replace(/\p{Diacritic}/gu,"")
    .toLowerCase().replace(/[^a-z\s]/g," ")
    .replace(/\s+/g," ").trim();
}
function titleCase(s){
  const t = cleanName(s);
  if(!t) return "—";
  return t.split(" ").map(p => p[0]?.toUpperCase() + p.slice(1)).join(" ");
}
/** Chave estável para "mesmo cliente": sobrenome + inicial do primeiro nome */
function nameKey(raw){
  const c = cleanName(raw);
  if(!c) return "";
  const parts = c.split(" ");
  if(parts.length >= 2){
    const last = parts[parts.length-1];
    const firstInitial = parts[0][0] || "";
    return `${last}|${firstInitial}`; // ex: "amora|a"
  }
  return c; // nome com 1 parte
}
/** Chave do serviço para deduplicar quando aparece em múltiplos pagamentos */
function serviceKey(s){
  return (
    s?.id || s?._id ||
    `${cleanName(`${s?.firstName||""} ${s?.lastName||""}`)}|${(s?.serviceDate||"").slice(0,10)}|${cleanName(s?.serviceType?.name||"")}|${Number(s?.finalValue||0)}`
  );
}

export default function ClientOperations() {
  const { payments, services, loading } = useFinanceData();

  const [sumMonth, setSumMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [sumWeekKey, setSumWeekKey] = useState("");

  const serviceById = useMemo(() => {
    const map = new Map();
    (services || []).forEach(s => map.set(s.id, s));
    return map;
  }, [services]);

  const sumWeeksOptions = useMemo(() => weeksForMonth(sumMonth), [sumMonth]);

  useEffect(() => {
    if (sumWeeksOptions.length === 0) { setSumWeekKey(""); return; }
    const todayW = getPaymentWeek(new Date()).key;
    const preferred = sumWeeksOptions.find(w => w.key === todayW) || sumWeeksOptions[0];
    setSumWeekKey(prev => sumWeeksOptions.some(w => w.key === prev) ? prev : preferred.key);
  }, [sumMonth, sumWeeksOptions]);

  const selectedSumWeek = useMemo(
    () => sumWeeksOptions.find(w => w.key === sumWeekKey) || null,
    [sumWeeksOptions, sumWeekKey]
  );
  const weekStartISO = selectedSumWeek?.start || null;
  const weekEndISO = useMemo(() => {
    if (!selectedSumWeek?.start) return null;
    const ws = new Date(selectedSumWeek.start);
    const we = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23,59,59,999);
    return we.toISOString();
  }, [selectedSumWeek]);

  /* ===== Agrupamento por cliente na semana, com dedupe de serviços ===== */
  const weeklyClientSummary = useMemo(() => {
    if (!weekStartISO || !weekEndISO) return [];

    const byClient = new Map();     // key -> { client, total, services[] }
    const nameVotes = new Map();    // key -> Map(displayName -> count)
    const seen = new Set();         // dedupe de serviços

    const addLine = (s) => {
      if(!s) return;
      const sk = serviceKey(s);
      if(seen.has(sk)) return;      // já somado em outro pagamento
      seen.add(sk);

      const rawName = `${s.firstName || ""} ${s.lastName || ""}`.trim() || "—";
      const k = nameKey(rawName) || `unknown:${sk}`;

      const amount = Number(s.finalValue || 0);
      const cur = byClient.get(k) || { client: rawName || "—", total: 0, services: [] };
      cur.total += amount;
      cur.services.push(s);

      // escolhe o melhor display name (mais frequente; empate → o mais longo)
      if(rawName){
        if(!nameVotes.has(k)) nameVotes.set(k, new Map());
        const votes = nameVotes.get(k);
        votes.set(rawName, (votes.get(rawName) || 0) + 1);

        let best = cur.client;
        let bestCnt = votes.get(best) || 0;
        votes.forEach((cnt, nm) => {
          if (cnt > bestCnt || (cnt === bestCnt && nm.length > best.length)) {
            best = nm; bestCnt = cnt;
          }
        });
        cur.client = titleCase(best);
      } else {
        cur.client = "—";
      }

      byClient.set(k, cur);
    };

    (payments || []).forEach(p => {
      const anchor = p.weekStart || p.createdAt;
      if (!anchor || !isWithinISO(anchor, weekStartISO, weekEndISO)) return;

      // via ids (preferencial)
      (p.serviceIds || []).forEach(id => {
        const s = serviceById.get(id);
        if (s) addLine(s);
      });

      // fallback: serviços embutidos no próprio pagamento
      (Array.isArray(p.services) ? p.services : []).forEach(addLine);
    });

    return Array.from(byClient.values()).sort((a, b) => b.total - a.total);
  }, [payments, serviceById, weekStartISO, weekEndISO]);

  return (
    <div className="finance-page finance-ops">
      <div className="fin-actions">
        <div className="fin-inline" style={{ gap: 12, flexWrap: "wrap" }}>
          <span>Month:</span>
          <input type="month" value={sumMonth} onChange={(e) => setSumMonth(e.target.value)} />
          <span>Week (Wed→Tue):</span>
          <select
            value={sumWeekKey}
            onChange={(e) => setSumWeekKey(e.target.value)}
            disabled={weeksForMonth(sumMonth).length === 0}
            style={{ minWidth: 280 }}
          >
            {weeksForMonth(sumMonth).length === 0 && <option value="">No weeks</option>}
            {weeksForMonth(sumMonth).map(w => (
              <option key={w.key} value={w.key}>
                {new Date(w.start).toLocaleDateString()} — {new Date(w.end).toLocaleDateString()} ({w.key})
              </option>
            ))}
          </select>
          {loading && <span className="kpi-title" style={{ fontWeight: 700 }}>Loading…</span>}
        </div>
      </div>

      <SectionWeeklyClientCosts rows={weeklyClientSummary} />
    </div>
  );
}
