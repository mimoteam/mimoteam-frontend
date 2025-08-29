// src/pages/FinanceCenter.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CalendarDays, DollarSign, Users, Calendar, ArrowRight } from 'lucide-react';
import FinanceDashboard from './FinanceDashboard.jsx';
import FinanceProfile from './FinanceProfile.jsx';
import "../styles/FinanceCenter.css";
import { api } from '../api/http'; // <<< backend

const PAYMENTS_KEY = 'payments_v1';
const SERVICES_KEY = 'services_store_v1';

/* =================== Helpers de datas =================== */
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
function isWithinISO(iso, fromIso, toIso){
  if(!iso) return false; const t = new Date(iso).getTime();
  const f = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const tt = toIso ? new Date(toIso).getTime() : Infinity;
  return t>=f && t<=tt;
}
function toMoney(n){ return `$${Number(n||0).toFixed(2)}`; }
function toCost(n){ const v = Math.abs(Number(n||0)); return `-$${v.toFixed(2)}`; }
function fmtDate(ts){ if(!ts) return '—'; const d = new Date(ts); return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'}); }
function fmtDateTime(ts){ if(!ts) return '—'; const d = new Date(ts); return d.toLocaleString('en-US',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function yyyymm(date){ const y=date.getFullYear(); const m=String(date.getMonth()+1).padStart(2,'0'); return `${y}-${m}`; }
function sameYYYYMM(iso, ym){ if(!iso||!ym) return false; const d=new Date(iso); const [y,m]=ym.split('-').map(Number); return d.getFullYear()===y && (d.getMonth()+1)===m; }
function addDaysISO(iso, days){
  const d = new Date(iso); d.setDate(d.getDate()+days); return d.toISOString();
}

/* ===== Semanas do mês (start na quarta) ===== */
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

/* =================== Normalizadores de backend =================== */
function normalizeList(res){
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

function normalizePayment(p){
  // garantias básicas de campos usados na UI
  const status = String(p.status || p.state || '').toUpperCase();
  return {
    id: p.id || p._id || p.paymentId || `${p.partnerId || 'p'}_${p.weekStart || p.createdAt || Date.now()}`,
    partnerId: p.partnerId || p.userId || p.partner?.id,
    partnerName: p.partnerName || p.partner?.name || p.partner?.fullName || '—',
    weekStart: p.weekStart || p.period?.start || p.periodFrom || p.createdAt || null,
    weekEnd:   p.weekEnd   || p.period?.end   || p.periodTo   || null,
    serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds
               : Array.isArray(p.services) ? p.services.map((s)=> s.id || s._id).filter(Boolean)
               : [],
    total: Number(p.total ?? p.amount ?? 0),
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

/* =================== UI helpers =================== */
function usePagination(rows, pageSizeDefault = 10){
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  useEffect(()=>{ setPage(1); }, [pageSize, rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pageRows = useMemo(()=> rows.slice(startIndex, startIndex + pageSize), [rows, startIndex, pageSize]);
  return { page, setPage, pageSize, setPageSize, totalPages, pageRows, startIndex };
}

function Pagination({ page, setPage, totalPages }){
  return (
    <div className="pagination-controls" style={{ display:'flex', alignItems:'center', gap:8 }}>
      <button className="pg-btn" onClick={()=>setPage(1)} disabled={page===1}>«</button>
      <button className="pg-btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>‹</button>
      <span className="muted" style={{minWidth:70, textAlign:'center'}}>Page {page}/{totalPages}</span>
      <button className="pg-btn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>›</button>
      <button className="pg-btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>»</button>
    </div>
  );
}

/* =================== Componente principal =================== */
export default function FinanceCenter(){
  const [tab, setTab] = useState('dashboard'); // dashboard | costs | profile | weekly
  const [month, setMonth] = useState(yyyymm(new Date()));

  // Weekly (página dedicada)
  const [sumMonth, setSumMonth] = useState(yyyymm(new Date()));
  const [sumWeekKey, setSumWeekKey] = useState('');

  const [open, setOpen] = useState(()=>new Set());
  const [payments, setPayments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(false);

  /* ---------- Carrega do backend (com fallback LS) ---------- */
  async function loadFromBackend(){
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api('/payments', { method: 'GET' }),
        api('/services', { method: 'GET' }),
      ]);
      const pList = normalizeList(pRes).map(normalizePayment);
      const sList = normalizeList(sRes).map(normalizeService);

      setPayments(pList);
      setServices(sList);

      // cache local leve (opcional)
      try { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(pList)); } catch {}
      try { localStorage.setItem(SERVICES_KEY, JSON.stringify(sList)); } catch {}
    } catch {
      // fallback local
      setPayments(readPayments());
      setServices(readServices());
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{
    loadFromBackend();
    const onStorage=(e)=>{
      if(e.key===PAYMENTS_KEY) setPayments(readPayments());
      if(e.key===SERVICES_KEY) setServices(readServices());
    };
    window.addEventListener('storage', onStorage);
    return ()=>window.removeEventListener('storage', onStorage);
  },[]);

  const serviceById = useMemo(()=>{
    const map = new Map();
    (services||[]).forEach(s=> map.set(s.id, s));
    return map;
  },[services]);

  // ===== Status queries =====
  const approvedAll = useMemo(()=>{
    return payments
      .filter(p => (p.status||'').toUpperCase()==='APPROVED')
      .filter(p => p.weekStart ? sameYYYYMM(p.weekStart, month) : (p.createdAt? sameYYYYMM(p.createdAt, month) : true))
      .sort((a,b)=> new Date(b.weekStart||b.createdAt||0) - new Date(a.weekStart||a.createdAt||0));
  },[payments, month]);

  const sharedAll = useMemo(()=>{
    return payments
      .filter(p => (p.status||'').toUpperCase()==='SHARED' || (p.status||'').toUpperCase()==='AWAITING')
      .filter(p => p.weekStart ? sameYYYYMM(p.weekStart, month) : (p.createdAt? sameYYYYMM(p.createdAt, month) : true))
      .sort((a,b)=> new Date(b.weekStart||b.createdAt||0) - new Date(a.weekStart||a.createdAt||0));
  },[payments, month]);

  const paidAll = useMemo(()=>{
    return payments
      .filter(p => (p.status||'').toUpperCase()==='PAID')
      .filter(p => p.paidAt ? sameYYYYMM(p.paidAt, month) : (p.weekStart? sameYYYYMM(p.weekStart, month) : true))
      .sort((a,b)=> new Date(b.paidAt||b.weekStart||0) - new Date(a.paidAt||a.weekStart||0));
  },[payments, month]);

  // ===== Paginações =====
  const approvedPag = usePagination(approvedAll, 5);
  const sharedPag   = usePagination(sharedAll, 10);
  const paidPag     = usePagination(paidAll, 10);

  // ===== Weekly (página e seção) =====
  const sumWeeksOptions = useMemo(()=> weeksForMonth(sumMonth), [sumMonth]);
  useEffect(()=>{
    if(sumWeeksOptions.length===0){ setSumWeekKey(''); return; }
    const todayW = getPaymentWeek(new Date()).key;
    const preferred = sumWeeksOptions.find(w => w.key===todayW) || sumWeeksOptions[0];
    setSumWeekKey(prev => sumWeeksOptions.some(w => w.key===prev) ? prev : preferred.key);
  },[sumMonth, sumWeeksOptions]);

  const selectedSumWeek = useMemo(()=> sumWeeksOptions.find(w=>w.key===sumWeekKey) || null, [sumWeeksOptions, sumWeekKey]);
  const weekStartISO = selectedSumWeek?.start || null;
  const weekEndISO = useMemo(()=>{
    if(!selectedSumWeek?.start) return null;
    const ws = new Date(selectedSumWeek.start);
    const we = new Date(ws); we.setDate(ws.getDate()+6); we.setHours(23,59,59,999);
    return we.toISOString();
  },[selectedSumWeek]);

  const weeklyClientSummary = useMemo(()=>{
    if(!weekStartISO || !weekEndISO) return [];
    const byClient = new Map();
    (payments||[]).forEach(p=>{
      const anchor = p.weekStart || p.createdAt;
      if(!anchor) return;
      if(!isWithinISO(anchor, weekStartISO, weekEndISO)) return;
      (p.serviceIds||[]).forEach(sid=>{
        const s = serviceById.get(sid);
        if(!s) return;
        const client = `${s.firstName||''} ${s.lastName||''}`.trim() || '—';
        const amount = Number(s.finalValue||0);
        if(!byClient.has(client)) byClient.set(client, { client, total:0, services: [] });
        byClient.get(client).total += amount;
        byClient.get(client).services.push(s);
      });
    });
    return Array.from(byClient.values()).sort((a,b)=> b.total - a.total);
  },[payments, serviceById, weekStartISO, weekEndISO]);

  function toggle(id){ setOpen(prev=>{ const nx=new Set(prev); nx.has(id)?nx.delete(id):nx.add(id); return nx; }); }

  /* ====== ACTIONS (com backend + fallback) ====== */
  async function markAsPaid(paymentId){
    // otimismo UI
    setPayments(prev => {
      const next = prev.map(p => p.id === paymentId ? { ...p, status: 'PAID', paidAt: new Date().toISOString() } : p);
      writePayments(next);
      return next;
    });

    // tenta múltiplas rotas comuns
    try {
      try {
        await api(`/payments/${paymentId}`, { method: 'PATCH', body: { status: 'PAID', paidAt: new Date().toISOString() } });
      } catch {
        await api(`/payments/${paymentId}/mark-paid`, { method: 'POST' });
      }
      await loadFromBackend();
    } catch {
      // se falhar, mantém cache local já atualizado
    }
  }

  async function moveSharedToNextWeek(paymentId){
    let patch = null;
    setPayments(prev=>{
      const next = prev.map(p=>{
        if(p.id !== paymentId) return p;
        const ws = p.weekStart ? addDaysISO(p.weekStart, 7) : null;
        const we = p.weekEnd ? addDaysISO(p.weekEnd, 7) : null;
        patch = { weekStart: ws, weekEnd: we };
        return { ...p, ...patch };
      });
      writePayments(next);
      return next;
    });

    try {
      await api(`/payments/${paymentId}`, { method: 'PATCH', body: patch || {} });
      await loadFromBackend();
    } catch {
      // mantém somente o local se der erro
    }
  }

  return (
    <div className="finance-page">
      {/* TABS */}
      <div className="fin-tabs">
        <button className={`fin-tab ${tab==='dashboard'?'active':''}`} onClick={()=>setTab('dashboard')}>Dashboard</button>
        <button className={`fin-tab ${tab==='costs'?'active':''}`} onClick={()=>setTab('costs')}>Costs</button>
        <button className={`fin-tab ${tab==='weekly'?'active':''}`} onClick={()=>setTab('weekly')}>Weekly</button>
        <button className={`fin-tab ${tab==='profile'?'active':''}`} onClick={()=>setTab('profile')}>Profile</button>
      </div>

      {/* CONTENT */}
      {tab === 'dashboard' && <FinanceDashboard />}

      {tab === 'profile' && <FinanceProfile />}

      {tab === 'weekly' && (
        <>
          <div className="fin-actions">
            <div className="fin-inline" style={{ gap: 12, flexWrap:'wrap' }}>
              <span>Month:</span>
              <input type="month" value={sumMonth} onChange={(e)=>setSumMonth(e.target.value)} />
              <span>Week (Wed→Tue):</span>
              <select value={sumWeekKey} onChange={(e)=>setSumWeekKey(e.target.value)} disabled={weeksForMonth(sumMonth).length===0} style={{ minWidth: 280 }}>
                {weeksForMonth(sumMonth).length===0 && <option value="">No weeks</option>}
                {weeksForMonth(sumMonth).map(w=>(
                  <option key={w.key} value={w.key}>
                    {new Date(w.start).toLocaleDateString()} — {new Date(w.end).toLocaleDateString()} ({w.key})
                  </option>
                ))}
              </select>
              {weekStartISO && weekEndISO && (
                <span className="wk-pill"><Calendar size={14}/> {fmtDate(weekStartISO)} — {fmtDate(weekEndISO)}</span>
              )}
              {loading && <span className="kpi-title" style={{fontWeight:700}}>Loading…</span>}
            </div>
          </div>
          <SectionWeeklyClientCosts rows={weeklyClientSummary} />
        </>
      )}

      {tab === 'costs' && (
        <>
          {/* Filtros */}
          <div className="fin-actions">
            <div className="fin-inline" style={{ gap: 12, flexWrap:'wrap' }}>
              <span>Filter by month:</span>
              <input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} />
              {loading && <span className="kpi-title" style={{fontWeight:700}}>Loading…</span>}
            </div>
          </div>

          {/* To be Paid (APPROVED) */}
          <SectionStatus
            title="To be Paid"
            tagClass="tag--approved"
            rows={approvedPag.pageRows}
            totalCount={approvedAll.length}
            page={approvedPag.page}
            totalPages={approvedPag.totalPages}
            onPage={approvedPag.setPage}
            serviceById={serviceById}
            open={open}
            onToggle={toggle}
            statusLabel="APPROVED"
            onMarkPaid={markAsPaid}
          />

          {/* Awaiting Approval (ex-Shared) */}
          <SectionStatus
            title="Awaiting Approval"
            tagClass="tag--shared"
            rows={sharedPag.pageRows}
            totalCount={sharedAll.length}
            page={sharedPag.page}
            totalPages={sharedPag.totalPages}
            onPage={sharedPag.setPage}
            serviceById={serviceById}
            open={open}
            onToggle={toggle}
            statusLabel="AWAITING"
            onMoveNextWeek={moveSharedToNextWeek}
          />

          {/* Paid */}
          <SectionStatus
            title="Paid"
            tagClass="tag--paid"
            rows={paidPag.pageRows}
            totalCount={paidAll.length}
            page={paidPag.page}
            totalPages={paidPag.totalPages}
            onPage={paidPag.setPage}
            serviceById={serviceById}
            open={open}
            onToggle={toggle}
            statusLabel="PAID"
            showPaidAt
          />
        </>
      )}
    </div>
  );
}

/* =================== Section (Status Lists) =================== */
function SectionStatus({
  title, rows, totalCount=0, page=1, totalPages=1, onPage,
  serviceById, open, onToggle, tagClass, statusLabel, showPaidAt=false,
  onMarkPaid, onMoveNextWeek
}){
  const showActionsPaid  = typeof onMarkPaid === 'function' && statusLabel === 'APPROVED';
  const showActionsMove  = typeof onMoveNextWeek === 'function' && statusLabel === 'AWAITING';

  return (
    <section className="fin-section">
      <div className="fin-head">
        <h3>{title}</h3>
        {totalCount > 0 && (
          <div className="muted">{totalCount} items</div>
        )}
      </div>
      <div className="fin-card">
        {rows.length===0 ? (
          <div className="fin-empty">No items for this filter.</div>
        ) : (
          <>
            <div className="table">
              <div className="thead">
                <div className="th">Partner</div>
                <div className="th">Week</div>
                <div className="th center">Services</div>
                <div className="th right">Total</div>
                <div className="th center">Status</div>
                <div className="th center">Breakdown</div>
                {(showActionsPaid || showActionsMove) && <div className="th center">Actions</div>}
              </div>
              {rows.map(p=>{
                const lines = (p.serviceIds||[]).map(id=> serviceById.get(id)).filter(Boolean);
                const isOpen = open.has(p.id);
                return (
                  <div className="tr" key={p.id}>
                    <div className="td"><Users size={14}/> {p.partnerName||'—'}</div>
                    <div className="td">
                      <div className="wk-chip"><CalendarDays size={14}/> {p.weekStart? `${fmtDate(p.weekStart)} — ${fmtDate(p.weekEnd)}` : '—'}</div>
                      {showPaidAt && p.paidAt && <div style={{fontSize:12,color:'#64748B'}}>Paid at: {fmtDateTime(p.paidAt)}</div>}
                    </div>
                    <div className="td center">{lines.length}</div>
                    <div className="td right"><b>{toMoney(p.total)}</b></div>
                    <div className="td center">
                      <span className={`tag ${tagClass}`}>
                        {statusLabel === 'AWAITING' ? 'AWAITING APPROVAL' : statusLabel}
                      </span>
                    </div>
                    <div className="td center">
                      <button className="pg-btn" onClick={()=>onToggle(p.id)}>{isOpen? <ChevronDown size={16}/> : <ChevronRight size={16}/>} Details</button>
                    </div>

                    {(showActionsPaid || showActionsMove) && (
                      <div className="td center" style={{ display:'flex', justifyContent:'center', gap:8 }}>
                        {showActionsPaid && (
                          <button
                            className="btn btn--sm"
                            style={{ background:'#059669', color:'#fff', fontWeight:700 }}
                            title="Mark this payment as PAID"
                            onClick={() => onMarkPaid?.(p.id)}
                          >
                            <Check size={14}/> Mark Paid
                          </button>
                        )}
                        {showActionsMove && (
                          <button
                            className="btn btn--sm"
                            style={{ background:'#2563eb', color:'#fff', fontWeight:700 }}
                            title="Move to next week"
                            onClick={() => onMoveNextWeek?.(p.id)}
                          >
                            Next Week <ArrowRight size={14} style={{marginLeft:6}}/>
                          </button>
                        )}
                      </div>
                    )}

                    {isOpen && (
                      <div className="td" style={{gridColumn:'1 / -1', paddingTop:0}}>
                        <BreakdownServices services={lines} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Paginação */}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <Pagination page={page} setPage={onPage} totalPages={totalPages} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* =================== Breakdown =================== */
function BreakdownServices({ services }){
  if(!services || services.length===0){
    return <div className="fin-break fin-empty" style={{textAlign:'left'}}>No service details available.</div>;
  }
  const total = services.reduce((s,x)=> s + Number(x.finalValue||0), 0);
  return (
    <div className="fin-break">
      <div className="table">
        <div className="thead">
          <div className="th">Client</div>
          <div className="th">Date</div>
          <div className="th">Service</div>
          <div className="th">Park</div>
          <div className="th center">Team</div>
          <div className="th center">Guests</div>
          <div className="th center">Hopper</div>
          <div className="th right">Amount</div>
        </div>
        {services.map(s=> (
          <div className="tr" key={s.id}>
            <div className="td">{`${s.firstName||''} ${s.lastName||''}`.trim() || '—'}</div>
            <div className="td">{s.serviceDate? new Date(s.serviceDate).toLocaleDateString() : '—'}</div>
            <div className="td">{s?.serviceType?.name || '—'}</div>
            <div className="td">{s.park || '—'}</div>
            <div className="td center">{s.team || '—'}</div>
            <div className="td center">{s.guests ?? '—'}</div>
            <div className="td center">{s.hopper ? 'Yes' : 'No'}</div>
            <div className="td right">{toMoney(s.finalValue)}</div>
          </div>
        ))}
        <div className="tr">
          <div className="td" style={{gridColumn:'1 / 7'}}></div>
          <div className="td right" style={{fontWeight:800}}>Total</div>
          <div className="td right" style={{fontWeight:800}}>{toMoney(total)}</div>
        </div>
      </div>
    </div>
  );
}

/* =================== Weekly Client Costs (resumo) =================== */
function SectionWeeklyClientCosts({ rows }){
  return (
    <section className="fin-section">
      <div className="fin-head"><h3>Weekly Costs</h3></div>
      <div className="fin-card">
        {rows.length===0 ? (
          <div className="fin-empty">No services found for the selected week.</div>
        ) : (
          <div className="table table--summary">
            <div className="thead">
              <div className="th">Client</div>
              <div className="th right">Total Cost (–)</div>
              <div className="th">Breakdown</div>
            </div>
            {rows.map(row=> (
              <ClientRow key={row.client} row={row} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ClientRow({ row }){
  const [open, setOpen] = useState(false);
  return (
    <div className="tr">
      <div className="td" style={{fontWeight:800}}>{row.client}</div>
      <div className="td right" style={{fontWeight:800}}>{toCost(row.total)}</div>
      <div className="td">
        <button className="pg-btn" onClick={()=>setOpen(v=>!v)}>{open? <ChevronDown size={16}/> : <ChevronRight size={16}/>} View services</button>
      </div>
      {open && (
        <div className="td" style={{gridColumn:'1 / -1', paddingTop:0}}>
          <BreakdownServices services={row.services} />
        </div>
      )}
    </div>
  );
}
