import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import { FiCheckCircle, FiAlertCircle, FiFileText, FiShoppingBag, FiCalendar } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const verifiedKeyRef = useRef(null);

  useEffect(() => {
    const provider = searchParams.get('provider') || 'stripe';
    const pendingPaymongo = provider === 'paymongo'
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem('sr5_paymongo_pending_session') || 'null');
          } catch {
            return null;
          }
        })()
      : null;

    const sessionId = searchParams.get('session_id') || pendingPaymongo?.session_id || null;
    const type = searchParams.get('type') || pendingPaymongo?.type || null;
    const checkoutReference = searchParams.get('checkout_ref') || pendingPaymongo?.checkout_reference || null;

    if (sessionId) {
      const verifyKey = `${sessionId}:${type || 'order'}:${provider}:${checkoutReference || 'none'}`;
      if (verifiedKeyRef.current === verifyKey) return;
      verifiedKeyRef.current = verifyKey;
      verifyPayment(sessionId, type, provider, checkoutReference);
    } else {
      setError('No payment session found.');
      setLoading(false);
    }
  }, [searchParams]);

  const verifyPayment = async (sessionId, type, provider, checkoutReference) => {
    try {
      const data = provider === 'paymongo'
        ? await api.verifyGcashPayment({ session_id: sessionId, checkout_reference: checkoutReference })
        : type === 'reservation'
          ? await api.verifyStripeReservationPayment({ session_id: sessionId })
          : type === 'order_reservation'
            ? await api.verifyStripeOrderReservationPayment({ session_id: sessionId })
            : type === 'installment'
              ? await api.verifyStripeInstallmentPayment({ session_id: sessionId })
              : await api.verifyStripePayment({ session_id: sessionId });
      setPayment(data);
      if (provider === 'paymongo') {
        localStorage.removeItem('sr5_paymongo_pending_session');
      }
    } catch (err) {
      setError(err.message || 'Failed to verify payment.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mb-4"></div>
        <p className="text-gray-600">Verifying your payment...</p>
      </div>
    );
  }

  const isPaymongo = searchParams.get('provider') === 'paymongo';

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <FiAlertCircle className="mx-auto text-red-500 mb-4" size={48} />
        <h1 className="text-2xl font-bold text-navy-900 mb-2">Payment Issue</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        <Link to="/orders" className="btn-primary">View My Orders</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="card p-8">
        <FiCheckCircle className="mx-auto text-green-500 mb-4" size={56} />
        <h1 className="text-2xl font-bold text-navy-900 mb-2">
          {searchParams.get('type') === 'reservation'
            ? 'Reservation Fee Paid!'
            : searchParams.get('type') === 'order_reservation'
              ? 'Vehicle Reservation Secured!'
              : searchParams.get('type') === 'installment'
                ? 'Installment Paid Successfully!'
              : isPaymongo
                ? 'GCash Payment Successful!'
                : 'Payment Successful!'}
        </h1>
        <p className="text-gray-600 mb-6">
          {searchParams.get('type') === 'reservation'
            ? 'Your reservation fee has been received. Your vehicle is now secured!'
            : searchParams.get('type') === 'order_reservation'
              ? 'Your order reservation fee is paid. Your vehicle is now reserved under your order.'
              : searchParams.get('type') === 'installment'
                ? `Payment for this month is successful${payment?.installment_number ? ` (Month ${payment.installment_number})` : ''}.`
                : isPaymongo
                  ? 'Your PayMongo GCash payment has been processed and posted to your order.'
                  : 'Your payment has been processed and your order is confirmed.'}
        </p>

        {payment && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Amount Paid</span>
              <span className="font-bold text-green-600">{formatPrice(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment Method</span>
              <span className="capitalize">{payment.payment_method?.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt #</span>
              <span className="font-mono">{payment.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="badge badge-success">Completed</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {payment?.receipt_number && (
            <Link to={`/receipt/${payment.receipt_number}`} className="btn-primary flex items-center justify-center gap-2">
              <FiFileText size={16} /> View Receipt
            </Link>
          )}
          {searchParams.get('type') === 'reservation' ? (
            <Link to="/bookings" className="btn-secondary flex items-center justify-center gap-2">
              <FiCalendar size={16} /> View My Bookings
            </Link>
          ) : searchParams.get('type') === 'order_reservation' ? (
            <Link to={payment?.order_id ? `/orders/${payment.order_id}` : '/orders'} className="btn-secondary flex items-center justify-center gap-2">
              <FiShoppingBag size={16} /> View Order
            </Link>
          ) : payment?.order_id && (
            <Link to={`/orders/${payment.order_id}`} className="btn-secondary flex items-center justify-center gap-2">
              <FiShoppingBag size={16} /> View Order
            </Link>
          )}
          {searchParams.get('type') !== 'reservation' && (
            <Link to="/orders" className="text-accent-600 hover:text-accent-700 text-sm">View All Orders</Link>
          )}
        </div>
      </div>
    </div>
  );
}
