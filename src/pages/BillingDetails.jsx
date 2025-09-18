import React, { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import "../styles/pages/BillingDetails.css";
import { listBilling, updateBillingStatus, removeBilling, clearBilling } from "../api/billing";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// 🔐 helper para extrair um id estável de uma linha
const getRowId = (r, idx) =>
  r?.id ?? r?._id ?? r?.uuid ?? r?.key ?? (r?.createdAt ? `${r.createdAt}-${idx}` : undefined);

export default function BillingDetails() {
  const [rows, setRows] = useState([]);
  const [onlyPending, setOnlyPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { items = [] } = await listBilling({ page: 1, pageSize: 200, onlyPending });
      // normaliza para sempre termos um id de trabalho (_rowId)
      const normalized = items.map((r, i) => ({ ...r, _rowId: getRowId(r, i) }));
      setRows(normalized);
    } catch (err) {
      console.error(err);
      alert(err?.details?.error || err.message || "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [onlyPending]);

  const toggleStatus = async (row) => {
    const id = row?._rowId || row?.id || row?._id || row?.uuid || row?.key;
    if (!id) return; // sem id, nada feito
    const nextStatus = row.status === "ADDED" ? "TO_BE_ADD" : "ADDED";
    try {
      await updateBillingStatus(id, nextStatus);
      setRows((prev) => prev.map((x) => (x._rowId === id ? { ...x, status: nextStatus } : x)));
    } catch (err) {
      alert(err?.details?.error || err.message);
    }
  };

  const removeRow = async (row) => {
    const id = row?._rowId || row?.id || row?._id || row?.uuid || row?.key;
    if (!id) return;
    if (!window.confirm("Remove this line?")) return;
    try {
      await removeBilling(id);
      setRows((prev) => prev.filter((x) => x._rowId !== id));
    } catch (err) {
      alert(err?.details?.error || err.message);
    }
  };

  const clearAllClick = async () => {
    if (!window.confirm("Clear all billing items?")) return;
    try {
      await clearBilling();
      setRows([]);
    } catch (err) {
      alert(err?.details?.error || err.message);
    }
  };

  const totalAmount = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows]
  );

  return (
    <div className="finance-page">
      <div className="fin-head" style={{ marginBottom: 6 }}>
        <h3 className="title--dashboard">Billing Details</h3>
        <div className="fin-inline">
          <label className="kpi-title" style={{ fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Show only “TO BE ADD”
          </label>
          <button className="btn btn--outline btn--sm" onClick={load} title="Reload" disabled={loading}>
            <RefreshCw size={14} /> Reload
          </button>
          <button className="btn btn--outline btn--sm" onClick={clearAllClick} title="Clear all" disabled={loading}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      <div className="fin-card">
        {loading && rows.length === 0 ? (
          <div className="fin-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="fin-empty">No items.</div>
        ) : (
          <>
            <div className="table table--wide">
              <div className="thead">
                <div className="th">Created At</div>
                <div className="th">Client</div>
                <div className="th">Service</div>
                <div className="th">Type</div>
                <div className="th">Observation</div>
                <div className="th right">Amount</div>
                <div className="th center">Status</div>
                <div className="th center">Actions</div>
              </div>

              {rows.map((r, i) => {
                const rowId = r._rowId || getRowId(r, i);
                const isAdded = r.status === "ADDED";
                const hasId = !!rowId;
                return (
                  <div className="tr" key={rowId || `row-${i}`}>
                    <div className="td">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</div>
                    <div className="td">{r.client || "—"}</div>
                    <div className="td">{r.service || "—"}</div>
                    <div className="td">{r.type || "—"}</div>
                    <div className="td" title={r.observation || ""}>
                      {r.observation?.trim() ? r.observation : "—"}
                    </div>
                    <div className="td right"><b>{money(r.amount)}</b></div>
                    <div className="td center">
                      <span
                        className={`tag ${isAdded ? "tag--paid" : "tag--shared"}`}
                        title={isAdded ? "ADDED" : "TO BE ADD"}
                      >
                        {isAdded ? "ADDED" : "TO BE ADD"}
                      </span>
                    </div>
                    <div className="td center">
                      <button
                        className={`btn ${isAdded ? "btn--outline" : "btn--primary"} btn--sm`}
                        onClick={() => toggleStatus(r)}
                        title={isAdded ? "Mark as TO BE ADD" : "Mark as ADDED"}
                        disabled={loading || !hasId}
                      >
                        <Check size={14} /> {isAdded ? "Undo" : "Mark Added"}
                      </button>
                      <button
                        className="btn btn--outline btn--danger btn--sm"
                        onClick={() => removeRow(r)}
                        title={hasId ? "Remove line" : "Missing id"}
                        style={{ marginLeft: 8 }}
                        disabled={loading || !hasId}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <div className="kpi-title" style={{ fontWeight: 900 }}>
                Total: {money(totalAmount)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
