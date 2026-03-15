import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';
import { FiShoppingCart, FiCalendar, FiMapPin, FiTag, FiInfo, FiArrowLeft, FiMinus, FiPlus, FiTruck, FiCheck, FiClock, FiFileText, FiDollarSign } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const INSTALLMENT_PLAN = {
  downpaymentRate: 0.5,
  months: 12,
  interestRate: 0.01,
  label: '50% Downpayment • 12 Months • 1% Monthly Interest',
};

function computeMonthly(price) {
  const financed = price * (1 - INSTALLMENT_PLAN.downpaymentRate);
  return Math.round((financed * (1 + INSTALLMENT_PLAN.interestRate * INSTALLMENT_PLAN.months)) / INSTALLMENT_PLAN.months * 100) / 100;
}

const FALLBACK_IMAGES = {
  truck: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1400&q=80',
  tractor: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1400&q=80',
  van: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1400&q=80',
  vehicle: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1400&q=80',
  parts: 'https://images.unsplash.com/photo-1635764706136-18f6be2d0f5b?auto=format&fit=crop&w=1400&q=80',
  tools: 'https://images.unsplash.com/photo-1581147036324-c47a03a81d48?auto=format&fit=crop&w=1400&q=80',
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

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { user } = useAuth();
  const { addToCart } = useCart();
  const navigate = useNavigate();

  useEffect(() => { fetchProduct(); }, [id]);

  const fetchProduct = async () => {
    try { const data = await api.getProduct(id); setProduct(data); }
    catch (err) { toast.error('Product not found'); navigate('/products'); }
    finally { setLoading(false); }
  };

  const handleAddToCart = async () => {
    if (!user) { toast.error('Please login first'); navigate('/login'); return; }
    try { await addToCart(product.id, quantity); toast.success('Added to cart!'); }
    catch (err) { toast.error(err.message); }
  };

  const specs = product?.specifications ? JSON.parse(product.specifications) : {};

  const resolveImageSrc = (imageUrl) => {
    if (!imageUrl) return '';
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    return imageUrl;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-900"></div></div>;
  if (!product) return null;

  return (
    <div>
      {/* Breadcrumb Header */}
      <section className="bg-navy-900 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/products" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors mb-2">
            <FiArrowLeft size={14} /> Back to Products
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{product.name}</h1>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Image */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
              <img
                src={product.image_url ? resolveImageSrc(product.image_url) : pickFallbackImage(product)}
                alt={product.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {product.status === 'sold_out' && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <span className="bg-red-600 text-white text-lg font-bold px-6 py-2 rounded-full">SOLD OUT</span>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-6">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {product.category_name && <span className="badge badge-info">{product.category_name}</span>}
              {product.type === 'vehicle' && <span className="badge badge-purple">Vehicle</span>}
              {product.status === 'available' && <span className="badge badge-success">Available</span>}
              {product.status === 'sold_out' && <span className="badge badge-danger">Sold Out</span>}
              {product.status === 'reserved' && <span className="badge badge-warning">Reserved</span>}
            </div>

            {/* Price */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
              <p className="text-4xl font-bold text-navy-900">{formatPrice(product.price)}</p>
              {product.type !== 'vehicle' && product.status === 'available' && (
                <p className="text-sm text-gray-500 mt-1">{product.stock_quantity} in stock</p>
              )}
            </div>

            {/* Installment Calculator (vehicles only) */}
            {product.type === 'vehicle' && product.status === 'available' && (
              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <FiDollarSign className="text-blue-600" />
                  <h3 className="font-bold text-blue-900 text-sm">Installment Plan Available</h3>
                </div>
                <p className="text-xs text-blue-700 mb-3">{INSTALLMENT_PLAN.label}</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <p className="text-xs text-gray-500">50% Downpayment</p>
                    <p className="font-bold text-navy-900">{formatPrice(product.price * 0.5)}</p>
                    <p className="text-xs text-gray-400">Due at pickup</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <p className="text-xs text-gray-500">Monthly Payment</p>
                    <p className="font-bold text-navy-900">{formatPrice(computeMonthly(product.price))}</p>
                    <p className="text-xs text-gray-400">× 12 months</p>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="font-bold text-navy-900 mb-2">Description</h3>
                <p className="text-gray-600 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Quick info */}
            <div className="grid grid-cols-2 gap-3">
              {product.location && (
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <FiMapPin className="text-accent-500 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="text-sm font-medium text-navy-900">{product.location}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                <FiInfo className="text-accent-500 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Condition</p>
                  <p className="text-sm font-medium text-navy-900 capitalize">{product.condition}</p>
                </div>
              </div>
            </div>

            {/* Specifications */}
            {Object.keys(specs).length > 0 && (
              <div>
                <h3 className="font-bold text-navy-900 mb-3">Specifications</h3>
                <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-200">
                  {Object.entries(specs).map(([key, val]) => (
                    <div key={key} className="flex justify-between px-4 py-3 text-sm">
                      <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-navy-900">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reservation info */}
            {product.max_reservation_days && (
              <div className="flex items-start gap-3 bg-amber-50 rounded-xl p-4 border border-amber-200">
                <FiClock className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700">
                  <p className="font-medium">Reservation Info</p>
                  <p>Maximum reservation period: {product.max_reservation_days} days</p>
                  {product.type !== 'vehicle' && <p className="text-xs mt-1">Item held for 48 hours after reservation</p>}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              {product.status === 'available' && (
                <>
                  {product.type !== 'vehicle' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600 font-medium">Quantity:</span>
                      <div className="flex items-center border border-gray-300 rounded-lg">
                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2.5 hover:bg-gray-50 transition-colors"><FiMinus size={14} /></button>
                        <span className="px-5 font-semibold text-navy-900">{quantity}</span>
                        <button onClick={() => setQuantity(Math.min(product.stock_quantity, quantity + 1))} className="p-2.5 hover:bg-gray-50 transition-colors"><FiPlus size={14} /></button>
                      </div>
                    </div>
                  )}
                  <button onClick={handleAddToCart} className="w-full bg-navy-900 text-white py-3.5 rounded-xl font-semibold hover:bg-navy-800 transition-colors flex items-center justify-center gap-2 text-lg">
                    <FiShoppingCart /> Add to Cart
                  </button>
                </>
              )}

              {product.type === 'vehicle' && user && (
                <Link to={`/bookings?product_id=${product.id}&product_name=${encodeURIComponent(product.name)}`} className="w-full btn-accent py-3.5 rounded-xl flex items-center justify-center gap-2 text-lg">
                  <FiCalendar /> Book Test Drive
                </Link>
              )}

              {product.type === 'vehicle' && product.status === 'available' && user && (
                <Link to={`/inquiries/new?product_id=${product.id}`} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-lg">
                  <FiFileText /> Apply for Installment
                </Link>
              )}

              {product.type === 'vehicle' && !user && (
                <Link to="/login" className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-lg">
                  <FiFileText /> Sign In to Apply for Installment
                </Link>
              )}

              {product.status === 'sold_out' && (
                <div className="bg-red-50 text-red-700 rounded-xl p-4 text-center font-medium border border-red-200">
                  This item is currently sold out
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
