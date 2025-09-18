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
  ChevronRight,
  Zap, // <- Lightning Lanes
} from 'lucide-react';
import '../styles/ui/Sidebar.css';

const Sidebar = ({ isOpen, onToggle }) => {
  // ORDEM desejada:
  // Dashboard, Services, Payments, Lightning Lanes, Billing Input, Team, Capacity, Costs, Users
  const menuItems = [
    { key: 'dashboard',        path: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard',       description: 'Overview & Analytics' },
    { key: 'services',         path: '/services',         icon: Settings,        label: 'Services',        description: 'Manage Partner Services' },
    { key: 'payments',         path: '/payments',         icon: CreditCard,      label: 'Payments',        description: 'Payment Processing' },
    { key: 'lightning_lanes',  path: '/lightning-lanes',  icon: Zap,             label: 'Lightning Lanes', description: 'LL viewer' },
    { key: 'billing_input',    path: '/billing-input',    icon: DollarSign,      label: 'Billing Input',   description: 'Send costs to Finance' },
    { key: 'team',             path: '/team',             icon: UsersIcon,       label: 'Team',            description: 'Team directory' },
    { key: 'capacity',         path: '/capacity',         icon: CalendarDays,    label: 'Capacity',        description: 'Teams availability' },
    { key: 'costs',            path: '/costs',            icon: DollarSign,      label: 'Costs',           description: 'Cost Management' },
    { key: 'users',            path: '/users',            icon: UsersIcon,       label: 'Users',           description: 'User Management' },
  ];

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`} aria-expanded={isOpen}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-mark" aria-hidden>M</div>
            <h2 className="logo-text">MIMO</h2>
            {isOpen && <span className="logo-subtitle">TEAM</span>}
          </div>

          <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
            {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                data-key={item.key}
                title={!isOpen ? item.label : undefined}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <div className="nav-icon">
                  <Icon size={22} />
                </div>

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
          <footer className="sidebar-footer">
            <div className="sidebar-footer-content">
              <p className="footer-text">Mimo Team Portal</p>
              <p className="footer-version">v2.0.1</p>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
