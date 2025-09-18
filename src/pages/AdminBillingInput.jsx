import React, { useMemo, useState, useEffect } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import "../styles/pages/AdminBillingInput.css";

import {
  listBilling,
  createBilling,
  removeBilling,
} from "../api/billing";

// Para exibir label amigável
const SERVICE_OPTIONS = [
  { id: "lightning_lane", label: "Lightning Lane" },
  { id: "food",           label: "Food" },
  { id: "concierge",      label: "Concierge" },
  { id: "ticket",         label: "Ticket" },
  { id: "other",          label: "Other" },
];
const labelOf = (id) => SERVICE_OPTIONS.find(s => s.id === id)?.label || id;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// 🔑 helper para chave estável (cobre _id, id e um fallback determinístico)
const rowKey = (r, idx) =>
  String(r?._id || r?.id || `${r?.client || "row"}-${r?.service || ""}-${r?.createdAt || ""}-${idx}`);

export default function AdminBillingInput() {
  // form
  const [client, setClient] = useState("");
  const [service, setService] = useState("");
  const [observation, setObservation] = useState("");
  const [amountRaw, setAmountRaw] = useState("");

  // tabela
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchRows = async (pageToLoad = page) => {
    setLoading(true);
    try {
      const { items = [], total: t = items.length } = await listBilling({
        page: pageToLoad,
        pageSize: PAGE_SIZE,
      });
      setRows(items);
      setTotal(t);
    } catch (err) {
      console.error(err);
      alert(err?.details?.error || err.message || "Failed to load billing list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(1); }, []);          // primeira carga
  useEffect(() => { fetchRows(page); }, [page]);   // paginação

  const totalAmount = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows]
  );

  const pageRange = (cur, total, max = 5) => {
    const half = Math.floor(max / 2);
    let start = Math.max(1, cur - half);
    let end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const clearForm = () => {
    setClient("");
    setService("");
    setObservation("");
    setAmountRaw("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(String(amountRaw).replace(",", "."));

    if (!client.trim()) return alert("Client is required.");
    if (!service) return alert("Service is required.");
    if (!isFinite(amt) || amt <= 0) return alert("Amount must be > 0.");

    try {
      await createBilling({
        client: client.trim(),
        service,                         // envia o id (ex: "food")
        observation: observation.trim(),
        amount: amt,
        origin: "admin",
        type: "Admin Input",
      });
      clearForm();
      setPage(1);                        // volta p/ primeira página
      fetchRows(1);
    } catch (err) {
      alert(err?.details?.error || err.message || "Error creating billing");
    }
  };

  const onRemove = async (id) => {
    if (!window.confirm("Remove this line?")) return;
    try {
      await removeBilling(id);
      // se apagou o último item da página, reposiciona
      const remaining = total - 1;
      const lastPage = Math.max(1, Math.ceil(remaining / PAGE_SIZE));
      const nextPage = Math.min(page, lastPage);
      setPage(nextPage);
      fetchRows(nextPage);
    } catch (err) {
      alert(err?.details?.error || err.message);
    }
  };

  const startIndex = (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="finance-page admin-billing-input">
      <div className="fin-head" style={{ marginBottom: 6 }}>
        <h3 className="title--dashboard">Billing Input (Admin → Finance)</h3>
      </div>

      {/* Form */}
      <div className="fin-card" style={{ marginBottom: 14 }}>
        <form onSubmit={onSubmit} className="form-grid">
          <div className="form-row">
            <div className="form-field">
              <label className="kpi-title">Client *</label>
              <input
                type="text"
                placeholder="Ex.: Cliente X / Empresa Y"
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="kpi-title">Service *</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <option value="">Select…</option>
                {SERVICE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="kpi-title">Observation</label>
              <input
                type="text"
                placeholder="Observations (optional)"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="kpi-title">Amount (USD) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              <PlusCircle size={16} /> Add to Billing Queue
            </button>
          </div>
        </form>
      </div>

      {/* Tabela + paginação */}
      <div className="fin-card">
        {loading && rows.length === 0 ? (
          <div className="fin-empty">Loading…</div>
        ) : total === 0 ? (
          <div className="fin-empty">No entries.</div>
        ) : (
          <>
            <div className="table table--wide">
              <div className="thead">
                <div className="th">Created At</div>
                <div className="th">Client</div>
                <div className="th">Service</div>
                <div className="th">Observation</div>
                <div className="th right">Amount</div>
                <div className="th center">Actions</div>
              </div>

              {rows.map((r, idx) => (
                <div className="tr" key={rowKey(r, idx)}>
                  <div className="td" data-label="Created At">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                  </div>
                  <div className="td" data-label="Client">{r.client || "—"}</div>
                  <div className="td" data-label="Service">
                    {labelOf(r.service)}
                  </div>
                  <div className="td" data-label="Observation" title={r.observation || ""}>
                    {r.observation?.trim() || "—"}
                  </div>
                  <div className="td right" data-label="Amount"><b>{money(r.amount)}</b></div>
                  <div className="td center" data-label="Actions">
                    <button
                      className="btn btn--outline btn--danger btn--sm"
                      onClick={() => onRemove(r._id || r.id)}
                      disabled={loading}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer: resumo + paginação */}
            <div className="table-footer">
              <div className="kpi-title">
                Showing <b>{startIndex}</b>–<b>{endIndex}</b> of <b>{total}</b> • Page {page}/{totalPages} • Page total: <b>{money(totalAmount)}</b>
              </div>
              <div className="pagination">
                <button className="pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="pg-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                <div className="pg-pages">
                  {pageRange(page, totalPages, 5).map((n) => (
                    <button
                      key={n}
                      className={`pg-num ${n === page ? "active" : ""}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button className="pg-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                <button className="pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
