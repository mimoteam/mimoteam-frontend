import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, DollarSign, Search, Filter, Settings, Users, MapPin, Eye, X } from 'lucide-react';
import '../styles/Partner.css';


/** Catálogo mínimo de tipos (fallback; pode ser reidratado pelo localStorage) */
const serviceTypes = [
  { id: 'IN_PERSON_TOUR', name: 'In-Person Tour', icon: MapPin, category: 'variable' },
  { id: 'VIRTUAL_TOUR',   name: 'Virtual Tour',   icon: Eye,    category: 'variable' },
  { id: 'COORDINATOR',    name: 'Coordinator',    icon: Calendar, category: 'variable' },
  { id: 'CONCIERGE', name: 'Concierge Service', icon: Settings, category: 'fixed' },
  { id: 'TICKET_DELIVERY', name: 'Ticket Delivery', icon: Settings, category: 'fixed' },
  { id: 'DELIVERY', name: 'Delivery Service', icon: Settings, category: 'fixed' },
  { id: 'AIRPORT_ASSISTANCE', name: 'Airport Assistance', icon: Settings, category: 'fixed' },
  { id: 'VACATION_HOME_ASSISTANCE', name: 'Vacation Home Assistance', icon: Settings, category: 'fixed' },
  { id: 'HOTEL_ASSISTANCE', name: 'Hotel Assistance', icon: Settings, category: 'fixed' },
  { id: 'ADJUSMENT', name: 'Adjusment', icon: DollarSign, category: 'fixed' },
  { id: 'REIMBURSEMENT', name: 'Reimbursement', icon: DollarSign, category: 'fixed' },
  { id: 'EXTRA HOUR', name: 'Extra Hour', icon: DollarSign, category: 'fixed' },
  { id: 'BABYSITTER', name: 'Babysitter', icon: Users, category: 'hourly' }
];

const byId = (arr) => new Map(arr.map(i => [i.id, i]));
const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;

/**
 * PartnerDashboard
 * - Lê currentUser via props (App.jsx passa), com fallback ao localStorage
 * - Mostra só itens “compartilhados” para o parceiro logado
 * - Modal de detalhes com Aprovar / Rejeitar (persiste em localStorage)
 */
