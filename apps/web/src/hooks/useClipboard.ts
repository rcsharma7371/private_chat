import { useState } from 'react';

export function useClipboard() {
  const [showWarning, setShowWarning] = useState(false);

  const copyWithWarning = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setShowWarning(true);
      setTimeout(() => setShowWarning(false), 4000);
    } catch (err) {
      console.error('Clipboard copy failed', err);
    }
  };

  return {
    copyWithWarning,
    showWarning,
    dismissWarning: () => setShowWarning(false),
  };
}
