// src/pages/PartnerWallet.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  CalendarDays, Check, X, DollarSign, BarChart3, TrendingUp, Clock,
  ChevronLeft, ChevronRight, ChevronDown, Calendar
} from 'lucide-react';
import { httpClient as api } from '../api/http'; // axios instance
import '../styles/PartnerWallet.css';

// ===== Helpers Semana (Qua→Ter) =====
function getWeekWedTue(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay();
  const toWed = (dow >= 3) ? (dow - 3) : (dow + 4);
  const start = new Date(d); start.setDate(d.getDate() - toWed); start.setHours(0,0,0,0);
  const end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end };
}

// UTC-safe YYYY-MM compare
function sameYYYYMM(iso, ym){
  if (!iso || !ym) return false;
  const d = new Date(iso);
  const [y,m] = ym.split('-').map(Number);
  return d.getUTCFullYear() === y && (d.getUTCMonth() + 1) === m;
}

const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;
const NORM = (s) => String(s || '').toUpperCase();
const isPendingForPartner = (p) => NORM(p.status) === 'SHARED'; // aguardando ação do parceiro
const isVisibleToPartner  = (p) => NORM(p.status) !== 'PENDING'; // parceiro não vê PENDING

export default function PartnerWallet({ currentUser, coloredCards = true }) {
  const partnerId = currentUser?.id || currentUser?._id;

  // services cache (id -> obj)
  const [servicesById, setServicesById] = useState(new Map());
  // payments sempre do backend (apenas do parceiro logado)
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(false);

  // filtros
  const [statusFilter, setStatusFilter] = useState(''); // '', SHARED, APPROVED, PAID, DECLINED, ON_HOLD
  const defaultMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

  // Payments by status
  const [psMonth, setPsMonth] = useState(defaultMonth);
  const [psPage, setPsPage]   = useState(1);

  // All payments
  const [apMonth, setApMonth] = useState(defaultMonth);
  const [apPage, setApPage]   = useState(1);

  // métricas
  const [weekRef, setWeekRef] = useState(getWeekWedTue(new Date()).start);

  // reject modal
  const [rejecting, setRejecting]       = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // breakdown toggle (por pagamento)
  const [openMap, setOpenMap] = useState({});
  const isOpen = (id) => !!openMap[id];
  const toggleOpen = (id) => setOpenMap(m => ({ ...m, [id]: !m[id] }));

  // === detectar tela estreita para o breakdown “vertical” ===
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const apply = () => setIsNarrow(!!mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  // dropdown custom de status
  const STATUS_OPTIONS = [
    { value: '',         label: 'Pending' },   // default (SHARED + ON_HOLD)
    { value: 'SHARED',   label: 'Shared' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'PAID',     label: 'Paid' },
    { value: 'ON_HOLD',  label: 'On hold' },
    { value: 'DECLINED', label: 'Declined' },
  ];
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef(null);
  useEffect(() => {
    const close = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);
  const statusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || 'Pending';

  // ========================= CARREGAR PAYMENTS DO BACKEND =========================
  // buscamos dois conjuntos (psMonth e apMonth) e unimos por id (evita sobrecarga e mantém flexibilidade dos meses)
  useEffect(() => {
    if (!partnerId) return;
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const [a, b] = await Promise.all([
          api.get('/payments', { params: { partnerId, month: psMonth, pageSize: 500 } }),
          api.get('/payments', { params: { partnerId, month: apMonth, pageSize: 500 } }),
        ]);

        const listA = Array.isArray(a?.data?.items) ? a.data.items : (Array.isArray(a?.data) ? a.data : []);
        const listB = Array.isArray(b?.data?.items) ? b.data.items : (Array.isArray(b?.data) ? b.data : []);
        // merge por id
        const map = new Map();
        [...listA, ...listB].forEach(p => map.set(p._id || p.id, { ...p, id: p._id || p.id }));
        const merged = Array.from(map.values())
          .filter(p => p.partnerId === partnerId); // segurança

        // ordena por semana/criação desc
        merged.sort((x,y) => new Date(y.weekStart || y.createdAt || 0) - new Date(x.weekStart || x.createdAt || 0));

        if (alive) setPayments(merged);
      } catch (e) {
        if (alive) setPayments([]);
        console.warn('Failed to load payments', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [partnerId, psMonth, apMonth]);

  // ========================= CARREGAR SERVICES NECESSÁRIOS =========================
  // quando a lista de payments muda, carregamos os services que faltam para os breakdowns
  useEffect(() => {
    if (!payments.length) return;

    const allIds = new Set();
    payments.forEach(p => (p.serviceIds || []).forEach(id => allIds.add(id)));

    const missing = Array.from(allIds).filter(id => !servicesById.has(id));
    if (missing.length === 0) return;

    let alive = true;

    (async () => {
      try {
        // em lotes (caso haja muitos ids)
        const chunk = 80;
        const fetched = [];
        for (let i = 0; i < missing.length; i += chunk) {
          const ids = missing.slice(i, i + chunk).join(',');
          const r = await api.get('/services', { params: { ids, limit: missing.length } });
          const items = Array.isArray(r?.data?.items) ? r.data.items : (Array.isArray(r?.data) ? r.data : []);
          fetched.push(...items);
        }
        const next = new Map(servicesById);
        fetched.forEach(svc => next.set(svc._id || svc.id, { ...svc, id: svc._id || svc.id }));
        if (alive) setServicesById(next);
      } catch (e) {
        console.warn('Failed to load services by ids', e);
      }
    })();

    return () => { alive = false; };
  }, [payments]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== DERIVADOS =====
  // Payments by status (filtra mês psMonth)
  const statusPayments = useMemo(() => {
    let arr = payments.slice();
    if (statusFilter) {
      arr = arr.filter(p => NORM(p.status) === statusFilter);
    } else {
      arr = arr.filter(p => isPendingForPartner(p) || NORM(p.status) === 'ON_HOLD');
    }
    arr = arr.filter(p =>
      (p.weekStart && sameYYYYMM(p.weekStart, psMonth)) ||
      (!p.weekStart && (sameYYYYMM(p.periodFrom, psMonth) || sameYYYYMM(p.periodTo, psMonth)))
    );
    arr.sort((a,b) => new Date(b.weekStart || b.createdAt || 0) - new Date(a.weekStart || a.createdAt || 0));
    return arr;
  }, [payments, statusFilter, psMonth]);

  const psTotalPages = Math.max(1, statusPayments.length || 1);
  const psCurrent = statusPayments[psPage - 1] || null;

  // All payments (parceiro não enxerga PENDING) — filtro apMonth
  const allPaymentsFiltered = useMemo(() => {
    const arr = payments
      .filter(isVisibleToPartner)
      .filter(p =>
        (p.weekStart && sameYYYYMM(p.weekStart, apMonth)) ||
        (!p.weekStart && (sameYYYYMM(p.periodFrom, apMonth) || sameYYYYMM(p.periodTo, apMonth)))
      )
      .sort((a,b) => new Date(b.weekStart || b.createdAt || 0) - new Date(a.weekStart || a.createdAt || 0));
    return arr;
  }, [payments, apMonth]);

  const apTotalPages = Math.max(1, allPaymentsFiltered.length || 1);
  const apCurrent = allPaymentsFiltered[apPage - 1] || null;

  // Métricas — excluir PENDING
  const [weekMetrics, monthMetrics, pendingCount, yearTotal] = useMemo(() => {
    const { start, end } = getWeekWedTue(weekRef);
    const inWeek = payments.filter(p => {
      if (!isVisibleToPartner(p)) return false;
      const ws = p.weekStart ? new Date(p.weekStart) : null;
      return ws && ws >= start && ws <= end;
    });
    const weekTotal = inWeek.reduce((sum, p) => sum + (Number(p.total) || 0), 0);

    const inMonth = payments.filter(p => isVisibleToPartner(p) && p.weekStart && sameYYYYMM(p.weekStart, apMonth));
    const monthTotal = inMonth.reduce((sum, p) => sum + (Number(p.total) || 0), 0);

    const pendCount = payments.filter(p => isPendingForPartner(p)).length;

    const Y = new Date().getFullYear();
    const yCount = payments.filter(p => {
      if (!isVisibleToPartner(p)) return false;
      const ws = p.weekStart ? new Date(p.weekStart) : null;
      return ws && ws.getFullYear() === Y;
    }).length;

    return [
      { count: inWeek.length, total: weekTotal, start, end },
      { total: monthTotal, count: inMonth.length, key: apMonth },
      pendCount,
      yCount
    ];
  }, [payments, weekRef, apMonth]);

  // Reseta paginação ao mudar filtros
  useEffect(() => { setPsPage(1); }, [statusFilter, psMonth]);

  // ===== AÇÕES (PATCH no backend) =====
  const pushAuditLocal = (p, text) => {
    const list = Array.isArray(p.notesLog) ? p.notesLog.slice() : [];
    list.push({ id: crypto?.randomUUID?.() || `note_${Date.now()}`, at:new Date().toISOString(), text });
    return list;
  };

  const approve = async (p) => {
    try {
      const { data } = await api.patch(`/payments/${p.id}`, {
        status: 'APPROVED',
        appendNote: true,
        notes: 'Partner approved'
      });
      const upd = { ...(data || {}), id: data?._id || data?.id || p.id };
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, ...upd } : x)));
    } catch (e) {
      // atualiza localmente só pra UX (opcional) — comente se preferir estrito
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, status: 'APPROVED', notesLog: pushAuditLocal(p, 'Partner approved') } : x)));
      console.warn('approve failed, applied optimistic update', e);
    }
  };

  const beginReject = (p) => { setRejecting(p); setRejectReason(''); };
  const confirmReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    const p = rejecting;
    try {
      const { data } = await api.patch(`/payments/${p.id}`, {
        status: 'DECLINED',
        appendNote: true,
        notes: `Partner declined — ${rejectReason.trim()}`
      });
      const upd = { ...(data || {}), id: data?._id || data?.id || p.id };
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, ...upd } : x)));
    } catch (e) {
      // fallback otimista
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, status: 'DECLINED', notesLog: pushAuditLocal(p, `Partner declined — ${rejectReason.trim()}`) } : x)));
      console.warn('reject failed, applied optimistic update', e);
    } finally {
      setRejecting(null); setRejectReason('');
    }
  };

  const weekLabel = (p) => {
    if (p.weekStart && p.weekEnd) return `${new Date(p.weekStart).toLocaleDateString()} – ${new Date(p.weekEnd).toLocaleDateString()}`;
    if (p.periodFrom || p.periodTo) {
      const from = p.periodFrom ? new Date(p.periodFrom).toLocaleDateString() : '…';
      const to   = p.periodTo   ? new Date(p.periodTo).toLocaleDateString()   : '…';
      return `${from} – ${to}`;
    }
    return '—';
  };
  const linesForPayment = (p) => (p.serviceIds || []).map(id => servicesById.get(id)).filter(Boolean);

  // tabela de breakdown reutilizável (desktop x vertical)
  const renderBreakdownTable = (lines) => {
    if (!lines?.length) return null;

    if (isNarrow) {
      // VERTICAL: Date, Client e Amount
      return (
        <div className="table table--breakdown">
          <div className="thead">
            <div className="th">Date</div>
            <div className="th">Client</div>
            <div className="th right">Amount</div>
          </div>
          <div className="tbody">
            {lines.map(s => {
              const client = `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—';
              return (
                <div key={s.id} className="tr">
                  <div className="td" data-label="Date">
                    {s.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}
                  </div>
                  <div className="td" data-label="Client">{client}</div>
                  <div className="td right amount" data-label="Amount">
                    <span className="value">{fmtUSD(s.finalValue)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // DESKTOP
    return (
      <div className="table table--breakdown">
        <div className="thead">
          <div className="th">Date</div>
          <div className="th">Client</div>
          <div className="th">Service</div>
          <div className="th">Park</div>
          <div className="th">Guests</div>
          <div className="th right">Amount</div>
        </div>
        <div className="tbody">
          {lines.map(s => {
            const client = `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—';
            const park   = s.park || s.location || '—';
            const guests = (s.guests ?? '—');
            return (
              <div key={s.id} className="tr">
                <div className="td" data-label="Date">
                  {s.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}
                </div>
                <div className="td" data-label="Client">{client}</div>
                <div className="td" data-label="Service">
                  <div className="main">{s?.serviceType?.name || s?.serviceType || '—'}</div>
                </div>
                <div className="td" data-label="Park">{park}</div>
                <div className="td center" data-label="Guests">{guests}</div>
                <div className="td right amount" data-label="Amount">
                  <span className="value">{fmtUSD(s.finalValue)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const statusPillClass = `wf-status status-theme--${(statusFilter || 'PENDING').toUpperCase()}`;

  return (
    <div className="partner-page wallet-page">
      {/* ===== MÉTRICAS ===== */}
      <div className="wallet-metrics">
        <div className={`wm-card ${coloredCards ? 'wm-blue' : ''}`}>
          <div className="wm-head"><BarChart3 size={16}/> This Week</div>
          <div className="wm-value">{fmtUSD(weekMetrics.total)}</div>
          <div className="wm-sub">{weekMetrics.count} payments • {weekMetrics.start.toLocaleDateString()} – {weekMetrics.end.toLocaleDateString()}</div>
          <div className="wm-actions">
            <button onClick={()=>setWeekRef(new Date(weekRef.getFullYear(), weekRef.getMonth(), weekRef.getDate()-7))}>Prev</button>
            <button onClick={()=>setWeekRef(getWeekWedTue(new Date()).start)}>This</button>
            <button onClick={()=>setWeekRef(new Date(weekRef.getFullYear(), weekRef.getMonth(), weekRef.getDate()+7))}>Next</button>
          </div>
        </div>
        <div className={`wm-card ${coloredCards ? 'wm-green' : ''}`}>
          <div className="wm-head"><DollarSign size={16}/> Monthly Earnings</div>
          <div className="wm-value">{fmtUSD(monthMetrics.total)}</div>
          <div className="wm-sub">{monthMetrics.count} payments</div>
          <div className="wm-actions">
            <input
              type="month"
              value={apMonth}
              onChange={(e)=>{ setApMonth(e.target.value || defaultMonth); setApPage(1); }}
            />
          </div>
        </div>
        <div className={`wm-card ${coloredCards ? 'wm-orange' : ''}`}>
          <div className="wm-head"><Clock size={16}/> Pending Approvals</div>
          <div className="wm-value">{pendingCount}</div>
          <div className="wm-sub">Awaiting your action</div>
        </div>
        <div className={`wm-card ${coloredCards ? 'wm-purple' : ''}`}>
          <div className="wm-head"><TrendingUp size={16}/> Payments This Year</div>
          <div className="wm-value">{yearTotal}</div>
          <div className="wm-sub">{new Date().getFullYear()}</div>
        </div>
      </div>

      {/* ===== FILTRO STATUS ===== */}
      <div className="wallet-filters">
        <div className={`${statusPillClass} status-dd`} ref={statusRef} data-open={statusOpen}>
          <label>Status</label>
          <button
            type="button"
            className="status-dd-btn"
            aria-haspopup="listbox"
            aria-expanded={statusOpen}
            onClick={() => setStatusOpen(o => !o)}
          >
            <span>{statusLabel}</span>
            <ChevronDown size={14} className="chev" />
          </button>

          {statusOpen && (
            <div className="status-dd-menu" role="listbox">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value || 'pending'}
                  role="option"
                  className={`status-dd-item${statusFilter === opt.value ? ' active' : ''}`}
                  onClick={() => {
                    setStatusFilter(opt.value);
                    setStatusOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== PAYMENTS BY STATUS ===== */}
      <div className="wallet-section">
        <div className="ws-title">Payments by status</div>

        <div className="ap-filters">
          <div className="ap-month">
            <label>Month</label>
            <input
              type="month"
              value={psMonth}
              onChange={(e) => { setPsMonth(e.target.value || defaultMonth); setPsPage(1); }}
            />
          </div>
        </div>

        {loading && statusPayments.length === 0 ? (
          <div className="wallet-empty">Loading…</div>
        ) : statusPayments.length === 0 ? (
          <div className="wallet-empty">No items for this status.</div>
        ) : (
          <div className="ap-one">
            {(() => {
              const p = psCurrent;
              if (!p) return null;
              const lines = linesForPayment(p);

              return (
                <div className="wallet-item">
                  <div className="wi-main">
                    <div className="wi-top">
                      <div className="wi-type"><CalendarDays size={16}/> Week • {weekLabel(p)}</div>
                      <div className={`wi-status tag ${NORM(p.status).toLowerCase()}`}>{String(p.status || '').toLowerCase()}</div>
                    </div>
                    <div className="wi-grid">
                      <div className="wi-row"><span>Partner</span><strong>{p.partnerName || '—'}</strong></div>
                      <div className="wi-row"><span>Services</span><strong>{(p.serviceIds || []).length}</strong></div>
                      <div className="wi-row">
                        <span>Details</span>
                        <strong className="muted">
                          {lines.length>0
                            ? `${lines[0]?.serviceType?.name || 'Service'}${lines.length>1 ? ` +${lines.length-1}`:''}`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="wi-side">
                    <div className="wi-price">{fmtUSD(p.total)}</div>
                    <div className="wi-actions">
                      <button className="wi-approve" onClick={()=>approve(p)} disabled={NORM(p.status)!=='SHARED'}>
                        <Check size={16}/> Approve
                      </button>
                      <button className="wi-reject"  onClick={()=>beginReject(p)} disabled={NORM(p.status)!=='SHARED'}>
                        <X size={16}/> Reject
                      </button>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="breakdown-box" data-open={isOpen(p.id)}>
                    <button className="bd-toggle" onClick={() => toggleOpen(p.id)}>
                      <span>Breakdown</span>
                      <ChevronDown size={16} className="chev" />
                    </button>

                    {isOpen(p.id) && (
                      <div className="wpay-breakdown">
                        <div className="wpay-head">Details</div>
                        {lines.length ? renderBreakdownTable(lines) : <div className="wallet-empty" style={{margin:0}}>No service details.</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* paginação */}
            <div className="ap-pagination">
              <button
                className="ap-btn"
                onClick={() => setPsPage(p => Math.max(1, p - 1))}
                disabled={psPage === 1}
                aria-label="Previous"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="ap-indicator">
                {psPage} / {psTotalPages}
              </div>

              <button
                className="ap-btn"
                onClick={() => setPsPage(p => Math.min(psTotalPages, p + 1))}
                disabled={psPage === psTotalPages}
                aria-label="Next"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== ALL PAYMENTS ===== */}
      <div className="wallet-section">
        <div className="ws-title">All payments</div>

        <div className="ap-filters">
          <div className="ap-month">
            <label>Month</label>
            <input
              type="month"
              value={apMonth}
              onChange={(e) => {
                setApMonth(e.target.value || defaultMonth);
                setApPage(1);
              }}
            />
          </div>
        </div>

        {loading && allPaymentsFiltered.length === 0 ? (
          <div className="wallet-empty">Loading…</div>
        ) : allPaymentsFiltered.length === 0 ? (
          <div className="wallet-empty">No payments for this month.</div>
        ) : (
          <div className="ap-one">
            {(() => {
              const p = apCurrent;
              if (!p) return null;
              const lines = linesForPayment(p);

              return (
                <div className="wallet-item">
                  <div className="wi-main">
                    <div className="wi-top">
                      <div className="wi-type"><Calendar size={16}/> {weekLabel(p)}</div>
                      <div className={`wi-status tag ${NORM(p.status).toLowerCase()}`}>
                        {String(p.status || '').toLowerCase()}
                      </div>
                    </div>
                    <div className="wi-grid">
                      <div className="wi-row"><span>Partner</span><strong>{p.partnerName || '—'}</strong></div>
                      <div className="wi-row"><span># Services</span><strong>{(p.serviceIds || []).length}</strong></div>
                    </div>
                  </div>

                  <div className="wi-side">
                    <div className="wi-price">{fmtUSD(p.total)}</div>
                  </div>

                  {/* Breakdown */}
                  <div className="breakdown-box" data-open={isOpen(p.id)}>
                    <button className="bd-toggle" onClick={() => toggleOpen(p.id)}>
                      <span>Breakdown</span>
                      <ChevronDown size={16} className="chev" />
                    </button>

                    {isOpen(p.id) && (
                      <div className="wpay-breakdown">
                        <div className="wpay-head">Details</div>
                        {lines.length ? renderBreakdownTable(lines) : <div className="wallet-empty" style={{margin:0}}>No service details.</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="ap-pagination">
              <button
                className="ap-btn"
                onClick={() => setApPage((p) => Math.max(1, p - 1))}
                disabled={apPage === 1}
                aria-label="Previous"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="ap-indicator">
                {apPage} / {apTotalPages}
              </div>

              <button
                className="ap-btn"
                onClick={() => setApPage((p) => Math.min(apTotalPages, p + 1))}
                disabled={apPage === apTotalPages}
                aria-label="Next"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL REJECT ===== */}
      {rejecting && (
        <div className="wl-overlay" onClick={()=>setRejecting(null)}>
          <div className="wl-modal" onClick={(e)=>e.stopPropagation()}>
            <h3>Reject payment</h3>
            <p>Please provide a reason. This will be sent back to admin.</p>
            <textarea
              value={rejectReason}
              onChange={(e)=>setRejectReason(e.target.value)}
              placeholder="Describe the issue..."
            />
            <div className="wl-actions">
              <button className="btn-cancel" onClick={()=>setRejecting(null)}>Cancel</button>
              <button className="btn-danger" disabled={!rejectReason.trim()} onClick={confirmReject}>
                <X size={14} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
