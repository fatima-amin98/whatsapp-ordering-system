const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(url, config);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error || data?.errors?.[0]?.message || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  sendOtp: (body) => request('/auth/send-otp', { method: 'POST', body }),
  resendOtp: (body) => request('/auth/resend-otp', { method: 'POST', body }),
  verifyOtp: (body) => request('/auth/verify-otp', { method: 'POST', body }),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  verifyResetOtp: (body) => request('/auth/verify-reset-otp', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),

  // Store (public)
  getStore: (slug) => request(`/store/${slug}`),
  getStoreProducts: (slug) => request(`/store/${slug}/products`),
  getStoreCategories: (slug) => request(`/store/${slug}/categories`),
  createOrder: (slug, body) => request(`/store/${slug}/orders`, { method: 'POST', body }),

  // Orders (public - token based)
  getOrder: (orderId, token) => request(`/orders/${orderId}?token=${token}`),
  confirmOrder: (orderId, token) => request(`/orders/${orderId}/confirm?token=${token}`, { method: 'POST' }),
  cancelOrder: (orderId, token) => request(`/orders/${orderId}/cancel?token=${token}`, { method: 'POST' }),

  // Dashboard (protected)
  getOrders: (status, limit) => {
    let url = '/dashboard/orders';
    const params = [];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (limit) params.push(`limit=${limit}`);
    if (params.length > 0) url += '?' + params.join('&');
    return request(url);
  },
  getOrderDetail: (id) => request(`/dashboard/orders/${id}`),
  sendConfirmation: (id) => request(`/dashboard/orders/${id}/send-confirmation`, { method: 'POST' }),
  acceptOrder: (id) => request(`/dashboard/orders/${id}/accept`, { method: 'POST' }),
  completeOrder: (id) => request(`/dashboard/orders/${id}/complete`, { method: 'POST' }),
  cancelDashboardOrder: (id) => request(`/dashboard/orders/${id}/cancel`, { method: 'POST' }),

  uploadImage: async (formData) => {
    const res = await fetch(`${API_BASE}/dashboard/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error || 'Upload failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  getProducts: (search) => request(`/dashboard/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createProduct: (body) => request('/dashboard/products', { method: 'POST', body }),
  updateProduct: (id, body) => request(`/dashboard/products/${id}`, { method: 'PUT', body }),
  toggleProduct: (id) => request(`/dashboard/products/${id}/toggle`, { method: 'PATCH' }),
  deleteProduct: (id) => request(`/dashboard/products/${id}`, { method: 'DELETE' }),
  duplicateProduct: (id) => request(`/dashboard/products/${id}/duplicate`, { method: 'POST' }),
  reorderProducts: (productIds) => request('/dashboard/products/reorder', { method: 'PUT', body: { productIds } }),

  getCategories: () => request('/dashboard/categories'),
  createCategory: (body) => request('/dashboard/categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/dashboard/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id) => request(`/dashboard/categories/${id}`, { method: 'DELETE' }),

  getSettings: () => request('/dashboard/settings'),
  updateSettings: (body) => request('/dashboard/settings', { method: 'PUT', body }),

  getBusinessHours: () => request('/dashboard/business-hours'),
  updateBusinessHours: (body) => request('/dashboard/business-hours', { method: 'PUT', body }),

  getQRCode: () => request('/dashboard/qrcode'),
  getStats: () => request('/dashboard/stats'),
};
