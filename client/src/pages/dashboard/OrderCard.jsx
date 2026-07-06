import { useState } from 'react';
import { formatPKR } from '../../utils/formatCurrency';

const STATUS_CONFIG = {
  'Confirmation Pending': { label: 'Confirmation Pending', color: 'bg-yellow-100 text-yellow-800' },
  'Awaiting Customer Confirmation': { label: 'Awaiting Confirmation', color: 'bg-purple-100 text-purple-800' },
  'Pending': { label: 'Pending', color: 'bg-blue-100 text-blue-800' },
  'Accepted': { label: 'Accepted', color: 'bg-green-100 text-green-800' },
  'Completed': { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
  'Cancelled': { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  'Expired': { label: 'Expired', color: 'bg-gray-100 text-gray-500' },
};

function formatTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return null;
  }
}

export default function OrderCard({ order, onAccept, onComplete, onCancel, onSendConfirmation, loading, isNew }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[order.orderStatus] || { label: order.orderStatus, color: 'bg-gray-100 text-gray-800' };

  const isConfirmationPending = order.orderStatus === 'Confirmation Pending';
  const isAwaitingCustomer = order.orderStatus === 'Awaiting Customer Confirmation';
  const isPending = order.orderStatus === 'Pending';
  const isAccepted = order.orderStatus === 'Accepted';
  const isTerminal = ['Completed', 'Cancelled', 'Expired'].includes(order.orderStatus);

  const confirmationSent = !!order.confirmationMessageSentAt;
  const customerConfirmed = isPending || isAccepted || order.orderStatus === 'Completed';

  return (
    <div className={`bg-white rounded-lg border shadow-sm transition-all ${isNew ? 'ring-2 ring-blue-300 animate-pulse' : ''}`}>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">Order #{order.id}</span>
              {isNew && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">New</span>}
            </div>
            <p className="text-sm text-gray-500">{order.customerName} · {order.customerPhone}</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">
            {order.fulfillmentMethod === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'} ·{' '}
            {new Date(order.createdAt).toLocaleString()}
          </span>
          <span className="font-bold">{formatPKR(order.total)}</span>
        </div>

        {/* Workflow steps */}
        {!isTerminal && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className={confirmationSent ? 'text-green-600' : (isConfirmationPending ? 'text-gray-400' : 'text-green-600')}>
                {confirmationSent ? '✓' : '○'}
              </span>
              <span className="text-gray-600">Confirmation Message</span>
              <span className={confirmationSent ? 'text-green-600 font-medium' : 'text-gray-400'}>
                {confirmationSent ? 'Sent' : 'Not Sent'}
              </span>
              {confirmationSent && (
                <span className="text-xs text-gray-400 ml-auto">{formatTime(order.confirmationMessageSentAt)}</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className={customerConfirmed ? 'text-green-600' : 'text-gray-400'}>
                {customerConfirmed ? '✓' : '○'}
              </span>
              <span className="text-gray-600">Customer Confirmed</span>
              <span className={customerConfirmed ? 'text-green-600 font-medium' : 'text-gray-400'}>
                {customerConfirmed ? 'Yes' : 'Waiting...'}
              </span>
            </div>

            {isConfirmationPending && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mt-1">
                📲 Send the WhatsApp confirmation first. Accept and Cancel become available after the customer confirms.
              </p>
            )}
            {isAwaitingCustomer && (
              <p className="text-xs text-purple-600 bg-purple-50 rounded px-2 py-1 mt-1">
                ⌛ Confirmation sent. Waiting for the customer to confirm. Accept and Cancel will become available after confirmation.
              </p>
            )}
            {isPending && (
              <p className="text-xs text-green-600 bg-green-50 rounded px-2 py-1 mt-1">
                ✓ Customer confirmed. You may now Accept or Cancel this order.
              </p>
            )}
            {isAccepted && (
              <p className="text-xs text-green-600 bg-green-50 rounded px-2 py-1 mt-1">
                ✓ Order accepted. Mark as Completed when fulfilled.
              </p>
            )}
          </div>
        )}

        <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-600 mt-2 hover:underline">
          {expanded ? 'Hide details' : 'Show details'}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="space-y-1.5 text-sm">
              {order.items?.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>{item.productName} × {item.quantity}</span>
                  <span>{formatPKR(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-2 pt-2 text-sm space-y-0.5">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span><span>{formatPKR(order.subtotal)}</span>
              </div>
              {order.fulfillmentMethod === 'delivery' && (
                <div className="flex justify-between text-gray-500">
                  <span>Delivery fee</span><span>{formatPKR(order.deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Total</span><span>{formatPKR(order.total)}</span>
              </div>
            </div>
            {order.fulfillmentMethod === 'delivery' && order.deliveryAddress && (
              <p className="text-xs text-gray-500 mt-2">📍 {order.deliveryAddress}</p>
            )}
          </div>
        )}
      </div>

      {/* Send WhatsApp Confirmation — only for Confirmation Pending, not yet sent */}
      {isConfirmationPending && !confirmationSent && onSendConfirmation && (
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => onSendConfirmation(order.id)}
            disabled={loading}
            className="flex-1 py-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            📲 Send WhatsApp Confirmation
          </button>
        </div>
      )}

      {/* Accept / Cancel — only after customer confirms (Pending) */}
      {isPending && (
        <div className="flex border-t border-gray-100">
          <button onClick={() => onAccept(order.id)} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 border-r border-gray-100">
            ✅ Accept Order
          </button>
          <button onClick={() => onCancel(order.id)} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
            ✕ Cancel Order
          </button>
        </div>
      )}

      {/* Complete / Cancel — when Accepted */}
      {isAccepted && (
        <div className="flex border-t border-gray-100">
          <button onClick={() => onComplete(order.id)} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 border-r border-gray-100">
            ✅ Complete Order
          </button>
          <button onClick={() => onCancel(order.id)} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
            ✕ Cancel Order
          </button>
        </div>
      )}
    </div>
  );
}
