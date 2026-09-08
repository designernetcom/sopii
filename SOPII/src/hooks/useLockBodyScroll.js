import { useLayoutEffect } from 'react';

/**
 * Freezes page scroll while an overlay is open, compensating for the
 * scrollbar width so the layout doesn't jump on desktop.
 */
export function useLockBodyScroll(locked) {
  useLayoutEffect(() => {
    if (!locked) return undefined;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [locked]);
}
