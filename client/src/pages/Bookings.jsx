import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiCalendar, FiClock, FiPlus, FiMapPin, FiTruck, FiCheckCircle, FiXCircle, FiCreditCard, FiStar, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import ReservationCountdown from '../components/ReservationCountdown';
import { useAuth } from '../context/AuthContext';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const formatDateInput = (date) => date.toISOString().split('T')[0];

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDateInput(parsed);
};

const toDisplayDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Invalid date';
  return parsed.toLocaleDateString();
};

const getBookingMaxDate = (productType) => {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + (productType === 'vehicle' ? 30 : 90));
  return formatDateInput(maxDate);
};

const toMinutes = (value) => {
  const [h, m] = String(value || '').split(':').map(Number);
  return (h * 60) + m;
};

const toTimeLabel = (value) => {
  const [h, m] = String(value || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const buildTimeSlots = (openTime, closeTime, lunchStart, lunchEnd, durationMinutes = 120, stepMinutes = 30) => {
  const openMin = toMinutes(openTime);
  const closeMin = toMinutes(closeTime);
  const lunchStartMin = toMinutes(lunchStart);
  const lunchEndMin = toMinutes(lunchEnd);
  const slots = [];

  for (let start = openMin; start + durationMinutes <= closeMin; start += stepMinutes) {
    const end = start + durationMinutes;
    const overlapsLunch = start < lunchEndMin && end > lunchStartMin;
    if (overlapsLunch) continue;

    const hour = Math.floor(start / 60).toString().padStart(2, '0');
    const minute = (start % 60).toString().padStart(2, '0');
    slots.push(`${hour}:${minute}`);
  }

  return slots;
};

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  approved: { color: 'badge-success', label: 'Approved' },
  rejected: { color: 'badge-danger', label: 'Rejected' },
  completed: { color: 'badge-success', label: 'Completed' },
  no_show: { color: 'badge-danger', label: 'No Show' },
  cancelled: { color: 'badge-gray', label: 'Cancelled' },
};

const bookingTypeConfig = {
  test_drive: { label: 'Test Drive', chip: 'bg-blue-100 text-blue-700' },
  vehicle_viewing: { label: 'Viewing', chip: 'bg-violet-100 text-violet-700' },
  service_appointment: { label: 'Service', chip: 'bg-emerald-100 text-emerald-700' },
};

export default function Bookings() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
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
  const [availability, setAvailability] = useState({
    daily_capacity: 5,
    counts: {},
    fully_booked_dates: [],
    holidays: [],
    store_open_time: '08:00',
    store_close_time: '15:00',
    lunch_start_time: '12:00',
    lunch_end_time: '13:00',
  });

  const selectedProduct = products.find(p => String(p.id) === String(form.product_id));
  const selectedProductType = selectedProduct?.type || (form.booking_type === 'test_drive' ? 'vehicle' : 'general');
  const minBookingDate = formatDateInput(new Date());
  const maxBookingDate = getBookingMaxDate(selectedProductType);

  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const monthOffset = monthStart.getDay();

  const bookingsByDate = bookings.reduce((acc, booking) => {
    const key = normalizeDateKey(booking.preferred_date);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(booking);
    return acc;
  }, {});

  const selectedDateBookings = (bookingsByDate[selectedDate] || []).slice().sort((a, b) => String(a.preferred_time).localeCompare(String(b.preferred_time)));
  const isSelectedDateHoliday = availability.holidays.includes(form.preferred_date);
  const availableTimeSlots = buildTimeSlots(
    availability.store_open_time,
    availability.store_close_time,
    availability.lunch_start_time,
    availability.lunch_end_time
  );

  const calendarCells = [
    ...Array.from({ length: monthOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedDateLabel = selectedDate ? toDisplayDate(selectedDate) : 'No date selected';

  const jumpToToday = () => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(formatDateInput(today));
  };

  useEffect(() => { fetchBookings(); fetchProducts(); }, []);
  useEffect(() => { fetchAvailability(); }, [monthKey]);

  // Fetch reservation fee whenever product selection changes
  useEffect(() => {
    if (!form.product_id) { setFeeInfo(null); return; }
    const selected = products.find(p => String(p.id) === String(form.product_id));
    if (!selected || selected.type !== 'vehicle') { setFeeInfo(null); return; }
    api.getReservationFee(form.product_id).then(setFeeInfo).catch(() => setFeeInfo(null));
  }, [form.product_id, products]);

  const fetchBookings = async () => {
    try {
      const data = await api.getBookings();
      const currentUserId = user?.id || user?._id;
      const own = Array.isArray(data)
        ? data.filter((booking) => !currentUserId || String(booking.user_id) === String(currentUserId))
        : [];
      setBookings(own);
    } catch {
      setBookings([]);
    } finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    try { setProducts(await api.getProducts()); } catch {}
  };

  const fetchAvailability = async () => {
    try {
      const data = await api.getBookingAvailability(monthKey);
      setAvailability({
        daily_capacity: Number(data?.daily_capacity || 5),
        counts: data?.counts || {},
        fully_booked_dates: Array.isArray(data?.fully_booked_dates) ? data.fully_booked_dates : [],
        holidays: Array.isArray(data?.holidays) ? data.holidays : [],
        store_open_time: data?.store_open_time || '08:00',
        store_close_time: data?.store_close_time || '15:00',
        lunch_start_time: data?.lunch_start_time || '12:00',
        lunch_end_time: data?.lunch_end_time || '13:00',
      });
    } catch {
      setAvailability({
        daily_capacity: 5,
        counts: {},
        fully_booked_dates: [],
        holidays: [],
        store_open_time: '08:00',
        store_close_time: '15:00',
        lunch_start_time: '12:00',
        lunch_end_time: '13:00',
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (availability.fully_booked_dates.includes(form.preferred_date)) {
      toast.error('Selected date is already fully booked. Please choose another day.');
      return;
    }
    if (availability.holidays.includes(form.preferred_date)) {
      toast.error('Selected date is a holiday. Please choose another day.');
      return;
    }
    if (!availableTimeSlots.includes(form.preferred_time)) {
      toast.error('Selected time is outside store hours or during lunch break.');
      return;
    }
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
              <input
                type="date"
                value={form.preferred_date}
                onChange={e => {
                  const nextDate = e.target.value;
                  const keepTime = availableTimeSlots.includes(form.preferred_time) ? form.preferred_time : '';
                  setForm({ ...form, preferred_date: nextDate, preferred_time: keepTime });
                }}
                className="input-field"
                min={minBookingDate}
                max={maxBookingDate}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {selectedProductType === 'vehicle'
                  ? 'Vehicle bookings can be scheduled up to 1 month ahead.'
                  : 'Tools, parts, and other item bookings can be scheduled up to 3 months ahead.'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Store hours: {toTimeLabel(availability.store_open_time)} to {toTimeLabel(availability.store_close_time)} (lunch break {toTimeLabel(availability.lunch_start_time)} to {toTimeLabel(availability.lunch_end_time)}).
              </p>
              {form.preferred_date && availability.fully_booked_dates.includes(form.preferred_date) && (
                <p className="text-xs text-red-600 mt-1">This date is fully booked.</p>
              )}
              {form.preferred_date && isSelectedDateHoliday && (
                <p className="text-xs text-red-600 mt-1">This date is a holiday and cannot be booked.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preferred Time *</label>
              <select
                value={form.preferred_time}
                onChange={e => setForm({ ...form, preferred_time: e.target.value })}
                className="input-field"
                required
                disabled={isSelectedDateHoliday}
              >
                <option value="">Select time...</option>
                {availableTimeSlots.map((slot) => (
                  <option key={slot} value={slot}>{toTimeLabel(slot)}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Only available store-hour slots are shown. Lunch-time slots are excluded.</p>
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

      {/* Booking Calendar */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-navy-900">Booking Calendar</h3>
            <p className="text-sm text-gray-500">Select a date to view all appointments for that day.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-600"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
              aria-label="Previous month"
            >
              <FiChevronLeft size={16} />
            </button>
            <p className="min-w-[150px] text-center text-sm font-semibold text-navy-900">{monthLabel}</p>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
              aria-label="Next month"
            >
              <FiChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-500 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-20 rounded-lg bg-gray-50 border border-gray-100" />;

            const dateKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayBookings = bookingsByDate[dateKey] || [];
            const isSelected = selectedDate === dateKey;
            const isToday = dateKey === formatDateInput(new Date());
            const isFullyBooked = availability.fully_booked_dates.includes(dateKey);
            const isHoliday = availability.holidays.includes(dateKey);
            const isUnavailable = isFullyBooked || isHoliday;
            const dayCount = Number(availability.counts?.[dateKey] || 0);

            return (
              <button
                key={dateKey}
                type="button"
                disabled={isUnavailable}
                onClick={() => setSelectedDate(dateKey)}
                className={`h-20 rounded-lg border p-2 text-left transition-colors ${isSelected ? 'border-accent-500 bg-accent-50' : 'border-gray-200 hover:bg-gray-50'} ${isToday ? 'ring-1 ring-navy-300' : ''} ${isUnavailable ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed hover:bg-gray-200' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${isSelected ? 'text-accent-700' : 'text-gray-700'}`}>{day}</span>
                  {(dayBookings.length > 0 || dayCount > 0) && (
                    <span className="text-[10px] bg-navy-900 text-white px-1.5 py-0.5 rounded-full">
                      {Math.max(dayBookings.length, dayCount)}
                    </span>
                  )}
                </div>
                {isHoliday && (
                  <div className="mt-2">
                    <p className="text-[11px] text-gray-500 font-medium">Holiday</p>
                  </div>
                )}
                {isFullyBooked && !isHoliday && (
                  <div className="mt-2">
                    <p className="text-[11px] text-gray-500 font-medium">Fully booked</p>
                  </div>
                )}
                {!isUnavailable && dayBookings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {dayBookings.slice(0, 2).map((b) => (
                      <p key={b.id} className="text-[11px] truncate">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 mr-1 font-medium ${bookingTypeConfig[b.booking_type]?.chip || 'bg-gray-100 text-gray-700'}`}>
                          {bookingTypeConfig[b.booking_type]?.label || b.booking_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-gray-600">{b.preferred_time}</span>
                      </p>
                    ))}
                    {dayBookings.length > 2 && <p className="text-[11px] text-gray-500">+{dayBookings.length - 2} more</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <FiCalendar size={16} className="text-navy-700" />
            <h4 className="font-semibold text-navy-900">Appointments on {selectedDateLabel}</h4>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(bookingTypeConfig).map(([key, value]) => (
              <span key={key} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${value.chip}`}>
                {value.label}
              </span>
            ))}
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-200 text-gray-700">
              Fully booked day ({availability.daily_capacity}/day)
            </span>
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-700">
              Holiday (unavailable)
            </span>
          </div>

          {selectedDateBookings.length === 0 ? (
            <p className="text-sm text-gray-500">No appointments on this date.</p>
          ) : (
            <div className="space-y-2">
              {selectedDateBookings.map((booking) => {
                const sc = statusConfig[booking.status] || { color: 'badge-gray', label: booking.status };
                const typeMeta = bookingTypeConfig[booking.booking_type] || { label: booking.booking_type.replace(/_/g, ' '), chip: 'bg-gray-100 text-gray-700' };
                return (
                  <div key={`selected-${booking.id}`} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        <span>{booking.preferred_time}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeMeta.chip}`}>{typeMeta.label}</span>
                      </p>
                      <span className={`badge ${sc.color}`}>{sc.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{booking.product_name || 'No product selected'}</p>
                    {booking.notes && <p className="text-xs text-gray-500 mt-1">Note: {booking.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
                  <div>
                    <span className="text-gray-500">Date</span>
                    <p className="font-medium flex items-center gap-1"><FiCalendar size={14} /> {toDisplayDate(booking.preferred_date)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Time</span>
                    <p className="font-medium flex items-center gap-1"><FiClock size={14} /> {booking.preferred_time}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Method</span>
                    <p className="font-medium capitalize flex items-center gap-1">
                      {booking.delivery_method === 'delivery' ? <FiTruck size={14} /> : <FiMapPin size={14} />}
                      {booking.delivery_method}
                    </p>
                  </div>
                  {booking.notes && (
                    <div className="md:col-span-4">
                      <span className="text-gray-500">Notes</span>
                      <p className="font-medium">{booking.notes}</p>
                    </div>
                  )}
                  {isVehicle && booking.reservation_expires_at && !booking.reservation_fee_paid && ['pending', 'approved'].includes(booking.status) && (
                    <div className="md:col-span-4">
                      <ReservationCountdown expiresAt={booking.reservation_expires_at} />
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {booking.status === 'pending' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.updateBookingStatus(booking.id, { status: 'cancelled' });
                          toast.success('Booking cancelled');
                          fetchBookings();
                        } catch (err) {
                          toast.error(err.message);
                        }
                      }}
                      className="btn-secondary btn-sm flex items-center gap-1"
                    >
                      <FiXCircle size={14} /> Cancel Booking
                    </button>
                  )}

                  {booking.status === 'approved' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.confirmPickup(booking.id);
                          toast.success('Pickup confirmed');
                          fetchBookings();
                        } catch (err) {
                          toast.error(err.message);
                        }
                      }}
                      className="btn-secondary btn-sm flex items-center gap-1"
                    >
                      <FiCheckCircle size={14} /> Confirm Pickup
                    </button>
                  )}

                  {booking.status === 'approved' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.markNoShow(booking.id);
                          toast.success('Marked as no-show');
                          fetchBookings();
                        } catch (err) {
                          toast.error(err.message);
                        }
                      }}
                      className="btn-secondary btn-sm"
                    >
                      Mark No Show
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}