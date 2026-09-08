import { useEffect, useState } from 'react';
import { ANNOUNCEMENTS } from '../../data/site';

/**
 * Thin strip above the header.
 * Desktop shows every message separated by a rule; mobile rotates through
 * them one at a time so the bar stays a single line at 320px.
 */
export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (ANNOUNCEMENTS.length < 2) return undefined;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % ANNOUNCEMENTS.length),
      4000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-charcoal text-cream">
      <div className="container-site flex h-9 items-center justify-center">
        {/* Mobile: one rotating message */}
        <p
          key={index}
          className="animate-fade-in text-center text-[10px] uppercase tracking-widest2 sm:hidden"
        >
          {ANNOUNCEMENTS[index]}
        </p>

        {/* Desktop: all messages */}
        <ul className="hidden items-center gap-6 text-[10px] uppercase tracking-widest2 sm:flex lg:gap-10">
          {ANNOUNCEMENTS.map((text, i) => (
            <li key={text} className="flex items-center gap-6 lg:gap-10">
              {i > 0 ? <span aria-hidden="true" className="text-cream/25">|</span> : null}
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
