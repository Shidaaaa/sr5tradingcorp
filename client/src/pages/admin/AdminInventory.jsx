import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiAlertTriangle, FiRefreshCw, FiList, FiPackage, FiSearch, FiEdit2, FiPlusCircle } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

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
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ stock_quantity: '', reorder_level: '', location: '', condition: 'good' });

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setCurrentPage(1);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { 
      const [inv, logData] = await Promise.all([api.getInventory(), api.getInventoryLog()]);
      setData(inv); setLogs(logData);
    } catch {} finally { setLoading(false); }
  };

  const getStockState = (product) => {
    const stock = Number(product?.stock_quantity || 0);
    const reorderLevel = Number(product?.reorder_level || 5);
    if (stock <= 0 || product?.status === 'sold_out') return 'out';
    if (stock <= reorderLevel) return 'low';
    return 'in';
  };

  const handleReorder = async (product) => {
    try {
      const result = await api.reorderProduct(product.id, { quantity: product.reorder_level });
      toast.success(`Restocked to ${result.new_quantity}!`);
      fetchData();
    } catch (err) { toast.error(err.message); }
  };

  const openAddStockModal = (product) => {
    setAdjustingProduct(product);
    setAddQuantity(Number(product.reorder_level || 1));
  };

  const submitAddStock = async () => {
    if (!adjustingProduct) return;
    const qty = Number(addQuantity);
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity to add.');
      return;
    }

    try {
      const newStock = Number(adjustingProduct.stock_quantity || 0) + qty;
      await api.updateProduct(adjustingProduct.id, { stock_quantity: newStock });
      toast.success(`${adjustingProduct.name} stock updated to ${newStock}.`);
      setAdjustingProduct(null);
      setAddQuantity(1);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to update stock.');
    }
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setEditForm({
      stock_quantity: Number(product.stock_quantity || 0),
      reorder_level: Number(product.reorder_level || 5),
      location: product.location || '',
      condition: product.condition || 'good',
    });
  };

  const submitEditProduct = async () => {
    if (!editingProduct) return;

    const stockQty = Number(editForm.stock_quantity);
    const reorderLevel = Number(editForm.reorder_level);

    if (Number.isNaN(stockQty) || stockQty < 0) {
      toast.error('Stock quantity must be 0 or higher.');
      return;
    }

    if (Number.isNaN(reorderLevel) || reorderLevel < 0) {
      toast.error('Reorder level must be 0 or higher.');
      return;
    }

    try {
      await api.updateProduct(editingProduct.id, {
        stock_quantity: stockQty,
        reorder_level: reorderLevel,
        location: editForm.location,
        condition: editForm.condition,
      });
      toast.success(`${editingProduct.name} updated.`);
      setEditingProduct(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to save product.');
    }
  };

  const displayProducts = tab === 'low' ? data.low_stock : tab === 'out' ? data.out_of_stock : data.products;

  const processed = useMemo(() => {
    let list = [...displayProducts];
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterType !== 'all') list = list.filter(p => p.type === filterType);
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [displayProducts, search, filterType, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Inventory Management</h1>
        <button onClick={() => setShowLog(!showLog)} className="btn-secondary btn-sm flex items-center gap-1"><FiList size={14} /> {showLog ? 'Hide' : 'Show'} Log</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button onClick={() => setTab('all')} className={`stat-card text-left ${tab === 'all' ? 'ring-2 ring-primary-500' : ''}`}>
          <FiPackage className="text-accent-500 mb-2" size={24} />
          <p className="text-2xl font-bold">{data.products.length}</p>
          <p className="text-sm text-gray-500">All Products</p>
        </button>
        <button onClick={() => setTab('low')} className={`stat-card text-left ${tab === 'low' ? 'ring-2 ring-amber-500' : ''}`}>
          <FiAlertTriangle className="text-amber-500 mb-2" size={24} />
          <p className="text-2xl font-bold text-amber-600">{data.low_stock.length}</p>
          <p className="text-sm text-gray-500">Low Stock</p>
        </button>
        <button onClick={() => setTab('out')} className={`stat-card text-left ${tab === 'out' ? 'ring-2 ring-red-500' : ''}`}>
          <FiAlertTriangle className="text-red-500 mb-2" size={24} />
          <p className="text-2xl font-bold text-red-600">{data.out_of_stock.length}</p>
          <p className="text-sm text-gray-500">Out of Stock</p>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search products..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="input-field pl-10" />
        </div>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="all">All Types</option>
          <option value="general">General</option><option value="vehicle">Vehicle</option><option value="parts">Parts</option><option value="tools">Tools</option>
        </select>
      </div>

      {/* Products Table */}
      <div className="table-container mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3"><SortHeader label="Product" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Stock" field="stock_quantity" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Reorder Level" field="reorder_level" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3"><SortHeader label="Times Sold" field="times_sold" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {paginated.map(p => (
                <tr key={p.id} className={`border-t border-gray-100 ${getStockState(p) === 'out' ? 'bg-red-50' : getStockState(p) === 'low' ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 capitalize">{p.type}</td>
                  <td className="px-4 py-3"><span className={`font-bold ${getStockState(p) === 'out' ? 'text-red-600' : getStockState(p) === 'low' ? 'text-amber-600' : 'text-green-600'}`}>{p.stock_quantity}</span></td>
                  <td className="px-4 py-3">{p.reorder_level}</td>
                  <td className="px-4 py-3">{p.location || '-'}</td>
                  <td className="px-4 py-3">{p.times_sold}</td>
                  <td className="px-4 py-3">
                    {getStockState(p) === 'out' ? <span className="badge badge-danger">Out of Stock</span> : 
                     getStockState(p) === 'low' ? <span className="badge badge-warning">Low Stock</span> :
                     <span className="badge badge-success">In Stock</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openEditModal(p)} className="btn-secondary btn-sm flex items-center gap-1"><FiEdit2 size={12} /> Edit</button>
                      <button onClick={() => openAddStockModal(p)} className="btn-primary btn-sm flex items-center gap-1"><FiPlusCircle size={12} /> Add Stock</button>
                      {p.type !== 'vehicle' && (
                        <button onClick={() => handleReorder(p)} className="btn-secondary btn-sm flex items-center gap-1"><FiRefreshCw size={12} /> Reorder</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
      </div>

      {/* Inventory Log */}
      {showLog && (
        <div>
          <h3 className="font-bold text-lg mb-3">Inventory Activity Log</h3>
          <div className="table-container">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">From → To</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Notes</th>
                </tr></thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">{log.product_name}</td>
                      <td className="px-4 py-3"><span className="badge badge-info capitalize">{log.change_type}</span></td>
                      <td className="px-4 py-3"><span className={log.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>{log.quantity_change > 0 ? '+' : ''}{log.quantity_change}</span></td>
                      <td className="px-4 py-3">{log.previous_quantity} → {log.new_quantity}</td>
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

      {/* Add Stock Modal */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAdjustingProduct(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-navy-900">Add Stock</h3>
            <p className="text-sm text-gray-500 mt-1">{adjustingProduct.name}</p>
            <div className="mt-4 space-y-3">
              <div className="text-sm text-gray-600">Current stock: <span className="font-semibold text-navy-900">{adjustingProduct.stock_quantity}</span></div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantity to add</label>
                <input type="number" min="1" value={addQuantity} onChange={(e) => setAddQuantity(e.target.value)} className="input-field" />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setAdjustingProduct(null)} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={submitAddStock} className="btn-primary flex-1">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingProduct(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-bold text-navy-900">Edit Inventory Item</h3>
            <p className="text-sm text-gray-500 mt-1">{editingProduct.name} ({editingProduct.type})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-sm font-medium mb-1">Stock Quantity</label>
                <input type="number" min="0" value={editForm.stock_quantity} onChange={(e) => setEditForm(prev => ({ ...prev, stock_quantity: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reorder Level</label>
                <input type="number" min="0" value={editForm.reorder_level} onChange={(e) => setEditForm(prev => ({ ...prev, reorder_level: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input value={editForm.location} onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Condition</label>
                <select value={editForm.condition} onChange={(e) => setEditForm(prev => ({ ...prev, condition: e.target.value }))} className="input-field">
                  <option value="new">New</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setEditingProduct(null)} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={submitEditProduct} className="btn-primary flex-1">Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
