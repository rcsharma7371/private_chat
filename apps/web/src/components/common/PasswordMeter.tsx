import React from 'react';

interface PasswordMeterProps {
  value: string;
}

export const PasswordMeter: React.FC<PasswordMeterProps> = ({ value }) => {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 14) score++;
  if (/[A-Z]/.test(value) || /[-]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;

  const strengthLabels = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const strengthColors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-emerald-500',
    'bg-teal-400',
  ];

  if (!value) return null;

  const currentLevel = Math.min(score, 4);

  return (
    <div className="flex flex-col gap-1 w-full text-xs">
      <div className="flex justify-between text-zinc-400">
        <span>Strength</span>
        <span className={score >= 3 ? 'text-emerald-400 font-medium' : 'text-zinc-400'}>
          {strengthLabels[currentLevel]}
        </span>
      </div>
      <div className="flex h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-full flex-1 transition-all duration-300 ${
              i <= currentLevel ? strengthColors[currentLevel] : 'bg-transparent'
            }`}
          />
        ))}
      </div>
      {value.length < 8 && (
        <span className="text-red-400/90 text-[11px] mt-0.5">Minimum 8 characters required</span>
      )}
    </div>
  );
};
