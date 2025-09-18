import React, { useMemo, useState, useEffect } from 'react';
import { useCosts } from '../contexts/CostsContext';
import {
  Save, Trash2, Upload, Download, Settings, Globe, MapPin, Users,
  RefreshCw, X, Edit3
} from 'lucide-react';
import '../styles/pages/Costs.css';

const SERVICE_TYPES = [
  'IN_PERSON_TOUR','VIRTUAL_TOUR','COORDINATOR',
  'CONCIERGE','TICKET_DELIVERY','DELIVERY','AIRPORT_ASSISTANCE','VACATION_HOME_ASSISTANCE','HOTEL_ASSISTANCE',
  'BABYSITTER','ADJUSMENT','REIMBURSEMENT','EXTRA HOUR', 'ASSISTANCE'
];
const TEAMS = ['US','BR'];
const LOCATIONS = ['ORLANDO','CALIFÓRNIA'];
const PARKS = ['DISNEY WORLD','DISNEYLAND','UNIVERSAL HOLLYWOOD','UNIVERSAL STUDIOS','EPIC','SEAWORLD','BUSCH GARDENS','LEGOLAND','PEPPA PIG','SIX FLAGS','VOLCANO BAY'];

export default function Costs() {
  const { costs, loaded, addRow, updateRow, removeRow, clearAll, exportJSON, importJSON } = useCosts();

  const [filters, setFilters] = useState({
    serviceType:'', team:'', location:'', park:'',
    guestsMin:'', guestsMax:''
  });

  const filtered = useMemo(() => {
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    let out = [...costs];
    if (filters.serviceType) out = out.filter(r => r.serviceType === filters.serviceType);
    if (filters.team)        out = out.filter(r => r.team === filters.team);
    if (filters.location)    out = out.filter(r => r.location === filters.location);
    if (filters.park)        out = out.filter(r => r.park === filters.park);

    if (filters.guestsMin !== '') {
      const gmin = Number(filters.guestsMin);
      out = out.filter(r => {
        const g = toNum(r.guests);
        return g !== null && g >= gmin;
      });
    }
    if (filters.guestsMax !== '') {
      const gmax = Number(filters.guestsMax);
      out = out.filter(r => {
        const g = toNum(r.guests);
        return g !== null && g <= gmax;
      });
    }

    return out;
  }, [costs, filters]);

  // paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => { setPage(1); }, [filters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginated = useMemo(
    () => filtered.slice(startIndex, startIndex + pageSize),
    [filtered, startIndex, pageSize]
  );

  // form
  const blank = { id:null, serviceType:'', team:'', location:'', park:'', guests:'', hopper:'', hours:'', amount:'' };
  const [editing, setEditing] = useState(blank);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!editing.serviceType) return;
    const amt = Number(editing.amount);
    if (Number.isNaN(amt)) return;

    const payload = {
      serviceType: editing.serviceType,
      team: (editing.team || '').toUpperCase(),
      location: (editing.location || '').toUpperCase(),
      park: (editing.park || '').toUpperCase(),
      guests: editing.guests ? Number(editing.guests) : '',
      hopper: editing.hopper === 'TRUE' ? 'TRUE' : (editing.hopper === 'FALSE' ? 'FALSE' : ''),
      hours: editing.hours?.toString() || '',
      amount: amt
    };

    if (editing.id) updateRow(editing.id, payload);
    else addRow(payload);

    setEditing(blank);
  };

  const startEdit  = (row) => setEditing({ ...row });
  const cancelEdit = () => setEditing(blank);

  const doExport = () => {
    const url = exportJSON();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'costs.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await importJSON(file); e.target.value = ''; }
    catch { alert('Invalid JSON file.'); }
  };

  return (
    <div className="costs-page">
      {/* Header */}
      <div className="services-header">
        <div className="header-info">
          <h1>Costs Management</h1>
          <p>Control the cost rules used by Suggested Value</p>
        </div>
        <div className="header-actions" style={{ gap: 8 }}>
          <button className="btn btn--outline" onClick={doExport}>
            <Download size={16}/> Export JSON
          </button>

          <label className="btn btn--outline" style={{ cursor:'pointer' }}>
            <Upload size={16}/> Import JSON
            <input type="file" accept="application/json" onChange={doImport} style={{ display:'none' }} />
          </label>

          <button className="btn btn--danger" onClick={() => { if (window.confirm('Clear ALL costs?')) clearAll(); }}>
            <Trash2 size={16}/> Clear All
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="services-container" style={{ gridTemplateColumns:'1fr' }}>
        <div className="form-card">
          <div className="form-header">
            <div className="form-icon"><Settings size={20}/></div>
            <h2 className="form-title">{editing.id ? 'Edit Cost Row' : 'Add Cost Row'}</h2>
            <p className="form-subtitle">More specific rows override generic ones</p>
          </div>

          <form className="service-form" onSubmit={onSubmit}>
            <div className="form-row-compact-4">
              <div className="field">
                <label className="form-label"><Settings size={14}/> Service Type *</label>
                <select className="form-select" value={editing.serviceType} onChange={e => setEditing(prev => ({...prev, serviceType:e.target.value}))}>
                  <option value="">Select</option>
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="form-label"><Globe size={14}/> Team</label>
                <select className="form-select" value={editing.team} onChange={e => setEditing(p => ({...p, team:e.target.value}))}>
                  <option value="">—</option>
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="form-label"><MapPin size={14}/> Location</label>
                <select className="form-select" value={editing.location} onChange={e => setEditing(p => ({...p, location:e.target.value}))}>
                  <option value="">—</option>
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="form-label"><MapPin size={14}/> Park</label>
                <select className="form-select" value={editing.park} onChange={e => setEditing(p => ({...p, park:e.target.value}))}>
                  <option value="">—</option>
                  {PARKS.map(pk => <option key={pk} value={pk}>{pk}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row-compact-4">
              <div className="field">
                <label className="form-label"><Users size={14}/> Guests</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={editing.guests}
                  onChange={e => setEditing(p => ({...p, guests:e.target.value}))}
                  placeholder="e.g. 2"
                />
              </div>

              <div className="field">
                <label className="form-label">Hopper</label>
                <select className="form-select" value={editing.hopper} onChange={e => setEditing(p => ({...p, hopper:e.target.value}))}>
                  <option value="">—</option>
                  <option value="TRUE">TRUE</option>
                  <option value="FALSE">FALSE</option>
                </select>
              </div>

              <div className="field">
                <label className="form-label">Hours</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={editing.hours}
                  onChange={e => setEditing(p => ({...p, hours:e.target.value}))}
                  placeholder="e.g. 3"
                />
              </div>

              <div className="field">
                <label className="form-label">Amount *</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editing.amount}
                  onChange={e => setEditing(p => ({...p, amount:e.target.value}))}
                  placeholder="e.g. 150"
                />
              </div>
            </div>

            <div style={{ display:'flex', gap:12, marginTop:8 }}>
              <button type="submit" className="btn btn--primary btn--block" style={{ flex:1 }}>
                <Save size={16}/> {editing.id ? 'Save Changes' : 'Add Row'}
              </button>
              {editing.id && (
                <button type="button" className="btn btn--outline" onClick={cancelEdit}>
                  <X size={16}/> Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Filtros e Lista */}
      <div className="services-list-container" style={{ marginTop:16 }}>
        <div className="list-controls">
          <div className="filters-section">
            <div className="filter-group">
              <label>Service Type</label>
              <select
                className="filter-select"
                value={filters.serviceType}
                onChange={e => setFilters(p => ({...p, serviceType:e.target.value}))}
              >
                <option value="">All</option>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Team</label>
              <select
                className="filter-select"
                value={filters.team}
                onChange={e => setFilters(p => ({...p, team:e.target.value}))}
              >
                <option value="">All</option>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Location</label>
              <select
                className="filter-select"
                value={filters.location}
                onChange={e => setFilters(p => ({...p, location:e.target.value}))}
              >
                <option value="">All</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Park</label>
              <select
                className="filter-select"
                value={filters.park}
                onChange={e => setFilters(p => ({...p, park:e.target.value}))}
              >
                <option value="">All</option>
                {PARKS.map(pk => <option key={pk} value={pk}>{pk}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Guests</label>
              <div style={{ display:'flex', gap:6 }}>
                <input
                  type="number"
                  min="1"
                  placeholder="Min"
                  className="filter-input"
                  value={filters.guestsMin}
                  onChange={e => setFilters(p => ({ ...p, guestsMin: e.target.value }))}
                  style={{ width: 90, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Max"
                  className="filter-input"
                  value={filters.guestsMax}
                  onChange={e => setFilters(p => ({ ...p, guestsMax: e.target.value }))}
                  style={{ width: 90, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}
                />
              </div>
            </div>

            <button
              className="btn btn--outline btn--sm"
              onClick={() => setFilters({
                serviceType:'', team:'', location:'', park:'',
                guestsMin:'', guestsMax:''
              })}
            >
              <RefreshCw size={14}/> Clear Filters
            </button>
          </div>
        </div>

        <div className="services-table">
          <div className="table-header">
            <div>Service Type</div>
            <div>Team</div>
            <div>Location</div>
            <div>Park</div>
            <div>Guests</div>
            <div>Hopper</div>
            <div>Hours</div>
            <div>Amount</div>
            <div>Actions</div>
          </div>

          <div className="table-body">
            {loaded && paginated.map(row => (
              <div key={row.id} className="table-row">
                <div className="table-cell">{row.serviceType || '—'}</div>
                <div className="table-cell">{row.team || '—'}</div>
                <div className="table-cell">{row.location || '—'}</div>
                <div className="table-cell">{row.park || '—'}</div>
                <div className="table-cell">{row.guests || '—'}</div>
                <div className="table-cell">{row.hopper || '—'}</div>
                <div className="table-cell">{row.hours || '—'}</div>
                <div className="table-cell">
                  {Number.isFinite(Number(row.amount)) ? `$${Number(row.amount).toFixed(2)}` : '—'}
                </div>
                <div className="table-cell">
                  <div className="action-buttons" style={{ display:'flex', gap:6 }}>
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={() => startEdit(row)}
                      title="Edit"
                    >
                      <Edit3 size={14}/> Edit
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => { if (window.confirm('Delete this row?')) removeRow(row.id); }}
                      title="Delete"
                    >
                      <Trash2 size={14}/> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {loaded && paginated.length === 0 && (
              <div className="loading-state" style={{ padding:24 }}>No rows to show.</div>
            )}
          </div>
        </div>

        {/* Paginação */}
        {loaded && filtered.length > 0 && (
          <div className="pagination" style={{ marginTop: 12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
            <div className="pagination-info" style={{ color:'#6b7280', fontSize:13 }}>
              Showing {filtered.length === 0 ? 0 : (startIndex + 1)}–{Math.min(startIndex + pageSize, filtered.length)} of {filtered.length} rows
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <label className="muted">Show</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="muted">per page</span>
            </div>

            <div className="pagination-controls" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button className="pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>

              <div className="pg-pages" style={{ display:'flex', gap:6 }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
                  .map(n => (
                    <button
                      key={n}
                      className={`pg-num ${page === n ? 'active' : ''}`}
                      onClick={() => setPage(n)}
                      style={{
                        border:'1px solid #e5e7eb',
                        background: page === n ? '#111827' : 'white',
                        color: page === n ? 'white' : '#111827',
                        borderRadius:8,
                        padding:'8px 10px',
                        height:34,
                        cursor:'pointer'
                      }}
                    >
                      {n}
                    </button>
                  ))
                }
              </div>

              <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className="pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
