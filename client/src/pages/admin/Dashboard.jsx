import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { FiPackage, FiShoppingCart, FiDollarSign, FiCalendar, FiUsers, FiMessageSquare, FiAlertTriangle, FiRefreshCw, FiTrendingUp, FiBox, FiClock } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try { setStats(await api.getStats()); } catch {} finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;
  if (!stats) return null;

  const primaryCards = [
    { label: 'Total Revenue', value: formatPrice(stats.revenue.total), icon: <FiDollarSign />, color: 'text-emerald-600 bg-emerald-50', link: '/admin/sales' },
    { label: 'Monthly Revenue', value: formatPrice(stats.revenue.monthly), icon: <FiTrendingUp />, color: 'text-blue-600 bg-blue-50', link: '/admin/sales' },
    { label: 'Total Orders', value: stats.orders.total, icon: <FiShoppingCart />, color: 'text-purple-600 bg-purple-50', link: '/admin/orders' },
    { label: 'Completed Orders', value: stats.orders.completed, icon: <FiShoppingCart />, color: 'text-emerald-600 bg-emerald-50', link: '/admin/orders' },
  ];

  const secondaryCards = [
    { label: 'Pending Orders', value: stats.orders.pending, icon: <FiClock />, color: 'text-amber-600 bg-amber-50', link: '/admin/orders' },
    { label: 'Total Products', value: stats.products.total, icon: <FiPackage />, color: 'text-indigo-600 bg-indigo-50', link: '/admin/products' },
    { label: 'Low Stock Items', value: stats.products.low_stock, icon: <FiAlertTriangle />, color: 'text-red-600 bg-red-50', link: '/admin/inventory' },
    { label: 'Sold Out Items', value: stats.products.sold_out, icon: <FiBox />, color: 'text-gray-600 bg-gray-100', link: '/admin/inventory' },
    { label: 'Pending Bookings', value: stats.bookings.pending, icon: <FiCalendar />, color: 'text-orange-600 bg-orange-50', link: '/admin/bookings' },
    { label: 'Total Customers', value: stats.customers.total, icon: <FiUsers />, color: 'text-teal-600 bg-teal-50', link: '/admin/customers' },
    { label: 'Pending Feedback', value: stats.feedback.pending, icon: <FiMessageSquare />, color: 'text-pink-600 bg-pink-50', link: '/admin/feedback' },
    { label: 'Pending Returns', value: stats.returns.pending, icon: <FiRefreshCw />, color: 'text-rose-600 bg-rose-50', link: '/admin/returns' },
  ];

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-gradient-to-r from-white to-slate-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">Dashboard Overview</h1>
            <p className="text-sm text-gray-500 mt-1">Balanced snapshot of sales, operations, and customer activity.</p>
          </div>
          <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {primaryCards.map((card) => (
          <Link key={card.label} to={card.link} className="card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all h-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-navy-900 leading-tight">{card.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {secondaryCards.map((card) => (
          <Link key={card.label} to={card.link} className="card p-4 hover:shadow-md transition-all h-full">
            <div className="flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>{card.icon}</span>
              <div>
                <p className="text-lg font-bold text-navy-900 leading-none">{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-navy-900">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs font-semibold text-accent-600 hover:text-accent-700">View all</Link>
          </div>
          <div className="p-4 space-y-3">
            {(stats.recentOrders || []).length > 0 ? (stats.recentOrders || []).map((order) => (
              <div key={order.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-900">{order.order_number}</p>
                  <p className="text-xs text-gray-500">{order.customer_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-navy-900">{formatPrice(order.total_amount || 0)}</p>
                  <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500 py-6 text-center">No recent orders yet.</p>}
          </div>
        </div>

        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-navy-900">Recent Bookings</h2>
            <Link to="/admin/bookings" className="text-xs font-semibold text-accent-600 hover:text-accent-700">View all</Link>
          </div>
          <div className="p-4 space-y-3">
            {(stats.recentBookings || []).length > 0 ? (stats.recentBookings || []).map((booking) => (
              <div key={booking.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-900">{booking.booking_number || booking.booking_type || 'Booking'}</p>
                  <p className="text-xs text-gray-500">{booking.customer_name} {booking.product_name ? `• ${booking.product_name}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{booking.status || 'pending'}</p>
                  <p className="text-xs text-gray-500">{new Date(booking.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500 py-6 text-center">No recent bookings yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
