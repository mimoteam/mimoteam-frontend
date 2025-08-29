// src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Services from './pages/Services';
import { 
  Settings, 
  DollarSign, 
  CreditCard, 
  Users as UsersIcon, 
  LogOut,
  Loader,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Bell,
  User,
  Wallet,
  CalendarDays,
  History,
  MoreVertical
} from 'lucide-react';

// Providers / Pages
import { CostsProvider } from './contexts/CostsContext';
import { HandoverProvider } from './contexts/HandoverContext';
import Costs from './pages/Costs'; 
import Payments from './pages/Payments';
import UsersPage from './pages/Users';
import Dashboard from './pages/Dashboard.jsx';

// Páginas do parceiro
import PartnerProfile from './pages/PartnerProfile.jsx';
import PartnerWallet from './pages/PartnerWallet.jsx';
import PartnerCalendar from './pages/PartnerCalendar.jsx';
import PartnerTimeline from './pages/PartnerTimeline.jsx';
import PartnerReimbursements from './pages/PartnerReimbursements.jsx';

// Admin Capacity
import Capacity from './pages/Capacity.jsx';

// >>> Finance (novo perfil)
import FinanceCenter from './pages/FinanceCenter.jsx';

import './styles/Layout.css';

// >>> chamada ao backend
import { loginApi } from './api/auth';
import { api } from './api/http';

const USERS_STORE_KEY = 'users_store_v1';
const CURRENT_USER_KEY = 'current_user_v1';
const LEGACY_CALENDAR_KEY = 'partner_calendar_v1';
const PAYMENTS_STORAGE_KEY = 'payments_v1';
const AUTH_TOKEN_KEY = 'auth_token_v1';

const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' ry='12' fill='%23E2E8F0'/><circle cx='32' cy='24' r='12' fill='%2394A3B8'/><path d='M10 56a22 22 0 0144 0' fill='%2394A3B8'/></svg>";

function ensureDefaultAvatarForUser(userLike) {
  if (!userLike) return DEFAULT_AVATAR_URL;
  const id = ensureStableId(userLike);
  const key = `partner_avatar_${id}`;
  let stored = null;
  try { stored = localStorage.getItem(key); } catch {}
  if (!stored && !userLike.avatarUrl) {
    try { localStorage.setItem(key, DEFAULT_AVATAR_URL); } catch {}
    return DEFAULT_AVATAR_URL;
  }
  return stored || userLike.avatarUrl || DEFAULT_AVATAR_URL;
}

function getDepartment(u) {
  return u?.department || u?.function || u?.funcao || u?.departmentName || '';
}

function ensureStableId(u) {
  if (u && u.id) return String(u.id);
  const base = (u?.email || u?.login || '').toString().trim();
  if (base) {
    return ('uid_' + base.toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/_+$/,'');
  }
  return 'uid_' + Math.random().toString(36).slice(2, 10);
}

function normalizeUsersStore() {
  let changed = false;
  let list = [];
  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    list = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch { list = []; }

  const seen = new Set();
  const normalized = list.map((u) => {
    const id = ensureStableId(u);
    const out = { ...u, id };
    if (u.id !== id) changed = true;

    if (seen.has(out.id)) {
      out.id = out.id + '_' + Math.random().toString(36).slice(2,6);
      changed = true;
    }
    seen.add(out.id);
    return out;
  });

  if (changed) {
    try { localStorage.setItem(USERS_STORE_KEY, JSON.stringify(normalized)); } catch {}
  }
  return normalized;
}

function migrateCalendarForUser(userId) {
  if (!userId) return;
  const destKey = `${LEGACY_CALENDAR_KEY}_${userId}`;
  try { if (localStorage.getItem(destKey)) return; } catch {}

  let sourceObj = null;
  try {
    const raw = localStorage.getItem(LEGACY_CALENDAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') sourceObj = parsed;
    }
  } catch {}
  if (!sourceObj) return;

  try { localStorage.setItem(destKey, JSON.stringify(sourceObj)); } catch {}
}