export default function PartnerDashboard({ tab = 'wallet', currentUser: userFromProps }) {
  // 1) usuário logado
  const currentUser = useMemo(() => {
    if (userFromProps) return userFromProps;
    try { return JSON.parse(localStorage.getItem('current_user_v1') || 'null'); } catch { return null; }
  }, [userFromProps]);

  const isPartner = (currentUser?.role || '').toLowerCase() === 'partner';

  // 2) carrega users (reidratar partners)
  const partners = useMemo(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('users_store_v1') || '[]');
      return (Array.isArray(arr) ? arr : []).filter(u =>
        (u.role || '').toLowerCase() === 'partner'
      );
    } catch { return []; }
  }, []);
  const partnersById = useMemo(() => byId(partners), [partners]);
  const serviceTypesById = useMemo(() => byId(serviceTypes), []);

  // 3) carrega serviços e reidrata
  const [allServices, setAllServices] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('services_store_v1');
      const arr = raw ? JSON.parse(raw) : [];
      const hydrated = (arr || []).map(s => ({
        ...s,
        partner: s.partner || partnersById.get(s.partnerId) || null,
        serviceType: s.serviceType || serviceTypesById.get(s.serviceTypeId) || { id: s.serviceTypeId, name: s.serviceTypeId, category: 'fixed' }
      }));
      setAllServices(hydrated);
    } catch {
      setAllServices([]);
    }
  }, [partnersById, serviceTypesById]);

  // 4) helper: “compartilhado com este parceiro?”
  const isSharedToMe = (s, myId) => {
    if (!s) return false;
    if (s.shared === true) return true;
    if (Array.isArray(s.sharedWith) && s.sharedWith.includes(myId)) return true;
    // fallback: se admin já enviou para pagamento
    if ((s.status?.id || '').toUpperCase() === 'IN_PAYMENT') return true;
    return false;
  };

  // 5) filtra só do partner logado + compartilhados
  const myServices = useMemo(() => {
    if (!currentUser) return [];
    const id = currentUser.id;
    return allServices
      .filter(s => (s.partner?.id || s.partnerId) === id)
      .filter(s => isSharedToMe(s, id))
      .sort((a,b) => new Date(b.serviceDate) - new Date(a.serviceDate));
  }, [allServices, currentUser]);

  // 6) busca e filtro rápido
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | RECORDED | IN_PAYMENT | APPROVED | PAID

  const filtered = useMemo(() => {
    let out = [...myServices];
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      out = out.filter(s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(t)
        || (s.serviceType?.name || '').toLowerCase().includes(t)
        || (s.park || '').toLowerCase().includes(t)
        || (s.location || '').toLowerCase().includes(t)
      );
    }
    if (statusFilter) {
      out = out.filter(s => (s.status?.id || '').toLowerCase() === statusFilter.toLowerCase());
    }
    return out;
  }, [myServices, q, statusFilter]);

  // 7) métricas simples
  const totals = useMemo(() => {
    const paid = filtered.filter(s => s.status?.id === 'PAID').reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0);
    const pending = filtered.filter(s => s.status?.id !== 'PAID').reduce((sum, s) => sum + (Number(s.finalValue) || 0), 0);
    return { paid, pending, count: filtered.length };
  }, [filtered]);

  // 8) modal de detalhes + ações
  const [detail, setDetail] = useState(null);

  const persistServices = (next) => {
    setAllServices(next);
    try { localStorage.setItem('services_store_v1', JSON.stringify(next)); } catch {}
  };

  const updateService = (id, patch) => {
    const next = allServices.map(s => (s.id === id ? { ...s, ...patch } : s));
    persistServices(next);
  };

  const approve = (s) => {
    const audit = Array.isArray(s.audit) ? s.audit.slice() : [];
    audit.push({ at: new Date().toISOString(), by: currentUser?.id, action: 'approved' });
    updateService(s.id, {
      status: { id: 'APPROVED', name: 'Approved', color: '#3b82f6' },
      approvedAt: new Date().toISOString(),
      audit
    });
    setDetail(null);
  };

  const reject = (s) => {
    const reason = window.prompt('Tell us what is wrong with this payment (optional comment):', s.reviewNote || '');
    const audit = Array.isArray(s.audit) ? s.audit.slice() : [];
    audit.push({ at: new Date().toISOString(), by: currentUser?.id, action: 'returned', note: reason || '' });
    updateService(s.id, {
      status: { id: 'RECORDED', name: 'Recorded', color: '#64748b' },
      reviewNote: reason || '',
      returnedAt: new Date().toISOString(),
      audit
    });
    setDetail(null);
  };

  if (!isPartner) {
    return (
      <div className="partner-page">
        <div className="partner-empty">
          <p>Você não está logado como Partner.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="partner-page">
      {/* SUMMARY */}
      <div className="partner-summary">
        <div className="ps-card">
          <div className="ps-label">Total Services</div>
          <div className="ps-value">{totals.count}</div>
        </div>
        <div className="ps-card">
          <div className="ps-label">Pending</div>
          <div className="ps-value">{fmtUSD(totals.pending)}</div>
        </div>
        <div className="ps-card">
          <div className="ps-label">Paid</div>
          <div className="ps-value">{fmtUSD(totals.paid)}</div>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="partner-controls">
        <div className="pc-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search name, type, park..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <button className="pc-clear" onClick={() => setQ('')} aria-label="Clear">×</button>}
        </div>

        <div className="pc-filters">
          <Filter size={16} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="RECORDED">Recorded</option>
            <option value="IN_PAYMENT">In Payment</option>
            <option value="APPROVED">Approved</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>

      {/* LISTA MOBILE-FIRST */}
      <div className="partner-cards">
        {filtered.length === 0 && (
          <div className="partner-empty">
            <p>No services found.</p>
          </div>
        )}

        {filtered.map(s => {
          const Icon = (serviceTypesById.get(s.serviceType?.id)?.icon) || Settings;
          const st = (s.status?.id || 'RECORDED').toLowerCase();
          return (
            <div className="p-card" key={s.id}>
              <div className="pc-head">
                <div className="pc-type">
                  <Icon size={16} />
                  <span>{s.serviceType?.name || s.serviceTypeId}</span>
                </div>
                <div className={`pc-status ${st}`}>
                  {s.status?.name || s.status?.id || 'Recorded'}
                </div>
              </div>

              <div className="pc-row">
                <div className="pc-label">Client</div>
                <div className="pc-value">{s.firstName} {s.lastName}</div>
              </div>

              <div className="pc-row">
                <div className="pc-label">Date</div>
                <div className="pc-value">
                  {new Date(s.serviceDate).toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' })}
                </div>
              </div>

              <div className="pc-row">
                <div className="pc-label">Details</div>
                <div className="pc-value dim">
                  {[
                    s.serviceTime ? `${s.serviceTime}h` : null,
                    s.park || null,
                    s.location || null,
                    s.guests ? `${s.guests} guests` : null,
                    s.hopper ? 'Hopper' : null
                  ].filter(Boolean).join(' • ') || '—'}
                </div>
              </div>

              <div className="pc-footer">
                <div className="pc-price">{fmtUSD(s.finalValue)}</div>
                <button className="pc-action" onClick={() => setDetail(s)}>
                  <Eye size={16} /> Details
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* SHEET DE DETALHES */}
      {detail && (
        <div className="pd-overlay" role="dialog" aria-modal="true">
          <div className="pd-sheet">
            <div className="pd-title">
              <span>Payment details</span>
              <button className="pc-action" onClick={() => setDetail(null)} aria-label="Close">
                <X size={16} /> Close
              </button>
            </div>

            <div className="pd-section pd-grid">
              <div className="pd-label">Client</div>
              <div>{detail.firstName} {detail.lastName}</div>

              <div className="pd-label">Date</div>
              <div>{new Date(detail.serviceDate).toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' })}</div>

              <div className="pd-label">Service</div>
              <div>{detail.serviceType?.name || detail.serviceTypeId}</div>

              <div className="pd-label">Parameters</div>
              <div>
                {[
                  detail.serviceTime ? `${detail.serviceTime}h` : null,
                  detail.park || null,
                  detail.location || null,
                  detail.guests ? `${detail.guests} guests` : null,
                  detail.hopper ? 'Hopper' : null
                ].filter(Boolean).join(' • ') || '—'}
              </div>

              <div className="pd-label">Final Value</div>
              <div style={{fontWeight:800}}>{fmtUSD(detail.finalValue)}</div>

              {detail.overrideValue ? (
                <>
                  <div className="pd-label">Override</div>
                  <div>{fmtUSD(detail.overrideValue)} (custom)</div>
                </>
              ) : null}

              {detail.reviewNote ? (
                <>
                  <div className="pd-label">Last note</div>
                  <div>{detail.reviewNote}</div>
                </>
              ) : null}
            </div>

            <div className="pd-actions">
              <button className="pd-btn approve" onClick={() => approve(detail)}>Approve</button>
              <button className="pd-btn reject" onClick={() => reject(detail)}>Reject</button>
              <button className="pd-btn close" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
