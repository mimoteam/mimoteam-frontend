// src/pages/Users.jsx

import React, { useEffect, useState } from "react";
import { UserPlus, Trash2, Edit3, X, Search, Shield } from "lucide-react";
import {
  fetchUsers,
  createUserApi,
  updateUserApi,
  deleteUserApi,
} from "../api/users"; // << caminho correto

const ROLES = [
  { id: "admin", label: "Admin" },
  { id: "partner", label: "Partner" },
  { id: "finance", label: "Finance" },
];

const FUNCOES = ["GUIDE", "CONCIERGE", "THIRD-PARTY"];
const TEAMS = ["US Team", "Brazil Team"];

const emptyForm = {
  fullName: "",
  email: "",
  login: "",
  password: "",
  role: "partner",
  funcao: "",
  team: "",
};

const maskPwd = (p) => (!p ? "—" : "•".repeat(Math.max(String(p).length, 8)));

export default function Users() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [filterRole, setFilterRole] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUsers({ q: search, role: filterRole, page, pageSize });
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number.isFinite(data.total) ? data.total : (data.items?.length ?? 0));
    } catch (err) {
      setError(err.message || "Falha ao carregar usuários");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }

  useEffect(() => { load(); }, []); // primeira carga
  useEffect(() => { if (hydrated) load(); }, [filterRole, search, page, pageSize]); // recargas

  const onChange = (k, v) => { setForm((p) => ({ ...p, [k]: v })); if (error) setError(""); };
  const resetForm = () => { setForm(emptyForm); setEditingId(null); setError(""); };

  const saveUser = async (e) => {
    e?.preventDefault?.();
    const f = { ...form };
    if (!f.fullName.trim() || !f.login.trim() || !f.email.trim()) {
      setError("Preencha Full Name, Login e Email.");
      return;
    }
    if (!editingId && !f.password.trim()) {
      setError("Defina uma senha ao criar um usuário.");
      return;
    }
    try {
      if (editingId) {
        const { password, ...rest } = f;
        await updateUserApi(editingId, f.password ? f : rest);
      } else {
        await createUserApi(f);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || "Falha ao salvar usuário");
    }
  };

  const startEdit = (u) => {
    setEditingId(u._id || u.id);
    setForm({
      fullName: u.fullName || "",
      email: u.email || "",
      login: u.login || "",
      password: "",
      role: u.role || "partner",
      funcao: u.funcao || "",
      team: u.team || "",
    });
    setError("");
  };

  const removeUser = async (id) => {
    if (!window.confirm("Excluir este usuário?")) return;
    try {
      await deleteUserApi(id);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err.message || "Falha ao excluir usuário");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="users-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="pay-header">
        <div className="pay-title">
          <h1>Users Management</h1>
          <p>Create, edit, and manage system users</p>
        </div>
        <div className="btn-group">
          <button className="btn btn--outline btn--icon" title="Ajuda">
            <Shield size={18} />
          </button>
        </div>
      </div>

      <div className="selection-card">
        <div className="selection-header">
          <h3>{editingId ? "Editar Usuário" : "New User"}</h3>
          <div className="btn-group">
            {editingId && (
              <button className="btn btn--outline btn--sm" onClick={resetForm}>
                <X size={16} /> Cancelar
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#b91c1c",
            padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 13, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={saveUser} style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", alignItems: "end" }}>
          <div className="filter">
            <label>Full Name</label>
            <input type="text" value={form.fullName} onChange={(e) => onChange("fullName", e.target.value)} />
          </div>

          <div className="filter">
            <label>Role</label>
            <select value={form.role} onChange={(e) => onChange("role", e.target.value)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <div className="filter">
            <label>Department</label>
            <select value={form.funcao} onChange={(e) => onChange("funcao", e.target.value)}>
              <option value="">—</option>
              {FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="filter">
            <label>Team</label>
            <select value={form.team} onChange={(e) => onChange("team", e.target.value)}>
              <option value="">—</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="filter">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} />
          </div>

          <div className="filter">
            <label>Login (único)</label>
            <input type="text" value={form.login} onChange={(e) => onChange("login", e.target.value)} />
          </div>

          <div className="filter">
            <label>Password {editingId ? "(preencha para trocar)" : ""}</label>
            <input type="password" value={form.password} onChange={(e) => onChange("password", e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn--outline" onClick={resetForm}>Limpar</button>
            <button type="submit" className="btn btn--primary">
              <UserPlus size={16} /> {editingId ? "Salvar Alterações" : "Adicionar Usuário"}
            </button>
          </div>
        </form>
      </div>

      {/* filtros */}
      <div className="filters-card">
        <div className="filters-row" style={{ gridTemplateColumns: "220px 1fr 200px", alignItems: "end" }}>
          <div className="filter">
            <label>Filtrar por Role</label>
            <select value={filterRole} onChange={(e) => { setPage(1); setFilterRole(e.target.value); }}>
              <option value="">All</option>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <div className="filter">
            <label>Buscar (nome, login, email, função ou team)</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Digite para filtrar..."
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                style={{ paddingLeft: 36 }}
              />
              <Search size={16} style={{ position: "absolute", left: 12, top: 12, opacity: .7 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn--outline btn--sm" onClick={() => { setFilterRole(""); setSearch(""); setPage(1); }}>
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {/* lista */}
      <div className="payments-list">
        <div className="list-header">
          <h3>All Users</h3>
          <span className="muted">{loading ? "carregando..." : `${total} usuário(s)`}</span>
        </div>

        <div className="table" style={{ overflowX: "auto" }}>
          <div className="thead" style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.7fr 0.9fr 0.9fr 1.1fr 0.9fr 0.9fr 180px",
            alignItems: "center",
            background: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            fontWeight: 700,
            color: "#374151",
          }}>
            <div className="th">Full Name</div>
            <div className="th">Role</div>
            <div className="th">Department</div>
            <div className="th">Team</div>
            <div className="th">Email</div>
            <div className="th">Login</div>
            <div className="th">Password</div>
            <div className="th">Actions</div>
          </div>

          <div className="tbody">
            {!loading && items.length === 0 ? (
              <div className="empty-row">Nenhum usuário encontrado.</div>
            ) : (
              items.map((u) => {
                const id = u._id || u.id;
                return (
                  <div key={id} className="tr" style={{
                    display: "grid",
                    gridTemplateColumns: "1.1fr 0.7fr 0.9fr 0.9fr 1.1fr 0.9fr 0.9fr 180px",
                    alignItems: "center",
                  }}>
                    <div className="td">{u.fullName}</div>
                    <div className="td">{ROLES.find((r) => r.id === u.role)?.label || u.role}</div>
                    <div className="td">{u.funcao || "—"}</div>
                    <div className="td">{u.team || "—"}</div>
                    <div className="td">{u.email}</div>
                    <div className="td">{u.login}</div>
                    <div className="td">{maskPwd("password")}</div>
                    <div className="td">
                      <div className="btn-group">
                        <button className="btn btn--outline btn--sm" onClick={() => startEdit(u)}>
                          <Edit3 size={14} /> Edit
                        </button>
                        <button className="btn btn--danger btn--sm" onClick={() => removeUser(id)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {total > 0 && (
          <div className="pagination" style={{ marginTop: 12 }}>
            <div className="pagination-info">
              Showing {total === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, total)} of {total} users
            </div>
            <div className="pagination-controls">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
                <label className="muted">Show</label>
                <select
                  value={pageSize}
                  onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px" }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="muted">per page</span>
              </div>

              <button className="pg-btn btn btn--outline btn--sm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="pg-btn btn btn--outline btn--sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <div className="pg-pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
                  .map((n) => (
                    <button key={n} className={`pg-num btn btn--outline btn--sm ${page === n ? "active" : ""}`} onClick={() => setPage(n)}>
                      {n}
                    </button>
                  ))}
              </div>
              <button className="pg-btn btn btn--outline btn--sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className="pg-btn btn btn--outline btn--sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
