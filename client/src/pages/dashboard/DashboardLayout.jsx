import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', end: true },
  { to: '/dashboard/orders', label: 'Orders', icon: '📋', end: false },
  { to: '/dashboard/products', label: 'Products', icon: '📦', end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: '⚙️', end: false },
];

export default function DashboardLayout() {
  const { merchant, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top header — distinct from public storefront */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-xl">
            {menuOpen ? '✕' : '☰'}
          </button>
          <h1 className="font-bold tracking-tight">📊 My Store</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-gray-300">{merchant?.storeName}</span>
          <button
            onClick={handleLogout}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-xs"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — desktop always, mobile toggle */}
        <nav className={`
          ${menuOpen ? 'block' : 'hidden'} md:block
          bg-white border-r border-gray-200 w-56 min-h-[calc(100vh-56px)] p-4 flex-shrink-0
        `}>
          <div className="md:hidden mb-4 text-sm text-gray-500">{merchant?.storeName}</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
