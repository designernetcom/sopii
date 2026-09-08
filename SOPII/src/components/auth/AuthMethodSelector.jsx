import { KeyRound, Smartphone } from 'lucide-react';
import { WhatsAppMark } from './WhatsAppMark';
import { cn } from '../../utils/cn';

/**
 * The switch between the ways in (§1, §11).
 *
 * Rendered as a tablist rather than a `<select>` because the choice is
 * exclusive, short, and worth seeing all of at once: a shopper who does not
 * remember their password needs to *notice* that a phone will do.
 *
 * Methods are passed in rather than hard-coded here, so a store with WhatsApp
 * switched off renders two tabs and not a disabled third. `Continue with
 * Google` is deliberately not one of them — it is a single button above the
 * divider, per §12's layout, not a third form.
 */

/** The full set. A caller filters this down to what its store has enabled. */
export const AUTH_METHODS = {
  password: { id: 'password', label: 'Password', icon: KeyRound },
  otp: { id: 'otp', label: 'Mobile OTP', icon: Smartphone },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    // Rendered at the tab's own colour so the selected tab does not keep a
    // green glyph on a charcoal fill.
    icon: (props) => <WhatsAppMark tone="inherit" {...props} />,
  },
};

export function AuthMethodSelector({ methods, value, onChange, label = 'Login method', className }) {
  const available = methods.map((id) => AUTH_METHODS[id]).filter(Boolean);

  // One way in is not a choice — rendering a single tab just adds furniture.
  if (available.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('grid border border-beige', className)}
      style={{ gridTemplateColumns: `repeat(${available.length}, minmax(0, 1fr))` }}
    >
      {available.map((entry) => {
        const Icon = entry.icon;
        const selected = value === entry.id;

        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(entry.id)}
            className={cn(
              'flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium uppercase tracking-widest2 transition-colors duration-200 sm:gap-2 sm:px-3',
              selected ? 'bg-charcoal text-cream' : 'text-charcoal-muted hover:text-charcoal',
            )}
          >
            <Icon size={13} aria-hidden="true" />
            <span className="truncate">{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
