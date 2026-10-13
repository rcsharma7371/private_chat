import React, { useState } from 'react';
import { Shield, Sparkles, Link as LinkIcon } from 'lucide-react';
import { api } from '../../services/api.js';
import { stretchAccessCode } from '../../crypto/argon2.js';
import { useRoomStore } from '../../state/roomStore.js';
import { PassphraseGen } from '../common/PassphraseGen.js';
import { PasswordMeter } from '../common/PasswordMeter.js';
import { initSocketConnection } from '../../services/socket.js';

interface AvailableScreenProps {
  slug: string;
  onSuccess: (roomId: string, slotIndex: number | null) => void;
}

export const AvailableScreen: React.FC<AvailableScreenProps> = ({ slug, onSuccess }) => {
  const [mode, setMode] = useState<'with-code' | 'link-only'>('with-code');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initDevice = useRoomStore((s) => s.initDevice);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'link-only') {
        const resp = await api.createRoom({ slug });
        onSuccess(resp.room.id, null);
        return;
      }

      if (code.length < 8) {
        setError('Access code must be at least 8 characters long');
        setLoading(false);
        return;
      }

      // Initialize local non-extractable device key
      const devicePubKey = await initDevice();

      // Stretch access code using Argon2id WASM
      const stretched = await stretchAccessCode(code);

      // Generate ephemeral ECDH keypair
      await useRoomStore.getState().initRoomSession(
        slug,
        '', // temp roomId
        0,
        stretched.authKey
      );

      const ecdhPubKey = useRoomStore.getState().ecdhPubKey!;

      const resp = await api.createRoom({
        slug,
        verifier: stretched.verifier,
        salt: stretched.salt,
        devicePubKey,
        ecdhPubKey,
        displayName: displayName.trim() || 'Creator',
      });

      // Update actual roomId in store
      useRoomStore.getState().setRoomInfo(resp.room.id, 0);
      await useRoomStore.getState().persistActiveSession(resp.token || undefined);

      // Initialize socket connection with session cookie
      initSocketConnection(resp.token || undefined);

      onSuccess(resp.room.id, 0);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-dark-800 border border-zinc-800 rounded-xl shadow-2xl">
      <div className="flex items-center gap-2 mb-2 text-emerald-400">
        <Sparkles className="w-5 h-5" />
        <span className="text-xs font-mono uppercase tracking-wider">Room Available</span>
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-1 text-white">Create this room</h2>
      <p className="text-xs text-zinc-400 mb-6 font-mono">/r/{slug}</p>

      <div className="flex border-b border-zinc-700/60 mb-6">
        <button
          type="button"
          onClick={() => setMode('with-code')}
          className={`pb-2.5 px-3 text-xs font-medium transition-colors border-b-2 -mb-px ${
            mode === 'with-code'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Set Code & Join (Recommended)
        </button>
        <button
          type="button"
          onClick={() => setMode('link-only')}
          className={`pb-2.5 px-3 text-xs font-medium transition-colors border-b-2 -mb-px ${
            mode === 'link-only'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Create Link Only
        </button>
      </div>

      <form onSubmit={handleCreate} className="space-y-4">
        {mode === 'with-code' ? (
          <>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Your Display Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Alice"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={30}
                className="w-full bg-dark-900 border border-zinc-700/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Access Code (Secret Password)
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
          </>
        ) : (
          <div className="p-4 bg-dark-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-400 space-y-2">
            <p className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <LinkIcon className="w-4 h-4 text-emerald-400" /> Shareable Link Reserved
            </p>
            <p>
              The link will be created without an access code. The first person to open the link and set a code will claim slot #1.
            </p>
            <p className="text-zinc-500 text-[11px]">
              Note: Unclaimed links auto-expire after 24 hours to prevent squatting.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (mode === 'with-code' && code.length < 8)}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Deriving cryptographic keys...
            </span>
          ) : mode === 'with-code' ? (
            <>
              <Shield className="w-4 h-4" /> Create & Join Protected Room
            </>
          ) : (
            <>
              <LinkIcon className="w-4 h-4" /> Create Unclaimed Link
            </>
          )}
        </button>
      </form>
    </div>
  );
};
