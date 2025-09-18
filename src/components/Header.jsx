// src/components/Header.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { LogOut, Menu, Bell, User as UserIcon, Search, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/layout/header.css';

const PAGES = {
  '/dashboard': 'Dashboard Overview',
  '/services': 'Services Management',
  '/payments': 'Payment Processing',
  '/costs': 'Cost Management',
  '/capacity': 'Capacity Planning',
  '/users': 'User Management',
};

function titleFromPath(path) {
  if (PAGES[path]) return PAGES[path];
  const parts = String(path || '/')
    .split('/').filter(Boolean)
    .map(p => p.replace(/[-_]/g, ' '))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1));
  return parts.length ? parts.join(' / ') : 'Mimo Team Portal';
}

function crumbsFromPath(path) {
  const known = {
    '/dashboard': ['Home', 'Dashboard'],
    '/services': ['Home', 'Services'],
    '/payments': ['Home', 'Payments'],
    '/costs': ['Home', 'Costs'],
    '/capacity': ['Home', 'Capacity'],
    '/users': ['Home', 'Users'],
  };
  if (known[path]) return known[path];
  const parts = String(path || '/').split('/').filter(Boolean);
  return ['Home', ...parts.map(p => p.replace(/[-_]/g, ' '))
                           .map(p => p.charAt(0).toUpperCase() + p.slice(1))];
}

// fallback leve para quando não houver foto
const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
      <rect width='64' height='64' rx='12' ry='12' fill='#E2E8F0'/>
      <circle cx='32' cy='24' r='12' fill='#94A3B8'/>
      <path d='M10 56a22 22 0 0144 0' fill='#94A3B8'/>
    </svg>`
  );

const Header = ({ currentPath = '/', onMenuToggle, onSearch }) => {
  const { user, logout } = useAuth();
  const [now, setNow] = useState(new Date());
  const [q, setQ] = useState('');

  const role = String(user?.userType || 'ADMIN').toUpperCase();
  const isAdmin = ['ADMIN', 'ADMINISTRATOR', 'ADMIN_USER'].includes(role);
  const isPartner = ['PARTNER', 'PROVIDER', 'VENDOR'].includes(role);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmtTime = (d) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const fmtDate = (d) =>
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const pageTitle = titleFromPath(currentPath);
  const crumbs = crumbsFromPath(currentPath);

  const submitSearch = (e) => {
    e?.preventDefault?.();
    if (typeof onSearch === 'function') onSearch(q);
  };

  // ===== avatar: pega do contexto; se faltar, tenta do localStorage; se falhar, usa DEFAULT =====
  const avatarUrl = useMemo(() => {
    const direct = user?.avatarUrl || user?.photoUrl || user?.photoURL;
    if (direct) return direct;
    try {
      const raw = localStorage.getItem('current_user_v1');
      const stored = raw ? JSON.parse(raw) : null;
      if (stored?.avatarUrl) return stored.avatarUrl;
    } catch {}
    return DEFAULT_AVATAR;
  }, [user]);

  // handler para quedas de imagem (troca para DEFAULT)
  const onAvatarError = (e) => {
    if (e?.currentTarget?.src !== DEFAULT_AVATAR) {
      e.currentTarget.src = DEFAULT_AVATAR;
    }
  };

  return (
    <header className={`app-header neumorphic ${isAdmin ? 'app-header--admin' : 'app-header--partner'}`}>
      {/* Top bar (comum) */}
      <div className="hdr-row hdr-top">
        <div className="header-left">
          <button className="menu-toggle mobile-only" onClick={onMenuToggle} aria-label="Toggle menu">
            <Menu size={20} />
          </button>

          <div className="page-info">
            <h1 className="page-title">{pageTitle}</h1>
            <p className={`page-subtitle ${isPartner ? 'page-subtitle--compact' : ''}`}>
              {fmtDate(now)} • {fmtTime(now)}
            </p>
          </div>
        </div>

        <div className="header-right">
          <div className="header-clock glass-card">
            <div className="clock-time">{fmtTime(now)}</div>
            <div className="clock-date">{fmtDate(now).split(',')[0]}</div>
          </div>

          <button className="header-btn" aria-label="Notifications">
            <Bell size={18} />
            <span className="notification-badge">3</span>
          </button>

          {/* ===== avatar + info ===== */}
          <div className="user-profile" title={user?.name || 'Profile'}>
            <div className="user-avatar">
              <img
                src={avatarUrl}
                alt={user?.name || 'User avatar'}
                onError={onAvatarError}
                loading="lazy"
                decoding="async"
              />
              {/* Ícone opcional de fundo (aparece atrás se a imagem não carregar) */}
              <span className="user-avatar-fallback" aria-hidden>
                <UserIcon size={16} />
              </span>
            </div>

            <div className="user-info">
              <span className="user-name">{user?.name || user?.fullName || 'Admin User'}</span>
              <span className="user-role">{user?.userType || 'Administrator'}</span>
            </div>
          </div>

          <button className="logout-btn" onClick={logout} title="Sign Out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Sub-bar só para Admin: breadcrumbs + busca + filtros rápidos */}
      {isAdmin && (
        <div className="hdr-row hdr-sub">
          <nav className="hdr-breadcrumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="crumb">
                {c}{i < crumbs.length - 1 && <ChevronRight size={14} className="crumb-sep" />}
              </span>
            ))}
          </nav>

          <form className="hdr-search" role="search" onSubmit={submitSearch}>
            <Search size={16} className="search-ico" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search services, users, payments, capacity…"
              aria-label="Search"
            />
          </form>

          <div className="hdr-quick">
            {currentPath === '/capacity' && (
              <>
                <div className="chip" data-variant="outline">View: Week</div>
                <div className="chip" data-variant="outline">Team: All</div>
              </>
            )}
            {currentPath === '/payments' && (
              <>
                <div className="chip" data-variant="outline">Status: All</div>
                <div className="chip" data-variant="outline">Month: Current</div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
