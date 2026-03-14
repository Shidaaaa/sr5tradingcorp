import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiCalendar, FiClock, FiPlus, FiMapPin, FiTruck, FiCheckCircle, FiXCircle, FiCreditCard, FiStar } from 'react-icons/fi';
import ReservationCountdown from '../components/ReservationCountdown';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const formatDateInput = (date) => date.toISOString().split('T')[0];

const getBookingMaxDate = (productType) => {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + (productType === 'vehicle' ? 30 : 90));
  return formatDateInput(maxDate);
};

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  approved: { color: 'badge-success', label: 'Approved' },
  rejected: { color: 'badge-danger', label: 'Rejected' },
  completed: { color: 'badge-success', label: 'Completed' },
  no_show: { color: 'badge-danger', label: 'No Show' },
  cancelled: { color: 'badge-gray', label: 'Cancelled' },
};

export default function Bookings() {
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!searchParams.get('product_id'));
  const [form, setForm] = useState({
    booking_type: 'test_drive',
    product_id: searchParams.get('product_id') || '',
    preferred_date: '',
    preferred_time: '',
    delivery_method: 'pickup',
    notes: '',
  });
  const [feeInfo, setFeeInfo] = useState(null);
  const [payingFee, setPayingFee] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [processingOnline, setProcessingOnline] = useState(false);

  const selectedProduct = products.find(p => String(p.id) === String(form.product_id));
  const selectedProductType = selectedProduct?.type || (form.booking_type === 'test_drive' ? 'vehicle' : 'general');
  const minBookingDate = formatDateInput(new Date());
  const maxBookingDate = getBookingMaxDate(selectedProductType);

  useEffect(() => { fetchBookings(); fetchProducts(); }, []);

  // Fetch reservation fee whenever product selection changes
  useEffect(() => {
    if (!form.product_id) { setFeeInfo(null); return; }
    const selected = products.find(p => String(p.id) === String(form.product_id));
    if (!selected || selected.type !== 'vehicle') { setFeeInfo(null); return; }
    api.getReservationFee(form.product_id).then(setFeeInfo).catch(() => setFeeInfo(null));
  }, [form.product_id, products]);

  const fetchBookings = async () => {
    try { setBookings(await api.getBookings()); } catch {} finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    try { setProducts(await api.getProducts()); } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.preferred_date && form.preferred_date > maxBookingDate) {
      toast.error(selectedProductType === 'vehicle'
        ? 'Vehicle bookings can only be scheduled up to 1 month in advance.'
        : 'Tools, parts, and other item bookings can only be scheduled up to 3 months in advance.');
      return;
    }
    try {
      const result = await api.createBooking(form);
      if (result.reservation_fee > 0) {
        toast.success(`Booking created! Reservation fee: ${formatPrice(result.reservation_fee)}`);
      } else {
        toast.success('Booking created! Waiting for admin approval.');
      }
      setShowForm(false);
      setFeeInfo(null);
      setForm({ booking_type: 'test_drive', product_id: '', preferred_date: '', preferred_time: '', delivery_method: 'pickup', notes: '' });
      fetchBookings();
    } catch (err) { toast.error(err.message); }
  };

  const handlePayFee = async (booking) => {
    setPayingFee(null);
    try {
      await api.processPayment({
        booking_id: booking.id,
        amount: booking.reservation_fee,
        payment_method: payMethod,
        payment_type: 'reservation',
      });
      toast.success('Reservation fee paid successfully!');
      fetchBookings();
    } catch (err) { toast.error(err.message); }
  };

  const handlePayOnline = async (booking) => {
    setProcessingOnline(true);
    try {
      const session = await api.createStripeReservationSession({ booking_id: booking.id });
      window.location.href = session.url;
    } catch (err) {
      toast.error(err.message);
      setProcessingOnline(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-navy-900">Bookings</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm flex items-center gap-1">
          <FiPlus /> New Booking
        </button>
      </div>

      {/* New Booking Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4">
          <h3 className="font-bold text-lg">Create New Booking</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Booking Type *</label>
              <select value={form.booking_type} onChange={e => setForm({ ...form, booking_type: e.target.value })} className="input-field">
                <option value="test_drive">Test Drive</option>
                <option value="vehicle_viewing">Vehicle Viewing</option>
                <option value="service_appointment">Service / Maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Product / Vehicle</label>
              <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} className="input-field">
                <option value="">Select product...</option>
                {products.filter(p => form.booking_type !== 'test_drive' || p.type === 'vehicle').map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.is_popular ? ' ★' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preferred Date *</label>
              <input type="date" value={form.preferred_date} onChange={e => setForm({ ...form, preferred_date: e.target.value })} className="input-field" min={minBookingDate} max={maxBookingDate} required />
              <p className="text-xs text-gray-500 mt-1">
                {selectedProductType === 'vehicle'
                  ? 'Vehicle bookings can be scheduled up to 1 month ahead.'
                  : 'Tools, parts, and other item bookings can be scheduled up to 3 months ahead.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preferred Time *</label>
              <input type="time" value={form.preferred_time} onChange={e => setForm({ ...form, preferred_time: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">How will you receive the item?</label>
              <select value={form.delivery_method} onChange={e => setForm({ ...form, delivery_method: e.target.value })} className="input-field">
                <option value="pickup">Pickup at store</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} placeholder="Any additional details..." />
          </div>

          {/* Reservation Fee Notice for vehicles */}
          {feeInfo && feeInfo.fee > 0 && (
            <div className="rounded-lg border border-accent-200 bg-accent-50 p-4">
              <div className="flex items-start gap-3">
                <FiStar className="text-accent-500 mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <p className="font-semibold text-accent-800">Reservation Fee Required</p>
                  <p className="text-sm text-accent-700 mt-1">
                    This is a <strong>{feeInfo.is_popular ? 'popular' : 'standard'}</strong> vehicle.
                    A reservation fee of <strong>{formatPrice(feeInfo.fee)}</strong> ({feeInfo.rate}% of vehicle price) is required to hold this vehicle.
                  </p>
                  <p className="text-xs text-accent-600 mt-1">
                    The vehicle will be held for <strong>{feeInfo.days} {feeInfo.days === 1 ? 'day' : 'days'}</strong> from booking approval.
                    Pay the fee after admin approves your booking.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-700">
            Note: There is a 2-hour buffer between bookings. Your booking requires admin approval.
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Submit Booking</button>
          </div>
        </form>
      )}

      {/* Pay Fee Modal */}
      {payingFee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !processingOnline && setPayingFee(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-br from-accent-600 to-accent-800 px-6 pt-6 pb-8 text-white text-center">
              <p className="text-accent-200 text-sm mb-1">Reservation fee for</p>
              <p className="font-bold text-lg">{payingFee.product_name}</p>
              <p className="text-5xl font-black mt-3 tracking-tight">{formatPrice(payingFee.reservation_fee)}</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {payingFee.product_is_popular
                  ? <span className="bg-amber-400/30 text-amber-200 text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1"><FiStar size={10} /> Popular — 5% of vehicle price</span>
                  : <span className="bg-white/20 text-white/80 text-xs font-medium px-3 py-1 rounded-full">Standard — 2% of vehicle price</span>
                }
              </div>
              <p className="text-accent-300 text-xs mt-2">Booking {payingFee.booking_number}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Stripe online payment - primary CTA */}
              <button
                onClick={() => handlePayOnline(payingFee)}
                disabled={processingOnline}
                className="w-full flex items-center gap-4 bg-accent-600 hover:bg-accent-700 disabled:opacity-70 text-white rounded-xl p-4 transition-all shadow-md"
              >
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FiCreditCard size={20} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold">{processingOnline ? 'Redirecting to Stripe…' : 'Pay Online with Card'}</p>
                  <p className="text-accent-200 text-xs">Secure payment via Stripe • Visa / Mastercard</p>
                </div>
                {!processingOnline && <span className="text-accent-300 text-lg">→</span>}
                {processingOnline && <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/40 border-t-white" />}
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or pay in person at the store</span></div>
              </div>

              {/* Manual payment methods */}
              <div className="grid grid-cols-3 gap-2">
                {[{v:'cash',l:'Cash'},{v:'gcash',l:'GCash'},{v:'bank_transfer',l:'Bank Transfer'}].map(pm => (
                  <label key={pm.v} className={`border-2 rounded-xl p-3 cursor-pointer text-center text-sm transition-all ${payMethod === pm.v ? 'border-accent-500 bg-accent-50 font-semibold text-accent-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <input type="radio" name="pay_method" value={pm.v} checked={payMethod === pm.v} onChange={() => setPayMethod(pm.v)} className="sr-only" />
                    {pm.l}
                  </label>
                ))}
              </div>
              <button onClick={() => handlePayFee(payingFee)} className="w-full btn-secondary text-sm">
                Confirm {payMethod.replace('_', ' ')} payment at store
              </button>

              <button onClick={() => setPayingFee(null)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>
      ) : bookings.length === 0 ? (
        <div className="card p-12 text-center">
          <FiCalendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600">No bookings yet</h3>
          <p className="text-gray-500 mt-1">Create a booking for test drives, viewings, or service appointments</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map(booking => {
            const sc = statusConfig[booking.status] || { color: 'badge-gray', label: booking.status };
            const isVehicle = booking.product_type === 'vehicle';
            const hasUnpaidFee = isVehicle && booking.reservation_fee > 0 && !booking.reservation_fee_paid && booking.status === 'approved';
            return (
              <div key={booking.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{booking.booking_number}</h3>
                      <span className={`badge ${sc.color}`}>{sc.label}</span>
                      {booking.product_is_popular && <span className="badge badge-warning text-xs"><FiStar size={10} className="inline mr-0.5" />Popular</span>}
                    </div>
                    <p className="text-sm text-gray-500 capitalize">{booking.booking_type.replace(/_/g, ' ')}</p>
                  </div>
                  {/* Pay reservation fee button */}
                  {hasUnpaidFee && (
                    <button onClick={() => setPayingFee(booking)} className="btn-primary btn-sm flex items-center gap-1 text-xs">
                      <FiCreditCard size={12} /> Pay Reservation Fee {formatPrice(booking.reservation_fee)}
                    </button>
                  )}
                  {isVehicle && booking.reservation_fee > 0 && booking.reservation_fee_paid && (
                    <span className="badge badge-success text-xs flex items-center gap-1"><FiCheckCircle size={11} /> Fee Paid</span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {booking.product_name && <div><span className="text-gray-500">Vehicle</span><p className="font-medium">{booking.product_name}</p></div>}
                  {isVehicle && booking.reservation_fee > 0 && (
                    <div><span className="text-gray-500">Reservation Fee</span><p className="font-medium text-accent-600">{formatPrice(booking.reservation_fee)}</p></div>
                  )}
                  <div><span className="text-gray-500">Date</span><p className="font-medium flex it