// src/components/NotificationsBell.jsx
import React, { useMemo, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationsContext';

export default function NotificationsBell() {
  const { list = [], unread = 0, markAllRead, removeNotification } = useNotifications() || {};
  const [open, setOpen] = useState(false);

  // Só mostra o que foi atualizado (não lido).
  const items = useMemo(() => {
    const hasReadFlag = list.some(n => n && Object.prototype.hasOwnProperty.call(n, 'read'));
    return hasReadFlag ? list.filter(n => !n.read) : list;
  }, [list]);

  return (
    <div className="notif-wrap" style={{ position: 'relative' }}>
      <button className="header-btn" title="Notifications" onClick={() => setOpen(v => !v)}>
        <Bell size={18} />
        {unread > 0 && <span className="notification-badge">{unread}</span>}
      </button>

      {open && (
        <div
          className="notif-panel"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 340,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 8px 28px rgba(0,0,0,.15)',
            zIndex: 60
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid #eee'
            }}
          >
            <strong>Notifications</strong>
            <button className="btn btn--sm btn--outline" onClick={markAllRead}>
              <Check size={14} /> Mark all read
            </button>
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: 16, color: '#64748b' }}>No new updates</div>
            ) : (
              items.map(n => (
                <div
                  key={n.id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{n.title}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#475569',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {n.message}
                    </div>
                    {n.timestamp && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        {new Date(n.timestamp).toLocaleString()}
                      </div>
                    )}
                    {/* Removido o botão "Open" */}
                  </div>

                  <button
                    className="btn btn--xs btn--ghost"
                    onClick={() => removeNotification(n.id)}
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
