import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';
import { FiShoppingCart, FiCalendar, FiMapPin, FiTag, FiInfo, FiArrowLeft, FiMinus, FiPlus, FiTruck, FiCheck, FiClock } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

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
              <div className="text-center text-gray-400">
                <FiTag size={80} className="mx-auto mb-2" />
                <span className="text-sm">No image available</span>
              </div>
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
