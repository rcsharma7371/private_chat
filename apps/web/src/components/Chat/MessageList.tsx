import React, { useEffect, useRef } from 'react';
import { Copy, Check, Flame } from 'lucide-react';
import { DecryptedMessage } from '@talk/shared';
import { useChatStore } from '../../state/chatStore.js';
import { useRoomStore } from '../../state/roomStore.js';
import { useClipboard } from '../../hooks/useClipboard.js';

interface MessageListProps {
  messages: DecryptedMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isPeerTyping = useChatStore((s) => s.isPeerTyping);
  const peerDisplayName = useRoomStore((s) => s.peerDisplayName);
  const { copyWithWarning, showWarning } = useClipboard();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPeerTyping]);

  const handleCopy = (id: string, text: string) => {
    copyWithWarning(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 sm:space-y-3">
      {showWarning && (
        <div className="sticky top-2 z-10 p-2.5 bg-amber-950/80 border border-amber-900 text-amber-200 text-xs rounded-lg text-center backdrop-blur-md shadow-lg transition animate-in fade-in">
          ⚠️ Notice: Text copied to your clipboard leaves the end-to-end encrypted app boundary.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 py-16 space-y-2">
          <div className="w-10 h-10 rounded-full bg-dark-800 border border-zinc-800 flex items-center justify-center text-emerald-500 text-lg">
            🔒
          </div>
          <p className="text-sm font-medium text-zinc-400">Encrypted Channel Ready</p>
          <p className="text-xs text-zinc-600 max-w-sm px-4">
            Messages sent here are encrypted with AES-256-GCM directly on your device. The server only sees ciphertext.
          </p>
        </div>
      ) : (
        messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col group ${m.isOutgoing ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-sm shadow-sm transition break-words ${
                m.isOutgoing
                  ? 'bg-emerald-600 text-white rounded-br-xs'
                  : 'bg-dark-700 border border-zinc-700/60 text-zinc-100 rounded-bl-xs'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>

              <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] opacity-75">
                {m.expiresAt && <Flame className="w-2.5 h-2.5 text-amber-300" />}
                <span>{formatTime(m.timestamp)}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(m.id, m.text)}
                  className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-0.5 hover:text-white active:scale-95"
                  title="Copy text"
                >
                  {copiedId === m.id ? (
                    <Check className="w-3 h-3 text-emerald-300" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {isPeerTyping && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-1 italic animate-pulse">
          <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
          <span>{peerDisplayName || 'Peer'} is typing...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
