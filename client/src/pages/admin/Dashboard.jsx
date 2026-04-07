import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { FiPackage, FiShoppingCart, FiDollarSign, FiCalendar, FiUsers, FiMessageSquare, FiAlertTriangle, FiRefreshCw, FiTrendingUp, FiBox, FiArrowUpRight, FiCheckCircle, FiCreditCard } from 'react-icons/fi';

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

  const totalSales = Number(stats.sales?.total ?? stats.revenue?.total ?? 0);
  const monthlySales = Number(stats.sales?.monthly ?? stats.revenue?.monthly ?? 0);
  const totalTransactions = Number(stats.transactions?.total ?? 0);
  const monthlyTransactions = Number(stats.transactions?.monthly ?? 0);
  const successfulOrders = Number(stats.orders?.successful ?? stats.orders?.completed ?? 0);

  const topKpis = [
    {
      label: 'Total Sales',
      value: formatPrice(totalSales),
      sub: `${formatPrice(monthlySales)} this month`,
      icon: <FiDollarSign size={18} />,
      link: '/admin/sales',
      tone: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Total Transactions',
      value: totalTransactions,
      sub: `${monthlyTransactions} this month`,
      icon: <FiCreditCard size={18} />,
      link: '/admin/sales',
      tone: 'from-blue-500 to-cyan-600',
    },
    {
      label: 'Successful Orders',
      value: successfulOrders,
      sub: `${stats.orders?.total || 0} total orders`,
      icon: <FiCheckCircle size={18} />,
      link: '/admin/orders',
      tone: 'from-violet-500 to-indigo-600',
    },
  ];

  const cards = [
    { label: 'Pending Orders', value: stats.orders.pending, icon: <FiShoppingCart />, color: 'text-amber-700 bg-amber-50 border-amber-100', link: '/admin/orders' },
    { label: 'Pending Bookings', value: stats.bookings.pending, icon: <FiCalendar />, color: 'text-orange-700 bg-orange-50 border-orange-100', link: '/admin/bookings' },
    { label: 'Pending Returns', value: stats.returns.pending, icon: <FiRefreshCw />, color: 'text-rose-700 bg-rose-50 border-rose-100', link: '/admin/returns' },
    { label: 'Pending Feedback', value: stats.feedback.pending, icon: <FiMessageSquare />, color: 'text-pink-700 bg-pink-50 border-pink-100', link: '/admin/feedback' },
    { label: 'Total Products', value: stats.products.total, icon: <FiPackage />, color: 'text-indigo-700 bg-indigo-50 border-indigo-100', link: '/admin/products' },
    { label: 'Low Stock Items', value: stats.products.low_stock, icon: <FiAlertTriangle />, color: 'text-red-700 bg-red-50 border-red-100', link: '/admin/inventory' },
    { label: 'Sold Out Items', value: stats.products.sold_out, icon: <FiBox />, color: 'text-gray-700 bg-gray-100 border-gray-200', link: '/admin/inventory' },
    { label: 'Total Customers', value: stats.customers.total, icon: <FiUsers />, color: 'text-teal-700 bg-teal-50 border-teal-100', link: '/admin/customers' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-navy-200 bg-gradient-to-r from-navy-900 to-slate-800 p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-navy-200">Admin Command Center</p>
            <h1 className="text-3xl font-bold mt-1">Business Overview</h1>
            <p className="text-sm text-navy-200 mt-2">Monitor revenue performance, transaction flow, and order success at a glance.</p>
          </div>
          <Link to="/admin/reports" className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 transition-colors">
            View Detailed Reports <FiArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topKpis.map((kpi) => (
          <Link key={kpi.label} to={kpi.link} className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
                <p className="text-3xl font-bold text-navy-900 mt-1">{kpi.value}</p>
                <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
              </div>
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.tone} text-white shadow-sm`}>
                {kpi.icon}
              </span>
            </div>
            <div className="mt-4 text-xs font-semibold text-navy-700 group-hover:text-accent-600 transition-colors">Open module</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold text-navy-900 mb-4">Operations Snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card, i) => (
              <Link key={i} to={card.link} className="rounded-xl border p-4 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-9 h-9 rounded-lg border flex items-center justify-center ${card.color}`}>
                    {card.icon}
                  </span>
                </div>
                <p className="text-2xl font-bold text-navy-900 leading-tight">{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold text-navy-900 mb-4">Revenue Pace</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Monthly Sales</p>
              <p className="text-2xl font-bold text-navy-900">{formatPrice(monthlySales)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Monthly Transactions</p>
              <p className="text-2xl font-bold text-navy-900">{monthlyTransactions}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Order Success Rate</p>
              <p className="text-2xl font-bold text-navy-900">
                {stats.orders?.total ? `${Math.round((successfulOrders / stats.orders.total) * 100)}%` : '0%'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
