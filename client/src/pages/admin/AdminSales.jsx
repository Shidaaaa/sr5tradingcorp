import { useState, useEffect } from 'react';
import { api } from '../../api';
import { FiFilter, FiDollarSign, FiEye } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function AdminSales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => { fetchSales(); }, [month, year]);

  const fetchSales = async () => {
    setLoading(true);
    try { const d = await api.getSales(month, year); setSales(d); } catch {} finally { setLoading(false); }
  };

  const totalRevenue = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalPaid = sales.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
  const totalBalance = sales.reduce((sum, s) => sum + (s.remaining_balance || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Sales Management</h1>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <FiFilter className="text-gray-500" />
          <select value={month} onChange={e => setMonth(+e.target.value)} className="input-field w-auto">
            {[...Array(12)].map((_, i) => <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)} className="input-field w-auto">
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card"><p className="text-sm text-gray-500">Orders</p><p className="text-2xl font-bold">{sales.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Total Sales</p><p className="text-2xl font-bold text-accent-600">{formatPrice(totalRevenue)}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Total Paid</p><p className="text-2xl font-bold text-green-600">{formatPrice(totalPaid)}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Outstanding Balance</p><p className="text-2xl font-bold text-red-600">{formatPrice(totalBalance)}</p></div>
      </div>

      {loading ? <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500"></div></div> : (
        <div className="table-container">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left">
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Date</th>
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
                {sales.map(s => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.order_number}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
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
                {sales.length === 0 && <tr><td colSpan="10" className="px-4 py-10 text-center text-gray-400">No sales records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
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
