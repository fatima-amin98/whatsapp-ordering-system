import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import OrderCard from './OrderCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import EmptyState from '../../components/EmptyState';

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

const FILTER_MAP = {
  active: 'Confirmation Pending,Awaiting Customer Confirmation,Pending,Accepted',
  pending: 'Pending',
  accepted: 'Accepted',
  completed: 'Completed',
  cancelled: 'Cancelled',
  all: '',
};

export default function OrdersPage() {
  const { merchant } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState('active');
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const audioRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    setError(null);
    try {
      const statusParam = FILTER_MAP[filter] || '';
      const data = await api.getOrders(statusParam || undefined);
      setOrders(data.orders);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const playChime = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } catch {}
  }, []);

  const handleNewOrder = useCallback((order) => {
    setNewOrderIds((prev) => new Set(prev).add(order.id));
    setOrders((prev) => [order, ...prev]);
    playChime();
    setTimeout(() => {
      setNewOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }, 5000);
  }, [playChime]);

  const handleOrderStatusChanged = useCallback((data) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === data.orderId ? { ...o, orderStatus: data.newStatus } : o
      )
    );
  }, []);

  const handleOrderConfirmed = useCallback((data) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === data.orderId ? { ...o, orderStatus: 'Pending' } : o
      )
    );
    playChime();
  }, [playChime]);

  const handleConfirmationSent = useCallback((data) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === data.orderId
          ? { ...o, confirmationMessageSentAt: data.confirmationMessageSentAt }
          : o
      )
    );
  }, []);

  useSocket(merchant?.id, {
    onNewOrder: handleNewOrder,
    onOrderConfirmed: handleOrderConfirmed,
    onOrderStatusChanged: handleOrderStatusChanged,
    onConfirmationSent: handleConfirmationSent,
  });

  const withLoadingRef = useRef();
  withLoadingRef.current = async (fn) => {
    setActionLoading(true);
    try {
      await fn();
      await fetchOrders();
    } catch (err) {
      alert(err.data?.error || err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = useCallback((id) => withLoadingRef.current(() => api.acceptOrder(id)), []);
  const handleComplete = useCallback((id) => withLoadingRef.current(() => api.completeOrder(id)), []);
  const handleCancel = useCallback((id) => withLoadingRef.current(() => api.cancelDashboardOrder(id)), []);

  const handleSendConfirmation = useCallback((id) => {
    withLoadingRef.current(async () => {
      const result = await api.sendConfirmation(id);
      window.open(result.waLink, '_blank');
    });
  }, []);

  if (loading) return <LoadingSpinner text="Loading orders..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchOrders} />;

  return (
    <div>
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAgICAf39/f39/f3+AgICAgeHh4eHh4eHh4eHh4eHh4Q==" preload="auto" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-xl font-bold">Orders</h2>
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                filter === f.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {orders.length === 0 && (
          <EmptyState
            title="No orders"
            message={filter === 'active' ? 'No active orders. Share your store link to start receiving orders!' : 'No orders found in this category'}
          />
        )}
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onAccept={handleAccept}
            onComplete={handleComplete}
            onCancel={handleCancel}
            onSendConfirmation={handleSendConfirmation}
            loading={actionLoading}
            isNew={newOrderIds.has(order.id)}
          />
        ))}
      </div>
    </div>
  );
}
