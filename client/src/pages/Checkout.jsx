import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiCreditCard, FiTruck, FiMapPin, FiCheck } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const calculateVehicleReservationFee = (item) => {
  if (!item || item.type !== 'vehicle') return 0;
  const rate = item.is_popular ? 0.05 : 0.02;
  const min = item.is_popular ? 5000 : 2000;
  const max = item.is_popular ? 50000 : 30000;
  const fee = Math.round((item.price || 0) * rate);
  return Math.max(min, Math.min(max, fee));
};

export default function Checkout() {
  const { cart, fetchCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    delivery_method: 'pickup',
    delivery_address: user?.address || '',
    payment_method: 'credit_card',
    notes: '',
  });

  const vehicleItems = cart.items.filter(item => item.type === 'vehicle');
  const hasVehicleOrder = vehicleItems.length > 0;
  const reservationFeeTotal = vehicleItems.reduce((sum, item) => sum + (calculateVehicleReservationFee(item) * (item.quantity || 1)), 0);

  useEffect(() => {
    if (hasVehicleOrder && !['credit_card', 'debit_card'].includes(form.payment_method)) {
      setForm(prev => ({ ...prev, payment_method: 'credit_card' }));
    }
  }, [hasVehicleOrder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.items.length === 0) { toast.error('Cart is empty'); return; }
    if (!Number.isFinite(cart.total) || cart.total <= 0) {
      toast.error('Order total must be greater than zero. Please review your cart items.');
      return;
    }

    let orderId = null;
    setLoading(true);
    try {
      const data = await api.placeOrder(form);
      orderId = data.id || data._id;
      await fetchCart();

      // Vehicle orders require reservation fee payment online.
      if (data.has_vehicle && data.reservation_fee_total > 0) {
        toast('Redirecting to secure payment...');
        const session = await api.createStripeOrderReservationSession({ order_id: orderId });
        window.location.href = session.url;
        return;
      }

      // For card payments, redirect to Stripe Checkout
      if (form.payment_method === 'credit_card' || form.payment_method === 'debit_card') {
        toast('Redirecting to secure payment...');
        const session = await api.createStripeSession({ order_id: orderId });
        window.location.href = session.url;
        return;
      }

      toast.success('Order placed successfully!');
      navigate(`/orders/${orderId}`);
    } catch (err) {
      if (orderId && (form.payment_method === 'credit_card' || form.payment_method === 'debit_card')) {
        toast.error(`${err.message} You can retry payment from your order details.`);
        navigate(`/orders/${orderId}`);
        return;
      }
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">Checkout</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery Method */}
          <div className="card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FiTruck /> Delivery Method</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${form.delivery_method === 'pickup' ? 'border-accent-500 bg-accent-50' : 'border-gray-200'}`}>
                <input type="radio" name="delivery_method" value="pickup" checked={form.delivery_method === 'pickup'} onChange={e => setForm({ ...form, delivery_method: e.target.value })} className="sr-only" />
                <div className="font-semibold">Pickup</div>
                <div className="text-sm text-gray-500">Pick up at SR-5 store</div>
              </label>
              <label className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${form.delivery_method === 'delivery' ? 'border-accent-500 bg-accent-50' : 'border-gray-200'}`}>
                <input type="radio" name="delivery_method" value="delivery" checked={form.delivery_method === 'delivery'} onChange={e => setForm({ ...form, delivery_method: e.target.value })} className="sr-only" />
                <div className="font-semibold">Delivery</div>
                <div className="text-sm text-gray-500">Ship to your address</div>
              </label>
            </div>
            {form.delivery_method === 'delivery' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                <textarea value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })} className="input-field" rows={2} required />
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FiCreditCard /> Payment Method</h3>

            {hasVehicleOrder && (
              <div className="rounded-lg border border-accent-200 bg-accent-50 p-4 mb-4">
                <p className="font-semibold text-accent-800">Vehicle Reservation Fee Required</p>
                <p className="text-sm text-accent-700 mt-1">
                  Reservation fee total: <strong>{formatPrice(reservationFeeTotal)}</strong>. This must be paid online to secure your vehicle order.
                </p>
                <p className="text-xs text-accent-600 mt-1">
                  Vehicle reservation period: <strong>1 week</strong>. Parts/accessories reservation period: <strong>48 hours</strong>.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {(hasVehicleOrder
                ? [
                    { value: 'credit_card', label: 'Credit Card', desc: 'Visa, Mastercard (online)' },
                    { value: 'debit_card', label: 'Debit Card', desc: 'Bank debit cards (online)' },
                  ]
                : [
                    { value: 'cash', label: 'Cash', desc: 'Pay on pickup' },
                    { value: 'credit_card', label: 'Credit Card', desc: 'Visa, Mastercard' },
                    { value: 'debit_card', label: 'Debit Card', desc: 'Bank debit cards' },
                    { value: 'ewallet', label: 'E-Wallet', desc: 'GCash, Maya, etc.' },
                    { value: 'bank_transfer', label: 'Bank Transfer', desc: 'Direct bank transfer' },
                    { value: 'installment', label: 'Installment', desc: 'Monthly payment plan' },
                  ]).map(pm => (
                <label key={pm.value} className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${form.payment_method === pm.value ? 'border-accent-500 bg-accent-50' : 'border-gray-200'}`}>
                  <input type="radio" name="payment_method" value={pm.value} checked={form.payment_method === pm.value} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="sr-only" />
                  <div className="font-medium text-sm">{pm.label}</div>
                  <div className="text-xs text-gray-500">{pm.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="card p-6">
            <h3 className="font-bold text-lg mb-4">Notes (Optional)</h3>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={3} placeholder="Any special instructions..." />
          </div>
        </div>

        {/* Summary */}
        <div>
          <div className="card p-6 sticky top-20">
            <h3 className="font-bold text-lg mb-4">Order Summary</h3>
            <div className="space-y-3 mb-4">
              {cart.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600 line-clamp-1 flex-1 mr-2">{item.name} × {item.quantity}</span>
                  <span className="font-medium whitespace-nowrap">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <hr className="my-4" />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-accent-600">{formatPrice(cart.total)}</span>
            </div>
            <button type="submit" disabled={loading || cart.items.length === 0 || !Number.isFinite(cart.total) || cart.total <= 0} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {loading
                ? 'Processing...'
                : hasVehicleOrder
                  ? <><FiCreditCard /> Pay Reservation Fee Online</>
                  : (form.payment_method === 'credit_card' || form.payment_method === 'debit_card')
                    ? <><FiCreditCard /> Pay with Card</>
                    : <><FiCheck /> Place Order</>
              }
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
