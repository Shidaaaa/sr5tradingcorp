const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('sr5_token');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const config = {
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong');
    Object.assign(error, data);
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  login: (data) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  verifyEmailCode: (data) => apiRequest('/auth/verify-email', { method: 'POST', body: JSON.stringify(data) }),
  resendVerificationCode: (data) => apiRequest('/auth/resend-verification', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => apiRequest('/auth/profile'),
  updateProfile: (data) => apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (data) => apiRequest('/auth/change-password', { method: 'PUT', body: JSON.stringify(data) }),

  // Products
  getProducts: (params = '') => apiRequest(`/products${params ? '?' + params : ''}`),
  getProduct: (id) => apiRequest(`/products/${id}`),
  getCategories: () => apiRequest('/products/meta/categories'),
  createProduct: (data) => apiRequest('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => apiRequest(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadProductImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiRequest('/products/upload-image', { method: 'POST', body: formData });
  },
  reorderProduct: (id, data) => apiRequest(`/products/${id}/reorder`, { method: 'POST', body: JSON.stringify(data) }),
  createCategory: (data) => apiRequest('/products/meta/categories', { method: 'POST', body: JSON.stringify(data) }),

  // Cart
  getCart: () => apiRequest('/cart'),
  addToCart: (data) => apiRequest('/cart', { method: 'POST', body: JSON.stringify(data) }),
  updateCartItem: (id, data) => apiRequest(`/cart/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeFromCart: (id) => apiRequest(`/cart/${id}`, { method: 'DELETE' }),
  clearCart: () => apiRequest('/cart', { method: 'DELETE' }),

  // Orders
  getOrders: () => apiRequest('/orders'),
  getOrder: (id) => apiRequest(`/orders/${id}`),
  placeOrder: (data) => apiRequest('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrderStatus: (id, data) => apiRequest(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),

  // Bookings
  getBookings: () => apiRequest('/bookings'),
  getReservationFee: (productId) => apiRequest(`/bookings/reservation-fee/${productId}`),
  getBookingAvailability: (productId, date) => apiRequest(`/bookings/availability/${productId || 'global'}?date=${encodeURIComponent(date)}`),
  createBooking: (data) => apiRequest('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  updateBookingStatus: (id, data) => apiRequest(`/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmPickup: (id) => apiRequest(`/bookings/${id}/confirm-pickup`, { method: 'PUT' }),
  markNoShow: (id) => apiRequest(`/bookings/${id}/no-show`, { method: 'PUT' }),

  // Payments
  processPayment: (data) => apiRequest('/payments', { method: 'POST', body: JSON.stringify(data) }),
  getPayments: () => apiRequest('/payments'),
  getReceipt: (receiptNumber) => apiRequest(`/payments/receipt/${receiptNumber}`),
  createStripeSession: (data) => apiRequest('/payments/stripe/create-session', { method: 'POST', body: JSON.stringify(data) }),
  verifyStripePayment: (data) => apiRequest('/payments/stripe/verify', { method: 'POST', body: JSON.stringify(data) }),
  getStripeConfig: () => apiRequest('/payments/stripe/config'),
  createStripeReservationSession: (data) => apiRequest('/payments/stripe/create-reservation-session', { method: 'POST', body: JSON.stringify(data) }),
  verifyStripeReservationPayment: (data) => apiRequest('/payments/stripe/verify-reservation', { method: 'POST', body: JSON.stringify(data) }),
  createStripeOrderReservationSession: (data) => apiRequest('/payments/stripe/create-order-reservation-session', { method: 'POST', body: JSON.stringify(data) }),
  verifyStripeOrderReservationPayment: (data) => apiRequest('/payments/stripe/verify-order-reservation', { method: 'POST', body: JSON.stringify(data) }),

  // Feedback
  getFeedback: () => apiRequest('/feedback'),
  submitFeedback: (data) => apiRequest('/feedback', { method: 'POST', body: JSON.stringify(data) }),
  respondToFeedback: (id, data) => apiRequest(`/feedback/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getReturns: () => apiRequest('/feedback/returns'),
  submitReturn: (data) => apiRequest('/feedback/returns', { method: 'POST', body: JSON.stringify(data) }),
  handleReturn: (id, data) => apiRequest(`/feedback/returns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Admin
  getStats: () => apiRequest('/admin/stats'),
  getAdminOrders: (status) => apiRequest(`/admin/orders${status ? '?status=' + status : ''}`),
  getAdminInstallmentClients: () => apiRequest('/admin/orders/installments'),
  updateAdminOrderStatus: (id, data) => apiRequest(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  recordAdminPickupPayment: (id, data) => apiRequest(`/admin/orders/${id}/pickup-payment`, { method: 'POST', body: JSON.stringify(data) }),
  markAdminOrderPaid: (id, data) => apiRequest(`/admin/orders/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(data) }),
  markAdminInstallmentPaid: (id, installmentNumber) => apiRequest(`/admin/orders/${id}/installments/${installmentNumber}`, { method: 'PUT' }),
  getAdminBookings: (status) => apiRequest(`/admin/bookings${status ? '?status=' + status : ''}`),
  updateAdminBookingStatus: (id, data) => apiRequest(`/admin/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminFeedback: () => apiRequest('/admin/feedback'),
  respondFeedback: (id, data) => apiRequest(`/admin/feedback/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminReturns: () => apiRequest('/admin/returns'),
  handleAdminReturn: (id, data) => apiRequest(`/admin/returns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCustomers: () => apiRequest('/admin/customers'),
  getInventory: () => apiRequest('/admin/inventory'),
  getInventoryLog: (productId) => apiRequest(`/admin/inventory/log${productId ? '?product_id=' + productId : ''}`),
  getSales: (month, year, options = {}) => {
    const params = new URLSearchParams();
    if (options.allTime) {
      params.set('all_time', '1');
    } else if (options.startDate && options.endDate) {
      params.set('start_date', options.startDate);
      params.set('end_date', options.endDate);
    } else {
      params.set('month', month);
      params.set('year', year);
    }
    return apiRequest(`/admin/sales?${params.toString()}`);
  },
  getDailySalesReport: (month, year, options = {}) => {
    const params = new URLSearchParams();
    if (options.allTime) {
      params.set('all_time', '1');
    } else if (options.startDate && options.endDate) {
      params.set('start_date', options.startDate);
      params.set('end_date', options.endDate);
    } else {
      params.set('month', month);
      params.set('year', year);
    }
    return apiRequest(`/admin/sales/daily?${params.toString()}`);
  },
  getMonthlyReport: (year) => apiRequest(`/admin/reports/monthly${year ? '?year=' + year : ''}`),
  getRevenueReport: () => apiRequest('/admin/reports/revenue'),
};
