import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiCreditCard, FiTruck, FiMapPin, FiCheck } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const calculateVehicleReservationFee = (item) => {
  if (!item || item.type !== 'vehicle') return 0;
  const fee = Math.round((item.price || 0) * 0.05);
  return Math.max(0, fee);
};

export default function Checkout() {
  const { cart, fetchCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [inquiryItem, setInquiryItem] = useState(null);
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [form, setForm] = useState({
    delivery_method: 'pickup',
    delivery_address: user?.address || '',
    delivery_contact_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '',
    delivery_contact_phone: user?.phone || '',
    customer_delivery_platform: '',
    customer_delivery_reference: '',
    payment_method: 'credit_card',
    notes: '',
  });

  const inquiryProductId = searchParams.get('inquire_product_id');
  const inquiryQty = Math.max(1, Number(searchParams.get('quantity') || 1));
  const checkoutItems = inquiryItem ? [{ ...inquiryItem, quantity: inquiryQty }] : cart.items;
  const checkoutTotal = checkoutItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

  const vehicleItems = checkoutItems.filter(item => item.type === 'vehicle');
  const hasVehicleOrder = vehicleItems.length > 0;
  const reservationFeeTotal = vehicleItems.reduce((sum, item) => sum + (calculateVehicleReservationFee(item) * (item.quantity || 1)), 0);

  const isCheckoutItemUnavailable = (item) => {
    const stock = Number(item.stock_quantity || 0);
    if (item.type === 'vehicle') return stock <= 0;
    return item.status !== 'available' || stock <= 0 || Number(item.quantity || 0) > stock;
  };

  const unavailableItems = inquiryItem ? [] : checkoutItems.filter(isCheckoutItemUnavailable);

  useEffect(() => {
    let cancelled = false;

    const loadInquiryItem = async () => {
      if (!inquiryProductId) {
        setInquiryItem(null);
        return;
      }

      try {
        setInquiryLoading(true);
        const product = await api.getProduct(inquiryProductId);
        if (cancelled) return;

        if (!product || Number(product.stock_quantity || 0) <= 0 || product.status === 'sold_out') {
          toast.error('Selected product is no longer available for inquiry checkout.');
          navigate('/products');
          return;
        }

        setInquiryItem({
          id: product.id,
          product_id: product.id,
          name: product.name,
          price: Number(product.price || 0),
          quantity: inquiryQty,
          stock_quantity: Number(product.stock_quantity || 0),
          type: product.type,
          status: product.status,
        });
      } catch (err) {
        if (!cancelled) {
          toast.error('Unable to load inquiry product.');
          navigate('/products');
        }
      } finally {
        if (!cancelled) setInquiryLoading(false);
      }
    };

    loadInquiryItem();
    return () => { cancelled = true; };
  }, [inquiryProductId, inquiryQty, navigate]);

  useEffect(() => {
    if (hasVehicleOrder && !['credit_card', 'debit_card'].includes(form.payment_method)) {
      setForm(prev => ({ ...prev, payment_method: 'credit_card' }));
    }
  }, [hasVehicleOrder]);

  useEffect(() => {
    if (!hasVehicleOrder) return;
    setForm(prev => ({
      ...prev,
      delivery_method: 'pickup',
      delivery_address: '',
      delivery_contact_name: '',
      delivery_contact_phone: '',
      customer_delivery_platform: '',
      customer_delivery_reference: '',
    }));
  }, [hasVehicleOrder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (checkoutItems.length === 0) {
      toast.error(inquiryProductId ? 'Inquiry item is missing.' : 'Cart is empty');
      return;
    }
    if (unavailableItems.length > 0) {
      toast.error('Some items are unavailable. Please review your cart before checkout.');
      return;
    }
    if (!Number.isFinite(checkoutTotal) || checkoutTotal <= 0) {
      toast.error('Order total must be greater than zero. Please review your cart items.');
      return;
    }

    let orderId = null;
    setLoading(true);
    try {
      const orderPayload = hasVehicleOrder
        ? {
            ...form,
            delivery_method: 'pickup',
            delivery_address: '',
            delivery_contact_name: '',
            delivery_contact_phone: '',
            customer_delivery_platform: '',
            customer_delivery_reference: '',
          }
        : form;

      const data = inquiryItem
        ? await api.placeDirectOrder({ ...orderPayload, product_id: inquiryItem.product_id, quantity: inquiryQty })
        : await api.placeOrder(orderPayload);
      orderId = data.id || data._id;
      if (!inquiryItem) await fetchCart();

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
            {hasVehicleOrder ? (
              <>
                <div className="grid grid-cols-1">
                  <label className="border-2 rounded-lg p-4 transition-all border-accent-500 bg-accent-50">
                    <input type="radio" name="delivery_method" value="pickup" checked className="sr-only" readOnly />
                    <div className="font-semibold">Pickup</div>
                    <div className="text-sm text-gray-500">Vehicle orders are currently pickup only.</div>
                  </label>
                </div>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  For trucks, heavy equipment, and other vehicle units, delivery is currently unavailable. Please proceed with pickup.
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <label className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${form.delivery_method === 'third_party' ? 'border-accent-500 bg-accent-50' : 'border-gray-200'}`}>
                  <input type="radio" name="delivery_method" value="third_party" checked={form.delivery_method === 'third_party'} onChange={e => setForm({ ...form, delivery_method: e.target.value })} className="sr-only" />
                  <div className="font-semibold">3rd-Party Delivery</div>
                  <div className="text-sm text-gray-500">You book Lalamove/other rider</div>
                </label>
              </div>
            )}

            {!hasVehicleOrder && (form.delivery_method === 'delivery' || form.delivery_method === 'third_party') && (
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                <textarea value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })} className="input-field" rows={2} required />

                {form.delivery_method === 'third_party' && (
                  <>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                      Rider booking is handled by customer (Lalamove/Grab/other). We will prepare your order and update status once picked up.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Receiver Name</label>
                        <input value={form.delivery_contact_name} onChange={e => setForm({ ...form, delivery_contact_name: e.target.value })} className="input-field" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Receiver Phone</label>
                        <input value={form.delivery_contact_phone} onChange={e => setForm({ ...form, delivery_contact_phone: e.target.value })} className="input-field" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Courier Platform (Optional)</label>
                        <input value={form.customer_delivery_platform} onChange={e => setForm({ ...form, customer_delivery_platform: e.target.value })} className="input-field" placeholder="Lalamove, Grab, etc." />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Booking Reference (Optional)</label>
                        <input value={form.customer_delivery_reference} onChange={e => setForm({ ...form, customer_delivery_reference: e.target.value })} className="input-field" placeholder="Booking or tracking #" />
                      </div>
                    </div>
                  </>
                )}
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
            {inquiryItem && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 mb-4">
                Inquiry checkout mode: this order is placed directly from product inquiry, not from cart.
              </div>
            )}
            {unavailableItems.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                Unavailable items detected. Please go back to cart and update quantities.
              </div>
            )}
            <div className="space-y-3 mb-4">
              {checkoutItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600 line-clamp-1 flex-1 mr-2">{item.name} × {item.quantity}</span>
                  <span className="font-medium whitespace-nowrap">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <hr className="my-4" />
            {hasVehicleOrder ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Order Total</span>
                  <span className="font-medium">{formatPrice(checkoutTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Reservation Fee (5%)</span>
                  <span className="font-medium">{formatPrice(reservationFeeTotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Pay Now</span>
                  <span className="text-accent-600">{formatPrice(reservationFeeTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-accent-600">{formatPrice(checkoutTotal)}</span>
              </div>
            )}
            <button type="submit" disabled={loading || inquiryLoading || unavailableItems.length > 0 || checkoutItems.length === 0 || !Number.isFinite(checkoutTotal) || checkoutTotal <= 0} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {loading
                ? 'Processing...'
                : inquiryLoading
                  ? 'Loading inquiry...'
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
