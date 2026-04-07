import { useState, useEffect } from 'react';
import { api } from '../../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { FiCalendar, FiTrendingUp, FiDollarSign, FiDownload } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);
const COLORS = ['#1e40af', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function AdminReports() {
  const [monthly, setMonthly] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('monthly');

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    try {
      const [m, r] = await Promise.all([api.getMonthlyReport(), api.getRevenueReport()]);
      setMonthly(m); setRevenue(r);
    } catch {} finally { setLoading(false); }
  };

  const downloadCsv = (filename, headers, rows) => {
    const escape = (value) => {
      if (value === null || value === undefined) return '';
      const text = String(value).replace(/"/g, '""');
      return /[",\n]/.test(text) ? `"${text}"` : text;
    };

    const csv = [headers.join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportMonthlyReports = () => {
    if (!monthly) return;

    downloadCsv(
      'monthly-sales-by-month.csv',
      ['Month', 'Total Revenue', 'Transactions'],
      (monthly.sales_by_month || []).map(item => [
        item.month,
        Number(item.total_revenue || 0).toFixed(2),
        item.transactions || 0,
      ])
    );

    downloadCsv(
      'monthly-bookings-by-month.csv',
      ['Month', 'Total Bookings'],
      (monthly.bookings_by_month || []).map(item => [
        item.month,
        item.total_bookings || 0,
      ])
    );

    downloadCsv(
      'monthly-top-products.csv',
      ['Rank', 'Product Name', 'Units Sold', 'Revenue'],
      (monthly.top_products || []).map((item, index) => [
        index + 1,
        item.product_name,
        item.total_quantity || 0,
        Number(item.total_revenue || 0).toFixed(2),
      ])
    );
  };

  const exportRevenueReports = () => {
    if (!revenue) return;

    downloadCsv(
      'revenue-summary.csv',
      ['Metric', 'Value'],
      [
        ['Total Revenue', Number(revenue.total_revenue || 0).toFixed(2)],
        ['Monthly Revenue', Number(revenue.monthly_revenue || 0).toFixed(2)],
        ['Total Orders', revenue.total_orders || 0],
      ]
    );

    downloadCsv(
      'revenue-by-payment-method.csv',
      ['Payment Method', 'Revenue'],
      (revenue.revenue_by_method || []).map(item => [
        (item.payment_method || 'unknown').replace('_', ' '),
        Number(item.total || 0).toFixed(2),
      ])
    );

    downloadCsv(
      'revenue-by-product-type.csv',
      ['Product Type', 'Revenue'],
      (revenue.revenue_by_type || []).map(item => [
        item.type || 'other',
        Number(item.total || 0).toFixed(2),
      ])
    );

    downloadCsv(
      'daily-revenue-last-30-days.csv',
      ['Date', 'Revenue'],
      (revenue.daily_revenue || []).map(item => [
        item.date,
        Number(item.total || 0).toFixed(2),
      ])
    );
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Reports & Analytics</h1>

      <div className="flex gap-2 mb-6">
        {[['monthly', 'Monthly Reports'], ['revenue', 'Revenue Report']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`}>{l}</button>
        ))}
        <button
          onClick={tab === 'monthly' ? exportMonthlyReports : exportRevenueReports}
          className="btn-secondary btn-sm inline-flex items-center gap-2"
        >
          <FiDownload size={14} /> Export {tab === 'monthly' ? 'Monthly' : 'Revenue'} CSV
        </button>
      </div>

      {tab === 'monthly' && monthly && (
        <div className="space-y-6">
          {/* Sales by Month */}
          <div className="card">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FiCalendar /> Monthly Sales</h3>
            {monthly.sales_by_month?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthly.sales_by_month}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" /><YAxis />
                  <Tooltip formatter={v => formatPrice(v)} />
                  <Bar dataKey="total_revenue" fill="#1e40af" name="Revenue" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-center py-10">No data yet.</p>}
          </div>

          {/* Bookings by Month */}
          <div className="card">
            <h3 className="font-bold text-lg mb-4">Monthly Bookings</h3>
            {monthly.bookings_by_month?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthly.bookings_by_month}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" /><YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="total_bookings" stroke="#f97316" strokeWidth={2} name="Bookings" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-center py-10">No data yet.</p>}
          </div>

          {/* Top Products */}
          <div className="card">
            <h3 className="font-bold text-lg mb-4">Top Selling Products</h3>
            {monthly.top_products?.length > 0 ? (
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Units Sold</th>
                    <th className="px-4 py-3">Revenue</th>
                  </tr></thead>
                  <tbody>
                    {monthly.top_products.map((p, i) => (
                      <tr key={p.product_id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-bold text-accent-600">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{p.product_name}</td>
                        <td className="px-4 py-3">{p.total_quantity}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{formatPrice(p.total_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-gray-400 text-center py-10">No data yet.</p>}
          </div>
        </div>
      )}

      {tab === 'revenue' && revenue && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card"><FiDollarSign className="text-accent-500 mb-1" size={24} /><p className="text-2xl font-bold text-accent-600">{formatPrice(revenue.total_revenue || 0)}</p><p className="text-sm text-gray-500">Total Revenue</p></div>
            <div className="stat-card"><FiTrendingUp className="text-green-500 mb-1" size={24} /><p className="text-2xl font-bold text-green-600">{formatPrice(revenue.monthly_revenue || 0)}</p><p className="text-sm text-gray-500">This Month</p></div>
            <div className="stat-card"><p className="text-2xl font-bold">{revenue.total_orders || 0}</p><p className="text-sm text-gray-500">Total Orders</p></div>
          </div>

          {/* Revenue by Payment Method */}
          <div className="card">
            <h3 className="font-bold text-lg mb-4">Revenue by Payment Method</h3>
            {revenue.revenue_by_method?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={revenue.revenue_by_method} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={100} label={({ payment_method, percent }) => `${payment_method?.replace('_',' ')} (${(percent*100).toFixed(0)}%)`}>
                    {revenue.revenue_by_method.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => formatPrice(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-center py-10">No data yet.</p>}
          </div>

          {/* Revenue by Product Type */}
          <div className="card">
            <h3 className="font-bold text-lg mb-4">Revenue by Product Type</h3>
            {revenue.revenue_by_type?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenue.revenue_by_type}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" /><YAxis />
                  <Tooltip formatter={v => formatPrice(v)} />
                  <Bar dataKey="total" fill="#f97316" name="Revenue" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-center py-10">No data yet.</p>}
          </div>

          {/* Daily Revenue (Last 30 Days) */}
          <div className="card">
            <h3 className="font-bold text-lg mb-4">Daily Revenue (Last 30 Days)</h3>
            {revenue.daily_revenue?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenue.daily_revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{fontSize: 11}} />
                  <YAxis />
                  <Tooltip formatter={v => formatPrice(v)} />
                  <Line type="monotone" dataKey="total" stroke="#1e40af" strokeWidth={2} name="Revenue" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-center py-10">No data yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
