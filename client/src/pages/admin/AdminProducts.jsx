import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiSearch, FiStar, FiUpload, FiX } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const EMPTY_VEHICLE_SPECS = {
  engine: '',
  power: '',
  transmission: '',
  gvw: '',
  fuel_type: '',
  drivetrain: '',
};

const EMPTY_PARTS_SPECS = {
  part_number: '',
  brand: '',
  compatibility: '',
  material: '',
  dimensions: '',
  warranty: '',
};

const EMPTY_TOOLS_SPECS = {
  brand: '',
  model: '',
  power_source: '',
  voltage: '',
  capacity: '',
  weight: '',
};

const parseVehicleSpecs = (specifications) => {
  if (!specifications) return { ...EMPTY_VEHICLE_SPECS };
  try {
    const parsed = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    return {
      engine: parsed.engine || '',
      power: parsed.power || '',
      transmission: parsed.transmission || '',
      gvw: parsed.gvw || '',
      fuel_type: parsed.fuel_type || '',
      drivetrain: parsed.drivetrain || '',
    };
  } catch {
    return { ...EMPTY_VEHICLE_SPECS };
  }
};

const parsePartsSpecs = (specifications) => {
  if (!specifications) return { ...EMPTY_PARTS_SPECS };
  try {
    const parsed = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    return {
      part_number: parsed.part_number || '',
      brand: parsed.brand || '',
      compatibility: parsed.compatibility || '',
      material: parsed.material || '',
      dimensions: parsed.dimensions || '',
      warranty: parsed.warranty || '',
    };
  } catch {
    return { ...EMPTY_PARTS_SPECS };
  }
};

