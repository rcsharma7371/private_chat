import React, { useState } from 'react';
import { ShieldCheck, Flame, EyeOff, LogOut, Trash2, X, Info } from 'lucide-react';
import { DISAPPEARING_OPTIONS } from '@talk/shared';
import { useRoomStore } from '../../state/roomStore.js';
import { useCallStore } from '../../state/callStore.js';
import { api } from '../../services/api.js';

interface SecurityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityDrawer: React.FC<SecurityDrawerProps> = ({ isOpen, onClose }) => {
  const { sas, slug, disappearAfter, setDisappearAfter, destroyLocalRoom } = useRoomStore();
  const { relayOnlyMode, setRelayOnlyMode } = useCallStore();
  const [burning, setBurning] = useState(false);

  if (!isOpen) return null;

  const handleUpdateDisappearing = async (seconds: number) => {
    if (!slug) return;
    try {
      await api.updateDisappearing(slug, seconds);
      setDisappearAfter(seconds === 0 ? null : seconds);
    } catch (err) {
      console.error('Failed to update disappearing timer', err);
    }
  };

  const handleLeave = async () => {
    if (!slug) return;
    if (confirm('Leave this room? Your slot will be freed for another participant.')) {
      try {
        await api.leaveRoom(slug);
        await destroyLocalRoom();
        window.location.href = '/';
      } catch (err) {
        console.error('Failed to leave room', err);
      }
    }
  };

  const handleBurn = async () => {
    if (!slug) return;
    const confirmed = prompt(
      'PANIC BURN: This will permanently delete the room, all ciphertext messages from the database, and wipe all cryptographic keys on both devices. Type BURN to confirm:'
    );

    if (confirmed === 'BURN') {
      setBurning(true);
      try {
        await api.burnRoom(slug);
        await destroyLocalRoom();
        alert('Room destroyed and local keys wiped.');
        window.location.href = '/';
      } catch (err) {
        alert('Failed to burn room: ' + (err as any).message);
      } finally {
        setBurning(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-dark-800 border-l border-zinc-800 h-full p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto flex flex-col justify-between shadow-2xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <ShieldCheck className="w-5 h-5" />
              <span>Privacy & Security</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 1. Safety Number / SAS Verification */}
          <div className="bg-dark-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Safety Number / SAS
              </span>
              <span className="text-[11px] text-emerald-400 font-mono">MITM Protection</span>
            </div>

            {sas ? (
              <div className="space-y-2">
                <div className="text-center py-2 bg-dark-800 rounded-lg border border-zinc-700/60">
                  <div className="text-2xl tracking-widest mb-1">{sas.emojis.join(' ')}</div>
                  <div className="font-mono text-lg font-bold text-emerald-400">{sas.code}</div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Compare this 6-digit number or emoji sequence with your contact over voice call or in person. If they match, your connection is guaranteed free from man-in-the-middle attacks.
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">
                Waiting for peer to connect to compute safety number.
              </p>
            )}
          </div>

          {/* 2. Disappearing Messages */}
          <div className="bg-dark-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-zinc-200 text-sm font-medium">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Disappearing Messages Timer</span>
            </div>
            <p className="text-xs text-zinc-400">
              Automatically erases messages from server storage and client caches after the set timer.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DISAPPEARING_OPTIONS.map((opt) => {
                const isActive = (disappearAfter ?? 0) === opt.seconds;
                return (
                  <button
                    key={opt.seconds}
                    type="button"
                    onClick={() => handleUpdateDisappearing(opt.seconds)}
                    className={`py-1.5 px-2 text-xs rounded-lg font-medium border transition ${
                      isActive
                        ? 'bg-amber-600/30 text-amber-300 border-amber-600/60'
                        : 'bg-dark-800 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Hide my IP (Relay only) */}
          <div className="bg-dark-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-200 text-sm font-medium">
                <EyeOff className="w-4 h-4 text-teal-400" />
                <span>Hide My IP (Relay Only)</span>
              </div>
              <input
                type="checkbox"
                checked={relayOnlyMode}
                onChange={(e) => setRelayOnlyMode(e.target.checked)}
                className="w-4 h-4 rounded bg-dark-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-dark-900"
              />
            </div>
            <p className="text-xs text-zinc-400">
              Forces all voice and video calls through Coturn TURN relay. Prevents the peer from discovering your public IP address via direct P2P connections.
            </p>
          </div>

          {/* 4. Limitation notice */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-lg text-[11px] text-zinc-500 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-zinc-400" />
            <span>
              End-to-end encryption secures transmission and server storage, but cannot prevent the other participant from taking a physical photo or screenshot of their screen.
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="pt-6 border-t border-zinc-800 space-y-3">
          <button
            type="button"
            onClick={handleLeave}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
          >
            <LogOut className="w-4 h-4" /> Leave Room Permanently
          </button>

          <button
            type="button"
            onClick={handleBurn}
            disabled={burning}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-300 text-xs font-semibold transition"
          >
            <Trash2 className="w-4 h-4" /> Panic Button: Burn Room & Shred Keys
          </button>
        </div>
      </div>
    </div>
  );
};
