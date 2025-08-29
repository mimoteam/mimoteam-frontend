// src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Settings, 
  DollarSign, 
  CreditCard, 
  Users as UsersIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const Sidebar = ({ isOpen, onToggle }) => {
  // Ordem: 1 Dashboard, 2 Services, 3 Payments, 4 Costs, 5 Capacity, 6 Users
  const menuItems = [
    { key: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', description: 'Overview & Analytics' },
    { key: 'services',  path: '/services',  icon: Settings,        label: 'Services',  description: 'Manage Partner Services' },
    { key: 'payments',  path: '/payments',  icon: CreditCard,      label: 'Payments',  description: 'Payment Processing' },
    { key: 'costs',     path: '/costs',     icon: DollarSign,      label: 'Costs',     description: 'Cost Management' },
    { key: 'capacity',  path: '/capacity',  icon: CalendarDays,    label: 'Capacity',  description: 'Teams availability' },
    { key: 'users',     path: '/users',     icon: UsersIcon,       label: 'Users',     description: 'User Management' },
  ];

  const visibleItems = menuItems; // todos visíveis agora

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      <div className={`sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <h2 className="logo-text">MIMO</h2>
            {isOpen && <span className="logo-subtitle">TEAM</span>}
          </div>
          <button className="sidebar-toggle" onClick={onToggle}>
            {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                data-key={item.key}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <div className="nav-icon"><Icon size={22} /></div>
                {isOpen && (
                  <div className="nav-content">
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-description">{item.description}</span>
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {isOpen && (
          <div className="sidebar-footer">
            <div className="sidebar-footer-content">
              <p className="footer-text">Mimo Team Portal</p>
              <p className="footer-version">v2.0.1</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
