import React from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';

const WORDS = [
  'amber', 'anchor', 'beacon', 'breeze', 'canyon', 'cascade', 'castle', 'cedar',
  'cliff', 'clover', 'cobalt', 'comet', 'coral', 'crater', 'crystal', 'delta',
  'dune', 'ember', 'falcon', 'feather', 'forest', 'fossil', 'galaxy', 'glacier',
  'granite', 'harbor', 'haven', 'island', 'jasper', 'lagoon', 'meadow', 'meteor',
  'mirage', 'monarch', 'nebula', 'oasis', 'ocean', 'orbit', 'pebble', 'phoenix',
  'planet', 'prism', 'quartz', 'radius', 'raven', 'ripple', 'river', 'sahara',
  'shadow', 'sierra', 'silver', 'solace', 'summit', 'temple', 'timber', 'tundra',
  'valley', 'vapor', 'velvet', 'vortex', 'voyage', 'willow', 'zenith', 'zephyr'
];

interface PassphraseGenProps {
  onSelect: (passphrase: string) => void;
}

export const PassphraseGen: React.FC<PassphraseGenProps> = ({ onSelect }) => {
  const [current, setCurrent] = React.useState('');

  const generate = () => {
    const selected: string[] = [];
    const randomBuffer = new Uint32Array(6);
    crypto.getRandomValues(randomBuffer);

    for (let i = 0; i < 6; i++) {
      const idx = randomBuffer[i] % WORDS.length;
      selected.push(WORDS[idx]);
    }
    const phrase = selected.join('-');
    setCurrent(phrase);
    onSelect(phrase);
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-dark-800/80 border border-zinc-800 rounded-lg text-sm">
      <div className="flex items-center justify-between text-zinc-400">
        <span className="flex items-center gap-1.5 font-medium text-xs uppercase tracking-wider text-emerald-400">
          <KeyRound className="w-3.5 h-3.5" /> 6-Word Passphrase Generator
        </span>
        <button
          type="button"
          onClick={generate}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Generate
        </button>
      </div>
      {current ? (
        <div className="flex items-center justify-between bg-dark-900 px-3 py-2 rounded font-mono text-xs text-emerald-300 break-all border border-emerald-950">
          <span>{current}</span>
          <button
            type="button"
            onClick={() => onSelect(current)}
            className="ml-2 text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 px-2 py-0.5 rounded transition"
          >
            Use
          </button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Recommended for highest privacy. Generates 6 random memorable words separated by hyphens.
        </p>
      )}
    </div>
  );
};
