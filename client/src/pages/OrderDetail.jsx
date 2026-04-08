import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCreditCard, FiFileText, FiRefreshCw, FiTruck, FiCheckCircle } from 'react-icons/fi';

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
  installment_active: { color: 'badge-info', label: 'Installment Active' },
  installment_defaulted: { color: 'badge-danger', label: 'Installment Defaulted' },
};

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [processingInstallmentMethod, setProcessingInstallmentMethod] = useState(null);
  const [confirmingReceived, setConfirmingReceived] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [returnRequests, setReturnRequests] = useState([]);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'cash', payment_type: 'full' });
  const [returnForm, setReturnForm] = useState({ order_item_id: '', reason: '', request_type: 'return' });

  const rememberPaymongoCheckout = (session, type) => {
    if (!session?.sessionId) return;

    localStorage.setItem('sr5_paymongo_pending_session', JSON.stringify({
      session_id: session.sessionId,
      checkout_reference: session.checkout_reference || null,
      type,
      created_at: Date.now(),
    }));
  };

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

  const fetchReturnRequests = async () => {
    try {
      const data = await api.getReturns();
      setReturnRequests(Array.isArray(data) ? data : []);
    } catch {
      setReturnRequests([]);
    }
  };

  useEffect(() => {
    fetchReturnRequests();
  }, [id]);

  useEffect(() => {
    if (!order) return;

    const allowedMethods = (order.has_vehicle && order.payment_method !== 'installment')
      ? ['cash', 'bank_transfer']
      : ['cash', 'credit_card', 'debit_card', 'gcash', 'bank_transfer'];

    if (!allowedMethods.includes(paymentForm.payment_method)) {
      setPaymentForm(prev => ({ ...prev, payment_method: allowedMethods[0] }));
    }
  }, [order, paymentForm.payment_method]);

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      if (order.has_vehicle && ['credit_card', 'debit_card', 'gcash'].includes(paymentForm.payment_method)) {
        toast.error('Card and GCash for vehicle orders are only available for monthly installment payments.');
        return;
      }

      // For card payments, redirect to Stripe Checkout
      if (paymentForm.payment_method === 'credit_card' || paymentForm.payment_method === 'debit_card') {
        const session = await api.createStripeSession({ order_id: order.id });
        window.location.href = session.url;
        return;
      }

      if (paymentForm.payment_method === 'gcash') {
        const session = await api.createGcashSession({ order_id: order.id });
        rememberPaymongoCheckout(session, 'order');
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
      const selected = eligibleReturnItems.find(item => String(item.id) === String(returnForm.order_item_id));
      if (!selected) {
        toast.error('Please select a valid non-vehicle item.');
        return;
      }
      await api.submitReturn({ order_id: order.id, ...returnForm, order_item_id: String(returnForm.order_item_id) });
      toast.success('Return request submitted');
      setShowReturn(false);
      setReturnForm({ order_item_id: '', reason: '', request_type: 'return' });
      fetchOrder();
      fetchReturnRequests();
    } catch (err) { toast.error(err.message); }
  };

  const openReturnForItem = (itemId) => {
    setReturnForm(prev => ({ ...prev, order_item_id: String(itemId || '') }));
    setShowReturn(true);
  };

  const handleInstallmentOnlinePayment = async (method = 'card') => {
    try {
      setProcessingInstallmentMethod(method);
      const session = method === 'gcash'
        ? await api.createGcashInstallmentSession({ order_id: order.id })
        : await api.createStripeInstallmentSession({ order_id: order.id });
      if (method === 'gcash') rememberPaymongoCheckout(session, 'installment');
      window.location.href = session.url;
    } catch (err) {
      toast.error(err.message || `Unable to start installment ${method === 'gcash' ? 'GCash' : 'card'} payment.`);
      setProcessingInstallmentMethod(null);
    }
  };

  const handleConfirmReceived = async () => {
    try {
      setConfirmingReceived(true);
      await api.confirmOrderReceived(order.id);
      toast.success('Thanks! We marked this order as received.');
      await fetchOrder();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirmingReceived(false);
    }
  };

  const handleReorder = async () => {
    try {
      setReordering(true);
      const result = await api.reorderOrder(order.id);
      const summary = `${result.added_count || 0} item(s) added` + ((result.skipped_count || 0) > 0 ? `, ${result.skipped_count} skipped.` : '.');
      toast.success(summary);
      navigate('/cart');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReordering(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;
  if (!order) return null;

  const sc = statusConfig[order.status] || { color: 'badge-gray', label: order.status };
  const deliveryMethodLabel = order.has_vehicle
    ? 'Pickup'
    : order.delivery_method === 'third_party'
    ? '3rd-Party Delivery'
    : order.delivery_method === 'delivery'
      ? 'Delivery'
      : 'Pickup';
  const nextInstallmentRow = order.installment_plan?.schedule?.find((row) => row.status !== 'paid') || null;
  const nextInstallmentAmountDue = nextInstallmentRow
    ? Math.max(0, Number(nextInstallmentRow.amount_due || 0) - Number(nextInstallmentRow.amount_paid || 0))
    : 0;
  const canPayInstallmentOnline = Boolean(
    order.payment_method === 'installment'
    && order.installment_plan
    && order.installment_plan.down_payment_paid
    && ['active', 'pending', 'defaulted'].includes(order.installment_plan.status)
    && nextInstallmentRow
    && nextInstallmentAmountDue > 0
    && !['cancelled', 'returned', 'replaced', 'completed'].includes(order.status)
  );
  const isVehicleNonInstallmentOrder = Boolean(order.has_vehicle && order.payment_method !== 'installment');
  const paymentMethodOptions = isVehicleNonInstallmentOrder
    ? [
        { value: 'cash', label: 'Cash' },
        { value: 'bank_transfer', label: 'Bank Transfer' },
      ]
    : [
        { value: 'cash', label: 'Cash' },
        { value: 'credit_card', label: 'Credit Card' },
        { value: 'debit_card', label: 'Debit Card' },
        { value: 'gcash', label: 'GCash' },
        { value: 'bank_transfer', label: 'Bank Transfer' },
      ];

  const canRequestReturn = ['completed', 'delivered', 'picked_up', 'return_requested'].includes(order.status);
  const eligibleReturnItems = (order.items || []).filter(item => ['parts', 'tools'].includes(item.product_type));

  const hasOpenRequestForItem = (itemId) => returnRequests.some((req) => (
    String(req.order_id) === String(order.id)
    && String(req.order_item_id) === String(itemId)
    && ['pending', 'approved'].includes(req.status)
  ));

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
          <div><span className="text-gray-500">Delivery</span><p className="font-medium">{deliveryMethodLabel}</p></div>
          {order.delivery_address && <div className="col-span-2"><span className="text-gray-500">Address</span><p className="font-medium">{order.delivery_address}</p></div>}
          {order.delivery_method === 'third_party' && (
            <>
              {order.delivery_contact_name && <div><span className="text-gray-500">Receiver</span><p className="font-medium">{order.delivery_contact_name}</p></div>}
              {order.delivery_contact_phone && <div><span className="text-gray-500">Phone</span><p className="font-medium">{order.delivery_contact_phone}</p></div>}
              {order.customer_delivery_platform && <div><span className="text-gray-500">Courier</span><p className="font-medium">{order.customer_delivery_platform}</p></div>}
              {order.customer_delivery_reference && <div><span className="text-gray-500">Reference</span><p className="font-medium break-all">{order.customer_delivery_reference}</p></div>}
            </>
          )}
          {order.customer_received_at && <div><span className="text-gray-500">Received At</span><p className="font-medium">{new Date(order.customer_received_at).toLocaleString()}</p></div>}
          {order.notes && <div className="col-span-2"><span className="text-gray-500">Notes</span><p className="font-medium">{order.notes}</p></div>}
        </div>

        {order.delivery_method === 'third_party' && ['ready', 'picked_up', 'in_transit', 'delivered'].includes(order.status) && (
          <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm">
            <p className="font-semibold text-indigo-800 flex items-center gap-2"><FiTruck /> Third-Party Delivery Tracking</p>
            <p className="text-indigo-700 mt-1">
              {order.status === 'ready' && 'Your order is ready for rider pickup.'}
              {order.status === 'picked_up' && 'Your rider has picked up the order and is in transit.'}
              {order.status === 'in_transit' && 'Your rider is currently in transit.'}
              {order.status === 'delivered' && 'Marked as delivered. Please confirm once items are received.'}
            </p>
          </div>
        )}

        {order.has_vehicle && (
          <div className="mb-6 rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm">
            <p className="font-semibold text-accent-800">Vehicle Reservation</p>
            <p className="text-accent-800 mt-1 font-medium">Delivery method policy: Vehicle orders are pickup only.</p>
            <p className="text-accent-700 mt-1">
              Reservation fee: <strong>{formatPrice(order.reservation_fee_total || 0)}</strong> • 
              {order.reservation_fee_paid ? ' Paid' : ' Unpaid'}
            </p>
            {order.reservation_expires_at && (
              <p className="text-accent-700 mt-1">
                Reservation expires: <strong>{new Date(order.reservation_expires_at).toLocaleString()}</strong>
              </p>
            )}
            {order.reservation_fee_paid && !order.payment_method && order.remaining_balance > 0 && (
              <p className="text-accent-800 mt-2 font-medium">
                Reservation secured! Please visit SR-5 store to arrange your remaining payment.
              </p>
            )}
            {!order.reservation_fee_paid && !['cancelled', 'returned'].includes(order.status) && (
              <p className="text-accent-800 mt-2 font-medium">
                Reservation fee collection is handled by admin/store. Online card and GCash are disabled for this step.
              </p>
            )}
          </div>
        )}

        {order.installment_plan && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
            <h3 className="font-bold text-blue-900 mb-2">Installment Plan Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-blue-900">
              <p><strong>Status:</strong> <span className="capitalize">{order.installment_plan.status}</span></p>
              <p><strong>Monthly:</strong> {formatPrice(order.installment_plan.monthly_amount)}</p>
              <p><strong>Interest Rate:</strong> {(order.installment_plan.interest_rate || 0) * 100}%</p>
              <p><strong>Total with Interest:</strong> {formatPrice(order.installment_plan.total_with_interest)}</p>
              <p><strong>Paid so far:</strong> {formatPrice(order.installment_plan.paid_schedule_total || 0)}</p>
              <p><strong>Remaining:</strong> {formatPrice(order.installment_plan.remaining_schedule_total || 0)}</p>
              {order.installment_plan.next_due_date && <p><strong>Next Due:</strong> {new Date(order.installment_plan.next_due_date).toLocaleDateString()}</p>}
            </div>

            <div className="mt-3">
              <h4 className="font-semibold mb-2">Payment Schedule</h4>
              <div className="space-y-1">
                {order.installment_plan.schedule?.map(row => {
                  const statusText = row.status === 'paid'
                    ? 'Paid'
                    : row.status === 'overdue'
                      ? 'Overdue'
                      : row.status === 'partially_paid'
                        ? 'Partially Paid'
                        : 'Pending';
                  const badge = row.status === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : row.status === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : row.status === 'partially_paid'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-700';

                  return (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white rounded border border-blue-100">
                      <div>
                        <p className="font-medium text-blue-900">Month {row.installment_number} • Due {new Date(row.due_date).toLocaleDateString()}</p>
                        <p className="text-blue-800">Due {formatPrice(row.amount_due)} • Paid {formatPrice(row.amount_paid || 0)}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${badge}`}>{statusText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Order Items */}
        <h3 className="font-bold mb-3">Items</h3>
        <div className="space-y-3 mb-6">
          {order.items?.map(item => {
            const itemHasOpenRequest = hasOpenRequestForItem(item.id);
            const itemEligible = ['parts', 'tools'].includes(item.product_type);
            return (
            <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-gray-500">{formatPrice(item.unit_price)} × {item.quantity}</p>
                {canRequestReturn && itemEligible && (
                  <div className="mt-2">
                    {itemHasOpenRequest ? (
                      <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">Return/Replacement Request Pending</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openReturnForItem(item.id)}
                        className="btn-secondary btn-sm flex items-center gap-1"
                      >
                        <FiRefreshCw size={12} /> Request Return / Replacement
                      </button>
                    )}
                  </div>
                )}
                {canRequestReturn && !itemEligible && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded-full">Return/Replacement only for Parts & Accessories and Tools & Equipment</span>
                  </div>
                )}
              </div>
              <p className="font-bold">{formatPrice(item.subtotal)}</p>
            </div>
          );})}
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
                    {p.receipt_number ? (
                      <Link to={`/receipt/${p.receipt_number}`} className="text-accent-600 text-xs flex items-center gap-1"><FiFileText size={12} /> Receipt</Link>
                    ) : (
                      <span className="text-xs text-gray-500">No receipt uploaded</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {order.has_vehicle && !order.reservation_fee_paid && !['cancelled', 'returned'].includes(order.status) && (
            <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Reservation fee payment is coordinated with admin/store. Online card and GCash are only available for monthly installment payments.
            </div>
          )}
          {canPayInstallmentOnline && (
            <button onClick={() => handleInstallmentOnlinePayment('card')} disabled={processingInstallmentMethod !== null} className="btn-primary btn-sm flex items-center gap-1">
              <FiCreditCard size={14} />
              {processingInstallmentMethod === 'card'
                ? 'Redirecting...'
                : `Pay Month ${nextInstallmentRow.installment_number} via Card (${formatPrice(nextInstallmentAmountDue)})`}
            </button>
          )}
          {canPayInstallmentOnline && (
            <button onClick={() => handleInstallmentOnlinePayment('gcash')} disabled={processingInstallmentMethod !== null} className="btn-secondary btn-sm flex items-center gap-1">
              <FiCreditCard size={14} />
              {processingInstallmentMethod === 'gcash'
                ? 'Redirecting...'
                : `Pay Month ${nextInstallmentRow.installment_number} via GCash (${formatPrice(nextInstallmentAmountDue)})`}
            </button>
          )}
          {order.remaining_balance > 0 && !['cancelled', 'returned'].includes(order.status) && (!order.has_vehicle || order.reservation_fee_paid) && order.payment_method !== 'installment' && (
            <button onClick={() => setShowPayment(true)} className="btn-primary btn-sm flex items-center gap-1"><FiCreditCard size={14} /> Make Payment</button>
          )}
          {['completed', 'delivered', 'picked_up'].includes(order.status) && eligibleReturnItems.length > 0 && (
            <button onClick={() => setShowReturn(true)} className="btn-secondary btn-sm flex items-center gap-1"><FiRefreshCw size={14} /> Return / Replace</button>
          )}
          {order.status === 'delivered' && (
            <button onClick={handleConfirmReceived} disabled={confirmingReceived} className="btn-success btn-sm flex items-center gap-1">
              <FiCheckCircle size={14} /> {confirmingReceived ? 'Confirming...' : 'Confirm Received'}
            </button>
          )}
          <button onClick={handleReorder} disabled={reordering} className="btn-secondary btn-sm">
            {reordering ? 'Reordering...' : 'Order Again'}
          </button>
          {['completed', 'delivered'].includes(order.status) && (
            <Link
              to={`/feedback?order_id=${order.id}${order.items?.[0]?.product_id ? `&product_id=${order.items[0].product_id}` : ''}`}
              className="btn-primary btn-sm"
            >
              Leave Feedback
            </Link>
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
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {isVehicleNonInstallmentOrder && (
                <p className="text-xs text-gray-500 mt-1">
                  For vehicle orders, online card and GCash are reserved for monthly installment payments only.
                </p>
              )}
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
                {eligibleReturnItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
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
