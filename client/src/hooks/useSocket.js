import { useEffect, useRef } from 'react';
import { getSocket, disconnectSocket } from '../utils/socket';

export function useSocket(storeId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  useEffect(() => {
    if (!storeId) return;

    const socket = getSocket();

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    const onNewOrder = (data) => handlersRef.current.onNewOrder?.(data.order);
    const onOrderConfirmed = (data) => handlersRef.current.onOrderConfirmed?.(data);
    const onOrderStatusChanged = (data) => handlersRef.current.onOrderStatusChanged?.(data);
    const onConfirmationSent = (data) => handlersRef.current.onConfirmationSent?.(data);

    socket.on('new-order', onNewOrder);
    socket.on('order-confirmed', onOrderConfirmed);
    socket.on('order-status-changed', onOrderStatusChanged);
    socket.on('confirmation-sent', onConfirmationSent);

    return () => {
      socket.off('new-order', onNewOrder);
      socket.off('order-confirmed', onOrderConfirmed);
      socket.off('order-status-changed', onOrderStatusChanged);
      socket.off('confirmation-sent', onConfirmationSent);
      disconnectSocket();
    };
  }, [storeId]);
}
