import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, ChevronDown, Users,
  Calendar as CalendarIcon, Flag, Trash2, Image as ImageIcon,
  Filter, X, Check, Clock3, PlusCircle
} from "lucide-react";
import { listLanes, deleteLaneReceipt, deleteLane } from "../api/lightninglanes";
import { api, toAbsoluteUrl } from "../api/http";
import "../styles/pages/LightningLanesDashboard.css";

/* ====== Constantes ====== */
const PAGE_SIZE = 20;
const INVOICE_QUEUE_KEY = "invoice_queue_v1";

const TYPES_MAP = new Map([
  ["multi",   "Multi Pass"],
  ["single",  "Single Pass"],
  ["premier", "Premier Pass"],
]);
const PMAP = new Map([
  ["mimo_card", "Mimo Card"],
  ["client",    "Client"],
]);

/* ====== Helpers ====== */
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const ymd = (d) => { try { return new Date(d).toISOString().slice(0,10); } catch { return String(d||""); } };
const withCacheBust = (u, updatedAt) => (/\?/.test(u) ? u : `${u}?v=${updatedAt ? new Date(updatedAt).getTime() : Date.now()}`);

function readLS(k, def = []) {
  try { const raw = localStorage.getItem(k); const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : def; }
  catch { return def; }
}
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

/* normaliza/limpa nomes para fuzzy-grouping */
function cleanName(s){ return String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim(); }
function titleCase(s){ const t=cleanName(s); if(!t) return ""; return t.split(" ").slice(0,3).map(p=>p[0]?.toUpperCase()+p.slice(1)).join(" "); }
function lev(a,b){ a=cleanName(a); b=cleanName(b); if(a===b) return 0; const m=a.length,n=b.length; if(!m||!n) return Math.max(m,n);
  const dp=Array.from({length:m+1},(_,i)=>[i]); for(let j=1;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){ dp[i][0]=i; for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+c); } }
  return dp[m][n];
}
const similarity = (a,b) => {
  const L=Math.max(cleanName(a).length||1, cleanName(b).length||1);
  return 1 - (lev(a,b)/L);
};

/* Agrupa por cliente (fuzzy) e agrega infos por grupo */
function groupByClient(items){
  const sorted = [...items].sort((a,b)=>new Date(b.visitDate||b.updatedAt||0)-new Date(a.visitDate||a.updatedAt||0));
  const used=new Set(); const groups=[];
  for(let i=0;i<sorted.length;i++){
    if(used.has(i)) continue;
    const seed=sorted[i]; const seedName=titleCase(seed.clientName||"—");
    const [sf="",sl=""]=cleanName(seedName).split(" ");
    const g=[seed]; used.add(i);
    for(let j=i+1;j<sorted.length;j++){
      if(used.has(j)) continue;
      const cand=sorted[j]; const candName=titleCase(cand.clientName||"—");
      const sim=similarity(seedName,candName);
      const [cf="",cl=""]=cleanName(candName).split(" ");
      const sameLastAndInitial = sl && cl && sl===cl && sf && cf && sf[0]===cf[0];
      if(sim>=0.86 || sameLastAndInitial){ g.push(cand); used.add(j); }
    }
    groups.push({ key: seed._id, client: seedName, items: g });
  }
  return groups
    .map(g=>{
      const latest=g.items[0];
      const sum=g.items.reduce((a,it)=>a+Number(it.amount||0),0);
      const count={}; g.items.forEach(it=>{ const k=it.paymentMethod||"—"; count[k]=(count[k]||0)+1; });
      const method=Object.entries(count).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "—";
      const last4Set=new Set(g.items.map(it=>(it.cardLast4||"").toString()).filter(Boolean));
      const last4 = method==="mimo_card" ? (last4Set.size===0?"—": last4Set.size===1?[...last4Set][0]:"multi") : "—";
      const uploadedBy =
        g.items.find(it => it.partnerFullName)?.partnerFullName ||
        latest.partnerFullName || latest.partner?.fullName || latest.user?.name || "—";

      const groupStatus = String(latest?.status || "").toLowerCase() === "read" ? "read" : "pending";

      return {
        id: latest._id,
        client: g.client,
        latestDate: latest.visitDate || latest.updatedAt,
        latestType: latest.laneType || "—",
        method, last4, amountSum: sum,
        observation: g.items.find(it=>it.observation)?.observation || "",
        uploadedBy,
        status: groupStatus,
        items: g.items
      };
    })
    .sort((a,b)=>new Date(b.latestDate||0)-new Date(a.latestDate||0));
}

