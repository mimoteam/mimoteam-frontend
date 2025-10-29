import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  CalendarDays, Check, X, DollarSign, BarChart3, TrendingUp, Clock,
  ChevronLeft, ChevronRight, ChevronDown, Calendar
} from 'lucide-react';
import { api } from '../api/http';
import '../styles/pages/PartnerWallet.css';

/* ================= Helpers ================= */

function getWeekWedTue(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay();
  const toWed = (dow >= 3) ? (dow - 3) : (dow + 4);
  const start = new Date(d); start.setDate(d.getDate() - toWed); start.setHours(0,0,0,0);
  const end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end };
}

function sameYYYYMM(iso, ym){
  if (!iso || !ym) return false;
  const d = new Date(iso);
  const [y,m] = ym.split('-').map(Number);
  return d.getUTCFullYear() === y && (d.getUTCMonth() + 1) === m;
}

const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;
const NORM = (s) => String(s || '').toUpperCase();
const SID = (v) => (v == null ? null : String(v));

/* Datas normalizadas */
const getPWeekStart = (p) => p?.week?.start || p?.weekStart || p?.periodFrom || p?.createdAt || null;
const getPWeekEnd   = (p) => p?.week?.end   || p?.weekEnd   || p?.periodTo   || p?.createdAt || null;

const SERVICE_LABELS = {
  IN_PERSON_TOUR: 'In Person Tour',
  VIRTUAL_TOUR: 'Virtual Tour',
  CONCIERGE: 'Concierge',
  COORDINATOR: 'Coordinator',
  REIMBURSEMENT: 'Reimbursement',
};
const fmtServiceType = (v) => {
  if (!v) return '—';
  let raw = (typeof v === 'object' && v !== null) ? (v.name || v.label || v.id || v.code || '') : String(v);
  if (!raw) return '—';
  const key = raw.trim().replace(/\s+/g, '_').replace(/-+/g, '_').toUpperCase();
  if (SERVICE_LABELS[key]) return SERVICE_LABELS[key];
  const spaced = raw.replace(/[_\-]+/g, ' ').trim().toLowerCase();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
};

function asId(v) {
  if (!v) return null;
  if (typeof v === 'string') return SID(v);
  if (typeof v === 'object') return SID(v._id || v.id || v.serviceId || null);
  return null;
}

function extractServiceIdsFromPayment(p) {
  if (Array.isArray(p?.serviceIds)) return p.serviceIds.map(asId).filter(Boolean);
  if (Array.isArray(p?.services))   return p.services.map(asId).filter(Boolean);
  if (Array.isArray(p?.items))      return p.items.map((it) => asId(it?.service || it?.serviceId || it)).filter(Boolean);
  return [];
}

function embeddedServiceLines(p) {
  if (Array.isArray(p?.services) && p.services.length && typeof p.services[0] === 'object') {
    return p.services.map((s) => ({ ...s, id: SID(s._id || s.id) }));
  }
  if (Array.isArray(p?.items) && p.items.length && typeof p.items[0] === 'object') {
    return p.items.map((s) => {
      const sid = SID(s._id || s.id || s.serviceId || (s.service && (s.service._id || s.service.id)));
      return { ...s, id: sid };
    });
  }
  return [];
}

function monthToRange(ym) {
  const [y,m] = ym.split('-').map(Number);
  const from = new Date(Date.UTC(y, m-1, 1, 0,0,0,0));
  const to   = new Date(Date.UTC(y, m,   0, 23,59,59,999));
  return { from: from.toISOString(), to: to.toISOString() };
}

/* ============== Mapeamento de status ============== */
const viewStatus = (raw) => {
  const s = NORM(raw);
  if (s === 'APPROVED' || s === 'PAID' || s === 'DECLINED') return s;
  return 'PENDING';
};

/* Visibilidade para o parceiro: só depois do SHARE (e estágios seguintes) */
const isVisibleToPartner = (p) => {
  const s = NORM(p?.status);
  return ['SHARED','APPROVED','PAID','DECLINED','ON_HOLD'].includes(s);
};

