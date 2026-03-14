import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { FiSearch, FiUsers, FiMail, FiPhone } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'created_at' ? 'desc' : 'asc'); }
    setCurrentPage(1);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try { const d = await api.getCustomers(); setCustomers(d); } catch {} finally { setLoading(false); }
  };

  const processed = useMemo(() => {
    let list = [...customers];
    if (search) list = list.filter(c => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'created_at') { va = new Date(va); vb = new Date(vb); }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [customers, search, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Customers</h1>
        <div className="flex items-center gap-2 text-gray-500"><FiUsers /><span>{customers.length} total</span></div>
      </div>

      <div className="relative mb-6">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="input-field pl-10" />
      </div>

      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3"><SortHeader label="Name" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3"><SortHeader label="Orders" field="order_count" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Total Spent" field="total_spent" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Joined" field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
            </tr></thead>
            <tbody>
              {paginated.map((c, i) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{(currentPage - 1) * itemsPerPage + i + 1}</td>
                  <td className="px-4 py-3 font-medium">{c.first_name} {c.last_name}</td>
                  <td className="px-4 py-3"><a href={`mailto:${c.email}`} className="text-accent-600 hover:underline flex items-center gap-1"><FiMail size={14} />{c.email}</a></td>
                  <td className="px-4 py-3">{c.phone ? <span className="flex items-center gap-1"><FiPhone size={14} />{c.phone}</span> : <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{c.address || '-'}</td>
                  <td className="px-4 py-3"><span className="badge badge-info">{c.order_count}</span></td>
                  <td className="px-4 py-3 font-medium text-green-600">{formatPrice(c.total_spent || 0)}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {paginated.length === 0 && <tr><td colSpan="8" className="px-4 py-10 text-center text-gray-400">No customers found.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
      </div>
    </div>
  );
}