const parseToolsSpecs = (specifications) => {
  if (!specifications) return { ...EMPTY_TOOLS_SPECS };
  try {
    const parsed = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    return {
      brand: parsed.brand || '',
      model: parsed.model || '',
      power_source: parsed.power_source || '',
      voltage: parsed.voltage || '',
      capacity: parsed.capacity || '',
      weight: parsed.weight || '',
    };
  } catch {
    return { ...EMPTY_TOOLS_SPECS };
  }
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '', type: 'general' });
  const [form, setForm] = useState({
    name: '', description: '', price: '', category_id: '', type: 'parts',
    stock_quantity: '', location: '', condition: 'good', image_url: '', specifications: '',
    is_popular: false, vehicle_category: ''
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [vehicleSpecs, setVehicleSpecs] = useState({ ...EMPTY_VEHICLE_SPECS });
  const [partsSpecs, setPartsSpecs] = useState({ ...EMPTY_PARTS_SPECS });
  const [toolsSpecs, setToolsSpecs] = useState({ ...EMPTY_TOOLS_SPECS });
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [stockDrafts, setStockDrafts] = useState({});
  const [savingStockId, setSavingStockId] = useState(null);

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
      setProducts(prods);
      setCategories(cats);
      setStockDrafts(Object.fromEntries(prods.map(product => [product.id, String(product.stock_quantity ?? 0)])));
    } catch {} finally { setLoading(false); }
  };

  const handleStockDraftChange = (productId, value) => {
    if (!/^\d*$/.test(value)) return;
    setStockDrafts(prev => ({ ...prev, [productId]: value }));
  };

  const saveInlineStock = async (product) => {
    const raw = stockDrafts[product.id];
    const nextStock = Number(raw === '' ? 0 : raw);
    const currentStock = Number(product.stock_quantity || 0);

    if (!Number.isFinite(nextStock) || nextStock < 0) {
      setStockDrafts(prev => ({ ...prev, [product.id]: String(currentStock) }));
      toast.error('Stock must be a non-negative number.');
      return;
    }

    if (nextStock === currentStock) return;

    setSavingStockId(product.id);
    try {
      const updated = await api.updateProduct(product.id, { stock_quantity: nextStock });
      setProducts(prev => prev.map(item => item.id === product.id ? { ...item, ...updated } : item));
      setStockDrafts(prev => ({ ...prev, [product.id]: String(updated.stock_quantity ?? nextStock) }));
    } catch (err) {
      setStockDrafts(prev => ({ ...prev, [product.id]: String(currentStock) }));
      toast.error(err.message);
    } finally {
      setSavingStockId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const selectedSpecs = form.type === 'vehicle'
        ? vehicleSpecs
        : form.type === 'parts'
          ? partsSpecs
          : toolsSpecs;

      const payloadSpecs = Object.fromEntries(
        Object.entries(selectedSpecs).filter(([, value]) => String(value || '').trim() !== '')
      );

      const data = {
        ...form,
        specifications: Object.keys(payloadSpecs).length ? JSON.stringify(payloadSpecs) : '',
        price: Number(form.price),
        stock_quantity: Number(form.stock_quantity),
        is_popular: !!form.is_popular,
      };
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
    setVehicleSpecs(parseVehicleSpecs(product.specifications));
    setPartsSpecs(parsePartsSpecs(product.specifications));
    setToolsSpecs(parseToolsSpecs(product.specifications));
    setForm({
      name: product.name, description: product.description || '', price: product.price, category_id: product.category_id || '',
      type: product.type, stock_quantity: product.stock_quantity, location: product.location || '',
      condition: product.condition, image_url: product.image_url || '', specifications: product.specifications || '',
      is_popular: product.is_popular || false, vehicle_category: product.vehicle_category || ''
    });
    setShowForm(true);
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const result = await api.uploadProductImage(file);
      setForm(prev => ({ ...prev, image_url: result.image_url || '' }));
      toast.success('Image uploaded successfully.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingImage(false);
      event.target.value = '';
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
    setForm({ name: '', description: '', price: '', category_id: '', type: 'parts', stock_quantity: '', location: '', condition: 'good', image_url: '', specifications: '', is_popular: false, vehicle_category: '' });
    setVehicleSpecs({ ...EMPTY_VEHICLE_SPECS });
    setPartsSpecs({ ...EMPTY_PARTS_SPECS });
    setToolsSpecs({ ...EMPTY_TOOLS_SPECS });
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
          <option value="vehicle">Vehicle</option><option value="parts">Parts</option><option value="tools">Tools</option>
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
              <select
                value={form.type}
                onChange={e => {
                  const nextType = e.target.value;
                  setForm({ ...form, type: nextType, vehicle_category: nextType === 'vehicle' ? form.vehicle_category : '', is_popular: nextType === 'vehicle' ? form.is_popular : false });
                  if (nextType !== 'vehicle') setVehicleSpecs({ ...EMPTY_VEHICLE_SPECS });
                  if (nextType !== 'parts') setPartsSpecs({ ...EMPTY_PARTS_SPECS });
                  if (nextType !== 'tools') setToolsSpecs({ ...EMPTY_TOOLS_SPECS });
                }}
                className="input-field"
              >
                <option value="vehicle">Vehicle</option><option value="parts">Parts</option><option value="tools">Tools</option>
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
                  <span className="text-xs text-gray-500">(Highlighted in listings)</span>
                </div>
              </>
            )}
            <div><label className="block text-sm font-medium mb-1">Stock Quantity</label><input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium mb-1">Location</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="input-field" placeholder="e.g., Shelf A-12" /></div>
            <div><label className="block text-sm font-medium mb-1">Condition</label>
              <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="input-field">
                <option value="new">New</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option>
              </select></div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Product Image</label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-secondary btn-sm flex items-center gap-2 cursor-pointer">
                  <FiUpload size={14} /> {uploadingImage ? 'Uploading...' : 'Upload Image'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
                {form.image_url && (
                  <button type="button" onClick={() => setForm({ ...form, image_url: '' })} className="btn-secondary btn-sm flex items-center gap-1">
                    <FiX size={14} /> Remove Image
                  </button>
                )}
              </div>
              {form.image_url && (
                <img src={form.image_url} alt="Product preview" className="mt-3 h-24 w-24 object-cover rounded-lg border border-gray-200" />
              )}
            </div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} /></div>
          {form.type === 'vehicle' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium mb-1">Engine</label><input value={vehicleSpecs.engine} onChange={e => setVehicleSpecs({ ...vehicleSpecs, engine: e.target.value })} className="input-field" placeholder="e.g. 9.7L WD615" /></div>
              <div><label className="block text-sm font-medium mb-1">Power</label><input value={vehicleSpecs.power} onChange={e => setVehicleSpecs({ ...vehicleSpecs, power: e.target.value })} className="input-field" placeholder="e.g. 371 HP" /></div>
              <div><label className="block text-sm font-medium mb-1">Transmission</label><input value={vehicleSpecs.transmission} onChange={e => setVehicleSpecs({ ...vehicleSpecs, transmission: e.target.value })} className="input-field" placeholder="e.g. 10-speed manual" /></div>
              <div><label className="block text-sm font-medium mb-1">GVW</label><input value={vehicleSpecs.gvw} onChange={e => setVehicleSpecs({ ...vehicleSpecs, gvw: e.target.value })} className="input-field" placeholder="e.g. 25,000 kg" /></div>
              <div><label className="block text-sm font-medium mb-1">Fuel Type</label><input value={vehicleSpecs.fuel_type} onChange={e => setVehicleSpecs({ ...vehicleSpecs, fuel_type: e.target.value })} className="input-field" placeholder="e.g. Diesel" /></div>
              <div><label className="block text-sm font-medium mb-1">Drivetrain</label><input value={vehicleSpecs.drivetrain} onChange={e => setVehicleSpecs({ ...vehicleSpecs, drivetrain: e.target.value })} className="input-field" placeholder="e.g. 6x4" /></div>
            </div>
          ) : form.type === 'parts' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium mb-1">Part Number</label><input value={partsSpecs.part_number} onChange={e => setPartsSpecs({ ...partsSpecs, part_number: e.target.value })} className="input-field" placeholder="e.g. CAT-WA150-FLTR-01" /></div>
              <div><label className="block text-sm font-medium mb-1">Brand</label><input value={partsSpecs.brand} onChange={e => setPartsSpecs({ ...partsSpecs, brand: e.target.value })} className="input-field" placeholder="e.g. Caterpillar" /></div>
              <div><label className="block text-sm font-medium mb-1">Compatibility</label><input value={partsSpecs.compatibility} onChange={e => setPartsSpecs({ ...partsSpecs, compatibility: e.target.value })} className="input-field" placeholder="e.g. WA150 / WA200" /></div>
              <div><label className="block text-sm font-medium mb-1">Material</label><input value={partsSpecs.material} onChange={e => setPartsSpecs({ ...partsSpecs, material: e.target.value })} className="input-field" placeholder="e.g. Steel Alloy" /></div>
              <div><label className="block text-sm font-medium mb-1">Dimensions</label><input value={partsSpecs.dimensions} onChange={e => setPartsSpecs({ ...partsSpecs, dimensions: e.target.value })} className="input-field" placeholder="e.g. 30 x 20 x 8 cm" /></div>
              <div><label className="block text-sm font-medium mb-1">Warranty</label><input value={partsSpecs.warranty} onChange={e => setPartsSpecs({ ...partsSpecs, warranty: e.target.value })} className="input-field" placeholder="e.g. 6 months" /></div>
            </div>
          ) : form.type === 'tools' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium mb-1">Brand</label><input value={toolsSpecs.brand} onChange={e => setToolsSpecs({ ...toolsSpecs, brand: e.target.value })} className="input-field" placeholder="e.g. Bosch" /></div>
              <div><label className="block text-sm font-medium mb-1">Model</label><input value={toolsSpecs.model} onChange={e => setToolsSpecs({ ...toolsSpecs, model: e.target.value })} className="input-field" placeholder="e.g. GSB 16 RE" /></div>
              <div><label className="block text-sm font-medium mb-1">Power Source</label><input value={toolsSpecs.power_source} onChange={e => setToolsSpecs({ ...toolsSpecs, power_source: e.target.value })} className="input-field" placeholder="e.g. Corded Electric" /></div>
              <div><label className="block text-sm font-medium mb-1">Voltage</label><input value={toolsSpecs.voltage} onChange={e => setToolsSpecs({ ...toolsSpecs, voltage: e.target.value })} className="input-field" placeholder="e.g. 220V" /></div>
              <div><label className="block text-sm font-medium mb-1">Capacity</label><input value={toolsSpecs.capacity} onChange={e => setToolsSpecs({ ...toolsSpecs, capacity: e.target.value })} className="input-field" placeholder="e.g. 13mm chuck" /></div>
              <div><label className="block text-sm font-medium mb-1">Weight</label><input value={toolsSpecs.weight} onChange={e => setToolsSpecs({ ...toolsSpecs, weight: e.target.value })} className="input-field" placeholder="e.g. 1.8 kg" /></div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No additional specification fields for this type.</div>
          )}
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
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={stockDrafts[p.id] ?? String(p.stock_quantity ?? 0)}
                        onChange={e => handleStockDraftChange(p.id, e.target.value)}
                        onBlur={() => saveInlineStock(p)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        disabled={savingStockId === p.id}
                        className="input-field h-8 w-20 text-center px-2"
                        aria-label={`Stock quantity for ${p.name}`}
                      />
                      {savingStockId === p.id && <span className="text-xs text-gray-500">Saving...</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.location || '-'}</td>
                  <td className="px-4 py-3">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(p)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit"><FiEdit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
      </div>
    </div>
  );
}
