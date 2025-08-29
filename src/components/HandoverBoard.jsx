import React, { useMemo, useState } from 'react';
import { NotebookPen, Plus, Filter, MessageSquare, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHandover } from '../contexts/HandoverContext';

/** Mapeamentos para UI **/
const TYPE_OPTIONS = [
  { id:'TO_KNOW',     label:'To Know',        emoji:'ℹ️' },
  { id:'TO_DO',       label:'To Do',          emoji:'📝' },
  { id:'QUESTION',    label:'Question',       emoji:'❓' },
  { id:'VIP',         label:'VIP Client',     emoji:'🚩' },
  { id:'GUIDELINE',   label:'Guideline',      emoji:'📘' },
  { id:'CS',          label:'Customer Service', emoji:'🎧' },
];

const TAG_OPTIONS = [
  { id:'URGENT',  label:'Urgent',        chip:'🔴' },
  { id:'PENDING', label:'Pending',       chip:'🟡' },
  { id:'ROUTINE', label:'Routine',       chip:'🟢' },
  { id:'INFO',    label:'Informational', chip:'🔵' },
];

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-US', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });

/**
 * Props opcionais:
 * - currentUserName: string
 * - currentUserRole: string
 */
export default function HandoverBoard({ currentUserName = 'Admin User', currentUserRole = 'Administrator' }) {
  const { notes, addNote, deleteNote, addComment } = useHandover();

  // form state
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState({ type:'TO_KNOW', tag:'INFO', body:'' });

  // filters & search
  const [fType, setFType] = useState('');
  const [fTag, setFTag] = useState('');
  const [query, setQuery] = useState('');

  // pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const onSubmit = (e) => {
    e?.preventDefault?.();
    if (!form.body.trim()) return;
    addNote({
      type: form.type,
      tag: form.tag,
      body: form.body,
      createdByName: currentUserName,
      createdByRole: currentUserRole
    });
    setForm({ type:'TO_KNOW', tag:'INFO', body:'' });
    setOpenForm(false);
    setPage(1);
  };

  const filtered = useMemo(() => {
    let arr = [...notes];
    if (fType) arr = arr.filter(n => n.type === fType);
    if (fTag)  arr = arr.filter(n => n.tag  === fTag);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(n =>
        (n.body || '').toLowerCase().includes(q) ||
        (n.createdBy?.name || '').toLowerCase().includes(q)
      );
    }
    // reverse chronological
    arr.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    return arr;
  }, [notes, fType, fTag, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);

  const clearFilters = () => { setFType(''); setFTag(''); setQuery(''); setPage(1); };

  return (
    <div className="dashboard-card neumorphic" style={{ gridColumn:'1 / -1' }}>
      <div className="card-content">
        {/* HEADER */}
        <div className="card-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div className="card-icon"><NotebookPen /></div>
            <h3 className="card-title">Shift Handover — Digital Notepad</h3>
          </div>
          <button className="btn btn--primary btn--sm" onClick={() => setOpenForm(v => !v)}>
            <Plus size={16}/> {openForm ? 'Close' : 'Add Note'}
          </button>
        </div>

        {/* FORM */}
        {openForm && (
          <form onSubmit={onSubmit} className="filters-card" style={{ marginTop:10 }}>
            <div className="filters-row" style={{ gridTemplateColumns:'220px 220px 1fr', alignItems:'end' }}>
              <div className="filter">
                <label>Note Type</label>
                <select value={form.type} onChange={e => setForm(p => ({...p, type:e.target.value}))}>
                  {TYPE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <div className="filter">
                <label>Color Tag</label>
                <select value={form.tag} onChange={e => setForm(p => ({...p, tag:e.target.value}))}>
                  {TAG_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.chip} {t.label}</option>)}
                </select>
              </div>

              <div className="filter">
                <label>Date/Time • Logged by</label>
                <input type="text" readOnly
                  value={`${fmtDate(new Date().toISOString())} — ${currentUserName}${currentUserRole ? ` (${currentUserRole})` : ''}`}
                />
              </div>
            </div>

            <div className="filter">
              <label>Note Body (Markdown allowed)</label>
              <textarea
                rows={3}
                value={form.body}
                onChange={e => setForm(p => ({...p, body:e.target.value}))}
                placeholder={`Example: "VIP Client #2015 (Mr. Smith) requested urgent callback before 5PM. Ticket #FX-3052 created."`}
              />
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpenForm(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary btn--sm">Save Note</button>
            </div>
          </form>
        )}

        {/* FILTERS */}
        <div className="filters-card" style={{ marginTop:10 }}>
          <div className="filters-row" style={{ gridTemplateColumns:'200px 200px 1fr 140px', alignItems:'end' }}>
            <div className="filter">
              <label><Filter size={13}/> Type</label>
              <select value={fType} onChange={e => { setFType(e.target.value); setPage(1); }}>
                <option value="">All</option>
                {TYPE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="filter">
              <label><Filter size={13}/> Tag</label>
              <select value={fTag} onChange={e => { setFTag(e.target.value); setPage(1); }}>
                <option value="">All</option>
                {TAG_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.chip} {t.label}</option>)}
              </select>
            </div>
            <div className="filter">
              <label>Search</label>
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1); }}
                placeholder="Find by text or author..."
              />
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn--outline btn--sm" onClick={clearFilters}>Clear</button>
            </div>
          </div>
        </div>

        {/* TIMELINE */}
        <div className="payments-list" style={{ marginTop:10 }}>
          <div className="list-header">
            <h3>Notes Timeline</h3>
            <span className="muted">{filtered.length} note(s)</span>
          </div>

          {pageItems.length === 0 ? (
            <div className="empty-row">No notes found.</div>
          ) : (
            <div className="table" style={{ border:'1px solid #e5e7eb' }}>
              <div className="thead" style={{ display:'grid', gridTemplateColumns:'180px 140px 1.2fr 120px 120px', alignItems:'center' }}>
                <div className="th">Type</div>
                <div className="th">Tag</div>
                <div className="th">Content</div>
                <div className="th">Logged</div>
                <div className="th">Actions</div>
              </div>
              <div className="tbody">
                {pageItems.map(note => {
                  const t = TYPE_OPTIONS.find(x => x.id === note.type);
                  const g = TAG_OPTIONS.find(x => x.id === note.tag);
                  return (
                    <NoteRow
                      key={note.id}
                      note={note}
                      typeMeta={t}
                      tagMeta={g}
                      onDelete={() => deleteNote(note.id)}
                      onAddComment={(txt) => addComment(note.id, txt, currentUserName)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="pagination" style={{ marginTop:10 }}>
              <div className="pagination-info">Page {page} of {totalPages}</div>
              <div className="pagination-controls">
                <button className="pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}><ChevronLeft size={14}/></button>
                <div className="pg-pages">
                  {Array.from({ length: totalPages }, (_, i) => i+1)
                    .slice(Math.max(0, page-3), Math.max(0, page-3)+5)
                    .map(n => (
                      <button key={n} className={`pg-num ${page===n?'active':''}`} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))
                  }
                </div>
                <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}><ChevronRight size={14}/></button>
                <button className="pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteRow({ note, typeMeta, tagMeta, onDelete, onAddComment }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');

  const submitComment = () => {
    if (!comment.trim()) return;
    onAddComment(comment.trim());
    setComment('');
    setOpen(true);
  };

  return (
    <div className="tr" style={{ display:'grid', gridTemplateColumns:'180px 140px 1.2fr 120px 120px', alignItems:'start' }}>
      {/* Type */}
      <div className="td">
        <div style={{ display:'inline-flex', gap:8, alignItems:'center', fontWeight:700, color:'#111827' }}>
          <span style={{ fontSize:18 }}>{typeMeta?.emoji || '📝'}</span>
          <span>{typeMeta?.label || note.type}</span>
        </div>
      </div>

      {/* Tag */}
      <div className="td">
        <span className={`wk-chip`} style={{
          borderColor: tagBorderColor(note.tag),
          background: tagBgColor(note.tag),
          color: tagTextColor(note.tag)
        }}>
          <span style={{ fontSize:14, lineHeight:1 }}>{tagMeta?.chip || '🔵'}</span>
          <b>{tagMeta?.label || note.tag}</b>
        </span>
      </div>

      {/* Content */}
      <div className="td" style={{ whiteSpace:'pre-wrap' }}>
        {note.body}
        {note.comments?.length > 0 && (
          <div style={{ marginTop:8, padding:8, background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8 }}>
            <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Feedback Thread</div>
            {note.comments.map(c => (
              <div key={c.id} style={{ fontSize:13, marginBottom:4 }}>
                <span style={{ color:'#111827', fontWeight:700 }}>{c.authorName || 'User'}</span>
                <span style={{ color:'#6b7280' }}> • {fmtDate(c.createdAt)}</span>
                <div>{c.body}</div>
              </div>
            ))}
          </div>
        )}

        {/* comment box */}
        {open && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Add a comment…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              style={{ flex:1, border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px' }}
              onKeyDown={e => e.key === 'Enter' && submitComment()}
            />
            <button className="btn btn--primary btn--sm" onClick={submitComment}>Send</button>
          </div>
        )}
      </div>

      {/* Logged */}
      <div className="td" style={{ fontSize:12 }}>
        <div style={{ fontWeight:700 }}>{note.createdBy?.name || 'User'}</div>
        {note.createdBy?.role && <div className="muted">{note.createdBy.role}</div>}
        <div className="muted">{fmtDate(note.createdAt)}</div>
      </div>

      {/* Actions */}
      <div className="td">
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className="btn btn--outline btn--sm" onClick={() => setOpen(v => !v)}>
            <MessageSquare size={14}/> {open ? 'Hide thread' : 'Comment'}
          </button>
          <button className="btn btn--danger btn--sm" onClick={onDelete}>
            <Trash2 size={14}/> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/** Helpers de cor para chips */
function tagBgColor(tag) {
  switch (tag) {
    case 'URGENT':  return '#fee2e2';
    case 'PENDING': return '#fef3c7';
    case 'ROUTINE': return '#dcfce7';
    default:        return '#e0f2fe';
  }
}
function tagBorderColor(tag) {
  switch (tag) {
    case 'URGENT':  return '#fecaca';
    case 'PENDING': return '#fde68a';
    case 'ROUTINE': return '#bbf7d0';
    default:        return '#bae6fd';
  }
}
function tagTextColor(tag) {
  switch (tag) {
    case 'URGENT':  return '#991b1b';
    case 'PENDING': return '#92400e';
    case 'ROUTINE': return '#065f46';
    default:        return '#1e40af';
  }
}
