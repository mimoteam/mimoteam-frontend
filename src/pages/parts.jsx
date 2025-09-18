import React, { useState } from "react";
import { Users, CalendarDays, ChevronDown, ChevronRight, Check, ArrowRight } from "lucide-react";

/* ===== Helpers ===== */
export function toMoney(n){ return `$${Number(n||0).toFixed(2)}`; }
export function toCost(n){ const v=Math.abs(Number(n||0)); return `-$${v.toFixed(2)}`; }
export function fmtDate(ts){ if(!ts) return "—"; const d=new Date(ts); return d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"2-digit"}); }
export function fmtDateTime(ts){ if(!ts) return "—"; const d=new Date(ts); return d.toLocaleString("en-US",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}); }

/* ===== Paginação local ===== */
function Pagination({ page=1, setPage=()=>{}, totalPages=1 }){
  const go = (p)=> setPage(Math.min(Math.max(1,p), totalPages||1));
  return (
    <div className="pagination-controls">
      <button className="btn btn--outline btn--sm" onClick={()=>go(1)} disabled={page<=1}>«</button>
      <button className="btn btn--outline btn--sm" onClick={()=>go(page-1)} disabled={page<=1}>‹</button>
      <span className="page-indicator muted">Page {page}/{totalPages||1}</span>
      <button className="btn btn--outline btn--sm" onClick={()=>go(page+1)} disabled={page>=totalPages}>›</button>
      <button className="btn btn--outline btn--sm" onClick={()=>go(totalPages||1)} disabled={page>=totalPages}>»</button>
    </div>
  );
}

/* =================== Breakdown =================== */
export function BreakdownServices({ services=[] }){
  const list = Array.isArray(services) ? services : [];
  if(list.length===0){
    return <div className="fin-break wc-break fin-empty">No service details available.</div>;
  }
  const total = list.reduce((s,x)=> s + Number(x?.finalValue||0), 0);

  return (
    <div className="fin-break wc-break">
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

        {list.map((s,i)=>(
          <div className="tr" key={s?.id ?? `line_${i}`}>
            <div className="td">{`${s?.firstName||''} ${s?.lastName||''}`.trim() || '—'}</div>
            <div className="td">{s?.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}</div>
            <div className="td">{s?.serviceType?.name || '—'}</div>
            <div className="td">{s?.park || '—'}</div>
            <div className="td center">{s?.team || '—'}</div>
            <div className="td center">{(s?.guests ?? '—')}</div>
            <div className="td center">{s?.hopper ? 'Yes' : 'No'}</div>
            <div className="td right">{toMoney(s?.finalValue)}</div>
          </div>
        ))}

        <div className="tr total">
          <div className="td blank" />
          <div className="td right label">Total</div>
          <div className="td right value">{toMoney(total)}</div>
        </div>
      </div>
    </div>
  );
}

