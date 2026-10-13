import React, { useState } from 'react';
import { Lock, ShieldAlert, Users, LogIn } from 'lucide-react';
import { api } from '../../services/api.js';
import { stretchAccessCode } from '../../crypto/argon2.js';
import { useRoomStore } from '../../state/roomStore.js';
import { initSocketConnection } from '../../services/socket.js';

interface ProtectedScreenProps {
  slug: string;
  isFull: boolean;
  salt?: string | null;
  onSuccess: (roomId: string, slotIndex: number) => void;
}

export const ProtectedScreen: React.FC<ProtectedScreenProps> = ({
  slug,
  isFull,
  salt,
  onSuccess,
}) => {
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);

  const initDevice = useRoomStore((s) => s.initDevice);
  const initRoomSession = useRoomStore((s) => s.initRoomSession);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;

    setError(null);
    setLoading(true);

    try {
      const devicePubKey = await initDevice();

      // Stretch access code using the room salt
      const stretched = await stretchAccessCode(code, salt || undefined);

      // Generate ephemeral ECDH keypair
      await initRoomSession(slug, '', 0, stretched.authKey);
      const ecdhPubKey = useRoomStore.getState().ecdhPubKey!;

      const resp = await api.joinRoom(slug, {
        verifier: stretched.verifier,
        devicePubKey,
        ecdhPubKey,
        displayName: displayName.trim() || undefined,
      });

      useRoomStore.getState().setRoomInfo(resp.room.id, resp.slotIndex);
      await useRoomStore.getState().persistActiveSession(resp.token);

      // If peer was returned, set peer in store
      if (resp.peer) {
        await useRoomStore.getState().setPeer(resp.peer);
      }

      initSocketConnection(resp.token);
      onSuccess(resp.room.id, resp.slotIndex);
    } catch (err: any) {
      if (err.status === 429) {
        setIsLockedOut(true);
        setError('Room is temporarily locked due to repeated failed attempts (15 minutes).');
      } else if (err.status === 403 && err.message?.toLowerCase().includes('full')) {
        setError('Room is full. Exactly two participants are permitted.');
      } else {
        setError(err.message || 'Invalid access code or room link');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-dark-800 border border-zinc-800 rounded-xl shadow-2xl">
      <div className="flex items-center gap-2 mb-2 text-emerald-400">
        <Lock className="w-5 h-5" />
        <span className="text-xs font-mono uppercase tracking-wider">Protected Room</span>
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-1 text-white">Enter access code to join</h2>
      <p className="text-xs text-zinc-400 mb-5 font-mono">/r/{slug}</p>

      {isFull && (
        <div className="p-3 mb-5 bg-amber-950/20 border border-amber-900/40 rounded-lg text-xs text-amber-300 flex items-start gap-2">
          <Users className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            This room already has 2 registered participants. You can only join if you are returning from an already-authorized device.
          </span>
        </div>
      )}

      {isLockedOut && (
        <div className="p-3 mb-5 bg-red-950/30 border border-red-900/50 rounded-lg text-xs text-red-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Brute force lockout active: 5 incorrect access codes were entered. The endpoint is locked for 15 minutes.
          </span>
        </div>
      )}

      <form onSubmit={handleJoin} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Display Name (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Charlie"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            className="w-full bg-dark-900 border border-zinc-700/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Access Code
          </label>
          <input
            type="password"
            placeholder="Enter the secret room access code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-dark-900 border border-zinc-700/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !code || isLockedOut}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Verifying and unlocking...
            </span>
          ) : (
            <>
              <LogIn className="w-4 h-4" /> Unlock & Join
            </>
          )}
        </button>
      </form>
    </div>
  );
};
