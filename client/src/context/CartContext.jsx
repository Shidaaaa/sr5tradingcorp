import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [], total: 0, count: 0 });
  const [loading, setLoading] = useState(false);

  const fetchCart = async () => {
    if (!user) { setCart({ items: [], total: 0, count: 0 }); return; }
    try {
      setLoading(true);
      const data = await api.getCart();
      const items = Array.isArray(data) ? data.map(i => ({
        id: i.id,
        product_id: i.product_id,
        name: i.product_name,
        price: i.product_price,
        image_url: i.product_image,
        quantity: i.quantity,
        stock_quantity: i.product_stock,
        type: i.product_type,
        status: i.product_status,
        is_popular: i.product_is_popular || false,
      })) : (data.items || []);
      const total = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
      setCart({ items, total, count: items.length });
    } catch { setCart({ items: [], total: 0, count: 0 }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCart(); }, [user]);

  const addToCart = async (productId, quantity = 1) => {
    await api.addToCart({ product_id: productId, quantity });
    await fetchCart();
  };

  const updateQuantity = async (itemId, quantity) => {
    await api.updateCartItem(itemId, { quantity });
    await fetchCart();
  };

  const removeItem = async (itemId) => {
    await api.removeFromCart(itemId);
    await fetchCart();
  };

  const clearCart = async () => {
    await api.clearCart();
    await fetchCart();
  };

  return (
    <CartContext.Provider value={{ cart, loading, addToCart, updateQuantity, removeItem, clearCart, fetchCart }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
