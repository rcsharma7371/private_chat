import { create } from 'zustand';
import { DecryptedMessage } from '@talk/shared';
import { encryptMessage, decryptMessage } from '../crypto/e2ee.js';
import { saveLocalMessage } from '../crypto/idb.js';
import { useRoomStore } from './roomStore.js';
import { getSocket } from '../services/socket.js';

interface ChatStoreState {
  messages: DecryptedMessage[];
  counter: number;
  isPeerTyping: boolean;

  addIncomingEncryptedMessage: (msg: {
    id: string;
    senderSlot: number;
    counter: number;
    iv: string;
    ciphertext: string;
    createdAt: string;
    expiresAt: string | null;
  }) => Promise<void>;

  sendTextMessage: (text: string) => Promise<void>;
  setPeerTyping: (isTyping: boolean) => void;
  loadInitialMessages: (
    encryptedMsgs: Array<{
      id: string;
      senderSlot: number;
      counter: number;
      iv: string;
      ciphertext: string;
      createdAt: string;
      expiresAt: string | null;
    }>
  ) => Promise<void>;
  purgeExpiredMessages: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  messages: [],
  counter: 0,
  isPeerTyping: false,

  addIncomingEncryptedMessage: async (msg) => {
    const { sessionKeys, roomId, slotIndex } = useRoomStore.getState();
    if (!sessionKeys || !roomId) return;

    // Check if already in store
    if (get().messages.some((m) => m.id === msg.id)) return;

    try {
      const decryptedText = await decryptMessage(
        sessionKeys.messageKey,
        roomId,
        msg.counter,
        msg.iv,
        msg.ciphertext
      );

      const isOutgoing = msg.senderSlot === slotIndex;
      const decryptedMsg: DecryptedMessage = {
        id: msg.id,
        counter: msg.counter,
        senderSlot: msg.senderSlot,
        text: decryptedText,
        timestamp: new Date(msg.createdAt).getTime(),
        isOutgoing,
        expiresAt: msg.expiresAt ? new Date(msg.expiresAt).getTime() : null,
      };

      await saveLocalMessage({
        ...decryptedMsg,
        roomId,
      });

      set((state) => ({
        messages: [...state.messages, decryptedMsg].sort((a, b) => a.counter - b.counter),
        counter: Math.max(state.counter, msg.counter),
      }));
    } catch (err) {
      console.error('[ChatStore] Message decryption failed:', err);
    }
  },

  sendTextMessage: async (text: string) => {
    const { sessionKeys, roomId, slotIndex, disappearAfter } = useRoomStore.getState();
    if (!sessionKeys || !roomId || slotIndex === null) {
      throw new Error('Cryptographic session not active');
    }

    const nextCounter = get().counter + 1;

    // Encrypt message with unique random IV & AAD
    const encrypted = await encryptMessage(sessionKeys.messageKey, roomId, nextCounter, text);

    let expiresAt: string | null = null;
    if (disappearAfter && disappearAfter > 0) {
      expiresAt = new Date(Date.now() + disappearAfter * 1000).toISOString();
    }

    const socket = getSocket();
    if (!socket) {
      throw new Error('Realtime socket not connected');
    }

    socket.emit('msg:send', {
      counter: nextCounter,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      senderSlot: slotIndex,
      expiresAt,
    });

    set({ counter: nextCounter });
  },

  setPeerTyping: (isTyping) => {
    set({ isPeerTyping: isTyping });
  },

  loadInitialMessages: async (encryptedMsgs) => {
    for (const msg of encryptedMsgs) {
      await get().addIncomingEncryptedMessage(msg);
    }
  },

  purgeExpiredMessages: () => {
    const now = Date.now();
    set((state) => ({
      messages: state.messages.filter((m) => !m.expiresAt || m.expiresAt > now),
    }));
  },

  clearMessages: () => {
    set({ messages: [], counter: 0, isPeerTyping: false });
  },
}));
