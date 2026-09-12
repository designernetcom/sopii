import { Facebook, Instagram, Sparkle, Youtube } from 'lucide-react';
import { SOCIAL_LINKS } from '../../data/site';
import { useSiteSettings } from '../../context/CatalogContext';
import { WhatsAppMark } from '../auth/WhatsAppMark';

/**
 * The social rail — a fixed tab of icons pinned to the left edge.
 *
 * Reads `SOCIAL_LINKS`, the same list the footer renders, so a channel is
 * added or dropped in one place and both surfaces follow. The icon map is
 * local for the same reason the footer's is: `icon` is a lucide export name,
 * and an unknown one degrades to `Sparkle` rather than throwing.
 *
 * Desktop only, from `lg`. Below that the viewport is narrow enough that a
 * 44px rail eats into the product grid, and a phone already carries the fixed
 * bottom nav — two floating bars competing for the same thumb is worse than
 * one. The footer's "Follow Us" list is the small-screen answer, and it is
 * already there.
 *
 * `z-30` puts it under the sticky header (`z-50`) and under every overlay
 * (65–75), so a drawer, the search sheet or the quick-view modal covers it
 * rather than fighting it, and the header wins on the way past.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE MOTION IS FOR
 * ---------------------------------------------------------------------------
 * Three effects, each of which replaces something worse:
 *
 *   The **staggered entrance** exists because the rail is fixed furniture with
 *   no scroll to introduce it. Sliding the tiles in 60ms apart reads as one
 *   object arriving; all five at once reads as a layout shift.
 *
 *   The **label pill** replaces the `title` tooltip this used to carry, which
 *   cannot be styled, waits a second to appear and never shows for a keyboard
 *   at all. It is positioned absolutely, so revealing it reflows nothing.
 *
 *   The **brand colour** is the hover state. At rest every icon is brand-soft and
 *   the rail reads as one object; under the cursor exactly one lights up in
 *   its network's own hue, which is the fastest confirmation available of what
 *   the thing under the pointer is.
 *
 * All three are cancelled by the global `prefers-reduced-motion` rule in
 * `index.css`, so a reader who asked for stillness gets the same rail without
 * any of it.
 */

const ICONS = { Instagram, Facebook, Sparkle, Youtube };

/** Plum, for a channel that carries no brand colour of its own. */
const FALLBACK = '#540000';

const WHATSAPP_GREEN = '#25D366';

/** How far apart the tiles arrive. Five of them land inside a third of a second. */
const STAGGER_MS = 60;

/**
 * `+91 22 4890 1200` → `912248901200`.
 *
 * wa.me takes digits only, country code included and nothing else — a `+`, a
 * space or a dash and the link opens to an error page rather than a chat.
 */
const waNumber = (phone) => String(phone ?? '').replace(/\D/g, '');

export function SocialRail() {
  const { brand: BRAND } = useSiteSettings();
  const whatsapp = waNumber(BRAND?.whatsapp ?? BRAND?.phone);

  if (!SOCIAL_LINKS.length && !whatsapp) return null;

  return (
    <nav
      aria-label="Follow us, and chat with us on WhatsApp"
      className="fixed left-0 top-1/2 z-30 hidden -translate-y-1/2 lg:block"
    >
      {/*
        Rounded on the right only and missing its left border, so the rail
        reads as a tab attached to the edge of the window rather than a card
        floating near it. The shadow is thrown rightwards for the same reason:
        the light is on the page, not behind the screen.
      */}
      {/*
        No `overflow-hidden` here, deliberately. It would clip the label pills,
        which live outside this box at `left-full` — so the rounded corner is
        carried by the one tile that actually paints a background instead.
      */}
      <ul className="flex flex-col rounded-r-lg border border-l-0 border-beige bg-cream/90 shadow-[6px_0_24px_-12px_rgba(45,31,43,0.35)] backdrop-blur-sm">
        {SOCIAL_LINKS.map((social, index) => {
          const Icon = ICONS[social.icon] || Sparkle;
          const colour = social.color || FALLBACK;

          return (
            <li key={social.name} className="border-beige border-t first:border-t-0">
              <a
                href={social.href}
                target="_blank"
                rel="noreferrer noopener"
                className="rail-link animate-slide-in-left"
                style={{ '--rail': colour, animationDelay: `${index * STAGGER_MS}ms` }}
              >
                {/* Decorative: the pill below carries the accessible name, so a
                    screen reader announces "Instagram, link" once, not twice. */}
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                <span className="rail-pill" style={{ backgroundColor: colour }}>
                  {social.name}
                </span>
              </a>
            </li>
          );
        })}

        {/* Dropped entirely when the panel has no store phone on file, rather
            than linking to a wa.me URL with nothing after the slash. */}
        {whatsapp ? (
          <li className="border-t border-beige">
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noreferrer noopener"
              className="rail-link animate-slide-in-left rounded-br-lg text-cream"
              style={{
                '--rail': '#FFFDFC',
                backgroundColor: WHATSAPP_GREEN,
                animationDelay: `${SOCIAL_LINKS.length * STAGGER_MS}ms`,
              }}
            >
              {/*
                The one filled tile, and the only item here that is not a
                profile link — it opens a conversation with the store. Filled
                rather than tinted on hover, because someone looking for help
                should find it without reading the four icons above it first.
              */}
              <WhatsAppMark size={20} tone="mono" />
              <span className="rail-pill" style={{ backgroundColor: WHATSAPP_GREEN }}>
                Chat with us
              </span>
            </a>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
