import { useState, useRef, useCallback } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved';

export function useSaveIndicator() {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const savingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifySave = useCallback(() => {
    if (savingTimer.current) clearTimeout(savingTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);

    setStatus('saving');

    savingTimer.current = setTimeout(() => {
      setStatus('saved');
      savedTimer.current = setTimeout(() => {
        setStatus('idle');
      }, 2000);
    }, 600);
  }, []);

  return { status, notifySave };
}
