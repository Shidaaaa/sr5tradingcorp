import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiRefreshCw, FiMapPin, FiTag, FiSearch, FiStar } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '', type: 'general' });
  const [form, setForm] = useState({
    name: '', description: '', price: '', category_id: '', type: 'general',
    stock_quantity: '', location: '', condition: 'good', image_url: '', specifications: '', reorder_level: '5',
    is_popular: false, vehicle_category: ''
  });
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [stockModalProduct, setStockModalProduct] = useState(null);
  const [stockAddQty, setStockAddQty] = useState(1);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setCurrentPage(1);
  };

  const processed = useMemo(() => {
    let list = [...products];
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterType !== 'all') list = list.filter(p => p.type === filterType);
    if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus);
    if (filterCategory !== 'all') list = list.filter(p => p.category_id === filterCategory);
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, search, filterType, filterStatus, filterCategory, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [prods, cats] = await Promise.all([api.getProducts(), api.getCategories()]);
      setProducts(prods); setCategories(cats);
    } catch {} finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, price: Number(form.price), stock_quantity: Number(form.stock_quantity), reorder_level: Number(form.reorder_level), is_popular: !!form.is_popular };
      if (editing) {
        await api.updateProduct(editing.id, data);
        toast.success('Product updated!');
      } else {
        await api.createProduct(data);
        toast.success('Product created!');
      }
      resetForm(); fetchAll();
    } catch (err) { toast.error(err.message); }
  };

  const handleEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name, description: product.description || '', price: product.price, category_id: product.category_id || '',
      type: product.type, stock_quantity: product.stock_quantity, location: product.location || '',
      condition: product.condition, image_url: product.image_url || '', specifications: product.specifications || '', reorder_level: product.reorder_level,
      is_popular: product.is_popular || false, vehicle_category: product.vehicle_category || ''
    });
    setShowForm(true);
  };

  const handleReorder = async (product) => {
    try {
      const data = await api.reorderProduct(product.id, { quantity: product.reorder_level });
      toast.success(`Restocked! New quantity: ${data.new_quantity}`);
      fetchAll();
    } catch (err) { toast.error(err.message); }
  };

  const openStockModal = (product) => {
    setStockModalProduct(product);
    setStockAddQty(Number(product.reorder_level || 1));
  };

  const handleAddStock = async () => {
    if (!stockModalProduct) return;
    const qty = Number(stockAddQty);
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity to add.');
      return;
    }

    try {
      const newStock = Number(stockModalProduct.stock_quantity || 0) + qty;
      await api.updateProduct(stockModalProduct.id, { stock_quantity: newStock });
      toast.success(`Stock updated: ${newStock}`);
      setStockModalProduct(null);
      setStockAddQty(1);
      fetchAll();
    } catch (err) {
      toast.error(err.message || 'Failed to add stock.');
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await api.createCategory(catForm);
      toast.success('Category created!');
      setShowCatForm(false); setCatForm({ name: '', description: '', type: 'general' });
      fetchAll();
    } catch (err) { toast.error(err.message); }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', price: '', category_id: '', type: 'general', stock_quantity: '', location: '', condition: 'good', image_url: '', specifications: '', reorder_level: '5', is_popular: false, vehicle_category: '' });
    setEditing(null); setShowForm(false);
  };

  const statusBadge = (s) => {
    if (s === 'available') return <span className="badge badge-success">Available</span>;
    if (s === 'sold_out') return <span className="badge badge-danger">Sold Out</span>;
    return <span className="badge badge-warning">{s}</span>;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Products Management</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCatForm(true)} className="btn-secondary btn-sm">+ Category</button>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary btn-sm flex items-center gap-1"><FiPlus /> Add Product</button>
        </div>
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
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="all">All Status</option>
          <option value="available">Available</option><option value="sold_out">Sold Out</option><option value="reserved">Reserved</option>
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Category Form Modal */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCatForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleCreateCategory} className="bg-white rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold">New Category</h3>
            <div><label className="block text-sm font-medium mb-1">Name</label><input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">Description</label><input value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">Type</label>
              <select value={catForm.type} onChange={e => setCatForm({ ...catForm, type: e.target.value })} className="input-field">
                <option value="general">General</option><option value="vehicle">Vehicle</option><option value="parts">Parts</option><option value="tools">Tools</option>
              </select>
            </div>
            <div className="flex gap-3"><button type="button" onClick={() => setShowCatForm(false)} className="btn-secondary flex-1">Cancel</button><button type="submit" className="btn-primary flex-1">Create</button></div>
          </form>
        </div>
      )}

      {/* Product Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4">
          <h3 className="text-lg font-bold">{editing ? 'Edit Product' : 'Add New Product'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium mb-1">Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">Price (PHP) *</label><input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium mb-1">Category</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="input-field">
                <option value="">None</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="general">General</option><option value="vehicle">Vehicle</option><option value="parts">Parts</option><option value="tools">Tools</option>
              </select></div>
            {form.type === 'vehicle' && (
              <>
                <div><label className="block text-sm font-medium mb-1">Vehicle Category</label>
                  <select value={form.vehicle_category} onChange={e => setForm({ ...form, vehicle_category: e.target.value })} className="input-field">
                    <option value="">None</option>
                    <option value="trucks">Trucks</option>
                    <option value="tractors">Tractors</option>
                    <option value="vans">Vans</option>
                    <option value="other_units">Other Units</option>
                  </select></div>
                <div className="flex items-center gap-3 pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_popular} onChange={e => setForm({ ...form, is_popular: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                    <span className="font-medium text-sm flex items-center gap-1"><FiStar size={14} className="text-amber-500" /> Popular Vehicle</span>
                  </label>
                  <span className="text-xs text-gray-500">(Popular = 5% fee, 14-day hold)</span>
                </div>
              </>
            )}
            <div><label className="block text-sm font-medium mb-1">Stock Quantity</label><input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">Location</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="input-field" placeholder="e.g., Shelf A-12" /></div>
            <div><label className="block text-sm font-medium mb-1">Condition</label>
              <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="input-field">
                <option value="new">New</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option>
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Reorder Level</label><input type="number" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">Image URL</label><input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} /></div>
          <div><label className="block text-sm font-medium mb-1">Specifications (JSON)</label><textarea value={form.specifications} onChange={e => setForm({ ...form, specifications: e.target.value })} className="input-field font-mono text-sm" rows={2} placeholder='{"key": "value"}' /></div>
          <div className="flex gap-3">
            <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update Product' : 'Create Product'}</button>
          </div>
        </form>
      )}

      {/* Products Table */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3"><SortHeader label="Product" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3"><SortHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Price" field="price" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Stock" field="stock_quantity" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3"><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {paginated.map(p => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium flex items-center gap-1">
                      {p.name}
                      {p.is_popular && <FiStar size={12} className="text-amber-500" title="Popular" />}
                    </p>
                    {p.description && <p className="text-xs text-gray-500 line-clamp-1">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.category_name || '-'}</td>
                  <td className="px-4 py-3"><span className="badge badge-info capitalize">{p.type}</span></td>
                  <td className="px-4 py-3 font-medium">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3">
                    <span className={p.stock_quantity <= p.reorder_level ? 'text-red-600 font-bold' : ''}>{p.stock_quantity}</span>
                    {p.stock_quantity <= p.reorder_level && p.stock_quantity > 0 && <span className="text-xs text-red-500 block">Low stock</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.location || '-'}</td>
                  <td className="px-4 py-3">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openStockModal(p)} className="p-1.5 hover:bg-green-50 text-green-700 rounded" title="Add Stock"><FiPlus size={14} /></button>
                      <button onClick={() => handleEdit(p)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit"><FiEdit2 size={14} /></button>
                      {p.type !== 'vehicle' && <button onClick={() => handleReorder(p)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" title="Reorder"><FiRefreshCw size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
      </div>

      {stockModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setStockModalProduct(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold">Add Stock</h3>
            <p className="text-sm text-gray-500 mt-1">{stockModalProduct.name}</p>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">Current: <span className="font-semibold text-navy-900">{stockModalProduct.stock_quantity}</span></p>
              <div>
                <label className="block text-sm font-medium mb-1">Quantity to add</label>
                <input type="number" min="1" value={stockAddQty} onChange={e => setStockAddQty(e.target.value)} className="input-field" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setStockModalProduct(null)} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={handleAddStock} className="btn-primary flex-1">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