function migratePaymentsForUser(user) {
  if (!user) return;
  const id = ensureStableId(user);
  const login = (user.login || user.email || '').trim().toLowerCase();
  const full  = (user.fullName || '').trim().toLowerCase();

  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(PAYMENTS_STORAGE_KEY) || '[]'); } catch {}

  let changed = false;
  const next = (Array.isArray(arr) ? arr : []).map(p => {
    const partnerLogin = (p.partnerLogin || p.partnerEmail || '').trim().toLowerCase();
    const partnerName  = (p.partnerName || '').trim().toLowerCase();
    const status = String(p.status || '').trim().toUpperCase();

    const hasPeriod = p.weekStart || p.periodFrom || p.periodTo;
    const weekStart = p.weekStart || (!hasPeriod && p.createdAt ? p.createdAt : p.weekStart);

    let partnerId = p.partnerId;
    if (!partnerId || partnerLogin === login || (partnerName && partnerName === full)) {
      partnerId = id;
    }

    const mutated =
      partnerId !== p.partnerId ||
      status !== p.status ||
      weekStart !== p.weekStart;

    if (mutated) changed = true;
    return { ...p, partnerId, status, weekStart };
  });

  if (changed) {
    try { localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(next)); } catch {}
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState('login');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [formData, setFormData] = useState({ user: '', password: '', email: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const SIDEBAR_W_OPEN = 280;
  const SIDEBAR_W_CLOSED = 72;

  useEffect(() => {
    if (currentPage !== 'login') {
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
    }
  }, [currentPage]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  useEffect(() => {
    normalizeUsersStore();
  }, []);

  // ====== LOGIN (via backend) ======
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');

    try {
      const { token, user } = await loginApi(formData.user.trim(), formData.password.trim());

      const ensuredId = ensureStableId(user);
      const ensuredUser = {
        ...user,
        id: ensuredId,
        avatarUrl: ensureDefaultAvatarForUser({ ...user, id: ensuredId }),
        department: getDepartment(user),
      };

      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(ensuredUser));
      setCurrentUser(ensuredUser);

      migrateCalendarForUser(ensuredId);
      migratePaymentsForUser(ensuredUser);

      setFormData(prev => ({ ...prev, email: ensuredUser.email || '' }));
      const role = (ensuredUser.role || '').toLowerCase();
      if (role === 'partner') setCurrentPage('partner_wallet');
      else if (role === 'finance') setCurrentPage('finance_center');
      else setCurrentPage('dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentPage('login');
    setFormData({ user: '', password: '', email: '' });
    setError('');
    setSidebarOpen(true);
    setCurrentUser(null);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setMenuOpen(false);
  };

  // restaura sessão
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);

      if (token) {
        try {
          const { user } = await api('/auth/me');
          const ensuredId = ensureStableId(user);
          const ensured = {
            ...user,
            id: ensuredId,
            avatarUrl: ensureDefaultAvatarForUser({ ...user, id: ensuredId }),
            department: getDepartment(user),
          };

          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(ensured));
          setCurrentUser(ensured);

          migrateCalendarForUser(ensuredId);
          migratePaymentsForUser(ensured);

          const role = (ensured.role || '').toLowerCase();
          setCurrentPage(
            role === 'partner' ? 'partner_wallet'
            : role === 'finance' ? 'finance_center'
            : 'dashboard'
          );
          return;
        } catch {
          localStorage.removeItem(AUTH_TOKEN_KEY);
        }
      }

      try {
        const raw = localStorage.getItem(CURRENT_USER_KEY);
        if (!raw) return;
        const user = JSON.parse(raw);
        const ensuredId = ensureStableId(user);
        const ensured = { ...user, id: ensuredId, avatarUrl: ensureDefaultAvatarForUser({ ...user, id: ensuredId }) };

        if (user.id !== ensuredId || !user.avatarUrl) {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(ensured));
        }

        normalizeUsersStore();

        setCurrentUser(ensured);

        migrateCalendarForUser(ensuredId);
        migratePaymentsForUser(ensured);

        const role = (ensured.role || '').toLowerCase();
        setCurrentPage(
          role === 'partner' ? 'partner_wallet'
          : role === 'finance' ? 'finance_center'
          : 'dashboard'
        );
      } catch {}
    })();
  }, []);

  // flags de perfil
  const roleLower = (currentUser?.role || '').toLowerCase();
  const isPartner = roleLower === 'partner';
  const isFinance = roleLower === 'finance';

  // Apenas partner usa UI "mobile-first"
  const isMobileUI = isPartner;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      setIsNarrowScreen(mq.matches);
      if ((currentUser?.role || '').toLowerCase() === 'partner') {
        setSidebarOpen(!mq.matches);
      }
    };
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, [currentUser]);

  // Fecha kebab fora da página de perfil
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnClickOutside = (ev) => {
      const t = ev.target;
      if (t?.closest?.('.page-profile')) return;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (t?.matches?.('input[type="password"], input[name^="cur-"], input[name^="new-"], input[name^="rep-"]')) return;
      if (t?.closest?.('.kebab-wrap')) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnClickOutside);
    return () => document.removeEventListener('mousedown', closeOnClickOutside);
  }, [menuOpen]);

  const adminMenuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', description: 'Overview & Analytics',          position: 1 },
    { id: 'services',  icon: Settings,        label: 'Services',  description: 'Manage Partner Services',       position: 2 },
    { id: 'payments',  icon: CreditCard,      label: 'Payments',  description: 'Payment Processing',            position: 3 },
    { id: 'costs',     icon: DollarSign,      label: 'Costs',     description: 'Cost Management',               position: 4 },
    { id: 'capacity',  icon: CalendarDays,    label: 'Capacity',  description: 'Partners availability',         position: 5 },
    { id: 'users',     icon: UsersIcon,       label: 'Users',     description: 'User Management',               position: 6 },
  ];

  const financeMenuItems = [
    { id: 'finance_center', icon: CreditCard, label: 'Accounting', description: 'Payouts & Reports', position: 1 },
  ];

  const partnerMenuItems = [
    { id: 'partner_profile',        icon: User,         label: 'Profile',        description: 'Your data & settings' },
    { id: 'partner_wallet',         icon: Wallet,       label: 'Wallet',         description: 'Payments & approvals' },
    { id: 'partner_reimbursements', icon: DollarSign,   label: 'Reimbursements', description: 'Request reimbursements' },
    { id: 'partner_calendar',       icon: CalendarDays, label: 'Calendar',       description: 'Your upcoming tasks' },
    { id: 'partner_timeline',       icon: History,      label: 'Timeline',       description: 'Activity & history' },
  ];

  const menuItems = isPartner
    ? partnerMenuItems
    : isFinance
      ? financeMenuItems
      : adminMenuItems;

  const allMenusForHeader = [
    ...adminMenuItems,
    ...financeMenuItems,
    { id: 'partner_profile', label: 'Profile' },
    { id: 'partner_wallet', label: 'Wallet' },
    { id: 'partner_reimbursements', label: 'Reimbursements' },
    { id: 'partner_calendar', label: 'Calendar' },
    { id: 'partner_timeline', label: 'Timeline' },
  ];
  const pageLabel = (allMenusForHeader.find(i => i.id === currentPage)?.label) || (isPartner ? 'Wallet' : 'Dashboard');

  // >>> MERGE (fix do redirecionamento inesperado)
  const handleUserUpdate = useCallback((patchOrUser) => {
    setCurrentUser(prev => {
      const next = { ...(prev || {}), ...(patchOrUser || {}) };
      try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  if (currentPage === 'login') {
    return (
      <div className="login-container">
        <div className="animated-bg"></div>
        <div className="login-card glass-card">
          <h1 className="login-title">MIMO TEAM</h1>
          <p className="login-subtitle">Team Management and Performance Portal</p>
          
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <input
                type="text"
                placeholder="Username"
                className="login-input"
                value={formData.user}
                onChange={(e) => updateField('user', e.target.value)}
                required
                disabled={isLoggingIn}
                autoComplete="username"
              />
            </div>
            
            <div className="input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                className="login-input"
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
                disabled={isLoggingIn}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle"
                disabled={isLoggingIn}
                aria-label="Toggle password"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            
            <button 
              type="submit" 
              className="login-button modern-button"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <>
                  <Loader size={20} className="animate-spin" style={{ marginRight: '8px' }} />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const appLayoutClass = `app-layout ${isPartner && isMobileUI ? 'partner-mobile' : ''}`;
  const sidebarClass = (() => {
    const cls = ['sidebar'];
    if (isMobileUI) {
      if (sidebarOpen) cls.push('sidebar-open');
    } else {
      if (!sidebarOpen) cls.push('sidebar-closed');
    }
    return cls.join(' ');
  })();
  const mainContentClass = (() => {
    const cls = ['main-content'];
    if (!isMobileUI && !sidebarOpen) cls.push('sidebar-closed');
    return cls.join(' ');
  })();

  return (
    <CostsProvider>
      <HandoverProvider>
        <div className={appLayoutClass}>
          {/* Sidebar */}
          {!(isPartner && isMobileUI) && (
            <div
              className={sidebarClass}
              style={!isMobileUI ? { width: sidebarOpen ? SIDEBAR_W_OPEN : SIDEBAR_W_CLOSED } : undefined}
            >
              <div className="sidebar-header">
                <div className="sidebar-logo">
                  <h2 className="logo-text">MIMO</h2>
                  {!isMobileUI && sidebarOpen && <span className="logo-subtitle">TEAM</span>}
                </div>
                <button 
                  className="sidebar-toggle"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  aria-label="Toggle sidebar"
                  aria-expanded={sidebarOpen}
                >
                  {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
              </div>

              <nav className="sidebar-nav">
                {menuItems
                  .slice()
                  .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
                  .map((item) => {
                    const IconComponent = item.icon;
                    const handleClick = () => {
                      setCurrentPage(item.id);
                      if (isMobileUI) setSidebarOpen(false);
                    };
                    return (
                      <button
                        key={item.id}
                        data-key={item.id}
                        onClick={handleClick}
                        className={`nav-item ${currentPage === item.id ? 'nav-item-active' : ''}`}
                        style={{ order: item.position }}
                      >
                        <div className="nav-icon">
                          <IconComponent size={22} />
                        </div>
                        {sidebarOpen && (
                          <div className="nav-content">
                            <span className="nav-label">{item.label}</span>
                            <span className="nav-description">{item.description}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
              </nav>

              {(!isMobileUI && sidebarOpen) && (
                <div className="sidebar-footer">
                  <div className="sidebar-footer-content">
                    <p className="footer-text">Mimo Team Portal</p>
                    <p className="footer-version">v2.0.1</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Backdrop do drawer */}
          {isMobileUI && sidebarOpen && !(isPartner && isMobileUI) && (
            <div className="backdrop" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Main Content */}
          <div className={mainContentClass} style={(isPartner && isMobileUI) ? { marginLeft: 0 } : undefined}>
            {/* Header */}
            <header className={`app-header neumorphic ${isPartner && isMobileUI ? 'partner-header' : ''}`}>
              <div className="header-left">
                {isMobileUI && !(isPartner && isMobileUI) && (
                  <button
                    className="header-hamburger"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Open menu"
                    style={{ marginRight: 8 }}
                  >
                    <span style={{display:'block', width:18, height:2, background:'#334155', margin:'3px 0', borderRadius:2}} />
                    <span style={{display:'block', width:18, height:2, background:'#334155', margin:'3px 0', borderRadius:2}} />
                    <span style={{display:'block', width:18, height:2, background:'#334155', margin:'3px 0', borderRadius:2}} />
                  </button>
                )}

                <div className="page-info">
                  <h1 className="page-title">{pageLabel}</h1>

                  <p className="page-subtitle">
                    {`Welcome — ${currentTime.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}`}
                  </p>

                  <p className="page-userline" style={{ marginTop: 4, color: isPartner && isMobileUI ? 'rgba(255,255,255,.85)' : '#64748B' }}>
                    {(currentUser?.fullName || formData.user || '—')} — {currentUser?.department || (isPartner ? 'Partner' : isFinance ? 'Finance' : 'Administrator')}
                  </p>
                </div>
              </div>

              <div className="header-right">
                {isPartner && isMobileUI ? (
                  <div className="kebab-wrap" style={{ position:'relative' }}>
                    <button
                      className="header-kebab"
                      aria-label="More"
                      onClick={() => setMenuOpen(v => !v)}
                      style={{
                        width:40, height:40, borderRadius:10, border:'1px solid rgba(255,255,255,.18)',
                        background:'rgba(255,255,255,.10)', color:'#fff', display:'inline-flex',
                        alignItems:'center', justifyContent:'center'
                      }}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {menuOpen && (
                      <div
                        className="kebab-menu"
                        style={{
                          position:'absolute', right:0, top:'calc(100% + 8px)',
                          background: 'rgba(13,19,45,.98)', color:'#fff',
                          border: '1px solid rgba(255,255,255,.12)', borderRadius:12,
                          minWidth:160, padding:6, boxShadow:'0 8px 24px rgba(0,0,0,.35)', zIndex: 50
                        }}
                      >
                        <button
                          onClick={handleLogout}
                          style={{
                            width:'100%', textAlign:'left', padding:'10px 12px', border:0, background:'transparent',
                            color:'#fff', borderRadius:8, cursor:'pointer'
                          }}
                          onMouseDown={(e)=>e.preventDefault()}
                        >
                          <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
                            <LogOut size={16} /> Logout
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {!isMobileUI && (
                      <div className="header-clock glass-card">
                        <div className="clock-time">
                          {currentTime.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          })}
                        </div>
                        <div className="clock-date">
                          {currentTime.toLocaleDateString('en-US', { weekday: 'long' })}
                        </div>
                      </div>
                    )}

                    <button className="header-btn" title="Notifications">
                      <Bell size={18} />
                      <span className="notification-badge">3</span>
                    </button>

                    <div className="user-profile">
                      <div className="user-avatar">
                        <User size={18} />
                      </div>
                      {!isMobileUI && (
                        <div className="user-info">
                          <span className="user-name">{currentUser?.fullName || formData.user || 'User'}</span>
                          <span className="user-role">{currentUser?.department || (isPartner ? 'Partner' : isFinance ? 'Finance' : 'Administrator')}</span>
                        </div>
                      )}
                    </div>

                    <button 
                      className="logout-btn"
                      onClick={handleLogout}
                      title="Sign Out"
                    >
                      <LogOut size={18} />
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* Page Content */}
            <div className="page-content">
              {/* Admin rotas */}
              {currentPage === 'dashboard' && !isPartner && !isFinance && (
                <Dashboard
                  currentUserName={formData.user || 'Admin User'}
                  currentUserRole="Administrator"
                />
              )}
              {currentPage === 'services' && !isPartner && !isFinance && <Services currentUser={currentUser} />}
              {currentPage === 'payments' && !isPartner && !isFinance && <Payments />}
              {currentPage === 'costs' && !isPartner && !isFinance && <Costs />}
              {currentPage === 'capacity' && !isPartner && !isFinance && <Capacity />}
              {currentPage === 'users' && !isPartner && !isFinance && <UsersPage />}

              {/* Finance (novo perfil desktop) */}
              {isFinance && currentPage === 'finance_center' && (
                <FinanceCenter />
              )}

              {/* Partner rotas dedicadas */}
              {isPartner && currentPage === 'partner_wallet'   && (
                <PartnerWallet
                  currentUser={currentUser}
                  coloredCards
                  filtersOnTop
                />
              )}
              {isPartner && currentPage === 'partner_profile'  && (
                <PartnerProfile currentUser={currentUser} onUserUpdate={handleUserUpdate} />
              )}
              {isPartner && currentPage === 'partner_calendar' && (
                <PartnerCalendar currentUser={currentUser} />
              )}
              {isPartner && currentPage === 'partner_reimbursements' && (
                <PartnerReimbursements currentUser={currentUser} />
              )}
              {isPartner && currentPage === 'partner_timeline' && (
                <PartnerTimeline currentUser={currentUser} />
              )}
            </div>
          </div>

          {/* Tab bars */}
          {isPartner && isMobileUI && (
            <MobileTabBar
              role="partner"
              currentPage={currentPage}
              setCurrentPage={(id) => {
                setCurrentPage(id);
                setMenuOpen(false);
              }}
            />
          )}
          {!isPartner && isMobileUI && (
            <MobileTabBar
              role="admin"
              currentPage={currentPage}
              setCurrentPage={(id) => {
                setCurrentPage(id);
                setSidebarOpen(false);
              }}
              onMore={() => setSidebarOpen(true)}
            />
          )}
        </div>
      </HandoverProvider>
    </CostsProvider>
  );
}

function MobileTabBar({ role = 'admin', currentPage, setCurrentPage, onMore }) {
  const partnerTabs = [
    { id: 'partner_profile',        label: 'Profile',  icon: User },
    { id: 'partner_wallet',         label: 'Wallet',   icon: Wallet },
    { id: 'partner_reimbursements', label: 'Reimb.',   icon: DollarSign },
    { id: 'partner_calendar',       label: 'Calendar', icon: CalendarDays },
    { id: 'partner_timeline',       label: 'Timeline', icon: History },
  ];
  const adminTabs = [
    { id: 'dashboard', label: 'Home',     icon: LayoutDashboard },
    { id: 'services',  label: 'Services', icon: Settings },
    { id: 'payments',  label: 'Payments', icon: CreditCard },
    { id: 'more',      label: 'More',     icon: UsersIcon, isMore: true },
  ];

  const tabs = role.toLowerCase() === 'partner' ? partnerTabs : adminTabs;

  return (
    <nav className="mobile-tabbar" role="navigation" aria-label="Primary">
      {tabs.map(t => {
        const Icon = t.icon;
        const active = currentPage === t.id;
        const onClick = t.isMore ? onMore : () => setCurrentPage(t.id);
        return (
          <button
            key={t.id}
            className={`mtab ${active ? 'active' : ''}`}
            onClick={onClick}
            aria-label={t.label}
          >
            <Icon size={22} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default App;