/* ============================== Componente ============================== */
export default function LightningLanesDashboard(){
  const [rows,setRows]=useState([]);
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);
  const pages = Math.max(1, Math.ceil(total/PAGE_SIZE));

  // expand
  const [open,setOpen]=useState(()=>new Set());
  const toggleOpen=(id)=>setOpen(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  // filtros
  const [fClient,setFClient]=useState("");
  const [fPartner,setFPartner]=useState("");
  const [fFrom,setFFrom]=useState("");
  const [fTo,setFTo]=useState("");

  // lightbox
  const [preview,setPreview]=useState(null);

  async function refresh(p=page){
    setLoading(true);
    try{
      const { items=[], total:t=0, page:cur=p } = await listLanes({ page:p, pageSize:PAGE_SIZE, mine:false });
      const ordered = [...items].sort((a,b)=>new Date(b.visitDate||b.updatedAt||0)-new Date(a.visitDate||a.updatedAt||0));
      setRows(ordered); setTotal(t); setPage(cur||p);
    } finally{ setLoading(false); }
  }
  useEffect(()=>{ refresh(1); /* eslint-disable-next-line */ }, []);

  // filtros ANTES do agrupamento
  const filtered = useMemo(()=>{
    const clientQ = cleanName(fClient);
    const partnerQ = cleanName(fPartner);
    const from = fFrom ? new Date(fFrom + "T00:00:00") : null;
    const to   = fTo   ? new Date(fTo   + "T23:59:59") : null;

    return rows.filter(it=>{
      if (clientQ && !cleanName(it.clientName).includes(clientQ)) return false;
      if (partnerQ && !cleanName((it.partnerFullName || it.partner?.fullName || it.user?.name || "")).includes(partnerQ)) return false;
      if (from || to){
        const d = new Date(it.visitDate || it.updatedAt || 0);
        if (from && d < from) return false;
        if (to   && d > to)   return false;
      }
      return true;
    })
    .sort((a,b)=>new Date(b.visitDate||b.updatedAt||0)-new Date(a.visitDate||a.updatedAt||0));
  },[rows,fClient,fPartner,fFrom,fTo]);

  const grouped = useMemo(()=>groupByClient(filtered),[filtered]);

  const goPrev=()=>{ if(page>1) refresh(page-1); };
  const goNext=()=>{ if(page<pages) refresh(page+1); };

  /* ====== Ações ====== */
  const onRemoveReceipt=async (laneId,url)=>{
    try{
      await deleteLaneReceipt(laneId,url);
      setRows(prev=>prev.map(it=>it._id===laneId?{...it,receipts:(it.receipts||[]).filter(u=>u!==url)}:it));
    }catch{}
  };
  const onDeleteLane=async (laneId)=>{
    if(!window.confirm("Delete this Lightning Lane?")) return;
    try{
      await deleteLane(laneId);
      setRows(prev=>prev.filter(it=>it._id!==laneId));
      setTotal(t=>Math.max(0,t-1));
    }catch{}
  };

  // Toggle status (PENDING ⇄ READ)
  const onToggleStatus = async (laneId, currentStatus) => {
    const next = currentStatus === "read" ? "pending" : "read";
    setRows(prev => prev.map(it => it._id === laneId ? { ...it, status: next } : it));
    try {
      await api(`/api/lightninglanes/${laneId}`, { method: "PATCH", body: { status: next } });
    } catch {}
  };

  // Invoice helpers
  const isGroupFullyQueued = (g) => {
    const queue = readLS(INVOICE_QUEUE_KEY, []);
    const ids = new Set(queue.map(q => q.id));
    return g.items.every(it => ids.has(it._id));
  };
  const addGroupToInvoice = (g) => {
    if (!g || !g.items?.length) return;
    const queue = readLS(INVOICE_QUEUE_KEY, []);
    const map = new Map(queue.map(q => [q.id, q]));
    g.items.forEach(it => {
      map.set(it._id, {
        id: it._id,
        client: g.client,
        date: it.visitDate || it.updatedAt || null,
        park: it.park || it.location || "",
        amount: Number(it.amount || 0),
      });
    });
    writeLS(INVOICE_QUEUE_KEY, Array.from(map.values()));
  };

  const clearFilters = () => { setFClient(""); setFPartner(""); setFFrom(""); setFTo(""); };

  return (
    <div className="lln-page">
      {/* Título */}
      <div className="page-title">
        <h1>Lightning Lanes</h1>
        <div className="page-meta">
          <span className="meta-pill">Total: {total}</span>
          <span className="meta-pill">Page {page} / {pages}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="lln-filters">
        <div className="filters-left">
          <div className="filter-field">
            <label>Client Name</label>
            <input className="filter-input" placeholder="Type a client…" value={fClient} onChange={(e)=>setFClient(e.target.value)} />
          </div>
          <div className="filter-field">
            <label>Partner</label>
            <input className="filter-input" placeholder="Partner full name…" value={fPartner} onChange={(e)=>setFPartner(e.target.value)} />
          </div>
          <div className="filter-field">
            <label>Period — From</label>
            <input type="date" className="filter-input" value={fFrom} onChange={(e)=>setFFrom(e.target.value)} />
          </div>
          <div className="filter-field">
            <label>To</label>
            <input type="date" className="filter-input" value={fTo} onChange={(e)=>setFTo(e.target.value)} />
          </div>
        </div>
        <div className="filters-right">
          <button className="btn btn--outline" onClick={clearFilters}><X size={16}/> Clear</button>
          <div className="filters-caption"><Filter size={14}/> {grouped.length} groups</div>
        </div>
      </div>

      {/* ===== Tabela ===== */}
      <div className="lln-card">
        {/* Cabeçalho (11 colunas) */}
        <div className="lln-thead" role="row">
          <div className="th client">Client Name</div>
          <div className="th date">Visit Date</div>
          <div className="th type">Type</div>
          <div className="th method">Payment Method</div>
          <div className="th last4">Last 4</div>
          <div className="th amount">Amount</div>
          <div className="th obs">Observation</div>
          <div className="th by">Upload by</div>
          <div className="th status">Status</div>
          <div className="th finance">Finance</div>
          <div className="th actions">Actions</div>
        </div>

        {/* Corpo */}
        <div className="lln-tbody">
          {loading ? (
            <div className="lln-empty">Loading…</div>
          ) : grouped.length===0 ? (
            <div className="lln-empty">No data.</div>
          ) : grouped.map(g=>{
            const opened=open.has(g.id);
            const receipts = g.items.flatMap(it =>
              (it.receipts || []).map(url => ({ laneId: it._id, url, updatedAt: it.updatedAt }))
            );
            const isRead = g.status === "read";
            const fullyQueued = isGroupFullyQueued(g);

            return (
              <div key={g.id} className="lln-row">
                {/* Linha principal (11 colunas) */}
                <div className="row-main">
                  <div className="cell client pill">
                    <Users size={14} className="muted"/> <span className="strong">{g.client}</span>
                  </div>
                  <div className="cell date pill">
                    <CalendarIcon size={14} className="muted"/> {ymd(g.latestDate)}
                  </div>
                  <div className="cell type pill">
                    <Flag size={14} className="muted"/> {TYPES_MAP.get(g.latestType)||g.latestType||"—"}
                  </div>
                  <div className="cell method pill">{PMAP.get(g.method)||g.method||"—"}</div>
                  <div className="cell last4 pill">{g.last4}</div>
                  <div className="cell amount pill">{money(g.amountSum)}</div>
                  <div className="cell obs pill grow">{g.observation || "—"}</div>
                  <div className="cell by pill truncate">{titleCase(g.uploadedBy)}</div>

                  {/* STATUS */}
                  <div className="cell status pill">
                    <button
                      type="button"
                      className={`badge ${isRead ? "badge--ok" : "badge--warn"}`}
                      title="Toggle status (Pending/Read)"
                      aria-pressed={isRead}
                      onClick={()=>onToggleStatus(g.id, g.status)}
                      style={{ cursor: "pointer" }}
                    >
                      {isRead ? <Check size={14}/> : <Clock3 size={14}/>}
                      {isRead ? "READ" : "PENDING"}
                    </button>
                  </div>

                  {/* FINANCE */}
                  <div className="cell finance">
                    <button
                      className={`btn ${fullyQueued ? "btn--outline" : "btn--primary"} btn--sm`}
                      onClick={()=>addGroupToInvoice(g)}
                      disabled={fullyQueued}
                      title={fullyQueued ? "All items of this group are already queued" : "Add all items of this group to the Invoice draft"}
                    >
                      <PlusCircle size={14}/>
                      {fullyQueued ? "Queued" : "Add to Invoice"}
                    </button>
                  </div>

                  {/* AÇÕES */}
                  <div className="cell actions">
                    <button
                      className="btn btn--outline btn--danger btn--sm"
                      onClick={()=>onDeleteLane(g.id)}
                    >
                      <Trash2 size={16}/> Delete
                    </button>
                  </div>
                </div>

                {/* Toggle expand */}
                <div className="row-expand-toggle">
                  <button className="expand-btn" onClick={()=>toggleOpen(g.id)} aria-expanded={opened}>
                    {opened ? <ChevronDown size={18}/> : <ChevronRight size={18}/> }
                    <span>Expand</span>
                  </button>
                </div>

                {/* Receipts */}
                <div className={`expand ${opened?"show":""}`}>
                  <div className="receipts" style={{padding:"6px 0"}}>
                    {receipts.length ? (
                      receipts.map(({laneId, url, updatedAt})=>{
                        const src = withCacheBust(toAbsoluteUrl(url), updatedAt);
                        return (
                          <div className="thumb" key={`${laneId}|${url}`} title="Click to zoom">
                            <img
                              src={src}
                              alt="receipt"
                              loading="lazy"
                              decoding="async"
                              onClick={()=>setPreview(src)}
                              onError={(e)=>{ e.currentTarget.style.opacity=".5"; e.currentTarget.alt="broken"; }}
                            />
                            <button className="icon" title="Remove" onClick={()=>onRemoveReceipt(laneId,url)}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="lln-empty small"><ImageIcon size={14}/> No receipts</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* paginação */}
        <div className="lln-pager">
          <button className="btn btn--outline" onClick={goPrev} disabled={page<=1}>Prev</button>
          <span className="pageinfo">Page <strong>{page}</strong> of <strong>{pages}</strong> • {total} items</span>
          <button className="btn btn--outline" onClick={goNext} disabled={page>=pages}>Next</button>
        </div>
      </div>

      {/* Lightbox */}
      {preview && (
        <div className="lln-lightbox" onClick={()=>setPreview(null)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.65)",
          display:"grid", placeItems:"center", zIndex:999
        }}>
          <img
            src={preview}
            alt="receipt large"
            onClick={(e)=>e.stopPropagation()}
            style={{ maxWidth:"92vw", maxHeight:"88vh", borderRadius:12, boxShadow:"0 10px 28px rgba(0,0,0,.35)" }}
          />
        </div>
      )}
    </div>
  );
}
