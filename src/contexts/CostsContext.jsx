// frontend/src/contexts/CostsContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { listCosts, createCost, updateCost, deleteCost, importCosts, clearAllCosts } from '../api/costs';

// normalização e ordem de chaves igual ao Services.jsx
const CostsContext = createContext(null);
const norm = (v) => (v ?? "").toString().trim().toUpperCase();
const toBoolStr = (v) => (v ? "TRUE" : "FALSE");
const COST_KEYS = [
  ["serviceType","team","location","park","guests","hopper","hours"],
  ["serviceType","team","location","park","guests","hopper"],
  ["serviceType","team","location","park","guests"],
  ["serviceType","team","location","park"],
  ["serviceType","team","location"],
  ["serviceType","team"],
  ["serviceType","team","hours"], // hourly
  ["serviceType","hours"],
  ["serviceType"],
];
const buildKey = (obj, fields) => fields.map(f => `${f}=${norm(obj[f])}`).join("|");

export function CostsProvider({ children }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const cacheRef = useRef(new Map());

  // carga inicial do backend
  useEffect(() => {
    (async () => {
      try {
        const res = await listCosts({ page: 1, pageSize: 1000 });
        const arr = (res.items || res.data || []).map(r => ({ ...r, id: String(r._id || r.id) }));
        setRows(arr);
      } catch (e) {
        console.error("Failed to load costs from API", e);
        setRows([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // CRUD → backend
  const addRow = async (row) => {
    const payload = {
      serviceType: row.serviceType ?? "",
      team: row.team ?? "",
      location: row.location ?? "",
      park: row.park ?? "",
      guests: row.guests === "" ? "" : Number(row.guests),
      hopper: row.hopper === true || row.hopper === "TRUE" ? "TRUE" :
              row.hopper === "FALSE" ? "FALSE" : "",
      hours: row.hours === "" ? "" : Number(row.hours),
      amount: Number(row.amount ?? 0),
    };
    const created = await createCost(payload);
    const doc = { ...created, id: String(created._id || created.id) };
    setRows(prev => [doc, ...prev]);
    cacheRef.current.clear();
    return doc;
  };

  const updateRow = async (id, patch) => {
    const payload = {
      ...patch,
      guests: patch.guests === "" ? "" : Number(patch.guests),
      hours:  patch.hours  === "" ? "" : Number(patch.hours),
      hopper: patch.hopper === true || patch.hopper === "TRUE" ? "TRUE" :
              patch.hopper === "FALSE" ? "FALSE" : "",
      amount: patch.amount != null ? Number(patch.amount) : undefined,
    };
    const updated = await updateCost(id, payload);
    const doc = { ...updated, id: String(updated._id || updated.id) };
    setRows(prev => prev.map(r => String(r.id) === String(id) ? doc : r));
    cacheRef.current.clear();
    return doc;
  };

  const removeRow = async (id) => {
    await deleteCost(id);
    setRows(prev => prev.filter(r => String(r.id) !== String(id)));
    cacheRef.current.clear();
  };

  const clearAll = () => { setRows([]); cacheRef.current.clear(); }; // se quiser apagar geral no BD, crie endpoint dedicado

  // export/import usando backend
  const exportJSON = async () => {
    const arr = await exportCosts();
    const url = URL.createObjectURL(new Blob([JSON.stringify(arr, null, 2)], { type: "application/json" }));
    return url;
  };

  const importJSON = async (file) => {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Invalid JSON");
    await importCosts(data);
    const res = await listCosts({ page: 1, pageSize: 1000 });
    const arr = (res.items || res.data || []).map(r => ({ ...r, id: String(r._id || r.id) }));
    setRows(arr);
    cacheRef.current.clear();
  };

  // lookup idêntico ao Services.jsx
  const matchRow = (row, fields, params) =>
    fields.every(f => {
      if (f === "hopper") return norm(row.hopper ?? "") === norm(toBoolStr(params.hopper));
      if (f === "guests" || f === "hours") return norm(row[f] ?? "") === norm(String(params[f] ?? ""));
      return norm(row[f] ?? "") === norm(params[f] ?? "");
    });

  const lookupCost = (params) => {
    if (!loaded) return null;
    for (const fields of COST_KEYS) {
      const key = buildKey(
        {
          ...params,
          hopper: params.hopper ? "TRUE" : "FALSE",
          guests: params.guests ? String(params.guests) : "",
          hours: params.serviceTime ? String(params.serviceTime) : "",
        },
        fields
      );

      if (cacheRef.current.has(key)) {
        const cached = cacheRef.current.get(key);
        if (cached) return { ...cached, keyFields: fields };
        continue;
      }

      const row = rows.find(r => matchRow(r, fields, { ...params, hours: params.serviceTime }));
      if (row && typeof row.amount === "number") {
        const found = { amount: row.amount, keyFields: fields, ruleId: String(row.id) };
        cacheRef.current.set(key, found);
        return found;
      }
      cacheRef.current.set(key, null);
    }
    return null;
  };

  const value = useMemo(() => ({
    costs: rows,
    loaded,
    addRow, updateRow, removeRow, clearAll,
    exportJSON, importJSON,
    lookupCost,
  }), [rows, loaded]);

  return <CostsContext.Provider value={value}>{children}</CostsContext.Provider>;
}

export const useCosts = () => {
  const ctx = useContext(CostsContext);
  if (!ctx) throw new Error("useCosts must be used within CostsProvider");
  return ctx;
};
