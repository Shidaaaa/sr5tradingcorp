import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiCalendar, FiClock, FiPlus, FiCheckCircle, FiXCircle, FiCreditCard, FiStar } from 'react-icons/fi';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ReservationCountdown from '../components/ReservationCountdown';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const HOLIDAY_MM_DD = new Set([
  '01-01',
  '04-09',
  '05-01',
  '06-12',
  '08-21',
  '11-01',
  '11-30',
  '12-08',
  '12-25',
  '12-30',
  '12-31',
]);

const isHolidayDate = (date) => HOLIDAY_MM_DD.has(`${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);

const isBlockedBookingDate = (date) => date.getDay() === 0 || isHolidayDate(date);

const getRollingMaxDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SERVICE_OPTIONS = [
  'Change Oil and Filter',
  'Engine Tune-Up',
  'Brake Inspection and Service',
  'Battery Check and Replacement',
  'Wheel Alignment and Balancing',
  'Tire Rotation and Replacement',
  'Air Conditioning Service',
  'Electrical System Diagnostics',
  'Suspension and Steering Check',
  'General Preventive Maintenance',
];

const buildTimeSlots = (start = '08:00', end = '17:00', intervalMinutes = 15) => {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startTotal = (startH * 60) + startM;
  const endTotal = (endH * 60) + endM;

  const slots = [];
  for (let t = startTotal; t <= endTotal; t += intervalMinutes) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
};

const toTwelveHourTime = (time24) => {
  if (!time24 || !time24.includes(':')) return time24;
  const [hourText, minuteText] = time24.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time24;

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
};

const BOOKING_TIME_SLOTS = buildTimeSlots('08:00', '17:00', 15);

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
    service_type: '',
    preferred_date: '',
    preferred_time: '',
    notes: '',
  });
  const [payingFee, setPayingFee] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [processingOnline, setProcessingOnline] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [unavailableTimes, setUnavailableTimes] = useState([]);
  const [availableTimes, setAvailableTimes] = useState(BOOKING_TIME_SLOTS);

  const selectedProduct = products.find(p => String(p.id) === String(form.product_id));
  const isVehicleBooking = form.booking_type === 'test_drive' || form.booking_type === 'vehicle_viewing';
  const isServiceAppointment = form.booking_type === 'service_appointment';
  const filteredProducts = isVehicleBooking ? products.filter(p => p.type === 'vehicle') : [];
  const minBookingDate = formatDateInput(new Date());
  const maxBookingDate = formatDateInput(getRollingMaxDate());
  const minBookingDateObj = new Date(`${minBookingDate}T00:00:00`);
  const maxBookingDateObj = new Date(`${maxBookingDate}T23:59:59`);
  const currentYear = minBookingDateObj.getFullYear();
  const maxYear = maxBookingDateObj.getFullYear();
  const allowedYears = Array.from({ length: (maxYear - currentYear) + 1 }, (_, idx) => currentYear + idx);

  useEffect(() => { fetchBookings(); fetchProducts(); }, []);

  useEffect(() => {
    if (!form.preferred_date || (isVehicleBooking && !form.product_id) || (isServiceAppointment && !form.service_type)) {
      setUnavailableTimes([]);
      setAvailableTimes(BOOKING_TIME_SLOTS);
      return;
    }
    setAvailabilityLoading(true);
    api.getBookingAvailability(form.product_id || 'global', form.preferred_date)
      .then(data => {
        setUnavailableTimes(data.unavailable_times || []);
        setAvailableTimes(data.available_times || BOOKING_TIME_SLOTS);
        if (form.preferred_time && (data.unavailable_times || []).includes(form.preferred_time)) {
          setForm(prev => ({ ...prev, preferred_time: '' }));
          toast.error('Selected time is no longer available. Please choose another slot.');
        }
      })
      .catch(() => {
        setUnavailableTimes([]);
        setAvailableTimes(BOOKING_TIME_SLOTS);
      })
      .finally(() => setAvailabilityLoading(false));
  }, [form.product_id, form.service_type, form.preferred_date, isVehicleBooking, isServiceAppointment]);

  const fetchBookings = async () => {
    try { setBookings(await api.getBookings()); } catch {} finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    try { setProducts(await api.getProducts()); } catch {}
  };

  const handlePreferredDateChange = (value) => {
    if (!value) {
      setForm({ ...form, preferred_date: value });
      return;
    }

    const pickedDate = new Date(`${value}T00:00:00`);
    if (isBlockedBookingDate(pickedDate)) {
      toast.error(pickedDate.getDay() === 0
        ? 'Bookings are not available on Sundays.'
        : 'Bookings are not available on holidays.');
      setForm({ ...form, preferred_date: '' });
      return;
    }

    setForm({ ...form, preferred_date: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isVehicleBooking && !form.product_id) {
      toast.error('Please select a vehicle for this booking type.');
      return;
    }
    if (isServiceAppointment && !form.service_type) {
      toast.error('Please select a service for your appointment.');
      return;
    }
    if (form.preferred_date && form.preferred_date > maxBookingDate) {
      toast.error('Bookings can only be scheduled from the current month up to the next month.');
      return;
    }
    if (form.preferred_date) {
      const pickedDate = new Date(`${form.preferred_date}T00:00:00`);
      if (isBlockedBookingDate(pickedDate)) {
        toast.error(pickedDate.getDay() === 0
          ? 'Bookings are not available on Sundays.'
          : 'Bookings are not available on holidays.');
        return;
      }
    }
    if (form.preferred_time && unavailableTimes.includes(form.preferred_time)) {
      toast.error('This time slot is already booked. Please choose another time.');
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
      setForm({ booking_type: 'test_drive', product_id: '', service_type: '', preferred_date: '', preferred_time: '', notes: '' });
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
              <select
                value={form.booking_type}
                onChange={e => setForm({ ...form, booking_type: e.target.value, product_id: '', service_type: '', preferred_time: '' })}
                className="input-field"
              >
                <option value="test_drive">Test Drive</option>
                <option value="vehicle_viewing">Vehicle Viewing</option>
                <option value="service_appointment">Service / Maintenance</option>
              </select>
            </div>
            <div>
              {isVehicleBooking ? (
                <>
                  <label className="block text-sm font-medium mb-1">Vehicle *</label>
                  <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value, preferred_time: '' })} className="input-field" required>
                    <option value="">Select vehicle...</option>
                    {filteredProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.is_popular ? ' ★' : ''}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium mb-1">Service Needed *</label>
                  <select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value, preferred_time: '' })} className="input-field" required>
                    <option value="">Select service...</option>
                    {SERVICE_OPTIONS.map(service => (
                      <option key={service} value={service}>{service}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preferred Date *</label>
              <DatePicker
                selected={form.preferred_date ? new Date(`${form.preferred_date}T00:00:00`) : null}
                onChange={(date) => handlePreferredDateChange(date ? formatDateInput(date) : '')}
                minDate={minBookingDateObj}
                maxDate={maxBookingDateObj}
                filterDate={(date) => !isBlockedBookingDate(date)}
                dateFormat="yyyy-MM-dd"
                placeholderText="Select booking date"
                className="input-field w-full"
                wrapperClassName="w-full booking-datepicker-wrapper"
                popperClassName="booking-datepicker-popper"
                calendarClassName="booking-datepicker-calendar"
                required
                renderCustomHeader={({ date, changeYear, changeMonth }) => (
                  <div className="flex items-center justify-between gap-2 px-2 pb-2 booking-datepicker-header">
                    <select
                      value={date.getFullYear()}
                      onChange={({ target: { value } }) => changeYear(Number(value))}
                      className="booking-datepicker-header-select"
                    >
                      {allowedYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <select
                      value={date.getMonth()}
                      onChange={({ target: { value } }) => changeMonth(Number(value))}
                      className="booking-datepicker-header-select"
                    >
                      {MONTH_NAMES.map((month, index) => (
                        <option key={month} value={index}>{month}</option>
                      ))}
                    </select>
                  </div>
                )}
              />
              <p className="text-xs text-gray-500 mt-1">
                Bookings can be scheduled from this month to next month only.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Sundays and holidays are unavailable. When this month changes, the booking window automatically rolls to the new current month and next month.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preferred Time *</label>
              <select
                value={form.preferred_time}
                onChange={e => setForm({ ...form, preferred_time: e.target.value })}
                className="input-field"
                required
                disabled={!form.preferred_date || (isVehicleBooking && !form.product_id) || (isServiceAppointment && !form.service_type) || availabilityLoading}
              >
                <option value="">{availabilityLoading ? 'Loading available slots...' : 'Select time slot...'}</option>
                {BOOKING_TIME_SLOTS.map(slot => {
                  const isUnavailable = unavailableTimes.includes(slot);
                  return (
                    <option key={slot} value={slot} disabled={isUnavailable}>
                      {toTwelveHourTime(slot)}{isUnavailable ? ' (Unavailable)' : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {(form.preferred_date && ((isVehicleBooking && form.product_id) || (isServiceAppointment && form.service_type)))
                  ? `Available slots: ${availableTimes.length}/${BOOKING_TIME_SLOTS.length}`
                  : `Select ${isVehicleBooking ? 'a vehicle' : 'a service'} and date to load available time slots (8:00 AM to 5:00 PM).`}
              </p>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} placeholder="Any additional details..." />
          </div>

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
                  {!booking.product_name && booking.service_type && <div><span className="text-gray-500">Service</span><p className="font-medium">{booking.service_type}</p></div>}
                  {isVehicle && booking.reservation_fee > 0 && (
                    <div><span className="text-gray-500">Reservation Fee</span><p className="font-medium text-accent-600">{formatPrice(booking.reservation_fee)}</p></div>
                  )}
                  <div><span className="text-gray-500">Date</span><p className="font-medium flex items-center gap-1"><FiCalendar size={12} /> {booking.preferred_date}</p></div>
                  <div><span className="text-gray-500">Time</span><p className="font-medium flex items-center gap-1"><FiClock size={12} /> {toTwelveHourTime(booking.preferred_time)}</p></div>
                </div>
                {booking.pickup_confirmed && <p className="text-sm text-green-600 mt-2 flex items-center gap-1"><FiCheckCircle size={14} /> Pickup confirmed</p>}
                {booking.admin_notes && <p className="text-sm text-gray-500 mt-2">Admin: {booking.admin_notes}</p>}
                {/* Countdown for vehicle reservations */}
                {isVehicle && booking.reservation_expires_at && ['pending', 'approved'].includes(booking.status) && (
                  <div className="mt-3">
                    <ReservationCountdown expiresAt={booking.reservation_expires_at} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