/* Nome do partner (com fallbacks) */
const partnerDisplayName = (p, currentUser, authIsPartner) =>
  p?.partnerName
  || p?.partner?.name
  || p?.partner?.fullName
  || (authIsPartner ? (currentUser?.fullName || currentUser?.name) : '')
  || '—';

/* ================================================================================= */

export default function PartnerWallet({ currentUser, coloredCards = true, filterPartnerId = null }) {
  const role = (currentUser?.role || currentUser?.userType || '').toString().toLowerCase();
  const authIsPartner = role === 'partner';
  const targetPartnerId = filterPartnerId || (authIsPartner ? (currentUser?.id || currentUser?._id) : null);

  const [servicesById, setServicesById] = useState(new Map());
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [lastError, setLastError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('PENDING');
  const defaultMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

  const [psMonth, setPsMonth] = useState(defaultMonth);
  const [psPage, setPsPage]   = useState(1);
  const [apMonth, setApMonth] = useState(defaultMonth);
  const [apPage, setApPage]   = useState(1);

  const [weekRef, setWeekRef] = useState(getWeekWedTue(new Date()).start);

  const [rejecting, setRejecting]       = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  /* abre/fecha: payment (Breakdown) */
  const [openMap, setOpenMap] = useState({});
  const isOpen = (id) => !!openMap[id];
  const toggleOpen = (id) => setOpenMap(m => ({ ...m, [id]: !m[id] }));

  /* abre/fecha: service row (apenas landscape) */
  const [rowOpen, setRowOpen] = useState({});
  const isRowOpen = (id) => !!rowOpen[id];
  const toggleRow = (id) => setRowOpen(m => ({ ...m, [id]: !m[id] }));

  /* ===== dropdown de status ===== */
  const STATUS_OPTIONS = [
    { value: 'PENDING',   label: 'Pending'   },
    { value: 'APPROVED',  label: 'Approved'  },
    { value: 'PAID',      label: 'Paid'      },
    { value: 'DECLINED',  label: 'Declined'  },
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

  /* =================== Fetch helpers =================== */
  const DEV = typeof window !== 'undefined' && window?.location?.hostname === 'localhost';

  const pickItems = (res) => {
    if (Array.isArray(res?.items)) return res.items;
    if (Array.isArray(res?.data?.items)) return res.data.items;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
  };

  async function fetchPaymentsByMonth(month) {
    setLastError(null);
    const baseParams = {
      month,
      pageSize: 500,
      sortBy: 'weekStart',
      sortDir: 'desc',
      ...(DEV ? { debug: 1 } : {}),
      ...(targetPartnerId && !authIsPartner ? { partnerId: targetPartnerId } : {}),
    };

    try {
      return await api.get('/payments', { params: baseParams });
    } catch (err) {
      setLastError(err?.data?.error || err?.message || 'Unknown error');
      try {
        const { from, to } = monthToRange(month);
        const alt = await api.get('/payments', {
          params: {
            from, to, pageSize: 500, sortBy: 'weekStart', sortDir: 'desc',
            ...(DEV ? { debug: 1 } : {}),
            ...(targetPartnerId && !authIsPartner ? { partnerId: targetPartnerId } : {}),
          }
        });
        return alt;
      } catch (err2) {
        setLastError(err2?.data?.error || err2?.message || 'Unknown error');
        throw err2;
      }
    }
  }

  /* =============== Load payments =============== */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        let listA = [], listB = [];
        if (psMonth === apMonth) {
          const a = await fetchPaymentsByMonth(psMonth); listA = pickItems(a);
        } else {
          const [a, b] = await Promise.all([ fetchPaymentsByMonth(psMonth), fetchPaymentsByMonth(apMonth) ]);
          listA = pickItems(a); listB = pickItems(b);
        }

        const map = new Map();
        [...listA, ...listB].forEach(p => {
          const id = String(p._id || p.id || '');
          if (!id) return;
          map.set(id, { ...p, id });
        });
        const merged = Array.from(map.values())
          .sort((x,y) => new Date(getPWeekStart(y) || y.createdAt || 0) - new Date(getPWeekStart(x) || x.createdAt || 0));

        if (alive) setPayments(merged);
      } catch (e) {
        if (alive) { setPayments([]); console.warn('Failed to load payments', e); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psMonth, apMonth, targetPartnerId, authIsPartner]);

  /* =============== Load services for breakdown =============== */
  useEffect(() => {
    if (!payments.length) return;

    const allIdsSet = new Set();
    payments.forEach((p) => extractServiceIdsFromPayment(p).forEach((id) => allIdsSet.add(SID(id))));
    if (allIdsSet.size === 0) return;

    const missing = Array.from(allIdsSet).filter((id) => !servicesById.has(id));
    if (missing.length === 0) return;

    let alive = true;
    (async () => {
      try {
        const chunk = 80;
        const fetched = [];
        for (let i = 0; i < missing.length; i += chunk) {
          const idsArr = missing.slice(i, i + chunk);
          const r = await api.get('/services', {
            params: { ids: idsArr.join(','), 'ids[]': idsArr, pageSize: idsArr.length, ...(DEV ? { debug: 1 } : {}) }
          });
          const items = pickItems(r);
          fetched.push(...items);
        }
        const next = new Map(servicesById);
        fetched.forEach(svc => {
          const key = SID(svc._id || svc.id);
          next.set(key, { ...svc, id: key });
        });
        if (alive) setServicesById(next);
      } catch (e) {
        console.warn('Failed to load services by ids', e);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments]);

  const linesForPayment = (p) => {
    const ids = extractServiceIdsFromPayment(p).map(SID).filter(Boolean);
    const embedded = embeddedServiceLines(p);
    const embById = new Map(embedded.map(l => [SID(l.id), l]));
    if (ids.length) {
      const out = ids.map(id => embById.get(id) || servicesById.get(id)).filter(Boolean);
      embedded.forEach(l => {
        const k = SID(l.id);
        if (!ids.includes(k) && !out.find(x => SID(x.id) === k)) out.push(l);
      });
      return out;
    }
    return embedded;
  };

  const sumValues = (arr) =>
    arr.reduce((acc, it) => acc + Number(it?.finalValue ?? it?.amount ?? it?.total ?? 0), 0);

  const totalForPayment = (p) => {
    const lines = linesForPayment(p);
    if (Array.isArray(lines) && lines.length) return sumValues(lines);
    return Number(p.total ?? p.displayTotal ?? p.totalComputed ?? p.totalAmount ?? 0);
  };

  /* =============== Derivados =============== */

  const statusPayments = useMemo(() => {
    let arr = payments.slice();
    arr = arr.filter(isVisibleToPartner);
    arr = arr.filter(p => viewStatus(p.status) === statusFilter);
    arr = arr.filter(p => {
      const ref = getPWeekStart(p) || p.createdAt;
      return ref && sameYYYYMM(ref, psMonth);
    });
    arr.sort((a,b) => new Date(getPWeekStart(b) || b.createdAt || 0) - new Date(getPWeekStart(a) || a.createdAt || 0));
    return arr;
  }, [payments, statusFilter, psMonth]);

  const psTotalPages = Math.max(1, statusPayments.length || 1);
  const psCurrent = statusPayments[psPage - 1] || null;

  const allPaymentsFiltered = useMemo(() => {
    const arr = payments
      .filter(isVisibleToPartner)
      .filter(p => {
        const ref = getPWeekStart(p) || p.createdAt;
        return ref && sameYYYYMM(ref, apMonth);
      })
      .sort((a,b) => new Date(getPWeekStart(b) || b.createdAt || 0) - new Date(getPWeekStart(a) || a.createdAt || 0));
    return arr;
  }, [payments, apMonth]);

  const apTotalPages = Math.max(1, allPaymentsFiltered.length || 1);
  const apCurrent = allPaymentsFiltered[apPage - 1] || null;

  const [weekMetrics, monthMetrics, pendingCount, yearTotal] = useMemo(() => {
    const { start, end } = getWeekWedTue(weekRef);

    const inWeek = payments.filter(p => {
      if (!isVisibleToPartner(p)) return false;
      const ref = getPWeekStart(p) || p.createdAt;
      const d = ref ? new Date(ref) : null;
      return d && d >= start && d <= end;
    });
    const weekTotal = inWeek.reduce((sum, p) => sum + totalForPayment(p), 0);

    const inMonth = payments.filter(p => {
      if (!isVisibleToPartner(p)) return false;
      const ref = getPWeekStart(p) || p.createdAt;
      return ref && sameYYYYMM(ref, apMonth);
    });
    const monthTotal = inMonth.reduce((sum, p) => sum + totalForPayment(p), 0);

    const pendCount = payments.filter(p => viewStatus(p.status) === 'PENDING').length;

    const Y = new Date().getFullYear();
    const yCount = payments.filter(p => {
      if (!isVisibleToPartner(p)) return false;
      const ref = getPWeekStart(p) || p.createdAt;
      const d = ref ? new Date(ref) : null;
      return d && d.getFullYear() === Y;
    }).length;

    return [
      { count: inWeek.length, total: weekTotal, start, end },
      { total: monthTotal, count: inMonth.length, key: apMonth },
      pendCount,
      yCount
    ];
  }, [payments, weekRef, apMonth, servicesById]);

  useEffect(() => { setPsPage(1); }, [statusFilter, psMonth]);

  const pushAuditLocal = (p, text) => {
    const list = Array.isArray(p.notesLog) ? p.notesLog.slice() : [];
    const rid = (typeof window !== 'undefined' && window.crypto?.randomUUID) ? window.crypto.randomUUID() : `note_${Date.now()}`;
    list.push({ id: rid, at:new Date().toISOString(), text });
    return list;
  };

  const approve = async (p) => {
    try {
      const data = await api.patch(`/payments/${p.id}`, {
        status: 'APPROVED',
        appendNote: true,
        notes: 'Partner approved'
      });
      const upd = { ...(data || {}), id: data?._id || data?.id || p.id };
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, ...upd } : x)));
    } catch (e) {
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, status: 'APPROVED', notesLog: pushAuditLocal(p, 'Partner approved') } : x)));
      console.warn('approve failed, applied optimistic update', e);
    }
  };

  const beginReject = (p) => { setRejecting(p); setRejectReason(''); };
  const confirmReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    const p = rejecting;
    try {
      const data = await api.patch(`/payments/${p.id}`, {
        status: 'DECLINED',
        appendNote: true,
        notes: `Partner declined — ${rejectReason.trim()}`
      });
      const upd = { ...(data || {}), id: data?._id || data?.id || p.id };
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, ...upd } : x)));
    } catch (e) {
      setPayments(prev => prev.map(x => (x.id === p.id ? { ...x, status: 'DECLINED', notesLog: pushAuditLocal(p, `Partner declined — ${rejectReason.trim()}`) } : x)));
    } finally {
      setRejecting(null); setRejectReason('');
    }
  };

  const weekLabel = (p) => {
    const s = getPWeekStart(p);
    const e = getPWeekEnd(p);
    if (s && e) return `${new Date(s).toLocaleDateString()} – ${new Date(e).toLocaleDateString()}`;
    if (p.periodFrom || p.periodTo) {
      const from = p.periodFrom ? new Date(p.periodFrom).toLocaleDateString() : '…';
      const to   = p.periodTo   ? new Date(p.periodTo).toLocaleDateString()   : '…';
      return `${from} – ${to}`;
    }
    return '—';
  };

  /* ======= Subcomponente de linha com expansão (obs) ======= */
  const ServiceRow = ({ s }) => {
    const open = isRowOpen(s.id);
    const client = `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—';
    const park   = s.park || s.location || '—';
    const guests = (s.guests ?? '—');
    const obs = s.observation ?? s.observations ?? s.note ?? s.notes ?? s.comment ?? s.comments ?? s.title ?? '';

    return (
      <div className={`tr srv-row${open ? ' is-open' : ''}`} data-id={s.id}>
        <div className="td" data-label="Date">
          {s.serviceDate ? new Date(s.serviceDate).toLocaleDateString() : '—'}
        </div>
        <div className="td" data-label="Client">{client}</div>
        <div className="td" data-label="Service">
          <div className="main">{fmtServiceType(s?.serviceType || s?.serviceTypeId)}</div>
          {/* OBS NÃO aparece aqui; só no expand */}
        </div>
        <div className="td" data-label="Park">{park}</div>
        <div className="td center" data-label="Guests">{guests}</div>
        <div className="td right amount" data-label="Amount">
          <button
            type="button"
            className="srv-toggle"
            aria-expanded={open}
            onClick={() => toggleRow(s.id)}
            title={open ? 'Hide details' : 'Show details'}
          >
            <ChevronDown size={16} className="chev"/>
          </button>
          <span className="value">{fmtUSD(s.finalValue)}</span>
        </div>

        {/* Área expandida — apenas landscape via CSS */}
        <div className="srv-extra">
          {obs ? (
            <div className="obs-line">
              <span className="chip">OBS</span>
              <span className="text">{obs}</span>
            </div>
          ) : (
            <div className="muted">No additional notes.</div>
          )}
        </div>
      </div>
    );
  };

  /* ======= Breakdown table ======= */
  const renderBreakdownTable = (lines) => {
    if (!lines?.length) return null;

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
          {lines.map((s) => <ServiceRow key={s.id} s={s} />)}
        </div>
      </div>
    );
  };

  const statusClass = (p) => viewStatus(p.status).toLowerCase();

  /* =========================== RENDER =========================== */
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
        <div className="wf-status status-theme--PENDING" style={{display:'none'}} aria-hidden />
        <div className="wf-status status-theme--APPROVED" style={{display:'none'}} aria-hidden />
        <div className="wf-status status-theme--PAID" style={{display:'none'}} aria-hidden />
        <div className="wf-status status-theme--DECLINED" style={{display:'none'}} aria-hidden />
        <div className="status-dd" ref={statusRef} data-open={statusOpen}>
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
                  key={opt.value}
                  role="option"
                  className={`status-dd-item${statusFilter === opt.value ? ' active' : ''}`}
                  onClick={() => { setStatusFilter(opt.value); setStatusOpen(false); }}
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
            <input type="month" value={psMonth} onChange={(e) => { setPsMonth(e.target.value || defaultMonth); setPsPage(1); }} />
          </div>
        </div>

        {loading && statusPayments.length === 0 ? (
          <div className="wallet-empty">Loading…</div>
        ) : statusPayments.length === 0 ? (
          <div className="wallet-empty">
            No items for this status.
            {lastError && <div className="err-inline">Last error: {String(lastError)}</div>}
          </div>
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
                      <div className="wi-status-wrap" style={{display:'flex', gap:8, alignItems:'center'}}>
                        <div className={`wi-status tag ${statusClass(p)}`}>{viewStatus(p.status).toLowerCase()}</div>
                        {Array.isArray(p.notesLog) && p.notesLog.length > 0 && (
                          <span className="tag notes" title="Notes on this payment">
                            {p.notesLog.length} note{p.notesLog.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="wi-grid">
                      <div className="wi-row"><span>Partner</span><strong>{partnerDisplayName(p, currentUser, authIsPartner)}</strong></div>
                      <div className="wi-row"><span>Services</span><strong>{extractServiceIdsFromPayment(p).length || embeddedServiceLines(p).length || 0}</strong></div>
                      <div className="wi-row">
                        <span>Details</span>
                        <strong className="muted">
                          {lines.length>0
                            ? `${fmtServiceType(lines[0]?.serviceType || lines[0]?.serviceTypeId)}${lines.length>1 ? ` +${lines.length-1}`:''}`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="wi-side">
                    <div className="wi-price">{fmtUSD(totalForPayment(p))}</div>
                    <div className="wi-actions">
                      <button className="wi-approve" onClick={()=>approve(p)} disabled={viewStatus(p.status) !== 'PENDING'}>
                        <Check size={16}/> Approve
                      </button>
                      <button className="wi-reject"  onClick={()=>beginReject(p)} disabled={viewStatus(p.status) !== 'PENDING'}>
                        <X size={16}/> Reject
                      </button>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="breakdown-box" data-open={isOpen(p.id)}>
                    <button className="bd-toggle" onClick={() => toggleOpen(p.id)} aria-expanded={isOpen(p.id)}>
                      <span>Breakdown</span>
                      <ChevronDown size={16} className="chev" />
                    </button>

                    {isOpen(p.id) && (
                      <div className="wpay-breakdown">
                        <div className="wpay-head">Details</div>
                        {lines.length ? renderBreakdownTable(lines) : <div className="wallet-empty" style={{margin:0}}>No service details.</div>}

                        {Array.isArray(p.notesLog) && p.notesLog.length > 0 && (
                          <>
                            <div className="wpay-head" style={{marginTop:12}}>Notes</div>
                            <div className="notes-list">
                              {[...p.notesLog].reverse().map((n) => (
                                <div key={n.id || n._id} className="note-item">
                                  <div className="note-meta">{new Date(n.at).toLocaleString()}</div>
                                  <div className="note-text">{n.text}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* paginação */}
            <div className="ap-pagination">
              <button className="ap-btn" onClick={() => setPsPage(p => Math.max(1, p - 1))} disabled={psPage === 1} aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <div className="ap-indicator">{psPage} / {psTotalPages}</div>
              <button className="ap-btn" onClick={() => setPsPage(p => Math.min(psTotalPages, p + 1))} disabled={psPage === psTotalPages} aria-label="Next">
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
          <div className="wallet-empty">
            No payments for this month.
            {lastError && <div className="err-inline">Last error: {String(lastError)}</div>}
          </div>
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
                      <div className="wi-status-wrap" style={{display:'flex', gap:8, alignItems:'center'}}>
                        <div className={`wi-status tag ${statusClass(p)}`}>
                          {viewStatus(p.status).toLowerCase()}
                        </div>
                        {Array.isArray(p.notesLog) && p.notesLog.length > 0 && (
                          <span className="tag notes" title="Notes on this payment">
                            {p.notesLog.length} note{p.notesLog.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="wi-grid">
                      <div className="wi-row"><span>Partner</span><strong>{partnerDisplayName(p, currentUser, authIsPartner)}</strong></div>
                      <div className="wi-row"><span># Services</span><strong>{extractServiceIdsFromPayment(p).length || embeddedServiceLines(p).length || 0}</strong></div>
                    </div>
                  </div>

                  <div className="wi-side">
                    <div className="wi-price">{fmtUSD(totalForPayment(p))}</div>
                  </div>

                  {/* Breakdown */}
                  <div className="breakdown-box" data-open={isOpen(p.id)}>
                    <button className="bd-toggle" onClick={() => toggleOpen(p.id)} aria-expanded={isOpen(p.id)}>
                      <span>Breakdown</span>
                      <ChevronDown size={16} className="chev" />
                    </button>

                    {isOpen(p.id) && (
                      <div className="wpay-breakdown">
                        <div className="wpay-head">Details</div>
                        {lines.length ? renderBreakdownTable(lines) : <div className="wallet-empty" style={{margin:0}}>No service details.</div>}

                        {Array.isArray(p.notesLog) && p.notesLog.length > 0 && (
                          <>
                            <div className="wpay-head" style={{marginTop:12}}>Notes</div>
                            <div className="notes-list">
                              {[...p.notesLog].reverse().map((n) => (
                                <div key={n.id || n._id} className="note-item">
                                  <div className="note-meta">{new Date(n.at).toLocaleString()}</div>
                                  <div className="note-text">{n.text}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="ap-pagination">
              <button className="ap-btn" onClick={() => setApPage((p) => Math.max(1, p - 1))} disabled={apPage === 1} aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <div className="ap-indicator">{apPage} / {apTotalPages}</div>
              <button className="ap-btn" onClick={() => setApPage((p) => Math.min(apTotalPages, p + 1))} disabled={apPage === apTotalPages} aria-label="Next">
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
