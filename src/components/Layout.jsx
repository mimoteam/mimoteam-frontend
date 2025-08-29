// src/components/Layout.jsx
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header'; // se tiver
import { Outlet } from 'react-router-dom';

const Layout = () => {
  const [isOpen, setIsOpen] = useState(true);
  const toggle = () => setIsOpen(v => !v);

  return (
    <div className="app-layout">
      <Sidebar isOpen={isOpen} onToggle={toggle} />
      <div className={`main-content ${isOpen ? '' : 'sidebar-closed'}`}>
        {/* Header opcional */}
        {typeof Header === 'function' ? <Header /> : null}
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
