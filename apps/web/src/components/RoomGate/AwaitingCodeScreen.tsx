import React, { useState } from 'react';
import { KeyRound, Shield, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api.js';
import { stretchAccessCode } from '../../crypto/argon2.js';
import { useRoomStore } from '../../state/roomStore.js';
import { PassphraseGen } from '../common/PassphraseGen.js';
import { PasswordMeter } from '../common/PasswordMeter.js';
import { initSocketConnection } from '../../services/socket.js';

interface AwaitingCodeScreenProps {
  slug: string;
  onSuccess: (roomId: string, slotIndex: number) => void;
  onSwitchToProtected: () => void;
}

export const AwaitingCodeScreen: React.FC<AwaitingCodeScreenProps> = ({
  slug,
  onSuccess,
  onSwitchToProtected,
}) => {
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initDevice = useRoomStore((s) => s.initDevice);
  const initRoomSession = useRoomStore((s) => s.initRoomSession);

  const handleSetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 8) {
      setError('Access code must be at least 8 characters long');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const devicePubKey = await initDevice();
      const stretched = await stretchAccessCode(code);

      // Generate ephemeral ECDH keypair
      await initRoomSession(slug, '', 0, stretched.authKey);
      const ecdhPubKey = useRoomStore.getState().ecdhPubKey!;

      const resp = await api.setRoomCode(slug, {
        verifier: stretched.verifier,
        salt: stretched.salt,
        devicePubKey,
        ecdhPubKey,
        displayName: displayName.trim() || 'Participant 1',
      });

      useRoomStore.getState().setRoomInfo(resp.room.id, 0);
      await useRoomStore.getState().persistActiveSession(resp.token);
      initSocketConnection(resp.token);
      onSuccess(resp.room.id, 0);
    } catch (err: any) {
      if (err.status === 409) {
        // Concurrency loser: someone else just set the code! Switch to enter code screen.
        alert('Another participant has just set the access code for this room. Please enter the code to join.');
        onSwitchToProtected();
      } else {
        setError(err.message || 'Failed to set room code');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-dark-800 border border-zinc-800 rounded-xl shadow-2xl">
      <div className="flex items-center gap-2 mb-2 text-amber-400">
        <KeyRound className="w-5 h-5" />
        <span className="text-xs font-mono uppercase tracking-wider">Unclaimed Link</span>
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-1 text-white">
        Create access code for this link
      </h2>
      <p className="text-xs text-zinc-400 mb-5 font-mono">/r/{slug}</p>

      <div className="p-3 mb-5 bg-amber-950/20 border border-amber-900/40 rounded-lg text-xs text-amber-300 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          This room link was reserved without an access code. Set an access code now to lock this room and become Participant #1.
        </span>
      </div>

      <form onSubmit={handleSetCode} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Your Display Name (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Bob"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            className="w-full bg-dark-900 border border-zinc-700/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Choose Access Code
          </label>
          <input
            type="password"
            placeholder="Min 8 characters or 6 words"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="new-password"
            className="w-full bg-dark-900 border border-zinc-700/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <div className="mt-2">
            <PasswordMeter value={code} />
          </div>
        </div>

        <PassphraseGen onSelect={(phrase) => setCode(phrase)} />

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || code.length < 8}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Securing room...
            </span>
          ) : (
            <>
              <Shield className="w-4 h-4" /> Set Code & Join Room
            </>
          )}
        </button>
      </form>
    </div>
  );
};
