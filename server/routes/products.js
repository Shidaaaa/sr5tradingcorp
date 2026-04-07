const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const InventoryLog = require('../models/InventoryLog');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all products
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, type, search, status, min_price, max_price, sort, vehicle_category } = req.query;
    const filter = {};

    if (category) filter.category_id = category;
    if (type) filter.type = type;
    if (vehicle_category) filter.vehicle_category = vehicle_category;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (min_price || max_price) {
      filter.price = {};
      if (min_price) filter.price.$gte = Number(min_price);
      if (max_price) filter.price.$lte = Number(max_price);
    }

    let sortOption = { created_at: -1 };
    if (sort === 'price_asc') sortOption = { price: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1 };
    else if (sort === 'name') sortOption = { name: 1 };

    const products = await Product.find(filter).populate('category_id', 'name').sort(sortOption).lean();
    // Map category_id to category_name for frontend compatibility
    const mapped = products.map(p => ({ ...p, id: p._id, category_name: p.category_id?.name || null, category_id: p.category_id?._id || null }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get all categories - MUST be before /:id
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json(categories.map(c => ({ ...c, id: c._id })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Public homepage stats
router.get('/meta/stats', async (req, res) => {
  try {
    const [users, transactions, appointments] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      Payment.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: { $in: ['pending', 'approved', 'completed'] } }),
    ]);

    res.json({
      users,
      transactions,
      appointments,
      locations: 3,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Admin: Create category - MUST be before /:id
router.post('/meta/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required.' });
    const cat = await Category.create({ name, description, type: type || 'general' });
    res.status(201).json({ ...cat.toObject(), id: cat._id });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Category already exists.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category_id', 'name').lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ...product, id: product._id, category_name: product.category_id?.name || null, category_id: product.category_id?._id || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Admin: Create product
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, category_id, type, stock_quantity, location, condition, image_url, specifications, reorder_level } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required.' });

    const { is_popular, vehicle_category } = req.body;
    const product = await Product.create({
      name, description, price, category_id: category_id || null, type: type || 'general',
      stock_quantity: stock_quantity || 0, location: location || null, condition: condition || 'good',
      image_url: image_url || null, specifications: specifications || null, reorder_level: reorder_level || 5,
      max_reservation_days: type === 'vehicle' ? 30 : 90,
      is_popular: is_popular || false,
      vehicle_category: vehicle_category || null,
    });

    if (stock_quantity > 0) {
      await InventoryLog.create({ product_id: product._id, change_type: 'restock', quantity_change: stock_quantity, previous_quantity: 0, new_quantity: stock_quantity, notes: 'Initial stock', created_by: req.user.id });
    }

    res.status(201).json({ ...product.toObject(), id: product._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating product.' });
  }
});

// Admin: Update product
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, category_id, type, stock_quantity, location, condition, image_url, specifications, reorder_level, status, is_popular, vehicle_category } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    if (stock_quantity !== undefined && stock_quantity !== product.stock_quantity) {
      const change = stock_quantity - product.stock_quantity;
      await InventoryLog.create({ product_id: product._id, change_type: change > 0 ? 'restock' : 'adjustment', quantity_change: change, previous_quantity: product.stock_quantity, new_quantity: stock_quantity, notes: 'Manual adjustment', created_by: req.user.id });
    }

    const resolvedType = type !== undefined ? type : product.type;
    let newStatus = status !== undefined ? status : product.status;
    if (stock_quantity !== undefined) {
      if (stock_quantity <= 0) {
        newStatus = 'sold_out';
      } else if (status === undefined) {
        if (resolvedType === 'vehicle') {
          newStatus = 'available';
        } else if (product.status === 'sold_out') {
          newStatus = 'available';
        }
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = price;
    if (category_id !== undefined) updates.category_id = category_id;
    if (type !== undefined) updates.type = type;
    if (stock_quantity !== undefined) updates.stock_quantity = stock_quantity;
    if (location !== undefined) updates.location = location;
    if (condition !== undefined) updates.condition = condition;
    if (image_url !== undefined) updates.image_url = image_url;
    if (specifications !== undefined) updates.specifications = specifications;
    if (reorder_level !== undefined) updates.reorder_level = reorder_level;
    if (is_popular !== undefined) updates.is_popular = is_popular;
    if (vehicle_category !== undefined) updates.vehicle_category = vehicle_category;
    updates.status = newStatus;

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, { new: true }).populate('category_id', 'name').lean();
    res.json({ ...updated, id: updated._id, category_name: updated.category_id?.name || null, category_id: updated.category_id?._id || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating product.' });
  }
});

// Admin: Reorder
router.post('/:id/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const newQty = product.stock_quantity + (quantity || 10);
    await InventoryLog.create({ product_id: product._id, change_type: 'restock', quantity_change: quantity || 10, previous_quantity: product.stock_quantity, new_quantity: newQty, notes: 'Reorder restock', created_by: req.user.id });

    product.stock_quantity = newQty;
    if (product.stock_quantity > 0) product.status = 'available';
    await product.save();

    res.json({ ...product.toObject(), id: product._id, new_quantity: product.stock_quantity });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Admin: Delete product
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
