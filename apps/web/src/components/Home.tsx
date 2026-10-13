import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Users, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { RESERVED_SLUGS, SLUG_REGEX } from '@talk/shared';

export const Home: React.FC = () => {
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const generateSlug = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    const buffer = new Uint8Array(8);
    crypto.getRandomValues(buffer);
    for (let i = 0; i < 8; i++) {
      res += chars[buffer[i] % chars.length];
    }
    setSlug(`room-${res}`);
    setError(null);
  };

  const handleOpenRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();

    if (!cleanSlug) {
      setError('Please enter a room name');
      return;
    }

    if (cleanSlug.length < 6 || cleanSlug.length > 40) {
      setError('Room name must be between 6 and 40 characters');
      return;
    }

    if (!SLUG_REGEX.test(cleanSlug)) {
      setError('Room name must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    if (RESERVED_SLUGS.has(cleanSlug)) {
      setError('This room name is reserved');
      return;
    }

    navigate(`/r/${cleanSlug}`);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Brand Header */}
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-lg">Talk</span>
            <span className="ml-2 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              Zero-Knowledge
            </span>
          </div>
        </div>
      </header>

      {/* Main Hero & Slug Entry */}
      <main className="py-12 sm:py-20 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dark-800 border border-zinc-800 text-xs text-zinc-400 mb-6">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Strictly 1-to-1 End-to-End Encrypted Communication</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight max-w-2xl leading-tight mb-4">
          Private, Disappearing Conversations for Two.
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 max-w-xl mb-8 leading-relaxed">
          No signups, no stored keys, no metadata. Exactly two participant slots per room, secured by Web Crypto and Argon2id. Automatically shredded after 30 days of inactivity.
        </p>

        {/* Room Slug Box */}
        <div className="w-full max-w-md bg-dark-800/90 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleOpenRoom} className="space-y-4">
            <div className="text-left">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Room Link
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs font-mono text-zinc-500 select-none">
                  talk/r/
                </span>
                <input
                  type="text"
                  placeholder="custom-room-name"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    setError(null);
                  }}
                  className="w-full bg-dark-900 border border-zinc-700 rounded-xl pl-20 pr-10 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 font-mono transition"
                />
                <button
                  type="button"
                  onClick={generateSlug}
                  title="Generate random secure slug"
                  className="absolute right-3 p-1 text-zinc-500 hover:text-emerald-400 transition"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-300 text-left">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              <span>Enter or Create Room</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 max-w-3xl text-left">
          <div className="p-4 bg-dark-800/50 border border-zinc-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
              <Users className="w-4 h-4" /> Strictly 2-Person Rule
            </div>
            <p className="text-xs text-zinc-400">
              Only 2 device-bound slots per room. Third parties are rejected at the database transaction layer.
            </p>
          </div>

          <div className="p-4 bg-dark-800/50 border border-zinc-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
              <Lock className="w-4 h-4" /> Client-Side Keys Only
            </div>
            <p className="text-xs text-zinc-400">
              Non-extractable keys in IndexedDB. Database holds ciphertext only; server has zero knowledge.
            </p>
          </div>

          <div className="p-4 bg-dark-800/50 border border-zinc-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
              <Clock className="w-4 h-4" /> 30-Day Auto-Purge
            </div>
            <p className="text-xs text-zinc-400">
              Inactive rooms and messages are automatically hard-deleted by an automated background cron.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-800/60 text-center text-xs text-zinc-500">
        Talk — Zero-knowledge 1-to-1 encrypted voice, video, and text communication.
      </footer>
    </div>
  );
};
