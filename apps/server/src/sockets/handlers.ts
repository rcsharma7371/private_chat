import { Server } from 'socket.io';
import { encryptedMessagePayloadSchema, encryptedSignalPayloadSchema } from '@talk/shared';
import { prisma } from '../db.js';
import { saveMessage } from '../services/roomService.js';
import { AuthenticatedSocket } from './index.js';

export function registerSocketHandlers(io: Server, socket: AuthenticatedSocket) {
  const { roomId, slotIndex, devicePubKey } = socket.session;

  // 1. Join room channel & sync peer presence
  socket.on('room:join', async () => {
    socket.join(roomId);

    try {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          participants: true,
        },
      });

      if (!room) {
        socket.emit('room:destroyed', { reason: 'Room no longer exists' });
        return;
      }

      // Check if peer is already present in DB
      const peer = room.participants.find((p) => p.slotIndex !== slotIndex);
      if (peer) {
        console.log(`[Socket] Sending peer info (slot ${peer.slotIndex}) to joining slot ${slotIndex}`);
        socket.emit('room:peer-info', {
          slotIndex: peer.slotIndex,
          devicePubKey: peer.devicePubKey,
          ecdhPubKey: peer.ecdhPubKey,
          displayName: peer.displayName,
          joinedAt: peer.joinedAt.toISOString(),
        });

        // Also broadcast peer info to the other participant so both have derived keys
        const me = room.participants.find((p) => p.slotIndex === slotIndex);
        if (me) {
          socket.to(roomId).emit('room:peer-joined', {
            slotIndex: me.slotIndex,
            devicePubKey: me.devicePubKey,
            ecdhPubKey: me.ecdhPubKey,
            displayName: me.displayName,
          });
        }
      }
    } catch (err) {
      console.error('[Socket Join Error]', err);
    }
  });

  // 2. Encrypted messaging relay & persistence
  socket.on('msg:send', async (payload: unknown) => {
    const parsed = encryptedMessagePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn('[Socket Msg Error] Invalid payload structure:', parsed.error.issues);
      socket.emit('room:error', { message: 'Invalid message structure' });
      return;
    }

    const msgData = parsed.data;

    // Enforce authentic sender slot
    if (msgData.senderSlot !== slotIndex) {
      console.warn(`[Socket Msg Error] Slot spoofing attempt: claim ${msgData.senderSlot} vs session ${slotIndex}`);
      socket.emit('room:error', { message: 'Slot index spoofing rejected' });
      return;
    }

    try {
      const saved = await saveMessage(roomId, {
        senderSlot: msgData.senderSlot,
        counter: msgData.counter,
        iv: msgData.iv,
        ciphertext: msgData.ciphertext,
        expiresAt: msgData.expiresAt ?? null,
      });

      console.log(`[Socket] Relaying msg #${saved.counter} from slot ${slotIndex} in room ${roomId}`);
      // Relay to both peers in the room (so sender gets confirmed ID and recipient receives real-time)
      io.to(roomId).emit('msg:new', saved);
    } catch (err) {
      console.error('[Message Save Error]', err);
      socket.emit('room:error', { message: 'Failed to process message' });
    }
  });

  // 3. Ephemeral typing indicator relay
  socket.on('msg:typing', (data: { isTyping: boolean }) => {
    socket.to(roomId).emit('msg:typing', {
      slotIndex,
      isTyping: !!data?.isTyping,
    });
  });

  // 4. Encrypted WebRTC signaling relays (SDP offer/answer, ICE candidates)
  socket.on('call:offer', async (payload: unknown) => {
    const parsed = encryptedSignalPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    console.log(`[Socket Signaling] call:offer from slot ${slotIndex} in room ${roomId}`);
    await prisma.room.update({
      where: { id: roomId },
      data: { lastActivityAt: new Date() },
    }).catch(() => {});

    socket.to(roomId).emit('call:offer', {
      ...parsed.data,
      fromSlot: slotIndex,
    });
  });

  socket.on('call:answer', (payload: unknown) => {
    const parsed = encryptedSignalPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    console.log(`[Socket Signaling] call:answer from slot ${slotIndex} in room ${roomId}`);
    socket.to(roomId).emit('call:answer', {
      ...parsed.data,
      fromSlot: slotIndex,
    });
  });

  socket.on('call:ice', (payload: unknown) => {
    const parsed = encryptedSignalPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    socket.to(roomId).emit('call:ice', {
      ...parsed.data,
      fromSlot: slotIndex,
    });
  });

  socket.on('call:end', () => {
    console.log(`[Socket Signaling] call:end from slot ${slotIndex} in room ${roomId}`);
    socket.to(roomId).emit('call:end', {
      fromSlot: slotIndex,
    });
  });
}
