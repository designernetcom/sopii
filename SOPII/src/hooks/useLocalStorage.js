import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorage, writeStorage } from '../utils/storage';

/**
 * State that persists to localStorage and stays in sync across browser tabs.
 * Mirrors the useState API so it can be swapped in directly.
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => readStorage(key, initialValue));
  const keyRef = useRef(key);

  useEffect(() => {
    writeStorage(keyRef.current, value);
  }, [value]);

  // Keep two open tabs of the store consistent (cart added in one, seen in the other).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== `sopii:${keyRef.current}`) return;
      try {
        setValue(e.newValue === null ? initialValue : JSON.parse(e.newValue));
      } catch {
        /* ignore malformed payloads from other tabs */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);

  return [value, setValue, reset];
}
