import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import cookie from 'cookie';
import { RoomSessionPayload } from '@talk/shared';
import { config } from '../config.js';
import { verifySessionToken } from '../services/authService.js';
import { registerSocketHandlers } from './handlers.js';

let ioInstance: Server | null = null;

// Track active sockets per room: Map<roomId, Map<devicePubKey, socketId>>
export const activeRoomSockets = new Map<string, Map<string, string>>();

export interface AuthenticatedSocket extends Socket {
  session: RoomSessionPayload;
}

export function initSocketIO(server: HttpServer): Server {
  const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? config.CLIENT_ORIGIN
        : (origin, callback) => callback(null, true),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    try {
      const rawCookies = socket.handshake.headers.cookie;
      const parsedCookies = rawCookies ? cookie.parse(rawCookies) : {};
      const token =
        socket.handshake.auth?.token ||
        parsedCookies.talk_session ||
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : null);

      if (!token) {
        console.warn('[Socket Auth] Connection rejected: No authentication token provided');
        return next(new Error('Authentication token required'));
      }

      const session = verifySessionToken(token);
      if (!session) {
        console.warn('[Socket Auth] Connection rejected: Session token invalid or expired');
        return next(new Error('Session invalid or expired'));
      }

      (socket as AuthenticatedSocket).session = session;
      next();
    } catch (err: any) {
      console.warn('[Socket Auth Error]', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { roomId, devicePubKey, slotIndex } = authSocket.session;

    let roomDevices = activeRoomSockets.get(roomId);
    if (!roomDevices) {
      roomDevices = new Map<string, string>();
      activeRoomSockets.set(roomId, roomDevices);
    }

    // Replace previous socket for the same device if present
    const existingSocketId = roomDevices.get(devicePubKey);
    if (existingSocketId && existingSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existingSocketId);
      if (oldSocket) {
        console.log(`[Socket] Replaced previous session for device in room ${roomId}`);
        oldSocket.emit('room:error', { message: 'Replaced by another session on this device' });
        oldSocket.disconnect(true);
      }
    }

    // Maximum 2 authenticated sockets per room
    if (!roomDevices.has(devicePubKey) && roomDevices.size >= 2) {
      console.warn(`[Socket] Room ${roomId} rejected 3rd participant socket`);
      socket.emit('room:error', { message: 'Room has reached maximum socket capacity (2 participants)' });
      socket.disconnect(true);
      return;
    }

    roomDevices.set(devicePubKey, socket.id);

    // Join room channel immediately upon authenticated connection
    socket.join(roomId);
    console.log(`[Socket] Participant (slot ${slotIndex}) connected to room ${roomId}`);

    // Register event handlers
    registerSocketHandlers(io, authSocket);

    socket.on('disconnect', () => {
      console.log(`[Socket] Participant (slot ${slotIndex}) disconnected from room ${roomId}`);
      const devices = activeRoomSockets.get(roomId);
      if (devices && devices.get(devicePubKey) === socket.id) {
        devices.delete(devicePubKey);
        if (devices.size === 0) {
          activeRoomSockets.delete(roomId);
        }
      }
    });
  });

  ioInstance = io;
  return io;
}

export function getIO(): Server | null {
  return ioInstance;
}
