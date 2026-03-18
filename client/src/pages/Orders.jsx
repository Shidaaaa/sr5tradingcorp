import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiPackage, FiClock, FiCheck, FiX, FiTruck, FiEye } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  confirmed: { color: 'badge-info', label: 'Confirmed' },
  processing: { color: 'badge-info', label: 'Processing' },
  ready: { color: 'badge-success', label: 'Ready' },
  picked_up: { color: 'badge-success', label: 'Picked Up' },
  in_transit: { color: 'badge-info', label: 'In Transit' },
  delivered: { color: 'badge-success', label: 'Delivered' },
  completed: { color: 'badge-success', label: 'Completed' },
  cancelled: { color: 'badge-danger', label: 'Cancelled' },
  return_requested: { color: 'badge-warning', label: 'Return Requested' },
  returned: { color: 'badge-gray', label: 'Returned' },
  replaced: { color: 'badge-purple', label: 'Replaced' },
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
    } catch (err) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (e, orderId) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await api.reorderOrder(orderId);
      const summary = `${result.added_count || 0} item(s) added` + ((result.skipped_count || 0) > 0 ? `, ${result.skipped_count} skipped.` : '.');
      toast.success(summary);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">My Orders</h1>

      {orders.length === 0 ? (
        <div className="card p-12 text-center">
          <FiPackage size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">No orders yet</h3>
          <Link to="/products" className="btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const sc = statusConfig[order.status] || { color: 'badge-gray', label: order.status };
            return (
              <Link to={`/orders/${order.id}`} key={order.id} className="card p-5 block hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{order.order_number}</h3>
                      <span className={`badge ${sc.color}`}>{sc.label}</span>
                      {order.has_vehicle && !order.reservation_fee_paid && (
                        <span className="badge badge-warning">Reservation Fee Pending</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-accent-600">{formatPrice(order.total_amount)}</p>
                    {order.remaining_balance > 0 && (
                      <p className="text-xs text-amber-600">Balance: {formatPrice(order.remaining_balance)}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><FiPackage size={14} /> {order.items?.length || 0} items</span>
                  <span className="flex items-center gap-1"><FiTruck size={14} /> {order.has_vehicle ? 'Pickup (Vehicle Policy)' : order.delivery_method === 'delivery' ? 'Delivery' : order.delivery_method === 'third_party' ? '3rd-Party Delivery' : 'Pickup'}</span>
                  <span className="flex items-center gap-1 ml-auto text-accent-600"><FiEye size={14} /> View Details</span>
                </div>
                <div className="mt-3">
                  <button onClick={(e) => handleReorder(e, order.id)} className="btn-secondary btn-sm">Order Again</button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
