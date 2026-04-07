import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiEye, FiUserX, FiTruck, FiSearch, FiStar, FiCreditCard, FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';
import ReservationCountdown from '../../components/ReservationCountdown';

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

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(formatDateInput(new Date()));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('preferred_date');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'preferred_date' ? 'desc' : 'asc'); }
    setCurrentPage(1);
  };

  useEffect(() => { fetchBookings(); }, []);

  useEffect(() => {
    if (!selectedBooking) return;
    const refreshed = bookings.find(b => String(b.id) === String(selectedBooking.id));
    setSelectedBooking(refreshed || null);
  }, [bookings]);

  const fetchBookings = async () => {
    try { setBookings(await api.getAdminBookings()); } catch {} finally { setLoading(false); }
  };

  const updateStatus = async (id, status, notes) => {
    try {
      await api.updateAdminBookingStatus(id, { status, admin_notes: notes });
      toast.success(`Booking ${status}`);
      fetchBookings();
    } catch (err) { toast.error(err.message); }
  };

  const confirmPickup = async (id) => {
    try { await api.updateAdminBookingStatus(id, { pickup_confirmed: true }); toast.success('Pickup confirmed'); fetchBookings(); } catch (err) { toast.error(err.message); }
  };

  const markNoShow = async (id) => {
    try { await api.updateAdminBookingStatus(id, { status: 'no_show' }); toast.success('Marked as no-show'); fetchBookings(); } catch (err) { toast.error(err.message); }
  };

  const processed = useMemo(() => {
    let list = [...bookings];
    if (filter !== 'all') list = list.filter(b => b.status === filter);
    if (search) list = list.filter(b => `${b.booking_number} ${b.first_name} ${b.last_name} ${b.email} ${b.product_name || ''}`.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [bookings, filter, search, sortField, sortDir]);

  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

  const calendarCells = [
    ...Array.from({ length: monthOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedDateBookings = (bookingsByDate[calendarSelectedDate] || [])
    .slice()
    .sort((a, b) => String(a.preferred_time).localeCompare(String(b.preferred_time)));

  const jumpToToday = () => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setCalendarSelectedDate(formatDateInput(today));
  };

  const openBookingDetails = (booking) => {
    setSelectedBooking(booking);
  };

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Bookings Management</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search bookings..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="input-field pl-10" />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="all">All Bookings</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="card p-6 mb-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-lg font-bold text-navy-900">Customer Appointments Calendar</h3>
            <p className="text-sm text-gray-500">Shows all customer bookings by date.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={jumpToToday} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-600">Today</button>
            <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" aria-label="Previous month"><FiChevronLeft size={16} /></button>
            <p className="min-w-[150px] text-center text-sm font-semibold text-navy-900">{monthLabel}</p>
            <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" aria-label="Next month"><FiChevronRight size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-500 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((day, idx) => {
            if (!day) return <div key={`admin-empty-${idx}`} className="h-24 rounded-lg bg-gray-50 border border-gray-100" />;
            const dateKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayBookings = bookingsByDate[dateKey] || [];
            const isSelected = calendarSelectedDate === dateKey;
            const isToday = dateKey === formatDateInput(new Date());

            return (
              <div
                key={dateKey}
                role="button"
                tabIndex={0}
                onClick={() => setCalendarSelectedDate(dateKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCalendarSelectedDate(dateKey);
                  }
                }}
                className={`h-24 rounded-lg border p-2 text-left transition-colors cursor-pointer ${isSelected ? 'border-accent-500 bg-accent-50' : 'border-gray-200 hover:bg-gray-50'} ${isToday ? 'ring-1 ring-navy-300' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${isSelected ? 'text-accent-700' : 'text-gray-700'}`}>{day}</span>
                  {dayBookings.length > 0 && <span className="text-[10px] bg-navy-900 text-white px-1.5 py-0.5 rounded-full">{dayBookings.length}</span>}
                </div>
                {dayBookings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {dayBookings.slice(0, 2).map((b) => (
                      <button
                        key={`admin-day-${b.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openBookingDetails(b);
                        }}
                        className="text-[11px] truncate w-full text-left hover:opacity-90"
                        title="Open booking details"
                      >
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 mr-1 font-medium ${bookingTypeConfig[b.booking_type]?.chip || 'bg-gray-100 text-gray-700'}`}>
                          {bookingTypeConfig[b.booking_type]?.label || b.booking_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-gray-600">{b.preferred_time}</span>
                      </button>
                    ))}
                    {dayBookings.length > 2 && <p className="text-[11px] text-gray-500">+{dayBookings.length - 2} more</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <FiCalendar size={16} className="text-navy-700" />
            <h4 className="font-semibold text-navy-900">All Appointments on {toDisplayDate(calendarSelectedDate)}</h4>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(bookingTypeConfig).map(([key, value]) => (
              <span key={key} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${value.chip}`}>{value.label}</span>
            ))}
          </div>
          {selectedDateBookings.length === 0 ? (
            <p className="text-sm text-gray-500">No customer appointments on this date.</p>
          ) : (
            <div className="space-y-2">
              {selectedDateBookings.map((booking) => {
                const sc = statusConfig[booking.status] || { color: 'badge-gray', label: booking.status };
                const typeMeta = bookingTypeConfig[booking.booking_type] || { label: booking.booking_type.replace(/_/g, ' '), chip: 'bg-gray-100 text-gray-700' };
                return (
                  <div key={`admin-selected-${booking.id}`} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        <span>{booking.preferred_time}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeMeta.chip}`}>{typeMeta.label}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${sc.color}`}>{sc.label}</span>
                        <button
                          type="button"
                          onClick={() => openBookingDetails(booking)}
                          className="p-1.5 rounded-md border border-gray-200 hover:bg-white text-gray-600"
                          title="Open booking details"
                        >
                          <FiEye size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{booking.first_name} {booking.last_name} • {booking.product_name || 'No product selected'}</p>
                    {booking.notes && <p className="text-xs text-gray-500 mt-1">Note: {booking.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedBooking(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Booking Details</p>
                <h3 className="text-lg font-bold text-navy-900">{selectedBooking.booking_number}</h3>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="p-2 text-gray-500 hover:text-gray-700" aria-label="Close modal">
                <FiX size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${statusConfig[selectedBooking.status]?.color || 'badge-gray'}`}>{statusConfig[selectedBooking.status]?.label || selectedBooking.status}</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${bookingTypeConfig[selectedBooking.booking_type]?.chip || 'bg-gray-100 text-gray-700'}`}>
                  {bookingTypeConfig[selectedBooking.booking_type]?.label || selectedBooking.booking_type?.replace(/_/g, ' ')}
                </span>
                {selectedBooking.pickup_confirmed && <span className="badge badge-success">Picked up</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-500">Customer</p><p className="font-medium text-gray-900">{selectedBooking.first_name} {selectedBooking.last_name}</p></div>
                <div><p className="text-gray-500">Contact</p><p className="font-medium text-gray-900">{selectedBooking.email || 'N/A'}{selectedBooking.phone ? ` • ${selectedBooking.phone}` : ''}</p></div>
                <div><p className="text-gray-500">Product</p><p className="font-medium text-gray-900">{selectedBooking.product_name || 'No product selected'}</p></div>
                <div><p className="text-gray-500">Receive Method</p><p className="font-medium text-gray-900 capitalize">{selectedBooking.delivery_method || 'pickup'}</p></div>
                <div><p className="text-gray-500">Date</p><p className="font-medium text-gray-900">{toDisplayDate(selectedBooking.preferred_date)}</p></div>
                <div><p className="text-gray-500">Time</p><p className="font-medium text-gray-900">{selectedBooking.preferred_time}{selectedBooking.end_time ? ` - ${selectedBooking.end_time}` : ''}</p></div>
                <div><p className="text-gray-500">Reservation Fee</p><p className="font-medium text-gray-900">{selectedBooking.reservation_fee > 0 ? formatPrice(selectedBooking.reservation_fee) : '-'}</p></div>
                <div><p className="text-gray-500">Fee Status</p><p className="font-medium text-gray-900">{selectedBooking.reservation_fee > 0 ? (selectedBooking.reservation_fee_paid ? 'Paid' : 'Unpaid') : '-'}</p></div>
              </div>

              {selectedBooking.notes && (
                <div>
                  <p className="text-gray-500 text-sm">Notes</p>
                  <p className="text-sm text-gray-700 mt-1">{selectedBooking.notes}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {selectedBooking.status === 'pending' && (
                  <>
                    <button
                      onClick={async () => { await updateStatus(selectedBooking.id, 'approved'); setSelectedBooking(null); }}
                      className="btn-primary btn-sm flex items-center gap-1"
                    >
                      <FiCheck size={14} /> Approve
                    </button>
                    <button
                      onClick={async () => { await updateStatus(selectedBooking.id, 'rejected'); setSelectedBooking(null); }}
                      className="btn-secondary btn-sm flex items-center gap-1"
                    >
                      <FiX size={14} /> Reject
                    </button>
                  </>
                )}

                {selectedBooking.status === 'approved' && (
                  <>
                    <button
                      onClick={async () => { await confirmPickup(selectedBooking.id); setSelectedBooking(null); }}
                      className="btn-primary btn-sm flex items-center gap-1"
                    >
                      <FiTruck size={14} /> Confirm Pickup
                    </button>
                    <button
                      onClick={async () => { await markNoShow(selectedBooking.id); setSelectedBooking(null); }}
                      className="btn-secondary btn-sm flex items-center gap-1"
                    >
                      <FiUserX size={14} /> Mark No Show
                    </button>
                  </>
                )}

                <button onClick={() => setSelectedBooking(null)} className="btn-secondary btn-sm ml-auto">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3"><SortHeader label="Booking #" field="booking_number" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Customer" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Type" field="booking_type" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3"><SortHeader label="Date" field="preferred_date" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Receive</th>
              <th className="px-4 py-3 font-medium">Reservation Fee</th>
              <th className="px-4 py-3 font-medium">Re-listed In</th>
              <th className="px-4 py-3"><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {paginated.map(b => {
                const sc = statusConfig[b.status] || { color: 'badge-gray', label: b.status };
                return (
                  <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-accent-600">{b.booking_number}</td>
                    <td className="px-4 py-3">{b.first_name} {b.last_name}<br /><span className="text-xs text-gray-500">{b.email} | {b.phone || 'N/A'}</span></td>
                    <td className="px-4 py-3"><span className="badge badge-info capitalize">{b.booking_type.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3">{b.product_name || '-'}</td>
                    <td className="px-4 py-3">{toDisplayDate(b.preferred_date)}</td>
                    <td className="px-4 py-3">{b.preferred_time} - {b.end_time}</td>
                    <td className="px-4 py-3 capitalize">{b.delivery_method}</td>
                    <td className="px-4 py-3">
                      {b.reservation_fee > 0 ? (
                        <div>
                          <div className="flex items-center gap-1">
                            {b.product_is_popular && <FiStar size={11} className="text-amber-500" />}
                            <span className="font-medium text-accent-700">{formatPrice(b.reservation_fee)}</span>
                          </div>
                          {b.reservation_fee_paid
                            ? <span className="text-xs text-green-600 flex items-center gap-0.5 mt-0.5"><FiCreditCard size={10} /> Paid</span>
                            : <span className="text-xs text-red-500 mt-0.5">Unpaid</span>
                          }
                        </div>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {b.reservation_expires_at && ['pending','approved'].includes(b.status)
                        ? <ReservationCountdown expiresAt={b.reservation_expires_at} compact />
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${sc.color}`}>{sc.label}</span>
                      {b.pickup_confirmed && <p className="text-xs text-green-600 mt-1">✓ Picked up</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openBookingDetails(b)} className="p-1.5 hover:bg-gray-100 text-gray-600 rounded" title="View details"><FiEye size={14} /></button>
                        {b.status === 'pending' && (
                          <>
                            <button onClick={() => updateStatus(b.id, 'approved')} className="p-1.5 hover:bg-green-50 text-green-600 rounded" title="Approve"><FiCheck size={14} /></button>
                            <button onClick={() => updateStatus(b.id, 'rejected')} className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Reject"><FiX size={14} /></button>
                          </>
                        )}
                        {b.status === 'approved' && (
                          <>
                            <button onClick={() => confirmPickup(b.id)} className="p-1.5 hover:bg-green-50 text-green-600 rounded" title="Confirm Pickup"><FiTruck size={14} /></button>
                            <button onClick={() => markNoShow(b.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="No Show"><FiUserX size={14} /></button>
                          </>
                        )}
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

      {processed.filter(b => b.status === 'no_show').length > 0 && (
        <div className="mt-6">
          <h3 className="font-bold text-lg text-red-600 mb-3">No-Show Clients</h3>
          <div className="space-y-2">
            {processed.filter(b => b.status === 'no_show').map(b => (
              <div key={b.id} className="card p-3 border-l-4 border-red-500 flex justify-between items-center">
                <div>
                  <p className="font-medium">{b.first_name} {b.last_name} - {b.booking_type.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-gray-500">{toDisplayDate(b.preferred_date)} at {b.preferred_time}</p>
                </div>
                <span className="badge badge-danger">No Show</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
