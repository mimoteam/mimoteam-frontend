// src/api/useFinanceData.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./http"; // ← caminho correto (mesma pasta)

const PAYMENTS_KEY = "payments_v1";
const SERVICES_KEY = "services_store_v1";

/* =================== Helpers de datas =================== */
export function getPaymentWeek(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay();
  const toWed = (dow >= 3) ? (dow - 3) : (dow + 4);
  const start = new Date(d); start.setDate(d.getDate() - toWed); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end, key: weekKey(start) };
}
export function weekKey(startDate) {
  const y = startDate.getFullYear();
  const jan1 = new Date(y,0,1);
  const diffDays = Math.floor((startDate - jan1)/86400000);
  const wk = Math.ceil((diffDays + jan1.getDay() + 1)/7);
  return `${y}-W${String(wk).padStart(2,'0')}`;
}
export function isWithinISO(iso, fromIso, toIso){
  if(!iso) return false; const t = new Date(iso).getTime();
  const f = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const tt = toIso ? new Date(toIso).getTime() : Infinity;
  return t>=f && t<=tt;
}
export function toMoney(n){ return `$${Number(n||0).toFixed(2)}`; }
export function fmtDate(ts){ if(!ts) return '—'; const d = new Date(ts); return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'}); }
export function fmtDateTime(ts){ if(!ts) return '—'; const d = new Date(ts); return d.toLocaleString('en-US',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
export function yyyymm(date){ const y=date.getFullYear(); const m=String(date.getMonth()+1).padStart(2,'0'); return `${y}-${m}`; }
export function sameYYYYMM(iso, ym){ if(!iso||!ym) return false; const d=new Date(iso); const [y,m]=ym.split('-').map(Number); return d.getFullYear()===y && (d.getMonth()+1)===m; }
export function addDaysISO(iso, days){ const d = new Date(iso); d.setDate(d.getDate()+days); return d.toISOString(); }

/* ===== Semanas do mês (start na quarta) ===== */
export function weeksForMonth(ym){
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

/* =================== Storage (fallback) =================== */
function readPayments(){
  try{ const raw=localStorage.getItem(PAYMENTS_KEY); const arr=JSON.parse(raw||'[]'); return Array.isArray(arr)?arr:[]; }
  catch{ return []; }
}
function writePayments(arr){
  try{ localStorage.setItem(PAYMENTS_KEY, JSON.stringify(arr)); } catch {}
}
function readServices(){
  try{
    const raw = localStorage.getItem(SERVICES_KEY);
    const arr = JSON.parse(raw||'[]');
    const rehydrated = (Array.isArray(arr)?arr:[]).map(s=>{
      let st = s.serviceType;
      if(st && !st.name && s.serviceTypeId){ st = { id: s.serviceTypeId, name: s.serviceTypeId }; }
      return { ...s, serviceType: st };
    });
    return rehydrated;
  }catch{ return []; }
}
function writeServices(arr){
  try{ localStorage.setItem(SERVICES_KEY, JSON.stringify(arr)); } catch {}
}

/* =================== Normalizadores de backend =================== */
function normalizeList(res){
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.data)) return res.data;
  return [];
}
function _mergeServiceIdsLegacy(p){
  const set = new Set();
  const add = (v)=> {
    const s = String((v && (v._id||v.id||v.serviceId||v.service||v)) || '').trim();
    if(s) set.add(s);
  };
  if (Array.isArray(p.serviceIds)) p.serviceIds.forEach(add);
  if (Array.isArray(p.items))      p.items.forEach(add);
  if (Array.isArray(p.services))   p.services.forEach(add);
  return Array.from(set);
}
function normalizePayment(p){
  const status = String(p.status || p.state || '').toUpperCase();
  const totalValue = (typeof p.total === 'number' ? p.total
                     : (typeof p.totalAmount === 'number' ? p.totalAmount : 0));
  return {
    id: p.id || p._id || p.paymentId || `${p.partnerId || 'p'}_${p.weekStart || p.createdAt || Date.now()}`,
    partnerId: p.partnerId || p.userId || p.partner?.id || p.partner?._id,
    partnerName: p.partnerName || p.partner?.name || p.partner?.fullName || '—',
    weekStart: p.weekStart || p.period?.start || p.periodFrom || p.createdAt || null,
    weekEnd:   p.weekEnd   || p.period?.end   || p.periodTo   || null,
    serviceIds: _mergeServiceIdsLegacy(p),
    total: Number(totalValue || 0),
    status: status, // SHARED | APPROVED | PAID ...
    paidAt: p.paidAt || null,
  };
}
function normalizeService(s){
  return {
    id: s.id || s._id,
    firstName: s.firstName, lastName: s.lastName,
    serviceDate: s.serviceDate || s.date || s.when,
    serviceType: s.serviceType?.name ? s.serviceType : (s.serviceTypeId ? { id: s.serviceTypeId, name: s.serviceTypeId } : s.serviceType || null),
    park: s.park, team: s.team, guests: s.guests, hopper: s.hopper,
    finalValue: Number(s.finalValue ?? s.value ?? s.amount ?? 0),
  };
}

/* =================== Hook principal =================== */
export function useFinanceData() {
  const [payments, setPayments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(false);

  const serviceById = useMemo(()=>{
    const map = new Map();
    (services||[]).forEach(s=> map.set(s.id, s));
    return map;
  },[services]);

  const reload = useCallback(async ()=>{
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api('/payments?all=1&sortBy=weekStart&sortDir=desc', { method: 'GET' }),
        api('/services?page=1&pageSize=5000', { method: 'GET' }),
      ]);
      const pList = normalizeList(pRes).map(normalizePayment);
      const sList = normalizeList(sRes).map(normalizeService);
      setPayments(pList);
      setServices(sList);
      writePayments(pList);
      writeServices(sList);
    } catch {
      // fallback local
      setPayments(readPayments());
      setServices(readServices());
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(()=>{ reload(); },[reload]);

  return { loading, payments, services, serviceById, reload };
}

/* =================== Hook de paginação (opcional) =================== */
export function usePagination(rows, pageSizeDefault = 10){
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  useEffect(()=>{ setPage(1); }, [pageSize, rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pageRows = useMemo(()=> rows.slice(startIndex, startIndex + pageSize), [rows, startIndex, pageSize]);
  return { page, setPage, pageSize, setPageSize, totalPages, pageRows, startIndex };
}