/* =================== Section (Status Lists) =================== */
export function SectionStatus({
  title='', rows=[], totalCount=0, page=1, totalPages=1, onPage,
  serviceById=new Map(), open=new Set(), onToggle=()=>{},
  tagClass='', statusLabel='', showPaidAt=false, onMarkPaid, onMoveNextWeek,
}){
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeOpen = open instanceof Set ? open : new Set();
  const isMap    = serviceById && typeof serviceById.get === 'function';
  const getById  = (id)=> isMap ? serviceById.get(id) : undefined;

  const showActionsPaid = typeof onMarkPaid === 'function' && statusLabel === 'APPROVED';
  const showActionsMove = typeof onMoveNextWeek === 'function' && statusLabel === 'AWAITING';

  return (
    <section className="fin-section">
      <div className="fin-head">
        <h3>{title}</h3>
        {totalCount>0 && <div className="muted">{totalCount} items</div>}
      </div>

      <div className="fin-card">
        {safeRows.length===0 ? (
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

              {safeRows.map((p,i)=>{
                const ids   = Array.isArray(p?.serviceIds) ? p.serviceIds : [];
                const lines = ids.map(getById).filter(Boolean);
                const totalFromLines = lines.reduce((sum,s)=> sum + Number(s?.finalValue||0), 0);
                const displayTotal   = lines.length ? totalFromLines : Number(p?.total||0);
                const partnerShown   = (p?.partnerName || (lines[0]?.team) || '—');
                const isOpen         = safeOpen.has(p?.id);

                return (
                  <div className="tr" key={p?.id ?? `row_${i}`}>
                    <div className="td"><Users size={14}/> {partnerShown}</div>
                    <div className="td">
                      <div className="wk-chip">
                        <CalendarDays size={14}/>
                        {p?.weekStart ? `${fmtDate(p.weekStart)} — ${fmtDate(p.weekEnd)}` : '—'}
                      </div>
                      {showPaidAt && p?.paidAt && (
                        <div className="paid-at">Paid at: {fmtDateTime(p.paidAt)}</div>
                      )}
                    </div>
                    <div className="td center">{lines.length}</div>
                    <div className="td right"><b>{toMoney(displayTotal)}</b></div>
                    <div className="td center">
                      <span className={`tag ${tagClass}`}>
                        {statusLabel === 'AWAITING' ? 'AWAITING APPROVAL' : statusLabel || '—'}
                      </span>
                    </div>
                    <div className="td center">
                      <button className="btn btn--outline btn--sm" onClick={()=>onToggle(p?.id)}>
                        {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} Details
                      </button>
                    </div>

                    {(showActionsPaid || showActionsMove) && (
                      <div className="td center td-actions" style={{ display:'flex', justifyContent:'center', gap:8 }}>
                        {showActionsPaid && (
                          <button
                            className="btn btn--primary btn--sm"
                            title="Mark this payment as PAID"
                            onClick={()=>onMarkPaid?.(p?.id)}
                          >
                            <Check size={14}/> Mark Paid
                          </button>
                        )}
                        {showActionsMove && (
                          <button
                            className="btn btn--outline btn--sm"
                            title="Move to next week"
                            onClick={()=>onMoveNextWeek?.(p?.id)}
                          >
                            Next Week <ArrowRight size={14}/>
                          </button>
                        )}
                      </div>
                    )}

                    {isOpen && (
                      <div className="td td-expand">
                        <BreakdownServices services={lines}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {typeof onPage==='function' && (
              <div className="pagination-wrap">
                <Pagination page={page} setPage={onPage} totalPages={totalPages}/>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* =================== Weekly Client Costs (resumo) =================== */
export function SectionWeeklyClientCosts({ rows=[] }){
  const list = Array.isArray(rows) ? rows : [];
  return (
    <section className="fin-section">
      <div className="fin-head"><h3>Weekly Costs</h3></div>
      <div className="fin-card">
        {list.length===0 ? (
          <div className="fin-empty">No services found for the selected week.</div>
        ) : (
          <div className="table table--summary">
            <div className="thead">
              <div className="th">Client</div>
              <div className="th">Total Cost (–)</div>
              <div className="th">Breakdown</div>
            </div>
            {list.map((row,i)=>(
              <ClientRow key={row?.client ?? `client_${i}`} row={row}/>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ClientRow({ row={} }){
  const [open,setOpen] = useState(false);
  const name  = row?.client ?? '—';
  const total = Number(row?.total || 0);
  const svcs  = Array.isArray(row?.services) ? row.services : [];

  return (
    <div className="tr">
      <div className="td" style={{ fontWeight:800 }}>{name}</div>
      <div className="td" style={{ fontWeight:800 }}>{toCost(total)}</div>
      <div className="td">
        <button className="btn btn--outline btn--sm" onClick={()=>setOpen(v=>!v)}>
          {open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} View services
        </button>
      </div>

      {open && (
        <div className="td td-expand">
          <BreakdownServices services={svcs}/>
        </div>
      )}
    </div>
  );
}

export default { BreakdownServices, SectionStatus, SectionWeeklyClientCosts, toMoney, toCost, fmtDate, fmtDateTime };
