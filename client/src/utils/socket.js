import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    const serverUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || '';
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
