const express = require('express');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const CartItem = require('../models/CartItem');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const InstallmentPlan = require('../models/InstallmentPlan');
const InstallmentSchedule = require('../models/InstallmentSchedule');
const ReturnRequest = require('../models/ReturnRequest');
const InventoryLog = require('../models/InventoryLog');
const { authenticateToken } = require('../middleware/auth');
const { generateOrderNumber, calculateReservationFee, VEHICLE_HOLD_DAYS } = require('../utils/helpers');

const router = express.Router();

function getUniqueCompletedPaymentTotal(payments = []) {
  const seenRefs = new Set();
  let total = 0;

  for (const payment of payments) {
    if (payment.status !== 'completed') continue;

    const reference = payment.reference_number ? String(payment.reference_number) : null;
    if (reference) {
      if (seenRefs.has(reference)) continue;
      seenRefs.add(reference);
    }

    total += Number(payment.amount || 0);
  }

  return total;
}

function getItemReservationExpiry(productType) {
  const now = new Date();
  if (productType === 'vehicle') {
    now.setDate(now.getDate() + VEHICLE_HOLD_DAYS);
  } else {
    now.setHours(now.getHours() + 48);
  }
  return now;
}

function isProductPurchasable(product) {
  const stock = Number(product?.stock_quantity || 0);
  if (product?.type === 'vehicle') {
    return stock > 0;
  }
  return product?.status === 'available' && stock > 0;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function buildDeliveryPayload(input = {}, options = {}) {
  const hasVehicleOrder = Boolean(options.hasVehicleOrder);
  const deliveryMethod = ['pickup', 'delivery', 'third_party'].includes(input.delivery_method)
    ? input.delivery_method
    : 'pickup';
  const deliveryAddress = normalizeOptionalString(input.delivery_address);
  const contactName = normalizeOptionalString(input.delivery_contact_name);
  const contactPhone = normalizeOptionalString(input.delivery_contact_phone);
  const customerDeliveryPlatform = normalizeOptionalString(input.customer_delivery_platform);
  const customerDeliveryReference = normalizeOptionalString(input.customer_delivery_reference);

  if (hasVehicleOrder && deliveryMethod !== 'pickup') {
    throw new Error('Vehicle orders are currently pickup only.');
  }

  if ((deliveryMethod === 'delivery' || deliveryMethod === 'third_party') && !deliveryAddress) {
    throw new Error('Delivery address is required for delivery orders.');
  }

  if (deliveryMethod === 'third_party' && (!contactName || !contactPhone)) {
    throw new Error('Contact name and phone are required for third-party delivery.');
  }

  if (deliveryMethod === 'pickup') {
    return {
      delivery_method: 'pickup',
      delivery_address: null,
      delivery_contact_name: null,
      delivery_contact_phone: null,
      customer_delivery_platform: null,
      customer_delivery_reference: null,
    };
  }

  return {
    delivery_method: deliveryMethod,
    delivery_address: deliveryAddress,
    delivery_contact_name: contactName,
    delivery_contact_phone: contactPhone,
    customer_delivery_platform: customerDeliveryPlatform,
    customer_delivery_reference: customerDeliveryReference,
  };
}

async function autoCompleteDeliveredOrdersForUser(userId) {
  const graceCutoff = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
  await Order.updateMany(
    {
      user_id: userId,
      status: 'delivered',
      customer_received_at: null,
      updated_at: { $lt: graceCutoff },
    },
    {
      status: 'completed',
      customer_received_at: new Date(),
    }
  );
}

async function releaseOrderInventory(orderId, userId) {
  const items = await OrderItem.find({ order_id: orderId }).lean();
  for (const item of items) {
    const product = await Product.findById(item.product_id);
    if (!product) continue;

    const prevQty = Number(product.stock_quantity || 0);
    product.stock_quantity = prevQty + (item.quantity || 0);
    if (product.stock_quantity > 0 && (product.status === 'sold_out' || product.status === 'reserved')) {
      product.status = 'available';
    }
    await product.save();

    await InventoryLog.create({
      product_id: product._id,
      change_type: 'restock',
      quantity_change: item.quantity,
      previous_quantity: prevQty,
      new_quantity: product.stock_quantity,
      notes: `Order cancellation release ${orderId}`,
      created_by: userId,
    });
  }
}

async function enrichOrder(order) {
  const items = await OrderItem.find({ order_id: order._id }).populate('product_id', 'name image_url type category_id').lean();
  const payments = await Payment.find({ order_id: order._id, status: { $in: ['completed', 'pending'] } }).sort({ created_at: -1 }).lean();
  const installmentPlan = await InstallmentPlan.findOne({ order_id: order._id }).lean();

  let installmentSchedule = [];
  if (installmentPlan) {
    const now = new Date();
    await InstallmentSchedule.updateMany(
      {
        installment_plan_id: installmentPlan._id,
        status: { $in: ['pending', 'partially_paid'] },
        due_date: { $lt: now },
      },
      { status: 'overdue' }
    );

    installmentSchedule = await InstallmentSchedule.find({ installment_plan_id: installmentPlan._id })
      .sort({ installment_number: 1 })
      .lean();
  }

  const totalPaid = getUniqueCompletedPaymentTotal(payments);

  const categoryIds = items
    .map(i => i.product_id?.category_id)
    .filter(Boolean)
    .map(id => String(id));
  const uniqueCategoryIds = [...new Set(categoryIds)];
  let categoryNameMap = {};
  if (uniqueCategoryIds.length) {
    const Category = require('../models/Category');
    const categories = await Category.find({ _id: { $in: uniqueCategoryIds } }).lean();
    categories.forEach(c => { categoryNameMap[String(c._id)] = c.name; });
  }

  order.items = items.map(i => ({
    id: i._id,
    product_id: i.product_id?._id,
    name: i.product_id?.name,
    product_name: i.product_id?.name,
    product_image: i.product_id?.image_url,
    product_type: i.product_id?.type,
    category_id: i.product_id?.category_id || null,
    category_name: i.product_id?.category_id ? (categoryNameMap[String(i.product_id.category_id)] || null) : null,
    quantity: i.quantity,
    unit_price: i.unit_price,
    subtotal: i.subtotal,
    reservation_expires_at: i.reservation_expires_at || null,
  }));

  order.payments = payments.map(p => ({
    id: p._id,
    amount: p.amount,
    payment_method: p.payment_method,
    payment_type: p.payment_type,
    status: p.status,
    receipt_number: p.receipt_number,
    reference_number: p.reference_number,
    installment_number: p.installment_number,
    total_installments: p.total_installments,
    created_at: p.created_at,
  }));

  if (installmentPlan) {
    const paidScheduleTotal = installmentSchedule.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const nextPending = installmentSchedule.find(row => row.status !== 'paid') || null;

    order.installment_plan = {
      id: installmentPlan._id,
      status: installmentPlan.status,
      total_financed_amount: installmentPlan.total_financed_amount,
      down_payment_amount: installmentPlan.down_payment_amount,
      down_payment_paid: installmentPlan.down_payment_paid,
      number_of_installments: installmentPlan.number_of_installments,
      monthly_amount: installmentPlan.monthly_amount,
      interest_rate: installmentPlan.interest_rate,
      total_with_interest: installmentPlan.total_with_interest,
      start_date: installmentPlan.start_date,
      created_at: installmentPlan.created_at,
      paid_schedule_total: Number(paidScheduleTotal.toFixed(2)),
      remaining_schedule_total: Number(Math.max(0, (installmentPlan.total_with_interest || 0) - paidScheduleTotal).toFixed(2)),
      next_due_date: nextPending?.due_date || null,
      schedule: installmentSchedule.map(row => ({
        id: row._id,
        installment_number: row.installment_number,
        amount_due: row.amount_due,
        amount_paid: row.amount_paid,
        due_date: row.due_date,
        paid_date: row.paid_date,
        status: row.status,
      })),
    };
  } else {
    order.installment_plan = null;
  }

  order.id = order._id;
  order.total_paid = totalPaid;
  order.remaining_balance = Math.max(0, (order.total_amount || 0) - totalPaid);
  return order;
}

// Get user orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    await autoCompleteDeliveredOrdersForUser(req.user.id);
    const orders = await Order.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
    for (const order of orders) {
      await enrichOrder(order);
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get single order
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await autoCompleteDeliveredOrdersForUser(req.user.id);
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    await enrichOrder(order);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create order directly from a product inquiry (without cart)
router.post('/direct', authenticateToken, async (req, res) => {
  try {
    const { product_id, quantity, notes } = req.body;
    if (!product_id) return res.status(400).json({ error: 'Product ID is required.' });

    const orderQty = Math.max(1, Number(quantity || 1));
    const product = await Product.findById(product_id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (!isProductPurchasable(product)) return res.status(400).json({ error: `${product.name} is no longer available.` });
    if (Number(product.stock_quantity || 0) < orderQty) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}.` });
    }

    const hasVehicle = product.type === 'vehicle';
    let deliveryPayload;
    try {
      deliveryPayload = buildDeliveryPayload(req.body || {}, { hasVehicleOrder: hasVehicle });
    } catch (deliveryErr) {
      return res.status(400).json({ error: deliveryErr.message });
    }

    const total = Number(product.price || 0) * orderQty;
    const reservationFeeTotal = hasVehicle ? calculateReservationFee(product) * orderQty : 0;
    const reservationExpiresAt = getItemReservationExpiry(hasVehicle ? 'vehicle' : 'general');

    const order = await Order.create({
      user_id: req.user.id,
      order_number: generateOrderNumber(),
      total_amount: total,
      status: 'pending',
      has_vehicle: hasVehicle,
      reservation_fee_total: reservationFeeTotal,
      reservation_fee_paid: reservationFeeTotal <= 0,
      reservation_expires_at: reservationExpiresAt,
      ...deliveryPayload,
      notes: notes || null,
    });

    await OrderItem.create({
      order_id: order._id,
      product_id: product._id,
      quantity: orderQty,
      unit_price: product.price,
      subtotal: total,
      reservation_expires_at: getItemReservationExpiry(product.type),
    });

    const prevQty = Number(product.stock_quantity || 0);
    product.stock_quantity = Math.max(0, prevQty - orderQty);
    if (product.stock_quantity <= 0) {
      product.status = 'sold_out';
    } else if (product.status === 'sold_out' || product.status === 'reserved') {
      product.status = 'available';
    }
    await product.save();

    await InventoryLog.create({
      product_id: product._id,
      change_type: 'sale',
      quantity_change: -orderQty,
      previous_quantity: prevQty,
      new_quantity: product.stock_quantity,
      notes: `Direct inquiry checkout ${order.order_number}`,
      created_by: req.user.id,
    });

    res.status(201).json({ ...order.toObject(), id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating direct order.' });
  }
});

// Create order from cart
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { notes } = req.body;

    const cartItems = await CartItem.find({ user_id: req.user.id }).populate('product_id').lean();
    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty.' });

    // Validate availability and stock
    for (const item of cartItems) {
      if (!item.product_id) return res.status(400).json({ error: 'A product in your cart no longer exists.' });
      if (!isProductPurchasable(item.product_id)) return res.status(400).json({ error: `${item.product_id.name} is no longer available.` });
      if (item.product_id.stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${item.product_id.name}.` });
      }
    }

    let total = 0;
    let reservationFeeTotal = 0;
    const hasVehicle = cartItems.some(item => item.product_id?.type === 'vehicle');

    let deliveryPayload;
    try {
      deliveryPayload = buildDeliveryPayload(req.body || {}, { hasVehicleOrder: hasVehicle });
    } catch (deliveryErr) {
      return res.status(400).json({ error: deliveryErr.message });
    }

    for (const item of cartItems) {
      total += item.product_id.price * item.quantity;
      if (item.product_id.type === 'vehicle') {
        reservationFeeTotal += calculateReservationFee(item.product_id) * item.quantity;
      }
    }

    const reservationExpiresAt = getItemReservationExpiry(hasVehicle ? 'vehicle' : 'general');

    const order = await Order.create({
      user_id: req.user.id,
      order_number: generateOrderNumber(),
      total_amount: total,
      status: 'pending',
      has_vehicle: hasVehicle,
      reservation_fee_total: reservationFeeTotal,
      reservation_fee_paid: reservationFeeTotal <= 0,
      reservation_expires_at: reservationExpiresAt,
      ...deliveryPayload,
      notes: notes || null,
    });

    for (const item of cartItems) {
      await OrderItem.create({
        order_id: order._id,
        product_id: item.product_id._id,
        quantity: item.quantity,
        unit_price: item.product_id.price,
        subtotal: item.product_id.price * item.quantity,
        reservation_expires_at: getItemReservationExpiry(item.product_id.type),
      });

      const product = await Product.findById(item.product_id._id);
      if (!product) continue;

      const prevQty = Number(product.stock_quantity || 0);
      product.stock_quantity = Math.max(0, prevQty - item.quantity);
      if (product.stock_quantity <= 0) {
        product.status = 'sold_out';
      } else if (product.status === 'sold_out' || product.status === 'reserved') {
        product.status = 'available';
      }
      await product.save();

      await InventoryLog.create({
        product_id: product._id,
        change_type: 'sale',
        quantity_change: -item.quantity,
        previous_quantity: prevQty,
        new_quantity: product.stock_quantity,
        notes: `Order ${order.order_number}`,
        created_by: req.user.id,
      });
    }

    // Clear cart
    await CartItem.deleteMany({ user_id: req.user.id });

    res.status(201).json({ ...order.toObject(), id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating order.' });
  }
});

