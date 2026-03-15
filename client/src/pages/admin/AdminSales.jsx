import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { FiFilter, FiEye, FiDownload, FiDollarSign, FiTrendingUp, FiCalendar, FiPieChart } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price || 0);
const COLORS = ['#1e40af', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

const toLocalDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function AdminSales() {
  const now = new Date();
  const [sales, setSales] = useState([]);
  const [dailyReport, setDailyReport] = useState([]);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [revenueReport, setRevenueReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dateMode, setDateMode] = useState('custom');
  const [startDate, setStartDate] = useState(toLocalDateInput(now));
  const [endDate, setEndDate] = useState(toLocalDateInput(now));
  const [activePreset, setActivePreset] = useState('today');
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    fetchSalesAndAnalytics();
  }, [month, year, dateMode, startDate, endDate]);

  const rangeOptions = dateMode === 'all' ? { allTime: true } : (dateMode === 'custom' ? { startDate, endDate } : {});

  const applyPreset = (preset) => {
    const today = new Date();
    const end = toLocalDateInput(today);
    let start = end;

    if (preset === 'last7') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      start = toLocalDateInput(d);
    } else if (preset === 'last30') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      start = toLocalDateInput(d);
    } else if (preset === 'thisQuarter') {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      start = toLocalDateInput(new Date(today.getFullYear(), quarterStartMonth, 1));
    } else if (preset === 'thisMonth') {
      start = toLocalDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
    }

    setDateMode('custom');
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset);
  };

  const fetchSalesAndAnalytics = async () => {
    if (dateMode === 'custom' && (!startDate || !endDate)) {
      setSales([]);
      setDailyReport([]);
      return;
    }

    setLoading(true);
    try {
      const [salesRes, dailyRes, monthlyRes, revenueRes] = await Promise.allSettled([
        api.getSales(month, year, rangeOptions),
        api.getDailySalesReport(month, year, rangeOptions),
        api.getMonthlyReport(year),
        api.getRevenueReport(),
      ]);
      setSales(salesRes.status === 'fulfilled' ? salesRes.value : []);
      setDailyReport(dailyRes.status === 'fulfilled' ? dailyRes.value : []);
      setMonthlyReport(monthlyRes.status === 'fulfilled' ? monthlyRes.value : null);
      setRevenueReport(revenueRes.status === 'fulfilled' ? revenueRes.value : null);
    } catch {
      setSales([]);
      setDailyReport([]);
      setMonthlyReport(null);
      setRevenueReport(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = (filename, headers, rows) => {
    const escape = (value) => {
      if (value === null || value === undefined) return '';
      const text = String(value).replace(/"/g, '""');
      return /[",\n]/.test(text) ? `"${text}"` : text;
    };

    const csvLines = [headers.join(','), ...rows.map(row => row.map(escape).join(','))];
    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportSalesCsv = () => {
    const headers = ['Order Number', 'Order Date', 'Completed Date', 'Customer', 'Items', 'Total', 'Paid', 'Balance', 'Payment Method', 'Delivery', 'Status', 'Notes'];
    const rows = sales.map((s) => [
      s.order_number,
      new Date(s.created_at).toLocaleDateString(),
      s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '-',
      `${s.first_name} ${s.last_name}`,
      s.item_count,
      Number(s.total_amount || 0).toFixed(2),
      Number(s.paid_amount || 0).toFixed(2),
      Number(s.remaining_balance || 0).toFixed(2),
      s.payment_method?.replace('_', ' ') || '-',
      s.delivery_method || '-',
      s.status,
      s.notes || '',
    ]);
    const suffix = dateMode === 'custom' ? `${startDate}_to_${endDate}` : `${year}-${String(month).padStart(2, '0')}`;
    downloadCsv(`sales-detailed-${suffix}.csv`, headers, rows);
  };

  const exportDailyCsv = () => {
    const headers = ['Date', 'Completed Orders', 'Gross Sales', 'Total Paid', 'Outstanding Balance'];
    const rows = effectiveDailyReport.map((day) => [
      day.date,
      day.completed_orders,
      Number(day.total_sales || 0).toFixed(2),
      Number(day.total_paid || 0).toFixed(2),
      Number(day.total_balance || 0).toFixed(2),
    ]);
    const suffix = dateMode === 'custom' ? `${startDate}_to_${endDate}` : `${year}-${String(month).padStart(2, '0')}`;
    downloadCsv(`sales-daily-${suffix}.csv`, headers, rows);
  };

  const totalRevenue = useMemo(() => sales.reduce((sum, s) => sum + (s.total_amount || 0), 0), [sales]);
  const totalPaid = useMemo(() => sales.reduce((sum, s) => sum + (s.paid_amount || 0), 0), [sales]);
  const totalBalance = useMemo(() => sales.reduce((sum, s) => sum + (s.remaining_balance || 0), 0), [sales]);
  const averageOrderValue = sales.length ? totalRevenue / sales.length : 0;
  const collectionRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;

  const fallbackDailyReport = useMemo(() => {
    const grouped = new Map();
    for (const sale of sales) {
      const sourceDate = sale.completed_at || sale.created_at;
      if (!sourceDate) continue;
      const key = new Date(sourceDate).toISOString().slice(0, 10);
      if (!grouped.has(key)) {
        grouped.set(key, {
          date: key,
          completed_orders: 0,
          total_sales: 0,
          total_paid: 0,
          total_balance: 0,
        });
      }
      const day = grouped.get(key);
      day.completed_orders += 1;
      day.total_sales += Number(sale.total_amount || 0);
      day.total_paid += Number(sale.paid_amount || 0);
      day.total_balance += Number(sale.remaining_balance || 0);
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => ({
        ...day,
        total_sales: Number(day.total_sales.toFixed(2)),
        total_paid: Number(day.total_paid.toFixed(2)),
        total_balance: Number(day.total_balance.toFixed(2)),
      }));
  }, [sales]);

  const effectiveDailyReport = dailyReport.length > 0 ? dailyReport : fallbackDailyReport;

  const bestSalesDay = effectiveDailyReport.reduce((best, day) => {
    if (!best || (day.total_sales || 0) > (best.total_sales || 0)) return day;
    return best;
  }, null);

  const yearOptions = Array.from({ length: 6 }, (_, idx) => now.getFullYear() - 3 + idx);

  if (loading) {
    return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500"></div></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Sales & Reports</h1>

      <div className="card mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <FiFilter className="text-gray-500" />
          <select value={dateMode} onChange={e => { setDateMode(e.target.value); if (e.target.value !== 'custom') setActivePreset(null); }} className="input-field w-auto">
            <option value="month">Month & Year</option>
            <option value="custom">Custom Date Range</option>
            <option value="all">All Time</option>
          </select>

          {dateMode === 'month' ? (
            <>
              <select value={month} onChange={e => setMonth(+e.target.value)} className="input-field w-auto">
                {[...Array(12)].map((_, i) => <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
              </select>
              <select value={year} onChange={e => setYear(+e.target.value)} className="input-field w-auto">
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          ) : dateMode === 'custom' ? (
            <>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setActivePreset(null); }} className="input-field w-auto" />
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setActivePreset(null); }} className="input-field w-auto" />
            </>
          ) : null}

          <button onClick={exportSalesCsv} disabled={!sales.length} className="btn-secondary btn-sm inline-flex items-center gap-2"><FiDownload size={14} /> Export Sales CSV</button>
          <button onClick={exportDailyCsv} disabled={!effectiveDailyReport.length} className="btn-secondary btn-sm inline-flex items-center gap-2"><FiDownload size={14} /> Export Daily CSV</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <button onClick={() => applyPreset('today')} className={`btn-sm ${activePreset === 'today' ? 'btn-primary' : 'btn-secondary'}`}>Today</button>
          <button onClick={() => applyPreset('last7')} className={`btn-sm ${activePreset === 'last7' ? 'btn-primary' : 'btn-secondary'}`}>Last 7 Days</button>
          <button onClick={() => applyPreset('last30')} className={`btn-sm ${activePreset === 'last30' ? 'btn-primary' : 'btn-secondary'}`}>Last 30 Days</button>
          <button onClick={() => applyPreset('thisMonth')} className={`btn-sm ${activePreset === 'thisMonth' ? 'btn-primary' : 'btn-secondary'}`}>This Month</button>
          <button onClick={() => applyPreset('thisQuarter')} className={`btn-sm ${activePreset === 'thisQuarter' ? 'btn-primary' : 'btn-secondary'}`}>This Quarter</button>
          <button onClick={() => { setDateMode('all'); setActivePreset(null); }} className={`btn-sm ${dateMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}>All Time</button>
        </div>
        {dateMode === 'custom' && startDate && endDate && (
          <p className="text-xs text-gray-500 mt-3">Showing records from {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}.</p>
        )}
        {dateMode === 'all' && (
          <p className="text-xs text-gray-500 mt-3">Showing all historical sales records.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <div className="stat-card xl:col-span-1"><p className="text-sm text-gray-500">Orders</p><p className="text-2xl font-bold">{sales.length}</p></div>
        <div className="stat-card xl:col-span-1"><FiDollarSign className="text-accent-500 mb-1" size={20} /><p className="text-lg font-bold text-accent-600">{formatPrice(totalRevenue)}</p><p className="text-xs text-gray-500">Gross Sales</p></div>
        <div className="stat-card xl:col-span-1"><FiTrendingUp className="text-green-500 mb-1" size={20} /><p className="text-lg font-bold text-green-600">{formatPrice(totalPaid)}</p><p className="text-xs text-gray-500">Collected</p></div>
        <div className="stat-card xl:col-span-1"><p className="text-lg font-bold text-red-600">{formatPrice(totalBalance)}</p><p className="text-xs text-gray-500">Outstanding</p></div>
        <div className="stat-card xl:col-span-1"><p className="text-lg font-bold">{formatPrice(averageOrderValue)}</p><p className="text-xs text-gray-500">Avg Order Value</p></div>
        <div className="stat-card xl:col-span-1"><p className="text-lg font-bold">{collectionRate.toFixed(1)}%</p><p className="text-xs text-gray-500">Collection Rate</p></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FiCalendar /> Daily Sales Trend</h3>
          {effectiveDailyReport.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={effectiveDailyReport}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={value => formatPrice(value)} />
                <Legend />
                <Line type="monotone" dataKey="total_sales" stroke="#1e40af" strokeWidth={2} name="Gross" dot={false} />
                <Line type="monotone" dataKey="total_paid" stroke="#10b981" strokeWidth={2} name="Paid" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">No daily data for selected period.</p>}
        </div>

        <div className="card">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FiPieChart /> Revenue by Payment Method</h3>
          {revenueReport?.revenue_by_method?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={revenueReport.revenue_by_method} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={95} label={({ payment_method }) => (payment_method || 'unknown').replace('_', ' ')}>
                  {revenueReport.revenue_by_method.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={value => formatPrice(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">No revenue method data yet.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-bold text-lg mb-4">Yearly Monthly Revenue</h3>
          {monthlyReport?.sales_by_month?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyReport.sales_by_month}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={value => formatPrice(value)} />
                <Bar dataKey="total_revenue" fill="#1e40af" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">No monthly trend data.</p>}
        </div>

        <div className="card">
          <h3 className="font-bold text-lg mb-4">Revenue by Product Type</h3>
          {revenueReport?.revenue_by_type?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueReport.revenue_by_type}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip formatter={value => formatPrice(value)} />
                <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">No product type data.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-bold text-lg mb-4">Daily Sales Report</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Completed Orders</th>
                  <th className="px-4 py-3">Gross</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {effectiveDailyReport.map(day => (
                  <tr key={day.date} className="border-t border-gray-100">
                    <td className="px-4 py-3">{new Date(day.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{day.completed_orders}</td>
                    <td className="px-4 py-3 font-medium">{formatPrice(day.total_sales)}</td>
                    <td className="px-4 py-3 text-green-600">{formatPrice(day.total_paid)}</td>
                    <td className="px-4 py-3">{day.total_balance > 0 ? <span className="text-red-600 font-medium">{formatPrice(day.total_balance)}</span> : <span className="text-green-600">Paid</span>}</td>
                  </tr>
                ))}
                {effectiveDailyReport.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">No daily sales data for the selected period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-lg mb-4">Top Selling Products (Year)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Units Sold</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(monthlyReport?.top_products || []).map((product, idx) => (
                  <tr key={product.product_id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-bold text-accent-600">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{product.product_name}</td>
                    <td className="px-4 py-3">{product.total_quantity}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{formatPrice(product.total_revenue)}</td>
                  </tr>
                ))}
                {(monthlyReport?.top_products || []).length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">No top-product data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-navy-900">Detailed Sales Transactions</h3>
          <span className="text-xs text-gray-500">Best Day: {bestSalesDay ? `${new Date(bestSalesDay.date).toLocaleDateString()} (${formatPrice(bestSalesDay.total_sales)})` : 'N/A'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{s.order_number}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-500">{s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3">{s.first_name} {s.last_name}</td>
                  <td className="px-4 py-3">{s.item_count} item(s)</td>
                  <td className="px-4 py-3 font-medium">{formatPrice(s.total_amount)}</td>
                  <td className="px-4 py-3 text-green-600">{formatPrice(s.paid_amount || 0)}</td>
                  <td className="px-4 py-3">{s.remaining_balance > 0 ? <span className="text-red-600 font-medium">{formatPrice(s.remaining_balance)}</span> : <span className="text-green-600">Paid</span>}</td>
                  <td className="px-4 py-3 capitalize">{s.payment_method?.replace('_', ' ') || '-'}</td>
                  <td className="px-4 py-3"><span className={`badge ${s.status === 'delivered' || s.status === 'completed' ? 'badge-success' : s.status === 'cancelled' ? 'badge-danger' : 'badge-info'}`}>{s.status}</span></td>
                  <td className="px-4 py-3"><button onClick={() => setSelectedOrder(s)} className="btn-secondary btn-sm"><FiEye size={14} /></button></td>
                </tr>
              ))}
              {sales.length === 0 && <tr><td colSpan="11" className="px-4 py-10 text-center text-gray-400">No sales records found for the selected filter. Try the All Time option.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{selectedOrder.order_number}</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Customer:</span><span>{selectedOrder.first_name} {selectedOrder.last_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date:</span><span>{new Date(selectedOrder.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status:</span><span className="badge badge-info">{selectedOrder.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Delivery:</span><span className="capitalize">{selectedOrder.delivery_method}</span></div>
              <hr />
              <div className="flex justify-between"><span className="text-gray-500">Total Amount:</span><span className="font-bold">{formatPrice(selectedOrder.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Amount Paid:</span><span className="text-green-600">{formatPrice(selectedOrder.paid_amount || 0)}</span></div>
              {selectedOrder.remaining_balance > 0 && <div className="flex justify-between"><span className="text-gray-500">Remaining:</span><span className="text-red-600 font-bold">{formatPrice(selectedOrder.remaining_balance)}</span></div>}
              {selectedOrder.payment_method && <div className="flex justify-between"><span className="text-gray-500">Payment Method:</span><span className="capitalize">{selectedOrder.payment_method.replace('_', ' ')}</span></div>}
              {selectedOrder.notes && <><hr /><p className="text-gray-500">Notes: {selectedOrder.notes}</p></>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
