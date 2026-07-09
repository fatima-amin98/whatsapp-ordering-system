import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatPKR } from '../../utils/formatCurrency';

// ─── Stat Card ──────────────────────────────────────────────────────
function StatCard({ icon, label, value, subtext, color = 'blue' }) {
  const colorMap = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-emerald-500 to-emerald-600',
    purple: 'from-purple-500 to-purple-600',
    amber: 'from-amber-500 to-amber-600',
    red: 'from-red-500 to-red-600',
    gray: 'from-gray-500 to-gray-600',
    indigo: 'from-indigo-500 to-indigo-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorMap[color] || colorMap.blue} flex items-center justify-center text-white text-lg`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  );
}

// ─── Mini Stat (no icon, smaller) ──────────────────────────────────
const MINI_COLOR_CLASSES = {
  blue: 'text-blue-600',
  gray: 'text-gray-600',
  green: 'text-green-600',
  red: 'text-red-600',
  indigo: 'text-indigo-600',
  amber: 'text-amber-600',
  purple: 'text-purple-600',
};

function MiniStat({ label, value, color = 'gray' }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${MINI_COLOR_CLASSES[color] || MINI_COLOR_CLASSES.gray}`}>{value}</p>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────
const STATUS_BADGE = {
  'Confirmation Pending': { label: 'Pending', class: 'bg-yellow-100 text-yellow-800' },
  'Awaiting Customer Confirmation': { label: 'Awaiting', class: 'bg-purple-100 text-purple-800' },
  'Pending': { label: 'Pending', class: 'bg-blue-100 text-blue-800' },
  'Accepted': { label: 'Accepted', class: 'bg-green-100 text-green-800' },
  'Completed': { label: 'Done', class: 'bg-gray-100 text-gray-800' },
  'Cancelled': { label: 'Cancelled', class: 'bg-red-100 text-red-800' },
  'Expired': { label: 'Expired', class: 'bg-gray-100 text-gray-500' },
};

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardHome() {
  const { merchant } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [productCount, setProductCount] = useState(0);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [statsData, ordersData, productsData] = await Promise.all([
        api.getStats(),
        api.getOrders('', 5).catch(() => ({ orders: [] })),
        api.getProducts('').catch(() => ({ products: [] })),
      ]);
      setStats(statsData.stats);
      setProductCount(productsData.products?.length || 0);
      setRecentOrders(ordersData.orders || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyStoreLink = useCallback(() => {
    if (merchant?.slug) {
      const url = `${window.location.origin}/store/${merchant.slug}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [merchant?.slug]);

  const storeUrl = merchant?.slug ? `${window.location.origin}/store/${merchant.slug}` : '';

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Welcome back, {merchant?.storeName}</p>
        </div>
      </div>

      {/* ─── Order Pipeline ──────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Order Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            icon="🕐"
            label="Pending"
            value={stats?.pending_count || 0}
            color="blue"
            subtext="Awaiting merchant action"
          />
          <StatCard
            icon="📨"
            label="Awaiting Confirmation"
            value={(stats?.awaiting_confirmation_count || 0) + (stats?.unconfirmed_count || 0)}
            color="purple"
            subtext="Waiting for customer"
          />
          <StatCard
            icon="✅"
            label="Accepted"
            value={stats?.accepted_count || 0}
            color="green"
            subtext="To be fulfilled"
          />
          <StatCard
            icon="✓"
            label="Completed"
            value={stats?.completed_count || 0}
            color="indigo"
            subtext="Fulfilled orders"
          />
          <StatCard
            icon="✕"
            label="Cancelled"
            value={stats?.cancelled_count || 0}
            color="red"
            subtext="Cancelled orders"
          />
        </div>
      </div>

      {/* ─── Revenue & Performance ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Revenue</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="💰" label="Revenue Today" value={formatPKR(stats?.revenue_today || 0)} color="green" />
            <StatCard icon="📈" label="Revenue This Week" value={formatPKR(stats?.revenue_this_week || 0)} color="green" />
            <StatCard icon="🏆" label="Total Revenue" value={formatPKR(stats?.total_revenue || 0)} color="amber" />
            <StatCard icon="📊" label="Avg. Order Value" value={formatPKR(stats?.average_order_value || 0)} color="blue" />
          </div>
        </div>

        {/* Performance */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Performance</h2>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Orders Today" value={stats?.orders_today || 0} color="blue" />
            <MiniStat label="Orders This Week" value={stats?.orders_this_week || 0} color="blue" />
            <MiniStat
              label="Best Selling"
              value={stats?.best_selling_product?.name || 'N/A'}
              color="gray"
            />
            <MiniStat label="Total Products" value={productCount} color="gray" />
          </div>
          {stats?.best_selling_product && (
            <p className="text-xs text-gray-400 mt-1 ml-1">
              Best seller: {stats.best_selling_product.totalSold} units sold
            </p>
          )}
        </div>
      </div>

      {/* ─── Quick Actions ────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/dashboard/products')}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-lg mb-3 group-hover:bg-blue-100 transition-colors">
              ➕
            </div>
            <p className="font-semibold text-gray-900 text-sm">Add Product</p>
            <p className="text-xs text-gray-400">Create a new product</p>
          </button>

          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-green-200 transition-all block group"
          >
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600 text-lg mb-3 group-hover:bg-green-100 transition-colors">
              👁️
            </div>
            <p className="font-semibold text-gray-900 text-sm">View Store</p>
            <p className="text-xs text-gray-400">See your public store</p>
          </a>

          <button
            onClick={copyStoreLink}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-purple-200 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 text-lg mb-3 group-hover:bg-purple-100 transition-colors">
              🔗
            </div>
            <p className="font-semibold text-gray-900 text-sm">{copied ? 'Copied!' : 'Copy Store Link'}</p>
            <p className="text-xs text-gray-400">Share your store URL</p>
          </button>

          <button
            onClick={() => navigate('/dashboard/settings')}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-600 text-lg mb-3 group-hover:bg-gray-100 transition-colors">
              ⚙️
            </div>
            <p className="font-semibold text-gray-900 text-sm">Settings</p>
            <p className="text-xs text-gray-400">Manage your store</p>
          </button>
        </div>
      </div>

      {/* ─── Recent Orders ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Orders</h2>
          <button
            onClick={() => navigate('/dashboard/orders')}
            className="text-sm text-blue-600 hover:underline"
          >
            View all →
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-400 text-3xl mb-2">📭</p>
            <p className="text-gray-500 text-sm">No orders yet</p>
            <p className="text-xs text-gray-400 mt-1">Share your store link to start receiving orders</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {recentOrders.map((order) => {
                const badge = STATUS_BADGE[order.orderStatus] || { label: order.orderStatus, class: 'bg-gray-100 text-gray-800' };
                return (
                  <div key={order.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                        #{order.id}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{order.customerName}</p>
                        <p className="text-xs text-gray-400">{formatPKR(order.total)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.class}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-gray-400 hidden sm:inline">{formatTimeAgo(order.createdAt)}</span>
                      <button
                        onClick={() => navigate('/dashboard/orders')}
                        className="text-xs text-blue-600 hover:underline flex-shrink-0"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
