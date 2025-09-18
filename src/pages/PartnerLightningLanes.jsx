import React, { useEffect, useMemo, useState } from "react";
import {
  Upload, Plus, Save, Trash2, Image as ImageIcon,
  CheckCircle2, AlertCircle, Calendar as CalendarIcon, Users,
  ChevronRight, ChevronDown
} from "lucide-react";
import "../styles/pages/PartnerLL.css";
import {
  createLane,
  listLanes,
  uploadLaneReceipts,
  deleteLaneReceipt,
  deleteLane
} from "../api/lightninglanes";
import { toAbsoluteUrl } from "../api/http";

/* ============== Constantes & Helpers ============== */
const PAGE_SIZE = 3;

const TYPES = [
  { value: "multi",   label: "Multi Pass" },
  { value: "single",  label: "Single Pass" },
  { value: "premier", label: "Premier Pass" },
];
const METHODS = [
  { value: "mimo_card", label: "Mimo Card" },
  { value: "client",    label: "Client" },
];

function titleCaseName(input) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map(p => p.replace(/^\p{L}/u, (c) => c.toLocaleUpperCase())).join(" ");
}
function sanitizeAmount(v) {
  const s = String(v ?? "").replace(/[^\d.,-]/g, "");
  const withDot = s.replace(",", ".");
  const n = Number(withDot);
  return isNaN(n) ? "" : withDot;
}
function emptyRow(prefilledClient = "") {
  return {
    _tmpId: Math.random().toString(36).slice(2),
    clientName: prefilledClient || "",
    laneType: "",
    amount: "",
    paymentMethod: "",
    cardLast4: "",
    observation: "",
    files: [],
    previews: [],
    message: "",
  };
}
function ymdToday() {
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function fmtYmd(d) {
  try { return new Date(d).toISOString().slice(0,10); } catch { return String(d || ""); }
}
const bust = (d) => (d ? `?v=${new Date(d).getTime()}` : "");

/* ============== Componente ============== */
export default function PartnerLightningLanes() {
  const [clientOnce, setClientOnce] = useState("");
  const [visitDate, setVisitDate]   = useState(ymdToday());
  const [rows, setRows] = useState([emptyRow("")]);

  // Lista + paginação
  const [mine, setMine] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const [msg, setMsg] = useState("");

  // Lightbox (zoom da foto)
  const [previewUrl, setPreviewUrl] = useState(null);

  // Controle de expand/colapse
  const [open, setOpen] = useState(() => new Set());
  const toggleOpen = (id) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ESC fecha lightbox
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setPreviewUrl(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sempre iniciar limpo com a data de hoje
  useEffect(() => {
    clearForm();
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const refresh = async (opts = {}) => {
    const nextPage = opts.page ?? page;
    setLoadingList(true);
    try {
      const { items, total: t = 0, page: cur = nextPage } =
        await listLanes({ page: nextPage, pageSize: PAGE_SIZE, mine: true });
      setMine(items || []);
      setTotal(t);
      setPage(cur || nextPage);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status && String(status).startsWith("4")) {
        try {
          const { items, total: t = 0, page: cur = nextPage } =
            await listLanes({ page: nextPage, pageSize: PAGE_SIZE, mine: false });
          setMine(items || []);
          setTotal(t);
          setPage(cur || nextPage);
        } catch {}
      }
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  function clearForm() {
    rows.forEach(r => (r.previews || []).forEach(u => URL.revokeObjectURL(u)));
    setClientOnce("");
    setVisitDate(ymdToday());
    setRows([emptyRow("")]);
  }

  function updateRow(idx, patch) {
    setRows(prev => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }
  function addRow() { setRows(prev => [...prev, emptyRow(clientOnce)]); }
  function removeRow(idx) { setRows(prev => prev.filter((_, i) => i !== idx)); }

  function onPickFiles(idx, ev) {
    const files = Array.from(ev.target.files || []);
    try { ev.target.value = ""; } catch {}
    if (!files.length) return;
    const previews = files.map(f => URL.createObjectURL(f));
    updateRow(idx, {
      files: [...(rows[idx].files || []), ...files],
      previews: [...(rows[idx].previews || []), ...previews],
    });
  }
  useEffect(() => {
    return () => {
      rows.forEach(r => (r.previews || []).forEach(u => URL.revokeObjectURL(u)));
    };
  }, [rows]);

  async function saveAll() {
    const client = titleCaseName(clientOnce);
    if (!client) { setMsg("Please fill the client name."); return; }
    let savedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hasCore = (r.laneType && r.paymentMethod) || r.amount || (r.files?.length > 0) || r.observation;
      if (!hasCore) continue;

      if (!r.laneType || !r.paymentMethod) {
        updateRow(i, { message: "Missing required fields." });
        continue;
      }

      try {
        const payload = {
          clientName: titleCaseName(r.clientName || client),
          laneType: r.laneType,
          amount: Number(r.amount || 0),
          paymentMethod: r.paymentMethod,
          cardLast4: r.paymentMethod === "mimo_card" ? String(r.cardLast4 || "").slice(-4) : null,
          visitDate: visitDate || ymdToday(),
          observation: String(r.observation || "").trim(),
          receipts: [],
        };
        const { lane } = await createLane(payload);
        if (r.files?.length) await uploadLaneReceipts(lane._id, r.files);
        savedCount++;
      } catch {
        updateRow(i, { message: "Error saving." });
      }
    }

    if (savedCount > 0) {
      clearForm();
      setOpen(new Set());
      setMsg(`${savedCount} item(s) saved.`);
      setPage(1);
      refresh({ page: 1 });
    } else {
      setMsg("Nothing to save.");
    }
  }

  async function removeReceipt(laneId, url) {
    try {
      await deleteLaneReceipt(laneId, url);
      setMine(prev => prev.map(it => it._id === laneId ? { ...it, receipts: it.receipts.filter(u => u !== url) } : it));
    } catch {}
  }

  async function removeLane(laneId) {
    if (!window.confirm("Delete this Lightning Lane? This action cannot be undone.")) return;
    try {
      await deleteLane(laneId);
      setMine(prev => prev.filter(it => it._id !== laneId));
      setTotal(t => Math.max(0, t - 1));
      setTimeout(() => {
        if (mine.length - 1 === 0 && page > 1) {
          refresh({ page: page - 1 });
        }
      }, 0);
    } catch (e) {
      console.error(e);
      setMsg("Error deleting.");
    }
  }

  const goPrev = () => { if (page > 1) refresh({ page: page - 1 }); };
  const goNext = () => { if (page < pages) refresh({ page: page + 1 }); };

  return (
    <div className="page-ll">
      {/* ====== Form principal ====== */}
      <div className="ll-card">
        <div className="ll-header">
          <h2>⚡ Lightning Lane purchases</h2>
          {msg && <div className="ll-toast success"><CheckCircle2 size={16} /> {msg}</div>}
        </div>

        {/* “Uma vez” — Client + Visit Date */}
        <div className="ll-form">
          <div className="ll-grid">
            <div>
              <label className="ll-label">Client Name</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={16} style={{ opacity: 0.7 }} />
                <input
                  className="ll-input"
                  placeholder="First Last"
                  value={clientOnce}
                  onChange={(e) => setClientOnce(e.target.value)}
                  onBlur={(e) => setClientOnce(titleCaseName(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className="ll-label">Visit Date</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CalendarIcon size={16} style={{ opacity: 0.7 }} />
                <input
                  type="date"
                  className="ll-input"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Linhas (múltiplas) */}
        {rows.map((r, idx) => (
          <div className="ll-form" key={r._tmpId}>
            <div className="ll-grid">
              <div>
                <label className="ll-label">Lightning Lane Type</label>
                <select
                  className="ll-input"
                  value={r.laneType}
                  onChange={(e) => updateRow(idx, { laneType: e.target.value })}
                >
                  <option value="">Select…</option>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="ll-label">Amount</label>
                <input
                  className="ll-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={r.amount}
                  onChange={(e) => updateRow(idx, { amount: sanitizeAmount(e.target.value) })}
                />
              </div>
            </div>

            <div className="ll-grid">
              <div>
                <label className="ll-label">Payment Method</label>
                <select
                  className="ll-input"
                  value={r.paymentMethod}
                  onChange={(e) => updateRow(idx, { paymentMethod: e.target.value })}
                >
                  <option value="">Select…</option>
                  {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="ll-label">Last 4 digits (if Mimo Card)</label>
                <input
                  className="ll-input"
                  placeholder="1234"
                  maxLength={4}
                  value={r.cardLast4}
                  onChange={(e) => updateRow(idx, { cardLast4: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
                  disabled={r.paymentMethod !== "mimo_card"}
                />
              </div>
            </div>

            {/* Observação (opcional) */}
            <div className="ll-row">
              <label className="ll-label">Observation (optional)</label>
              <input
                className="ll-input"
                placeholder="Notes / details"
                value={r.observation}
                onChange={(e) => updateRow(idx, { observation: e.target.value })}
              />
            </div>

            <div className="ll-row">
              <label className="ll-label">Upload Receipt(s)</label>
              <label className="ll-upload-btn">
                <Upload size={16} />
                <span>Choose photos</span>
                <input type="file" accept="image/*" multiple onChange={(ev) => onPickFiles(idx, ev)} />
              </label>

              <div className="ll-previews">
                {(r.previews || []).map((src, i) => (
                  <div className="ll-preview" key={i}>
                    <img src={src} alt="receipt" />
                  </div>
                ))}
              </div>

              <div className="ll-actions">
                {rows.length > 1 && (
                  <button className="btn danger" onClick={() => removeRow(idx)}>
                    <Trash2 size={16} /> Remove
                  </button>
                )}
                {r.message && (
                  <span className={`ll-msg ${/save|saved|ok|success/i.test(r.message) ? "ok" : "err"}`}>
                    {r.message}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="ll-add" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn outline" onClick={addRow}>
            <Plus size={18} /> Add Another Lightning Lane
          </button>
          <button className="btn primary" onClick={saveAll}>
            <Save size={18} /> Save All
          </button>
        </div>
      </div>

      {/* ====== Lista: My Purchases ====== */}
      <div className="ll-list">
        <div className="ll-header" style={{ marginBottom: 12 }}>
          <h3>My Purchases</h3>
        </div>

        {loadingList ? (
          <div className="ll-empty">Loading…</div>
        ) : mine.length === 0 ? (
          <div className="ll-empty"><AlertCircle size={16} /> No entries yet.</div>
        ) : (
          <>
            <ul className="ll-items">
              {mine.map(it => {
                const opened = open.has(it._id);
                const icon = opened ? <ChevronDown size={18} /> : <ChevronRight size={18} />;
                return (
                  <li key={it._id} className={`ll-item ${opened ? "open" : "closed"}`}>
                    <div className="ll-item-row">
                      <button
                        className="ll-item-top"
                        onClick={() => toggleOpen(it._id)}
                        aria-expanded={opened}
                        aria-controls={`lane-${it._id}`}
                      >
                        <span className="ll-toggle">{icon}</span>
                        <div className="ll-item-title">
                          <strong>{it.clientName || "—"}</strong>
                          <span className="ll-badge">{(it.laneType || "").toString().replace(/^\w/, c => c.toUpperCase())}</span>
                        </div>
                        <div className="ll-item-meta hide-sm">
                          ${Number(it.amount || 0).toFixed(2)}
                        </div>
                      </button>

                      <button
                        className="btn danger ll-del-lane"
                        title="Delete"
                        onClick={() => removeLane(it._id)}
                      >
                        <Trash2 size={16} /> <span className="hide-sm">Delete</span>
                      </button>
                    </div>

                    {/* resumo em chips */}
                    <div className="ll-item-summary">
                      <span className="ll-chip">${Number(it.amount || 0).toFixed(2)}</span>
                      <span className="ll-chip">
                        {it.paymentMethod === "mimo_card" ? "Mimo Card" : "Client"} {it.cardLast4 ? `(${it.cardLast4})` : ""}
                      </span>
                      {it.visitDate && <span className="ll-chip">Visit {fmtYmd(it.visitDate)}</span>}
                      {it.status && <span className={`ll-chip status ${it.status}`}>{it.status}</span>}
                    </div>

                    {opened && (
                      <div id={`lane-${it._id}`} className="ll-item-details">
                        {it.observation && (
                          <div className="ll-empty" style={{ marginTop: 4 }}>
                            <strong>Note:</strong>&nbsp;{it.observation}
                          </div>
                        )}

                        <div className="ll-item-receipts">
                        {it.receipts?.length ? (
                          it.receipts.map((u) => {
                            const src = toAbsoluteUrl(u) + bust(it.updatedAt);
                            return (
                              <div className="ll-receipt" key={u}>
                                <img
                                  src={src}
                                  alt="receipt"
                                  crossOrigin="anonymous"
                                  loading="lazy"
                                  onClick={() => setPreviewUrl(src)}
                                  style={{ cursor: "zoom-in" }}
                                  onError={(e) => {
                                    e.currentTarget.style.opacity = "0.5";
                                    e.currentTarget.alt = "broken";
                                  }}
                                />
                                <button className="icon-btn" title="Remove" onClick={() => removeReceipt(it._id, u)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            );
                          })
                        ) : (
                          <div className="ll-empty small"><ImageIcon size={14} /> Print not available</div>
                        )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* paginação */}
            <div className="ll-pager">
              <button className="btn outline" disabled={page <= 1} onClick={goPrev}>Prev</button>
              <span className="ll-pageinfo">
                Page <strong>{page}</strong> of <strong>{pages}</strong>
                <span className="ll-total"> • {total} item(s)</span>
              </span>
              <button className="btn outline" disabled={page >= pages} onClick={goNext}>Next</button>
            </div>
          </>
        )}
      </div>

      {/* ===== Lightbox ===== */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 12, cursor: "zoom-out"
          }}
        >
          <img
            src={previewUrl}
            alt="receipt large"
            style={{
              maxWidth: "95vw",
              maxHeight: "90vh",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,.5)",
              background: "#fff"
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
