import { Server } from 'socket.io';
import { verifyJwt } from '../utils/jwt.js';
import { checkRateLimit } from '../middleware/rateLimit.js';

export function initializeSocket(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const ip = socket.handshake.address;
    const { allowed } = checkRateLimit(`socket:${ip}`, 10, 60000);
    if (!allowed) {
      return next(new Error('Too many connections. Try again later.'));
    }
    next();
  });

  io.use((socket, next) => {
    let token = socket.handshake.auth?.token;

    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie;
      if (cookieHeader) {
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map((c) => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
          })
        );
        token = cookies.token;
      }
    }

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = verifyJwt(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    socket.storeId = payload.storeId;
    next();
  });

  io.on('connection', (socket) => {
    const storeId = socket.storeId;
    const room = `store:${storeId}`;

    socket.join(room);
    console.log(`Merchant connected: store ${storeId} (socket ${socket.id})`);

    socket.on('join-store', (data) => {
      if (data?.storeId === storeId) {
        socket.join(room);
      }
    });

    socket.on('leave-store', (data) => {
      if (data?.storeId === storeId) {
        socket.leave(room);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Merchant disconnected: store ${storeId} (socket ${socket.id})`);
    });
  });

  return io;
}
