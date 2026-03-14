import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCreditCard, FiFileText, FiRefreshCw } from 'react-icons/fi';

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
  return_requested: { color: 'badge-warning', label: 'Return Requested' },
  returned: { color: 'badge-gray', label: 'Returned' },
  replaced: { color: 'badge-purple', label: 'Replaced' },
};

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [processingReservation, setProcessingReservation] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'cash', payment_type: 'full' });
  const [returnForm, setReturnForm] = useState({ order_item_id: '', reason: '', request_type: 'return' });

  useEffect(() => { fetchOrder(); }, [id]);

  const fetchOrder = async () => {
    try {
      const data = await api.getOrder(id);
      setOrder(data);
      setPaymentForm(prev => ({ ...prev, amount: data.remaining_balance > 0 ? data.remaining_balance : data.total_amount }));
    } catch (err) {
      toast.error('Order not found');
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      // For card payments, redirect to Stripe Checkout
      if (paymentForm.payment_method === 'credit_card' || paymentForm.payment_method === 'debit_card') {
        const session = await api.createStripeSession({ order_id: order.id });
        window.location.href = session.url;
        return;
      }
      const data = await api.processPayment({ order_id: order.id, ...paymentForm, amount: Number(paymentForm.amount) });
      toast.success('Payment processed!');
      setShowPayment(false);
      navigate(`/receipt/${data.receipt_number}`);
    } catch (err) { toast.error(err.message); }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    try {
      await api.submitReturn({ order_id: order.id, ...returnForm, order_item_id: Number(returnForm.order_item_id) });
      toast.success('Return request submitted');
      setShowReturn(false);
      fetchOrder();
    } catch (err) { toast.error(err.message); }
  };

  const handleReservationPayment = async () => {
    try {
      setProcessingReservation(true);
      const session = await api.createStripeOrderReservationSession({ order_id: order.id });
      window.location.href = session.url;
    } catch (err) {
      toast.error(err.message);
      setProcessingReservation(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;
  if (!order) return null;

  const sc = statusConfig[order.status] || { color: 'badge-gray', label: order.status };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/orders" className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-700 mb-6"><FiArrowLeft /> Back to Orders</Link>

      <div className="card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">Order {order.order_number}</h1>
            <p className="text-gray-500">{new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <span className={`badge ${sc.color} mt-2`}>{sc.label}</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-accent-600">{formatPrice(order.total_amount)}</p>
            <p className="text-sm text-gray-500">Paid: {formatPrice(order.total_paid)}</p>
            {order.remaining_balance > 0 && <p className="text-sm font-bold text-amber-600">Balance: {formatPrice(order.remaining_balance)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
          <div><span className="text-gray-500">Delivery</span><p className="font-medium capitalize">{order.delivery_method}</p></div>
          {order.delivery_address && <div className="col-span-2"><span className="text-gray-500">Address</span><p className="font-medium">{order.delivery_address}</p></div>}
          {order.notes && <div className="col-span-2"><span className="text-gray-500">Notes</span><p className="font-medium">{order.notes}</p></div>}
        </div>

        {order.has_vehicle && (
          <div className="mb-6 rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm">
            <p className="font-semibold text-accent-800">Vehicle Reservation</p>
            <p className="text-accent-700 mt-1">
              Reservation fee: <strong>{formatPrice(order.reservation_fee_total || 0)}</strong> • 
              {order.reservation_fee_paid ? ' Paid' : ' Unpaid'}
            </p>
            {order.reservation_expires_at && (
              <p className="text-accent-700 mt-1">
                Reservation expires: <strong>{new Date(order.reservation_expires_at).toLocaleString()}</strong>
              </p>
            )}
          </div>
        )}

        {/* Order Items */}
        <h3 className="font-bold mb-3">Items</h3>
        <div className="space-y-3 mb-6">
          {order.items?.map(item => (
            <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-gray-500">{formatPrice(item.unit_price)} × {item.quantity}</p>
              </div>
              <p className="font-bold">{formatPrice(item.subtotal)}</p>
            </div>
          ))}
        </div>

        {/* Payments */}
        {order.payments?.length > 0 && (
          <>
            <h3 className="font-bold mb-3">Payments</h3>
            <div className="space-y-2 mb-6">
              {order.payments.map(p => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-green-50 rounded-lg text-sm">
                  <div>
                    <p className="font-medium capitalize">{p.payment_method.replace('_', ' ')} - {p.payment_type}</p>
                    <p className="text-gray-500">{new Date(p.created_at).toLocaleDateString()}</p>
                    {p.installment_number && <p className="text-gray-500">Installment {p.installment_number} of {p.total_installments}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700">{formatPrice(p.amount)}</p>
                    <Link to={`/receipt/${p.receipt_number}`} className="text-accent-600 text-xs flex items-center gap-1"><FiFileText size={12} /> Receipt</Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {order.has_vehicle && !order.reservation_fee_paid && !['cancelled', 'returned'].includes(order.status) && (
            <button onClick={handleReservationPayment} disabled={processingReservation} className="btn-primary btn-sm flex items-center gap-1">
              <FiCreditCard size={14} /> {processingReservation ? 'Redirecting...' : `Pay Reservation Fee ${formatPrice(order.reservation_fee_total || 0)}`}
            </button>
          )}
          {order.remaining_balance > 0 && !['cancelled', 'returned'].includes(order.status) && (!order.has_vehicle || order.reservation_fee_paid) && (
            <button onClick={() => setShowPayment(true)} className="btn-primary btn-sm flex items-center gap-1"><FiCreditCard size={14} /> Make Payment</button>
          )}
          {['completed', 'delivered', 'picked_up'].includes(order.status) && (
            <button onClick={() => setShowReturn(true)} className="btn-secondary btn-sm flex items-center gap-1"><FiRefreshCw size={14} /> Return / Replace</button>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPayment(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handlePayment} className="bg-white rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold">Make Payment</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payment Method</label>
              <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })} className="input-field">
                <option value="cash">Cash</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="ewallet">E-Wallet</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payment Type</label>
              <select value={paymentForm.payment_type} onChange={e => setPaymentForm({ ...paymentForm, payment_type: e.target.value })} className="input-field">
                <option value="full">Full Payment</option>
                <option value="partial">Partial Payment</option>
                <option value="installment">Installment</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowPayment(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1">Process Payment</button>
            </div>
          </form>
        </div>
      )}

      {/* Return Modal */}
      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowReturn(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleReturn} className="bg-white rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold">Return / Replacement Request</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Select Item</label>
              <select value={returnForm.order_item_id} onChange={e => setReturnForm({ ...returnForm, order_item_id: e.target.value })} className="input-field" required>
                <option value="">Choose item...</option>
                {order.items?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Request Type</label>
              <select value={returnForm.request_type} onChange={e => setReturnForm({ ...returnForm, request_type: e.target.value })} className="input-field">
                <option value="return">Return (Refund)</option>
                <option value="replacement">Replacement</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <textarea value={returnForm.reason} onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })} className="input-field" rows={3} required />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowReturn(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1">Submit Request</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