// Customer confirms they already received delivered items.
router.put('/:id/confirm-received', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!['delivered', 'picked_up'].includes(order.status)) {
      return res.status(400).json({ error: 'Only delivered orders can be confirmed as received.' });
    }

    order.status = 'completed';
    order.customer_received_at = new Date();
    await order.save();

    res.json({ ...order.toObject(), id: order._id, message: 'Order marked as received.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error confirming delivery.' });
  }
});

// Re-order non-vehicle items from an existing order into cart.
router.post('/:id/reorder', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const orderItems = await OrderItem.find({ order_id: order._id }).populate('product_id').lean();
    if (!orderItems.length) return res.status(400).json({ error: 'No order items found to reorder.' });

    const added = [];
    const skipped = [];

    for (const item of orderItems) {
      const product = item.product_id;
      if (!product) {
        skipped.push({ item_name: 'Unknown item', reason: 'Item no longer exists.' });
        continue;
      }

      if (product.type === 'vehicle') {
        skipped.push({ item_name: product.name, reason: 'Vehicle items are inquiry-only and cannot be reordered to cart.' });
        continue;
      }

      if (!isProductPurchasable(product)) {
        skipped.push({ item_name: product.name, reason: 'Out of stock.' });
        continue;
      }

      const availableStock = Number(product.stock_quantity || 0);
      const desiredQty = Math.max(1, Number(item.quantity || 1));
      const qtyToAdd = Math.min(desiredQty, availableStock);

      if (qtyToAdd <= 0) {
        skipped.push({ item_name: product.name, reason: 'Out of stock.' });
        continue;
      }

      const existingCartItem = await CartItem.findOne({ user_id: req.user.id, product_id: product._id });
      if (existingCartItem) {
        const targetQty = Math.min(availableStock, Number(existingCartItem.quantity || 0) + qtyToAdd);
        if (targetQty <= Number(existingCartItem.quantity || 0)) {
          skipped.push({ item_name: product.name, reason: 'Cart already at maximum stock quantity.' });
          continue;
        }
        existingCartItem.quantity = targetQty;
        await existingCartItem.save();
        added.push({ item_name: product.name, quantity: targetQty });
        continue;
      }

      const created = await CartItem.create({ user_id: req.user.id, product_id: product._id, quantity: qtyToAdd });
      added.push({ item_name: product.name, quantity: created.quantity });

      if (qtyToAdd < desiredQty) {
        skipped.push({ item_name: product.name, reason: `Only ${qtyToAdd} units available right now.` });
      }
    }

    res.json({
      message: 'Reorder completed.',
      added_count: added.length,
      skipped_count: skipped.length,
      added,
      skipped,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error reordering items.' });
  }
});

// Update order status (customer cancel)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (status === 'cancelled' && order.status !== 'cancelled') {
      await releaseOrderInventory(order._id, req.user.id);
    }

    order.status = status;
    await order.save();
    res.json({ ...order.toObject(), id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create return request
router.post('/:id/return', authenticateToken, async (req, res) => {
  try {
    const { order_item_id, reason, request_type } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!['delivered', 'completed'].includes(order.status)) {
      return res.status(400).json({ error: 'Returns can only be requested for delivered orders.' });
    }

    const returnReq = await ReturnRequest.create({
      order_id: order._id,
      order_item_id: order_item_id || null,
      user_id: req.user.id,
      reason: reason || '',
      request_type: request_type || 'return',
    });

    res.status(201).json({ ...returnReq.toObject(), id: returnReq._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating return request.' });
  }
});

module.exports = router;
