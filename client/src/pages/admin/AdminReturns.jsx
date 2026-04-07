import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiRotateCcw, FiCheck, FiX, FiSearch, FiPackage } from 'react-icons/fi';
import Pagination from '../../components/Pagination';

export default function AdminReturns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [adminNotes, setAdminNotes] = useState({});
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => { fetchReturns(); }, []);

  const fetchReturns = async () => {
    try { const d = await api.getAdminReturns(); setReturns(d); } catch {} finally { setLoading(false); }
  };

  const handleReturn = async (id, status) => {
    try {
      await api.handleAdminReturn(id, { status, admin_notes: adminNotes[id] || '' });
      toast.success(`Return request ${status}`);
      setAdminNotes(prev => ({ ...prev, [id]: '' }));
      fetchReturns();
    } catch (err) { toast.error(err.message); }
  };

  const processed = useMemo(() => {
    let list = [...returns];
    if (filter !== 'all') list = list.filter(r => r.status === filter);
    if (search) list = list.filter(r => `${r.first_name} ${r.last_name} ${r.order_number} ${r.product_name}`.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'created_at') { va = new Date(va); vb = new Date(vb); }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [returns, filter, search, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Return & Replacement Requests</h1>
        <span className="text-gray-500"><FiRotateCcw className="inline mr-1" />{returns.filter(r => r.status === 'pending').length} pending</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search returns..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="input-field pl-10" />
        </div>
        <select value={sortField} onChange={e => { setSortField(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="created_at">Sort by Date</option>
          <option value="type">Sort by Type</option>
          <option value="first_name">Sort by Customer</option>
          <option value="product_name">Sort by Product</option>
        </select>
        <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="btn-secondary btn-sm">{sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
      </div>

      <div className="flex gap-2 mb-6">
        {['all', 'pending', 'approved', 'rejected', 'completed'].map(f => (
          <button key={f} onClick={() => { setFilter(f); setCurrentPage(1); }} className={`btn-sm capitalize ${filter === f ? 'btn-primary' : 'btn-secondary'}`}>{f}</button>
        ))}
      </div>

      <div className="space-y-4">
        {paginated.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium">{r.first_name} {r.last_name}</span>
                  <span className={`badge ${r.type === 'return' ? 'badge-warning' : 'badge-info'}`}>{r.type === 'replacement' ? 'Replacement' : 'Return'}</span>
                  <span className={`badge ${r.status === 'pending' ? 'badge-warning' : r.status === 'approved' || r.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                </div>
                <p className="text-sm text-gray-500">Order: {r.order_number} • Product: {r.product_name} (x{r.quantity})</p>
              </div>
              <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>

            <p className="text-gray-700 mb-3"><strong>Reason:</strong> {r.reason}</p>

            {r.admin_notes && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <p className="text-xs text-gray-500 mb-1">Admin Notes:</p>
                <p className="text-sm">{r.admin_notes}</p>
              </div>
            )}

            {r.status === 'pending' && (
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <input type="text" value={adminNotes[r.id] || ''} onChange={e => setAdminNotes(prev => ({ ...prev, [r.id]: e.target.value }))} placeholder="Admin notes (optional)" className="input-field flex-1" />
                <button onClick={() => handleReturn(r.id, 'approved')} className="btn-success btn-sm flex items-center gap-1"><FiCheck size={14} /> Approve</button>
                <button onClick={() => handleReturn(r.id, 'rejected')} className="btn-danger btn-sm flex items-center gap-1"><FiX size={14} /> Reject</button>
              </div>
            )}

            {r.status === 'approved' && (
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <input type="text" value={adminNotes[r.id] || ''} onChange={e => setAdminNotes(prev => ({ ...prev, [r.id]: e.target.value }))} placeholder="Completion notes (optional)" className="input-field flex-1" />
                <button onClick={() => handleReturn(r.id, 'completed')} className="btn-primary btn-sm flex items-center gap-1"><FiPackage size={14} /> Mark Completed</button>
              </div>
            )}
          </div>
        ))}
        {paginated.length === 0 && <p className="text-center text-gray-400 py-10">No return requests found.</p>}
      </div>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
    </div>
  );
}
