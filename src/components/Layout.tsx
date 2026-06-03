import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: 'bi-grid-1x2-fill', label: '儀表板' },
  { to: '/cash-management', icon: 'bi-wallet2', label: '現金管理' },
  { to: '/sales-entry', icon: 'bi-cash-coin', label: '售出錄入' },
  { to: '/buy-in', icon: 'bi-bag-plus-fill', label: '買入頁面' },
  { to: '/fifo-inventory', icon: 'bi-boxes', label: 'FIFO庫存管理' },
  { to: '/independent-balance', icon: 'bi-currency-exchange', label: '儲值客戶' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="wrapper">
      <nav id="sidebar" className={sidebarOpen ? 'show' : ''}>
        <div className="sidebar-header">
          <h4>
            <i className="bi bi-graph-up-arrow me-2" />
            RMB管理系統
          </h4>
          <small className="text-muted">你好, {user?.username}</small>
        </div>
        <ul className="list-unstyled components">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => (isActive ? 'active' : '')}
                onClick={() => window.innerWidth <= 768 && setSidebarOpen(false)}
              >
                <i className={`bi ${item.icon} me-3`} />
                {item.label}
              </NavLink>
            </li>
          ))}
          {user?.isAdmin && (
            <>
              <hr className="mx-3" />
              <li>
                <NavLink
                  to="/user-management"
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => window.innerWidth <= 768 && setSidebarOpen(false)}
                >
                  <i className="bi bi-person-badge me-3" />
                  使用者管理
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </nav>

      <div
        id="sidebarOverlay"
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        role="presentation"
      />

      <button
        type="button"
        id="floatingSidebarToggle"
        className="floating-sidebar-toggle d-md-none"
        onClick={() => setSidebarOpen((v) => !v)}
      >
        <i className={`bi ${sidebarOpen ? 'bi-x-lg' : 'bi-list'} fs-5`} />
      </button>

      <div id="content">
        <div className="main-content-inner">
          <nav className="navbar navbar-expand-lg navbar-light bg-white mb-4 rounded shadow-sm p-2">
            <div className="container-fluid">
              <div className="ms-auto d-flex align-items-center">
                <span className="navbar-text text-muted d-none d-md-inline me-3">
                  {user?.username}
                </span>
                <button type="button" className="btn btn-outline-danger btn-sm" onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right me-1" />
                  登出
                </button>
              </div>
            </div>
          </nav>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div id="content" className="w-100 p-0 m-0">
      <main>{children}</main>
    </div>
  );
}
