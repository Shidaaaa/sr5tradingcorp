import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Toaster } from 'react-hot-toast';
import { FiGrid, FiPackage, FiShoppingCart, FiCalendar, FiBox, FiDollarSign, FiUsers, FiMessageSquare, FiBarChart2, FiArrowLeft, FiRefreshCw, FiLogOut, FiMenu, FiX, FiFileText } from 'react-icons/fi';

const navItems = [
  { path: '/admin', icon: <FiGrid />, label: 'Dashboard', exact: true },
  { path: '/admin/products', icon: <FiPackage />, label: 'Products' },
  { path: '/admin/orders', icon: <FiShoppingCart />, label: 'Orders' },
  { path: '/admin/inquiries', icon: <FiFileText />, label: 'Inquiries' },
  { path: '/admin/bookings', icon: <FiCalendar />, label: 'Bookings' },
  { path: '/admin/inventory', icon: <FiBox />, label: 'Inventory' },
  { path: '/admin/sales', icon: <FiDollarSign />, label: 'Sales' },
  { path: '/admin/customers', icon: <FiUsers />, label: 'Customers' },
  { path: '/admin/feedback', icon: <FiMessageSquare />, label: 'Feedback' },
  { path: '/admin/returns', icon: <FiRefreshCw />, label: 'Returns' },
  { path: '/admin/reports', icon: <FiBarChart2 />, label: 'Reports' },
];

export default function AdminLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Toaster position="top-right" />

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-navy-900 flex flex-col transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-navy-800 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SR-5</span>
            </div>
            <div>
              <p className="font-bold text-white text-sm">SR-5 Admin</p>
              <p className="text-[10px] text-gray-400">Management Panel</p>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white"><FiX size={20} /></button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-accent-500 text-white' : 'text-gray-300 hover:bg-navy-800 hover:text-white'}`}>
                {item.icon} {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-navy-800 space-y-1">
          <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-navy-800 hover:text-white transition-colors">
            <FiArrowLeft /> Back to Store
          </Link>
          <button onClick={() => { logout(); navigate('/'); }} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-navy-800 w-full transition-colors">
            <FiLogOut /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-navy-900"><FiMenu size={22} /></button>
            <h2 className="font-semibold text-navy-900">Welcome, {user?.first_name}</h2>
          </div>
          <p className="text-sm text-gray-500 hidden sm:block">{new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
