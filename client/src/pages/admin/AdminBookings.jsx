import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiEye, FiUserX, FiTruck, FiSearch } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  approved: { color: 'badge-success', label: 'Approved' },
  rejected: { color: 'badge-danger', label: 'Rejected' },
  completed: { color: 'badge-success', label: 'Completed' },
  no_show: { color: 'badge-danger', label: 'No Show' },
  cancelled: { color: 'badge-gray', label: 'Cancelled' },
};

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
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
                    <td className="px-4 py-3">{b.preferred_date}</td>
                    <td className="px-4 py-3">{b.preferred_time} - {b.end_time}</td>
                    <td className="px-4 py-3 capitalize">{b.delivery_method}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${sc.color}`}>{sc.label}</span>
                      {b.pickup_confirmed && <p className="text-xs text-green-600 mt-1">✓ Picked up</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
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
                  <p className="text-sm text-gray-500">{b.preferred_date} at {b.preferred_time}</p>
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
