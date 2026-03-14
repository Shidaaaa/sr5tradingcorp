import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiAlertTriangle, FiList, FiPackage, FiSearch } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

export default function AdminInventory() {
  const [data, setData] = useState({ products: [], low_stock: [], out_of_stock: [] });
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [inv, logData] = await Promise.all([
        api.getInventory(),
        api.getInventoryLog(),
      ]);
      setData(inv);
      setLogs(logData);
    } catch {
      toast.error('Failed to load inventory data.');
    } finally {
      setLoading(false);
    }
  };

  const isOutOfStock = (product) => product.stock_quantity <= 0 || product.status === 'sold_out';
  const isLowStock = (product) => {
    const reorderLevel = Number(product.reorder_level || 5);
    return !isOutOfStock(product) && product.stock_quantity <= reorderLevel;
  };

  const lowStockProducts = data.products.filter(isLowStock);
  const outOfStockProducts = data.products.filter(isOutOfStock);
  const displayProducts = tab === 'low' ? lowStockProducts : tab === 'out' ? outOfStockProducts : data.products;

  const processed = useMemo(() => {
    let list = [...displayProducts];
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterType !== 'all') list = list.filter((p) => p.type === filterType);
    list.sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = (vb || '').toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [displayProducts, search, filterType, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Inventory Management</h1>
        <button onClick={() => setShowLog(!showLog)} className="btn-secondary btn-sm flex items-center gap-1">
          <FiList size={14} /> {showLog ? 'Hide' : 'Show'} Log
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <button onClick={() => setTab('all')} className={`stat-card text-left ${tab === 'all' ? 'ring-2 ring-primary-500' : ''}`}>
          <FiPackage className="text-accent-500 mb-2" size={24} />
          <p className="text-2xl font-bold">{data.products.length}</p>
          <p className="text-sm text-gray-500">All Products</p>
        </button>
        <button onClick={() => setTab('low')} className={`stat-card text-left ${tab === 'low' ? 'ring-2 ring-amber-500' : ''}`}>
          <FiAlertTriangle className="text-amber-500 mb-2" size={24} />
          <p className="text-2xl font-bold text-amber-600">{lowStockProducts.length}</p>
          <p className="text-sm text-gray-500">Low Stock</p>
        </button>
        <button onClick={() => setTab('out')} className={`stat-card text-left ${tab === 'out' ? 'ring-2 ring-red-500' : ''}`}>
          <FiAlertTriangle className="text-red-500 mb-2" size={24} />
          <p className="text-2xl font-bold text-red-600">{outOfStockProducts.length}</p>
          <p className="text-sm text-gray-500">Out of Stock</p>
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="input-field pl-10"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setCurrentPage(1);
          }}
          className="input-field w-auto"
        >
          <option value="all">All Types</option>
          <option value="vehicle">Vehicle</option>
          <option value="parts">Parts</option>
          <option value="tools">Tools</option>
        </select>
      </div>

      <div className="table-container mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3"><SortHeader label="Product" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="Stock" field="stock_quantity" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="Reorder Level" field="reorder_level" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3"><SortHeader label="Times Sold" field="times_sold" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr key={p.id} className={`border-t border-gray-100 ${p.stock_quantity <= 0 ? 'bg-red-50' : p.stock_quantity <= p.reorder_level ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 capitalize">{p.type}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${p.stock_quantity <= 0 ? 'text-red-600' : p.stock_quantity <= p.reorder_level ? 'text-amber-600' : 'text-green-600'}`}>{p.stock_quantity}</span>
                  </td>
                  <td className="px-4 py-3">{p.reorder_level}</td>
                  <td className="px-4 py-3">{p.location || '-'}</td>
                  <td className="px-4 py-3">{p.times_sold}</td>
                  <td className="px-4 py-3">
                    {p.stock_quantity <= 0 ? <span className="badge badge-danger">Sold Out</span> : p.stock_quantity <= p.reorder_level ? <span className="badge badge-warning">Low Stock</span> : <span className="badge badge-success">In Stock</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={processed.length}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={(v) => {
            setItemsPerPage(v);
            setCurrentPage(1);
          }}
        />
      </div>

      {showLog && (
        <div>
          <h3 className="font-bold text-lg mb-3">Inventory Activity Log</h3>
          <div className="table-container">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Change</th>
                    <th className="px-4 py-3">From to</th>
                    <th className="px-4 py-3">By</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">{log.product_name}</td>
                      <td className="px-4 py-3"><span className="badge badge-info capitalize">{log.change_type}</span></td>
                      <td className="px-4 py-3"><span className={log.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>{log.quantity_change > 0 ? '+' : ''}{log.quantity_change}</span></td>
                      <td className="px-4 py-3">{log.previous_quantity} to {log.new_quantity}</td>
                      <td className="px-4 py-3">{log.first_name || 'System'}</td>
                      <td className="px-4 py-3 text-gray-500">{log.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
