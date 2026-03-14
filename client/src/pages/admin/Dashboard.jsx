import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { FiPackage, FiShoppingCart, FiDollarSign, FiCalendar, FiUsers, FiMessageSquare, FiAlertTriangle, FiRefreshCw, FiTrendingUp, FiBox } from 'react-icons/fi';

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

  const cards = [
    { label: 'Total Revenue', value: formatPrice(stats.revenue.total), icon: <FiDollarSign />, color: 'text-emerald-600 bg-emerald-50', link: '/admin/sales' },
    { label: 'Monthly Revenue', value: formatPrice(stats.revenue.monthly), icon: <FiTrendingUp />, color: 'text-blue-600 bg-blue-50', link: '/admin/reports' },
    { label: 'Total Orders', value: stats.orders.total, icon: <FiShoppingCart />, color: 'text-purple-600 bg-purple-50', link: '/admin/orders' },
    { label: 'Pending Orders', value: stats.orders.pending, icon: <FiShoppingCart />, color: 'text-amber-600 bg-amber-50', link: '/admin/orders' },
    { label: 'Total Products', value: stats.products.total, icon: <FiPackage />, color: 'text-indigo-600 bg-indigo-50', link: '/admin/products' },
    { label: 'Low Stock Items', value: stats.products.low_stock, icon: <FiAlertTriangle />, color: 'text-red-600 bg-red-50', link: '/admin/inventory' },
    { label: 'Sold Out Items', value: stats.products.sold_out, icon: <FiBox />, color: 'text-gray-600 bg-gray-100', link: '/admin/inventory' },
    { label: 'Pending Bookings', value: stats.bookings.pending, icon: <FiCalendar />, color: 'text-orange-600 bg-orange-50', link: '/admin/bookings' },
    { label: 'Total Customers', value: stats.customers.total, icon: <FiUsers />, color: 'text-teal-600 bg-teal-50', link: '/admin/customers' },
    { label: 'Pending Feedback', value: stats.feedback.pending, icon: <FiMessageSquare />, color: 'text-pink-600 bg-pink-50', link: '/admin/feedback' },
    { label: 'Pending Returns', value: stats.returns.pending, icon: <FiRefreshCw />, color: 'text-rose-600 bg-rose-50', link: '/admin/returns' },
    { label: 'Completed Orders', value: stats.orders.completed, icon: <FiShoppingCart />, color: 'text-emerald-600 bg-emerald-50', link: '/admin/orders' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <Link key={i} to={card.link} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
                {card.icon}
              </span>
            </div>
            <p className="text-2xl font-bold text-navy-900">{card.value}</p>
            <p className="text-sm text-gray-500">{card.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
