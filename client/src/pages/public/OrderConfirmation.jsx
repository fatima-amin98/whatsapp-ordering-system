import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { formatPKR } from '../../utils/formatCurrency';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';

const STATUS_COLORS = {
  'Confirmation Pending': 'bg-yellow-100 text-yellow-800',
  'Awaiting Customer Confirmation': 'bg-purple-100 text-purple-800',
  'Pending': 'bg-blue-100 text-blue-800',
  'Accepted': 'bg-green-100 text-green-800',
  'Completed': 'bg-gray-100 text-gray-800',
  'Cancelled': 'bg-red-100 text-red-800',
  'Expired': 'bg-gray-100 text-gray-600',
};

function statusMessageFor(status, confirmationMessageSentAt) {
  switch (status) {
    case 'Confirmation Pending':
      return '';
    case 'Awaiting Customer Confirmation':
      return 'The merchant has sent you a confirmation link. Please confirm or cancel your order below.';
    case 'Pending':
      return 'Your order has been confirmed and is awaiting review by the merchant.';
    case 'Accepted':
      return 'Your order has been accepted by the merchant.';
    case 'Completed':
      return 'Your order has been completed.';
    case 'Cancelled':
      return 'This order has been cancelled.';
    case 'Expired':
      return 'This order has expired. Please place a new order.';
    default:
      return '';
  }
}

