import React, { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { useChatStore } from '../../state/chatStore.js';
import { getSocket } from '../../services/socket.js';

export const MessageComposer: React.FC = () => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sendTextMessage = useChatStore((s) => s.sendTextMessage);

  const handleTyping = () => {
    const socket = getSocket();
    if (!socket) return;

    if (!typingTimeoutRef.current) {
      socket.emit('msg:typing', { isTyping: true });
    } else {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('msg:typing', { isTyping: false });
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // Reset typing immediately
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      getSocket()?.emit('msg:typing', { isTyping: false });
    }

    setSending(true);
    try {
      setText('');
      await sendTextMessage(trimmed);
    } catch (err) {
      console.error('Failed to send message:', err);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-2 sm:p-3 bg-dark-800 border-t border-zinc-800 flex items-center gap-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
    >
      <input
        type="text"
        placeholder="Type an encrypted message..."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          handleTyping();
        }}
        onKeyDown={handleKeyDown}
        maxLength={4000}
        className="flex-1 min-w-0 bg-dark-900 border border-zinc-700/80 rounded-full px-3.5 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white flex items-center justify-center transition shadow-md"
        title="Send Encrypted Message"
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  );
};
