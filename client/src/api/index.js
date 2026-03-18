const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('sr5_token');
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  let data;

  if (isJson) {
    data = await response.json();
  } else {
    const rawText = await response.text();
    const firstLine = (rawText || '').split('\n').map(line => line.trim()).find(Boolean) || '';

    data = {
      error: firstLine.startsWith('<!DOCTYPE')
        ? 'Unexpected non-JSON response from server. Please refresh and try again.'
        : firstLine || 'Unexpected server response format.',
      raw_response: rawText,
    };
  }

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
  placeDirectOrder: (data) => apiRequest('/orders/direct', { method: 'POST', body: JSON.stringify(data) }),
  placeOrder: (data) => apiRequest('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrderStatus: (id, data) => apiRequest(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmOrderReceived: (id) => apiRequest(`/orders/${id}/confirm-received`, { method: 'PUT' }),
  reorderOrder: (id) => apiRequest(`/orders/${id}/reorder`, { method: 'POST' }),

  // Bookings
  getBookings: () => apiRequest('/bookings'),
  getReservationFee: (productId) => apiRequest(`/bookings/reservation-fee/${productId}`),
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
  createStripeInstallmentSession: (data) => apiRequest('/payments/stripe/create-installment-session', { method: 'POST', body: JSON.stringify(data) }),
  verifyStripeInstallmentPayment: (data) => apiRequest('/payments/stripe/verify-installment', { method: 'POST', body: JSON.stringify(data) }),

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
  updateAdminOrderStatus: (id, data) => apiRequest(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setupInstallmentPlan: (orderId, data) => apiRequest(`/admin/orders/${orderId}/setup-installment`, { method: 'POST', body: JSON.stringify(data || {}) }),
  recordAdminOrderPayment: (orderId, data) => apiRequest(`/admin/orders/${orderId}/record-payment`, { method: 'POST', body: JSON.stringify(data) }),
  recordInstallmentPayment: (planId, data) => apiRequest(`/admin/installments/${planId}/record-payment`, { method: 'POST', body: JSON.stringify(data) }),
  getAdminInstallment: (orderId) => apiRequest(`/admin/installments/${orderId}`),
  getAdminBookings: (status) => apiRequest(`/admin/bookings${status ? '?status=' + status : ''}`),
  updateAdminBookingStatus: (id, data) => apiRequest(`/admin/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminFeedback: () => apiRequest('/admin/feedback'),
  respondFeedback: (id, data) => apiRequest(`/admin/feedback/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAdminReturns: () => apiRequest('/admin/returns'),
  handleAdminReturn: (id, data) => apiRequest(`/admin/returns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCustomers: () => apiRequest('/admin/customers'),
  getInventory: () => apiRequest('/admin/inventory'),
  getInventoryLog: (productId) => apiRequest(`/admin/inventory/log${productId ? '?product_id=' + productId : ''}`),
  getSales: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'all') {
        query.set(key, value);
      }
    });
    return apiRequest(`/admin/sales${query.toString() ? `?${query.toString()}` : ''}`);
  },
  getMonthlyReport: (year) => apiRequest(`/admin/reports/monthly${year ? '?year=' + year : ''}`),
  getRevenueReport: () => apiRequest('/admin/reports/revenue'),
  uploadAdminPaymentReceipt: async (file) => {
    const token = localStorage.getItem('sr5_token');
    const form = new FormData();
    form.append('receipt', file);

    const response = await fetch(`${API_BASE}/admin/payments/upload-receipt`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: form,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : { error: 'Unexpected server response format.' };

    if (!response.ok) {
      const error = new Error(data.error || 'Failed to upload receipt.');
      Object.assign(error, data);
      throw error;
    }

    return data;
  },
};
