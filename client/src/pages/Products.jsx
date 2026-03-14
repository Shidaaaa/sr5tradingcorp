import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { FiSearch, FiShoppingCart, FiMapPin, FiTag, FiFilter, FiGrid, FiList, FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const PAGE_TITLES = {
  vehicle: 'Vehicles',
  trucks: 'Trucks',
  tractors: 'Tractors',
  vans: 'Vans',
  'other-units': 'Other Units',
};

const FALLBACK_IMAGES = {
  truck: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1200&q=80',
  tractor: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1200&q=80',
  van: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1200&q=80',
  vehicle: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80',
  parts: 'https://images.unsplash.com/photo-1635764706136-18f6be2d0f5b?auto=format&fit=crop&w=1200&q=80',
  tools: 'https://images.unsplash.com/photo-1581147036324-c47a03a81d48?auto=format&fit=crop&w=1200&q=80',
};

const pickFallbackImage = (product) => {
  const name = (product?.name || '').toLowerCase();
  const vehicleCategory = (product?.vehicle_category || '').toLowerCase();
  const type = (product?.type || '').toLowerCase();

  if (vehicleCategory.includes('truck') || name.includes('truck')) return FALLBACK_IMAGES.truck;
  if (vehicleCategory.includes('tractor') || name.includes('tractor')) return FALLBACK_IMAGES.tractor;
  if (vehicleCategory.includes('van') || name.includes('van')) return FALLBACK_IMAGES.van;
  if (type === 'vehicle') return FALLBACK_IMAGES.vehicle;
  if (type === 'tools') return FALLBACK_IMAGES.tools;
  return FALLBACK_IMAGES.parts;
};

export default function Products({ filterType, browseCategory }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [showFilters, setShowFilters] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || '',
    sort: searchParams.get('sort') || '',
    type: filterType || searchParams.get('type') || '',
  });

  const pageTitle = browseCategory ? PAGE_TITLES[browseCategory] || browseCategory : filterType === 'vehicle' ? 'Vehicles' : 'All Products';
  const pageDesc = browseCategory ? `Discover our range of ${pageTitle.toLowerCase()} products` : filterType === 'vehicle' ? 'Browse our quality imported vehicles' : 'Browse our wide selection of products';

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [filters, filterType, browseCategory]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.sort) params.set('sort', filters.sort);
      if (filterType) params.set('type', filterType);
      else if (filters.type) params.set('type', filters.type);
      if (browseCategory) {
        params.set('type', 'vehicle');
        params.set('vehicle_category', browseCategory.replace('-', '_'));
      }
      const data = await api.getProducts(params.toString());
      setProducts(data);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try { const data = await api.getCategories(); setCategories(data); } catch {}
  };

  const handleAddToCart = async (e, productId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast.error('Please login to add items to cart'); return; }
    try { await addToCart(productId); toast.success('Added to cart!'); } catch (err) { toast.error(err.message); }
  };

  const sortLabels = { '': 'Most Relevant', price_asc: 'Price: Low to High', price_desc: 'Price: High to Low', name: 'Name A-Z' };

  const resolveImageSrc = (imageUrl) => {
    if (!imageUrl) return '';
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    return imageUrl;
  };

  return (
    <div>
      {/* Page Header */}
      <section className="bg-navy-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white">{pageTitle}</h1>
          <p className="text-gray-400 mt-2">{pageDesc}</p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="font-medium">{products.length} products found</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value })}
                className="input-field pl-9 py-2 w-48 md:w-64 text-sm"
              />
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button onClick={() => setSortOpen(!sortOpen)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                {sortLabels[filters.sort] || 'Most Relevant'} <FiChevronDown size={14} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-30 animate-slide-down">
                  {Object.entries(sortLabels).map(([val, label]) => (
                    <button key={val} onClick={() => { setFilters({ ...filters, sort: val }); setSortOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${filters.sort === val ? 'text-primary-600 font-medium' : 'text-gray-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter toggle */}
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${showFilters ? 'bg-navy-900 text-white border-navy-900' : 'border-gray-300 hover:bg-gray-50'}`}>
              <FiFilter size={14} /> Filters
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center animate-slide-down border border-gray-200">
            {!filterType && !browseCategory && (
              <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} className="input-field w-auto py-2 text-sm">
                <option value="">All Types</option>
                <option value="vehicle">Vehicles</option>
                <option value="parts">Parts</option>
                <option value="tools">Tools</option>
              </select>
            )}
            <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })} className="input-field w-auto py-2 text-sm">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setFilters({ search: '', category: '', sort: '', type: filterType || '' })} className="text-sm text-primary-600 hover:underline">Clear Filters</button>
          </div>
        )}

        {/* Products Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-900"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl">
            <FiSearch size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-600">No products found</h3>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.map(product => (
              <Link to={`/products/${product.id}`} key={product.id} className="group">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  {/* Image area */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
                    <img
                      src={product.image_url ? resolveImageSrc(product.image_url) : pickFallbackImage(product)}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Status overlay */}
                    {product.status === 'sold_out' && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">SOLD OUT</span>
                      </div>
                    )}
                  </div>

                  {/* Card content */}
                  <div className="p-4">
                    <h3 className="font-semibold text-navy-900 group-hover:text-primary-600 transition-colors line-clamp-1 text-sm">{product.name}</h3>
                    <p className="text-lg font-bold text-navy-900 mt-1">{formatPrice(product.price)}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs font-medium ${product.stock_quantity > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
                      </span>
                      {product.location && (
                        <span className="text-xs text-gray-400 flex items-center gap-1"><FiMapPin size={10} /> {product.location}</span>
                      )}
                    </div>

                    {product.status === 'available' && (
                      <button
                        onClick={(e) => handleAddToCart(e, product.id)}
                        className="w-full mt-3 py-2 bg-navy-900 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100"
                      >
                        <FiShoppingCart size={14} /> Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
