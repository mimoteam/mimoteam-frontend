// frontend/src/pages/PartnerReimbursements.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  User,
  Calendar as CalendarIcon,
  FileText,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import '../styles/PartnerReimbursements.css';

// 🔌 usa o backend de /services
import { fetchServices, createService, deleteService } from '../api/services';

const SERVICE_TYPE_ID = 'REIMBURSEMENT';

const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;
const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};
const nowMonth = () => monthKey(new Date());

// dado "YYYY-MM", devolve [dateFrom, dateTo] (início/fim do mês, ISO-8601)
function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export default function PartnerReimbursements({ currentUser }) {
  // ------- FORM -------
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    serviceDate: '',
    amount: '',
    observations: '',
  });
  const [errors, setErrors] = useState({});

  // ------- LIST (via backend) -------
  const [rrMonth, setRrMonth] = useState(nowMonth());
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const partnerId = currentUser?.id || '';
  const [dateFrom, dateTo] = useMemo(() => monthRange(rrMonth), [rrMonth]);

  // ------- Handlers -------
  const setField = (k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (!form.serviceDate) e.serviceDate = 'Date is required';
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) e.amount = 'Enter a valid amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const clearForm = () => {
    setForm({
      firstName: '',
      lastName: '',
      serviceDate: '',
      amount: '',
      observations: '',
    });
    setErrors({});
  };

  async function loadReimbursements() {
    if (!partnerId) {
      setItems([]); setTotalPages(1); setTotalRecords(0);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchServices({
        page,
        pageSize,
        sortBy: 'serviceDate',
        sortDir: 'desc',
        filters: {
          partner: partnerId,
          serviceType: SERVICE_TYPE_ID,
          dateFrom,
          dateTo,
        },
      });

      const arr = Array.isArray(res.items)
        ? res.items
        : (Array.isArray(res.data) ? res.data : []);

      setItems(arr);
      setTotalPages(Number(res.totalPages ?? 1));
      setTotalRecords(Number(res.total ?? res.totalRecords ?? arr.length));
    } catch (e) {
      console.error('Failed to load reimbursements', e);
      setItems([]); setTotalPages(1); setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); }, [rrMonth, partnerId]);
  useEffect(() => { loadReimbursements(); }, [page, pageSize, rrMonth, partnerId]);

  const saveReimbursement = async () => {
    if (!validate()) return;
    try {
      await createService({
        serviceDate: form.serviceDate,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        partnerId,
        team: null,
        serviceTypeId: SERVICE_TYPE_ID,
        serviceTime: null,
        park: null,
        location: null,
        hopper: false,
        guests: null,
        observations: form.observations?.trim() || null,
        finalValue: parseFloat(form.amount),
        overrideValue: null,
        calculatedPrice: null,
        status: 'RECORDED',
      });

      if (monthKey(form.serviceDate) !== rrMonth) {
        setRrMonth(monthKey(form.serviceDate));
      } else {
        await loadReimbursements();
      }
      clearForm();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (e) {
      console.error(e);
      alert('Failed to save reimbursement.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this reimbursement?')) return;
    try {
      await deleteService(id);
      await loadReimbursements();
    } catch (e) {
      console.error(e);
      alert('Failed to delete item.');
    }
  };

  return (
    <div className="reimb-page">
      {/* FORM */}
      <div className="reimb-form card">
        <div className="card-head">
          <div className="icon"><DollarSign size={18} /></div>
          <div>
            <h2>Request Reimbursement</h2>
            <p className="muted">Fill the client and expense details below.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label><User size={14}/> First Name</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
              placeholder="Client first name"
              className={errors.firstName ? 'error' : ''}
            />
            {errors.firstName && <div className="err">{errors.firstName}</div>}
          </div>

          <div className="field">
            <label><User size={14}/> Last Name</label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => setField('lastName', e.target.value)}
              placeholder="Client last name"
              className={errors.lastName ? 'error' : ''}
            />
            {errors.lastName && <div className="err">{errors.lastName}</div>}
          </div>

          <div className="field">
            <label><CalendarIcon size={14}/> Service Date</label>
            <input
              type="date"
              value={form.serviceDate}
              onChange={(e) => setField('serviceDate', e.target.value)}
              className={errors.serviceDate ? 'error' : ''}
            />
            {errors.serviceDate && <div className="err">{errors.serviceDate}</div>}
          </div>

          <div className="field">
            <label><DollarSign size={14}/> Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setField('amount', e.target.value)}
              placeholder="0.00"
              className={errors.amount ? 'error' : ''}
            />
            {errors.amount && <div className="err">{errors.amount}</div>}
          </div>

          <div className="field">
            <label><FileText size={14}/> Service Type</label>
            <div className="readonly-chip">Reimbursement</div>
          </div>

          <div className="field field--full">
            <label><FileText size={14}/> Notes (optional)</label>
            <textarea
              rows={3}
              value={form.observations}
              onChange={(e) => setField('observations', e.target.value)}
              placeholder="Details to help the admin process this reimbursement"
            />
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={saveReimbursement}>
            <Plus size={16}/> Submit
          </button>
        </div>
      </div>

      {/* RECENT REIMBURSEMENTS */}
      <div className="reimb-list card">
        <div className="card-head">
          <div className="icon"><HistoryIcon /></div>
          <div>
            <h2>Recent Reimbursements</h2>
            <p className="muted">Filter by month, paginate, and manage items.</p>
          </div>
        </div>

        <div className="list-controls">
          <div className="month-filter">
            <label>Month</label>
            <input
              type="month"
              value={rrMonth}
              onChange={(e) => setRrMonth(e.target.value || nowMonth())}
            />
          </div>
          <div className="count-pill">
            {loading ? 'Loading…' : `${totalRecords} items`}
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading reimbursements…</div>
        ) : items.length === 0 ? (
          <div className="empty">No reimbursements for this month.</div>
        ) : (
          <>
            <div className="r-table">
              <div className="r-thead">
                <div className="r-th w-date">Date</div>
                <div className="r-th w-client">Client</div>
                <div className="r-th w-amount right">Amount</div>
                <div className="r-th w-notes notes-col">Notes</div>
                <div className="r-th w-actions right">Actions</div>
              </div>

              <div className="r-tbody">
                {items.map((r) => {
                  const id = r.id || r._id;
                  const client = `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—';
                  return (
                    <div key={id} className="r-tr">
                      <div className="r-td w-date" data-label="Date">
                        {r.serviceDate ? new Date(r.serviceDate).toLocaleDateString() : '—'}
                      </div>
                      <div className="r-td w-client" data-label="Client">{client}</div>
                      <div className="r-td w-amount right" data-label="Amount">
                        {fmtUSD(r.finalValue)}
                      </div>
                      <div className="r-td w-notes notes-col" data-label="Notes">
                        {r.observations || '—'}
                      </div>
                      <div className="r-td w-actions right">
                        <button
                          className="btn-icon danger"
                          title="Delete"
                          onClick={() => handleDelete(id)}
                        >
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <button
                className="pg-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous"
              >
                <ChevronLeft size={18}/>
              </button>
              <div className="pg-indicator">{page} / {totalPages}</div>
              <button
                className="pg-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next"
              >
                <ChevronRight size={18}/>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Só para estética do card */
function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 8v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12a9 9 0 10-3.87 7.44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
