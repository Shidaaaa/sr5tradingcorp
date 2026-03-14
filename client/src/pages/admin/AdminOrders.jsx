import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiEye, FiCheck, FiTruck, FiX, FiSearch } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  confirmed: { color: 'badge-info', label: 'Confirmed' },
  processing: { color: 'badge-info', label: 'Processing' },
  ready: { color: 'badge-success', label: 'Ready' },
  picked_up: { color: 'badge-success', label: 'Picked Up' },
  delivered: { color: 'badge-success', label: 'Delivered' },
  completed: { color: 'badge-success', label: 'Completed' },
  cancelled: { color: 'badge-danger', label: 'Cancelled' },
  return_requested: { color: 'badge-warning', label: 'Return Req.' },
  returned: { color: 'badge-gray', label: 'Returned' },
  replaced: { color: 'badge-purple', label: 'Replaced' },
};

const statusFlow = ['pending', 'confirmed', 'processing', 'ready', 'picked_up', 'delivered', 'completed', 'cancelled'];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'created_at' ? 'desc' : 'asc'); }
    setCurrentPage(1);
  };

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try { setOrders(await api.getAdminOrders()); } catch {} finally { setLoading(false); }
  };

  const updateStatus = async (orderId, status) => {
    try {
      await api.updateAdminOrderStatus(orderId, { status });
      toast.success(`Order ${status}`);
      fetchOrders();
      setSelected(null);
    } catch (err) { toast.error(err.message); }
  };

  const processed = useMemo(() => {
    let list = [...orders];
    if (filter !== 'all') list = list.filter(o => o.status === filter);
    if (search) list = list.filter(o => `${o.order_number} ${o.first_name} ${o.last_name} ${o.email}`.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'created_at') { va = new Date(va); vb = new Date(vb); }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [orders, filter, search, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Orders Management</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search orders..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="input-field pl-10" />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="all">All Orders</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3"><SortHeader label="Order #" field="order_number" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Customer" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3"><SortHeader label="Total" field="total_amount" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Paid</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Delivery</th>
              <th className="px-4 py-3"><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Date" field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {paginated.map(order => {
                const sc = statusConfig[order.status] || { color: 'badge-gray', label: order.status };
                return (
                  <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-accent-600">{order.order_number}</td>
                    <td className="px-4 py-3">{order.first_name} {order.last_name}<br /><span className="text-xs text-gray-500">{order.email}</span></td>
                    <td className="px-4 py-3">{order.items?.length || 0}</td>
                    <td className="px-4 py-3 font-medium">{formatPrice(order.total_amount)}</td>
                    <td className="px-4 py-3 text-green-600">{formatPrice(order.total_paid)}</td>
                    <td className="px-4 py-3">{order.remaining_balance > 0 ? <span className="text-amber-600 font-medium">{formatPrice(order.remaining_balance)}</span> : <span className="text-green-600">Paid</span>}</td>
                    <td className="px-4 py-3 capitalize">{order.delivery_method}</td>
                    <td className="px-4 py-3"><span className={`badge ${sc.color}`}>{sc.label}</span></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setSelected(selected?.id === order.id ? null : order)} className="p-1.5 hover:bg-gray-100 rounded" title="Details"><FiEye size={14} /></button>
                        {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'confirmed')} className="p-1.5 hover:bg-green-50 text-green-600 rounded" title="Confirm"><FiCheck size={14} /></button>}
                        {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'cancelled')} className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Cancel"><FiX size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
      </div>

      {/* Order Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">Order {selected.order_number}</h3>
            <div className="text-sm space-y-2">
              <p><strong>Customer:</strong> {selected.first_name} {selected.last_name} ({selected.email})</p>
              <p><strong>Delivery:</strong> {selected.delivery_method} {selected.delivery_address && `- ${selected.delivery_address}`}</p>
              <p><strong>Total:</strong> {formatPrice(selected.total_amount)} | <strong>Paid:</strong> {formatPrice(selected.total_paid)}</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Items:</h4>
              {selected.items?.map(item => (
                <div key={item.id} className="flex justify-between p-2 bg-gray-50 rounded mb-1 text-sm">
                  <span>{item.name} × {item.quantity}</span>
                  <span className="font-medium">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>
            {selected.payments?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Payments:</h4>
                {selected.payments.map(p => (
                  <div key={p.id} className="flex justify-between p-2 bg-green-50 rounded mb-1 text-sm">
                    <span className="capitalize">{p.payment_method.replace('_', ' ')} ({p.payment_type})</span>
                    <span className="font-medium text-green-700">{formatPrice(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Update Status:</h4>
              <div className="flex flex-wrap gap-2">
                {statusFlow.map(s => (
                  <button key={s} onClick={() => updateStatus(selected.id, s)} className={`btn-sm rounded-lg text-xs ${selected.status === s ? 'btn-primary' : 'btn-secondary'}`}>{statusConfig[s]?.label || s}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="btn-secondary w-full">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
