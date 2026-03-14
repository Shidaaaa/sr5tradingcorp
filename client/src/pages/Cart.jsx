import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { FiTrash2, FiMinus, FiPlus, FiShoppingBag, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function Cart() {
  const { cart, updateQuantity, removeItem, clearCart, loading } = useCart();

  const handleUpdateQty = async (itemId, newQty) => {
    try { await updateQuantity(itemId, newQty); } catch (err) { toast.error(err.message); }
  };

  const handleRemove = async (itemId) => {
    try { await removeItem(itemId); toast.success('Item removed'); } catch (err) { toast.error(err.message); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">Shopping Cart</h1>

      {cart.items.length === 0 ? (
        <div className="card p-12 text-center">
          <FiShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Your cart is empty</h3>
          <p className="text-gray-500 mb-6">Browse our products and add items to your cart</p>
          <Link to="/products" className="btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {cart.items.map(item => (
              <div key={item.id} className="card p-4 flex gap-4">
                <div className="w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center">
                  <FiShoppingBag className="text-gray-300" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/products/${item.product_id}`} className="font-semibold text-gray-900 hover:text-accent-600 line-clamp-1">{item.name}</Link>
                  <p className="text-accent-600 font-bold mt-1">{formatPrice(item.price)}</p>
                  {item.status === 'sold_out' && <p className="text-xs text-red-500 font-medium">Item no longer available</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center border rounded-lg">
                      <button onClick={() => handleUpdateQty(item.id, item.quantity - 1)} className="p-1.5 hover:bg-gray-50"><FiMinus size={14} /></button>
                      <span className="px-3 text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => handleUpdateQty(item.id, item.quantity + 1)} className="p-1.5 hover:bg-gray-50"><FiPlus size={14} /></button>
                    </div>
                    <button onClick={() => handleRemove(item.id)} className="text-red-500 hover:text-red-700 p-1.5"><FiTrash2 size={16} /></button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{formatPrice(item.price * item.quantity)}</p>
                </div>
              </div>
            ))}
            <button onClick={() => { clearCart(); toast.success('Cart cleared'); }} className="text-sm text-red-500 hover:text-red-700 font-medium">Clear Cart</button>
          </div>

          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-20">
              <h3 className="font-bold text-lg mb-4">Order Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items ({cart.count})</span>
                  <span className="font-medium">{formatPrice(cart.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="text-gray-500">Calculated at checkout</span>
                </div>
              </div>
              <hr className="my-4" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-accent-600">{formatPrice(cart.total)}</span>
              </div>
              <Link to="/checkout" className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
                Proceed to Checkout <FiArrowRight />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
