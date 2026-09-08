import { cn } from '../../utils/cn';

const TONES = {
  New: 'bg-charcoal text-cream',
  /* Charcoal on gold, not cream on gold: cream measured 2.23:1 against the
     brand gold, which is unreadable. Charcoal on the *same* gold is 6.91:1, so
     the badge keeps its colour and gains its legibility from the text. */
  Bestseller: 'bg-gold text-charcoal',
  Sale: 'bg-sale text-cream',
  soft: 'bg-cream/95 text-charcoal border border-beige',
};

/** Small uppercase product flag. */
export function Badge({ children, tone, className }) {
  return (
    <span
      className={cn(
        /* 10px on a phone, back to the original 9px from `sm`: at two columns
           a 9px flag over a photograph was the least legible thing on the card. */
        'inline-block px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] sm:px-2.5 sm:text-[9px] sm:tracking-widest2',
        TONES[tone] || TONES[children] || TONES.soft,
        className,
      )}
    >
      {children}
    </span>
  );
}
