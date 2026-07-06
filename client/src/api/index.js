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

  // Store (public)
  getStore: (slug) => request(`/store/${slug}`),
  getStoreProducts: (slug) => request(`/store/${slug}/products`),
  createOrder: (slug, body) => request(`/store/${slug}/orders`, { method: 'POST', body }),

  // Orders (public - token based)
  getOrder: (orderId, token) => request(`/orders/${orderId}?token=${token}`),
  confirmOrder: (orderId, token) => request(`/orders/${orderId}/confirm?token=${token}`, { method: 'POST' }),
  cancelOrder: (orderId, token) => request(`/orders/${orderId}/cancel?token=${token}`, { method: 'POST' }),

  // Dashboard (protected)
  getOrders: (status) => request(`/dashboard/orders${status ? `?status=${status}` : ''}`),
  getOrderDetail: (id) => request(`/dashboard/orders/${id}`),
  sendConfirmation: (id) => request(`/dashboard/orders/${id}/send-confirmation`, { method: 'POST' }),
  acceptOrder: (id) => request(`/dashboard/orders/${id}/accept`, { method: 'POST' }),
  completeOrder: (id) => request(`/dashboard/orders/${id}/complete`, { method: 'POST' }),
  cancelDashboardOrder: (id) => request(`/dashboard/orders/${id}/cancel`, { method: 'POST' }),

  uploadImage: async (formData) => {``
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

  getProducts: () => request('/dashboard/products'),
  createProduct: (body) => request('/dashboard/products', { method: 'POST', body }),
  updateProduct: (id, body) => request(`/dashboard/products/${id}`, { method: 'PUT', body }),
  toggleProduct: (id) => request(`/dashboard/products/${id}/toggle`, { method: 'PATCH' }),
  deleteProduct: (id) => request(`/dashboard/products/${id}`, { method: 'DELETE' }),

  getSettings: () => request('/dashboard/settings'),
  updateSettings: (body) => request('/dashboard/settings', { method: 'PUT', body }),

  getBusinessHours: () => request('/dashboard/business-hours'),
  updateBusinessHours: (body) => request('/dashboard/business-hours', { method: 'PUT', body }),

  getQRCode: () => request('/dashboard/qrcode'),
  getStats: () => request('/dashboard/stats'),
};
