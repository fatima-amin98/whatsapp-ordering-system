import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import OrderCard from './OrderCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import EmptyState from '../../components/EmptyState';

export default function DashboardHome() {
  const { merchant } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState('active');
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const [stats, setStats] = useState(null);
  const audioRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    setError(null);
    try {
      const filterMap = {
        active: 'Confirmation Pending,Awaiting Customer Confirmation,Pending,Accepted',
        pending: 'Pending',
        accepted: 'Accepted',
        completed: 'Completed',
        cancelled: 'Cancelled',
        all: '',
      };
      const statusParam = filterMap[filter] || '';
      const [ordersData, statsData] = await Promise.all([
        api.getOrders(statusParam || undefined),
        api.getStats(),
      ]);
      setOrders(ordersData.orders);
      setStats(statsData.stats);
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

  const FILTERS = [
    { key: 'active', label: 'Active' },
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'all', label: 'All' },
  ];

  if (loading) return <LoadingSpinner text="Loading orders..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchOrders} />;

  return (
    <div>
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAgICAf39/f39/f3+AgICAgeHh4eHh4eHh4eHh4eHh4Q==" preload="auto" />

      {stats && (
        <div>
          {/* Section: Order Pipeline — most actionable metrics */}
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Order Pipeline</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <p className="text-xs font-medium text-gray-500">Pending</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.pending_count || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <p className="text-xs font-medium text-gray-500">Awaiting Conf.</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.awaiting_confirmation_count || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-xs font-medium text-gray-500">Accepted</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.accepted_count || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <p className="text-xs font-medium text-gray-500">Revenue Today</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">PKR {Number(stats.revenue_today || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Section: Time-based metrics */}
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Period Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Orders Today</p>
                <p className="text-xl font-bold text-gray-900">{stats.orders_today || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Orders This Week</p>
                <p className="text-xl font-bold text-gray-900">{stats.orders_this_week || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Revenue This Week</p>
                <p className="text-xl font-bold text-gray-900">PKR {Number(stats.revenue_this_week || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Total Revenue</p>
                <p className="text-xl font-bold text-gray-900">PKR {Number(stats.total_revenue || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Section: Completed + Cancelled + Trends */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Performance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Completed</p>
                <p className="text-xl font-bold text-green-600">{stats.completed_count || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Cancelled</p>
                <p className="text-xl font-bold text-red-500">{stats.cancelled_count || 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Avg. Order Value</p>
                <p className="text-xl font-bold text-gray-900">
                  PKR {Number(stats.average_order_value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-1">Best Seller</p>
                <p className="text-base font-bold text-gray-900 truncate" title={stats.best_selling_product?.name || 'N/A'}>
                  {stats.best_selling_product?.name || 'N/A'}
                </p>
                {stats.best_selling_product && (
                  <p className="text-xs text-gray-400 mt-0.5">{stats.best_selling_product.totalSold} sold</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4 overflow-x-auto">
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
