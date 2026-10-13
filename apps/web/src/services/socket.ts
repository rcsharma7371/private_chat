import { io, Socket } from 'socket.io-client';
import { useRoomStore } from '../state/roomStore.js';
import { useChatStore } from '../state/chatStore.js';
import { webrtcService } from './webrtc.js';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function initSocketConnection(token?: string): Socket {
  if (socket) {
    socket.disconnect();
  }

  const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;

  socket = io(wsUrl, {
    withCredentials: true,
    auth: token ? { token } : undefined,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to realtime relay server:', socket?.id);
    socket?.emit('room:join');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket Connect Error]', err.message);
  });

  // Peer joined or peer info received
  socket.on('room:peer-info', (peer) => {
    useRoomStore.getState().setPeer(peer);
  });

  socket.on('room:peer-joined', (peer) => {
    useRoomStore.getState().setPeer(peer);
  });

  socket.on('room:peer-left', () => {
    useRoomStore.getState().clearPeer();
  });

  // Realtime incoming encrypted message
  socket.on('msg:new', (msg) => {
    useChatStore.getState().addIncomingEncryptedMessage(msg);
  });

  // Ephemeral typing indicator
  socket.on('msg:typing', (data) => {
    const { slotIndex } = useRoomStore.getState();
    if (data.slotIndex !== slotIndex) {
      useChatStore.getState().setPeerTyping(data.isTyping);
    }
  });

  // Disappearing messages timer update
  socket.on('room:disappear-changed', (data) => {
    useRoomStore.getState().setDisappearAfter(data.disappearAfter);
  });

  // WebRTC Encrypted Signaling Relays
  socket.on('call:offer', (payload) => {
    webrtcService.handleIncomingOffer(payload);
  });

  socket.on('call:answer', (payload) => {
    webrtcService.handleIncomingAnswer(payload);
  });

  socket.on('call:ice', (payload) => {
    webrtcService.handleIncomingIce(payload);
  });

  socket.on('call:end', () => {
    webrtcService.handlePeerEndedCall();
  });

  // Room destruction (Panic burn or 30-day inactivity deletion)
  socket.on('room:destroyed', async () => {
    await useRoomStore.getState().destroyLocalRoom();
    useChatStore.getState().clearMessages();
    alert('This room has been destroyed and all cryptographic keys have been shredded.');
    window.location.href = '/';
  });

  socket.on('room:error', (data) => {
    console.warn('[Socket Room Error]', data.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
