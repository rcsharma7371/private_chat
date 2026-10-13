import React, { useEffect, useState } from 'react';
import { Phone, Video, ShieldCheck, Users } from 'lucide-react';
import { useRoomStore } from '../../state/roomStore.js';
import { useChatStore } from '../../state/chatStore.js';
import { api } from '../../services/api.js';
import { webrtcService } from '../../services/webrtc.js';
import { SecurityBanner } from '../common/SecurityBanner.js';
import { MessageList } from './MessageList.js';
import { MessageComposer } from './MessageComposer.js';
import { SecurityDrawer } from './SecurityDrawer.js';
import { CallModal } from '../Call/CallModal.js';
import { getSocket, initSocketConnection } from '../../services/socket.js';

export const ChatRoom: React.FC = () => {
  const { slug, disappearAfter, peerDevicePubKey, peerDisplayName } = useRoomStore();
  const { messages, loadInitialMessages, purgeExpiredMessages } = useChatStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;

    // Ensure socket connection is active with preserved token
    if (!getSocket() || !getSocket()?.connected) {
      const raw = localStorage.getItem(`talk_session_${slug.toLowerCase()}`);
      let savedToken: string | undefined;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          savedToken = parsed.token || undefined;
        } catch (_) {}
      }
      initSocketConnection(savedToken);
    }

    // Load initial encrypted messages history from server
    api.getRoomMessages(slug, 0)
      .then((resp) => {
        if (resp.messages && resp.messages.length > 0) {
          loadInitialMessages(resp.messages);
        }
      })
      .catch((err) => {
        console.warn('[ChatRoom] Failed to load message history:', err);
      });

    // Periodic disappearing messages cleanup
    const interval = setInterval(() => {
      purgeExpiredMessages();
    }, 10000);

    return () => clearInterval(interval);
  }, [slug]);

  const hasPeer = !!peerDevicePubKey;

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] max-w-4xl mx-auto bg-dark-900 border-x border-zinc-800 shadow-2xl relative overflow-hidden">
      {/* Top Header */}
      <header className="px-3 sm:px-4 py-2.5 sm:py-3 bg-dark-800 border-b border-zinc-800 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-dark-700 border border-zinc-700 flex items-center justify-center font-bold text-xs sm:text-sm text-zinc-300">
              {peerDisplayName ? peerDisplayName[0].toUpperCase() : 'P'}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-dark-800 ${
                hasPeer ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-semibold text-xs sm:text-sm text-zinc-100 truncate max-w-[130px] sm:max-w-[220px]">
                {peerDisplayName || (hasPeer ? 'Connected Peer' : 'Waiting for Peer')}
              </h1>
              <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">/r/{slug}</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate max-w-[160px] sm:max-w-none">
              {hasPeer ? 'End-to-end encrypted session active' : 'Slot #2 open for invitee'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => webrtcService.startCall('voice')}
            disabled={!hasPeer}
            className="p-2 rounded-lg bg-dark-700/80 hover:bg-dark-600 disabled:opacity-40 disabled:hover:bg-dark-700/80 text-zinc-200 transition"
            title="Start Encrypted Voice Call"
          >
            <Phone className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={() => webrtcService.startCall('video')}
            disabled={!hasPeer}
            className="p-2 rounded-lg bg-dark-700/80 hover:bg-dark-600 disabled:opacity-40 disabled:hover:bg-dark-700/80 text-zinc-200 transition"
            title="Start Encrypted Video Call"
          >
            <Video className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-dark-700/80 hover:bg-dark-600 text-zinc-200 text-xs font-medium transition"
            title="Privacy & Verification Settings"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Privacy</span>
          </button>
        </div>
      </header>

      {/* Security notice & disappearing timer banner */}
      <SecurityBanner disappearAfter={disappearAfter} />

      {/* Peer waiting placeholder banner if only slot 1 is present */}
      {!hasPeer && (
        <div className="bg-amber-950/20 border-b border-amber-900/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Share this room URL and access code with your contact to establish the 2-person session.</span>
          </div>
        </div>
      )}

      {/* Decrypted Message Feed */}
      <MessageList messages={messages} />

      {/* Message Composer */}
      <MessageComposer />

      {/* Security / SAS Drawer */}
      <SecurityDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Call Modal Overlay */}
      <CallModal />
    </div>
  );
};