export default function OrderConfirmation() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('Missing confirmation token');
      setLoading(false);
      return;
    }
    if (!orderId) {
      setError('Missing order ID');
      setLoading(false);
      return;
    }

    api.getOrder(orderId, token)
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.data?.error || err.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [orderId, token]);

  const handleConfirm = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await api.confirmOrder(orderId, token);
      setActionResult({ type: 'confirmed', message: data.message });
      setOrder((prev) => prev ? { ...prev, orderStatus: 'Pending', canConfirm: false, canCancel: false, statusMessage: 'Your order has been confirmed and is awaiting review by the merchant.' } : prev);
    } catch (err) {
      const errData = err.data || {};
      if (errData.alreadyConfirmed) {
        setActionResult({ type: 'info', message: 'This order is already confirmed.' });
        setOrder((prev) => prev ? { ...prev, canConfirm: false, canCancel: false, orderStatus: 'Pending' } : prev);
      } else if (errData.expired) {
        setActionResult({ type: 'info', message: 'This order has expired.' });
        setOrder((prev) => prev ? { ...prev, canConfirm: false, canCancel: false, orderStatus: 'Expired' } : prev);
      } else if (errData.cancelled) {
        setActionResult({ type: 'info', message: 'This order has been cancelled.' });
        setOrder((prev) => prev ? { ...prev, canConfirm: false, canCancel: false, orderStatus: 'Cancelled' } : prev);
      } else {
        setActionError(errData.error || 'Failed to confirm order');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await api.cancelOrder(orderId, token);
      setActionResult({ type: 'cancelled', message: data.message });
      setOrder((prev) => prev ? { ...prev, orderStatus: 'Cancelled', canConfirm: false, canCancel: false, statusMessage: 'This order has been cancelled.' } : prev);
    } catch (err) {
      const errData = err.data || {};
      if (errData.alreadyCancelled) {
        setActionResult({ type: 'info', message: 'This order is already cancelled.' });
        setOrder((prev) => prev ? { ...prev, canConfirm: false, canCancel: false } : prev);
      } else if (errData.expired) {
        setActionResult({ type: 'info', message: 'This order has already expired.' });
        setOrder((prev) => prev ? { ...prev, canConfirm: false, canCancel: false } : prev);
      } else {
        setActionError(errData.error || 'Failed to cancel order');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading order details..." />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <ErrorMessage message={error} />
          <Link to="/" className="text-blue-600 underline mt-4 inline-block">Go to home</Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-lg font-bold">{order.storeName}</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-lg">Order #{order.id}</h2>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.orderStatus] || 'bg-gray-100'}`}>
              {order.orderStatus}
            </span>
          </div>

          {order.orderStatus === 'Confirmation Pending' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-green-800 text-lg mb-1">Order Placed Successfully!</p>
              <p className="text-sm text-green-700 leading-relaxed">
                Thank you for your order.<br />
                The merchant has received your order and will send you a WhatsApp confirmation shortly.<br />
                Once you receive the WhatsApp message, simply tap the confirmation link to confirm your order.
              </p>
              <p className="text-xs text-green-600 mt-2">
                No further action is required on this page. You may safely close this page after reviewing your order details below.
              </p>
            </div>
          )}

          {order.orderStatus !== 'Confirmation Pending' && (
            <p className="text-sm text-gray-600 mb-4">
              {order.statusMessage || statusMessageFor(order.orderStatus, order.confirmationMessageSentAt)}
            </p>
          )}

          <div className="border-t border-gray-100 pt-3 space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.productName} × {item.quantity}</span>
                <span className="font-medium">{formatPKR(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatPKR(order.subtotal)}</span>
            </div>
            {order.fulfillmentMethod === 'delivery' && (
              <div className="flex justify-between">
                <span className="text-gray-500">Delivery fee</span>
                <span>{formatPKR(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200">
              <span>Total</span>
              <span>{formatPKR(order.total)}</span>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-400 space-y-0.5">
            <p>Customer: {order.customerName}</p>
            <p>Phone: {order.customerPhone}</p>
            {order.fulfillmentMethod === 'delivery' && <p>Deliver to: {order.deliveryAddress}</p>}
            {order.fulfillmentMethod === 'pickup' && <p>Pickup</p>}
          </div>
        </div>

        {actionResult && (
          <div className={`p-4 rounded-lg text-center ${
            actionResult.type === 'confirmed' ? 'bg-green-50 border border-green-200' :
            actionResult.type === 'cancelled' ? 'bg-red-50 border border-red-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <p className={`font-medium ${
              actionResult.type === 'confirmed' ? 'text-green-700' :
              actionResult.type === 'cancelled' ? 'text-red-700' :
              'text-blue-700'
            }`}>
              {actionResult.message}
            </p>
            <Link to={`/store/${order.storeSlug || ''}`} className="text-sm underline mt-2 inline-block text-blue-600">
              Back to store
            </Link>
          </div>
        )}

        {actionError && <ErrorMessage message={actionError} />}

        {order.canConfirm && (
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={actionLoading}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : '✅ Confirm Order'}
            </button>
            {order.canCancel && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 bg-red-100 text-red-700 py-3 rounded-lg font-semibold hover:bg-red-200 disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : '✕ Cancel Order'}
              </button>
            )}
          </div>
        )}

        {order.canCancel && !order.canConfirm && (
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 bg-red-100 text-red-700 py-3 rounded-lg font-semibold hover:bg-red-200 disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : '✕ Cancel Order'}
            </button>
          </div>
        )}

        {!order.canConfirm && !order.canCancel && !actionResult && (
          <div className="bg-gray-100 rounded-lg p-4 text-center">
            <p className="text-gray-500 text-sm">
              {order.orderStatus === 'Expired' && 'This order has expired. Please place a new order.'}
              {order.orderStatus === 'Cancelled' && 'This order has been cancelled.'}
              {order.orderStatus === 'Pending' && 'Your order has been confirmed and is awaiting merchant review.'}
              {order.orderStatus === 'Accepted' && 'Your order has been accepted by the merchant.'}
              {order.orderStatus === 'Completed' && 'Your order has been completed.'}
              {order.orderStatus === 'Confirmation Pending' && 'Your order has been received. The merchant will send you a WhatsApp confirmation shortly.'}
              {order.orderStatus === 'Awaiting Customer Confirmation' && order.confirmationMessageSentAt && 'The merchant has sent the confirmation. Please confirm or cancel above.'}
            </p>
            {(order.orderStatus === 'Expired' || order.orderStatus === 'Cancelled') && (
              <Link to={`/store/${order.storeSlug || ''}`} className="text-blue-600 underline mt-2 inline-block text-sm">
                Return to store
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
