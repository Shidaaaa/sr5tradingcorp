const express = require('express');
const CartItem = require('../models/CartItem');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function isProductPurchasable(product) {
  const stock = Number(product?.stock_quantity || 0);
  if (product?.type === 'vehicle') {
    return stock > 0;
  }
  return product?.status === 'available' && stock > 0;
}

// Get user's cart
router.get('/', authenticateToken, async (req, res) => {
  try {
    const items = await CartItem.find({ user_id: req.user.id })
      .populate('product_id')
      .lean();
    const mapped = items.map(item => ({
      id: item._id,
      quantity: item.quantity,
      product_id: item.product_id?._id,
      product_name: item.product_id?.name,
      product_price: item.product_id?.price,
      product_image: item.product_id?.image_url,
      product_stock: item.product_id?.stock_quantity,
      product_type: item.product_id?.type,
      product_status: item.product_id?.status,
      product_is_popular: item.product_id?.is_popular || false,
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Add item to cart
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { product_id, quantity } = req.body;
    if (!product_id) return res.status(400).json({ error: 'Product ID required.' });

    const product = await Product.findById(product_id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (!isProductPurchasable(product)) return res.status(400).json({ error: 'Product is not available.' });
    if (product.stock_quantity < (quantity || 1)) {
      return res.status(400).json({ error: 'Insufficient stock.' });
    }

    const existing = await CartItem.findOne({ user_id: req.user.id, product_id });
    if (existing) {
      existing.quantity += (quantity || 1);
      await existing.save();
      return res.json({ ...existing.toObject(), id: existing._id });
    }

    const item = await CartItem.create({ user_id: req.user.id, product_id, quantity: quantity || 1 });
    res.status(201).json({ ...item.toObject(), id: item._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error adding to cart.' });
  }
});

// Update cart item quantity
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Invalid quantity.' });

    const item = await CartItem.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!item) return res.status(404).json({ error: 'Cart item not found.' });

    item.quantity = quantity;
    await item.save();
    res.json({ ...item.toObject(), id: item._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Remove item from cart
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const item = await CartItem.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
    if (!item) return res.status(404).json({ error: 'Cart item not found.' });
    res.json({ message: 'Item removed from cart.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Clear cart
router.delete('/', authenticateToken, async (req, res) => {
  try {
    await CartItem.deleteMany({ user_id: req.user.id });
    res.json({ message: 'Cart cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
