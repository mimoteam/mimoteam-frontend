import React, { useEffect, useMemo, useState, useRef } from "react";
import { useFinanceData } from "../api/useFinanceData.js";
import { SectionStatus } from "./parts.jsx";
import { api } from "../api/http";
import { useNotifications } from "../contexts/NotificationsContext"; // 🔔
import "../styles/pages/PartnerPayroll.css";

/* ===== Helpers locais ===== */
function sameYYYYMM(iso, ym) {
  if (!iso || !ym) return false;
  const d = new Date(iso);
  const [y, m] = ym.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m;
}
function usePagination(rows, pageSizeDefault = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  useEffect(() => { setPage(1); }, [pageSize, rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pageRows = useMemo(() => rows.slice(startIndex, startIndex + pageSize), [rows, startIndex, pageSize]);
  return { page, setPage, pageSize, setPageSize, totalPages, pageRows };
}

export default function PartnerPayroll() {
  const { payments, services } = useFinanceData();

  // 🔔 notifications
  const { addNotification, push } = useNotifications() || {};
  const notify = addNotification || push || (()=>{});
  const seenPaymentsRef = useRef(new Set());
  const seededRef = useRef(false);

  // cópia local para UI otimista
  const [localPayments, setLocalPayments] = useState(() => payments || []);
  useEffect(() => setLocalPayments(payments || []), [payments]);

  // 🔔 notifica novos pagamentos (pós-semente)
  useEffect(()=>{
    const list = Array.isArray(payments) ? payments : [];
    if (!list.length) return;

    const ids = list.map(p => p.id || p._id).filter(Boolean);
    if (!seededRef.current) {
      ids.forEach(id => seenPaymentsRef.current.add(id));
      seededRef.current = true;
      return;
    }

    const fresh = list.filter(p => !seenPaymentsRef.current.has(p.id || p._id));
    if (fresh.length) {
      fresh.forEach(p => {
        const id = p.id || p._id;
        seenPaymentsRef.current.add(id);

        const status = String(p.status || '').toUpperCase();
        const amount = Number(p.amount || p.total || 0);
        const partner = p.partnerName || p.partner?.name || p.partnerFullName || 'Partner';

        let title = 'New Payment';
        let type  = 'info';
        if (status === 'APPROVED') { title = 'Payment Approved'; type = 'success'; }
        else if (status === 'PAID') { title = 'Payment Paid'; type = 'success'; }
        else if (status === 'AWAITING' || status === 'SHARED') { title = 'Payment Awaiting Approval'; type = 'info'; }

        notify({
          id: `pay:${id}`,
          kind: 'payment_new',
          type,
          title,
          message: `${partner} • $${amount.toFixed(2)} • ${status}`,
          pageId: 'finance_payroll',
          meta: { paymentId: id, status, partner },
          timestamp: Date.now()
        });
      });
    }
  },[payments]); // eslint-disable-line

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const serviceById = useMemo(() => {
    const map = new Map();
    (services || []).forEach(s => map.set(s.id, s));
    return map;
  }, [services]);

  // listas por status
  const approvedAll = useMemo(() => {
    return (localPayments || [])
      .filter(p => (p.status || "").toUpperCase() === "APPROVED")
      .filter(p => p.weekStart ? sameYYYYMM(p.weekStart, month) : (p.createdAt ? sameYYYYMM(p.createdAt, month) : true))
      .sort((a, b) => new Date(b.weekStart || b.createdAt || 0) - new Date(a.weekStart || a.createdAt || 0));
  }, [localPayments, month]);

  const sharedAll = useMemo(() => {
    return (localPayments || [])
      .filter(p => {
        const s = (p.status || "").toUpperCase();
        return s === "SHARED" || s === "AWAITING";
      })
      .filter(p => p.weekStart ? sameYYYYMM(p.weekStart, month) : (p.createdAt ? sameYYYYMM(p.createdAt, month) : true))
      .sort((a, b) => new Date(b.weekStart || b.createdAt || 0) - new Date(a.weekStart || a.createdAt || 0));
  }, [localPayments, month]);

  const paidAll = useMemo(() => {
    return (localPayments || [])
      .filter(p => (p.status || "").toUpperCase() === "PAID")
      .filter(p => p.paidAt ? sameYYYYMM(p.paidAt, month) : (p.weekStart ? sameYYYYMM(p.weekStart, month) : true))
      .sort((a, b) => new Date(b.paidAt || b.weekStart || 0) - new Date(a.paidAt || a.weekStart || 0));
  }, [localPayments, month]);

  // paginações
  const approvedPag = usePagination(approvedAll, 5);
  const sharedPag   = usePagination(sharedAll, 10);
  const paidPag     = usePagination(paidAll, 10);

  // abrir/fechar breakdown
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen(prev => {
    const nx = new Set(prev); nx.has(id) ? nx.delete(id) : nx.add(id); return nx;
  });

  /* ===== Actions ===== */
  async function markAsPaid(paymentId) {
    // otimista
    setLocalPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: "PAID", paidAt: new Date().toISOString() } : p));
    try {
      try {
        await api(`/payments/${paymentId}`, { method: "PATCH", body: { status: "PAID", paidAt: new Date().toISOString() } });
      } catch {
        await api(`/payments/${paymentId}/mark-paid`, { method: "POST" });
      }
    } catch {
      // mantém o estado local caso falhe
    }
  }

  return (
    <div className="finance-page finance-payroll">
      {/* Filtros */}
      <div className="fin-actions">
        <div className="fin-inline" style={{ gap: 12, flexWrap: "wrap" }}>
          <span>Filter by month:</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {/* To be Paid */}
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

      {/* Awaiting Approval */}
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
    </div>
  );
}
