import React from 'react';
import { ShieldCheck, Clock, Flame } from 'lucide-react';

interface SecurityBannerProps {
  disappearAfter?: number | null;
}

export const SecurityBanner: React.FC<SecurityBannerProps> = ({ disappearAfter }) => {
  return (
    <div className="bg-dark-800/90 border-b border-zinc-800/80 px-4 py-2 flex flex-wrap items-center justify-between text-xs text-zinc-400 gap-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" /> End-to-End Encrypted (AES-256-GCM)
        </span>
        <span className="text-zinc-600">|</span>
        <span className="flex items-center gap-1 text-zinc-300">
          <Clock className="w-3.5 h-3.5 text-zinc-400" /> This room auto-deletes after 30 days of inactivity.
        </span>
      </div>

      {disappearAfter && disappearAfter > 0 && (
        <div className="flex items-center gap-1.5 text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/40">
          <Flame className="w-3.5 h-3.5" /> Disappearing messages active (
          {disappearAfter >= 86400
            ? `${disappearAfter / 86400}d`
            : disappearAfter >= 3600
            ? `${disappearAfter / 3600}h`
            : `${disappearAfter}s`}
          )
        </div>
      )}
    </div>
  );
};
