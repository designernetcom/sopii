import { Link } from 'react-router-dom';
import {
  Briefcase,
  Facebook,
  Instagram,
  LifeBuoy,
  Mail,
  MapPin,
  Package,
  Phone,
  Scissors,
  ShieldCheck,
  Sparkle,
  Youtube,
} from 'lucide-react';
import {
  FOOTER_COLUMNS,
  FOOTER_UTILITY_LINKS,
  LEGAL_LINKS,
  PAYMENT_BADGES,
  SOCIAL_LINKS,
} from '../../data/site';
import { useSiteSettings } from '../../context/CatalogContext';
import { Newsletter } from '../Newsletter/Newsletter';
import { FooterSection } from './FooterSection';

const SOCIAL_ICONS = { Instagram, Facebook, Sparkle, Youtube };
const UTILITY_ICONS = { Package, LifeBuoy, Scissors, Briefcase };

/**
 * The policy links used to be a row of small print under the columns. They are
 * a category of their own — returns, shipping, privacy — and a customer hunting
 * for the returns window looks for them in the same grid as everything else, so
 * they are a fifth column now.
 */
const LINK_COLUMNS = [...FOOTER_COLUMNS, { title: 'Policies', links: LEGAL_LINKS }];

export function Footer() {
  /* Store name, address and contact details come from the admin panel's
     store settings. */
  const { brand: BRAND } = useSiteSettings();

  return (
    <footer className="mt-auto bg-charcoal text-cream">
      <Newsletter tone="dark" />

      {/* The page ends on cream and the footer starts on charcoal, so the two
          already separate themselves. This is the seam, not a border: a gold
          hairline that fades out at both ends. */}
      <div
        aria-hidden="true"
        className="h-px w-full bg-gradient-to-r from-transparent via-gold/50 to-transparent"
      />

      <div className="container-site py-6 sm:py-12 lg:py-14">
        <div className="grid gap-x-8 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-[repeat(5,minmax(0,1fr))_1.4fr] lg:gap-y-0">
          {/*
            Brand and contact.
            First in the DOM, because on a phone the address and the two
            tap-to-contact rows are what the footer is *for* — burying them under
            five collapsed accordions costs five taps to reach. Last on a
            desktop, across a divider on the right, which is where the eye
            expects the "reach us" block to sit beside a wall of link columns.
          */}
          <div className="order-first sm:col-span-2 lg:order-last lg:col-span-1 lg:border-l lg:border-white/10 lg:pl-8">
            <Link to="/" className="inline-block">
              {/*
                The wordmark is set in type here rather than being the logo
                artwork. The PNG is plum with a gold outline, drawn for a cream
                page; on charcoal the plum falls to roughly 2:1 and the mark goes
                muddy. Playfair at this tracking is the same voice and stays
                legible.
              */}
              <span className="font-display text-2xl tracking-widest2 text-cream">
                {BRAND.name}
              </span>
            </Link>

            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-cream/60">
              {BRAND.tagline}. Handwoven textiles and considered silhouettes, made with
              craftspeople across India.
            </p>

            <div className="mt-6 space-y-5 sm:mt-7">
              <div>
                <h2 className="footer-eyebrow">Visit Us</h2>
                <p className="mt-2 flex items-start gap-2.5 text-[13px] leading-relaxed text-cream/70">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
                  {BRAND.address}
                </p>
              </div>

              <div>
                <h2 className="footer-eyebrow">Talk To Us</h2>
                {/* `tap-target` gives the two tappable rows a 44px height on a
                    phone without changing how they read on a desktop. */}
                <ul className="mt-1 sm:mt-2 sm:space-y-2">
                  <li>
                    <a
                      href={`mailto:${BRAND.email}`}
                      className="footer-link tap-target flex items-center gap-2.5 break-all text-[13px]"
                    >
                      <Mail size={15} className="shrink-0 text-gold" aria-hidden="true" />
                      {BRAND.email}
                    </a>
                  </li>
                  <li>
                    <a
                      href={`tel:${BRAND.phone.replace(/\s/g, '')}`}
                      className="footer-link tap-target flex items-center gap-2.5 text-[13px]"
                    >
                      <Phone size={15} className="shrink-0 text-gold" aria-hidden="true" />
                      {BRAND.phone}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {LINK_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <FooterSection title={col.title}>
                <ul className="space-y-0 sm:space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="footer-link tap-target flex items-center text-[13px] sm:block"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </FooterSection>
            </nav>
          ))}

          {/* Social */}
          <nav aria-label="Follow Us">
            <FooterSection title="Follow Us">
              <ul className="space-y-0 sm:space-y-2.5">
                {SOCIAL_LINKS.map((social) => {
                  const Icon = SOCIAL_ICONS[social.icon] || Sparkle;
                  return (
                    <li key={social.name}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="footer-link tap-target inline-flex items-center gap-2.5 text-[13px]"
                      >
                        <Icon size={15} className="text-gold" aria-hidden="true" />
                        {social.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </FooterSection>
          </nav>
        </div>
      </div>

      {/*
        Utility bar.
        A darker band under the columns carrying the things a customer looks for
        once they have already bought something — where the order is, who to ask,
        and whether their card is taken — plus the copyright.
      */}
      <div className="border-t border-white/10 bg-black/25">
        <div className="container-site flex flex-col items-center gap-4 py-5 text-center lg:flex-row lg:justify-between lg:gap-8 lg:py-4 lg:text-left">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0 sm:gap-y-1">
            {FOOTER_UTILITY_LINKS.map((link) => {
              const Icon = UTILITY_ICONS[link.icon] || Package;
              return (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="footer-link tap-target inline-flex items-center gap-2 text-[12px]"
                  >
                    <Icon size={14} className="text-gold" aria-hidden="true" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Last on a phone, where it reads as a sign-off; in the middle on a
              desktop, where the two flanking groups need something to push
              against. */}
          <p className="order-last text-[11px] text-cream/60 lg:order-none">
            © {new Date().getFullYear()} {BRAND.name}. All Rights Reserved.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest2 text-cream/60">
              <ShieldCheck size={14} className="text-gold" aria-hidden="true" />
              We Accept
            </span>
            <ul className="flex flex-wrap items-center justify-center gap-1.5">
              {PAYMENT_BADGES.map((badge) => (
                <li
                  key={badge}
                  className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium tracking-wide text-cream/75"
                >
                  {badge}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Clears the fixed mobile bottom nav, home indicator included. */}
      <div aria-hidden="true" className="h-bottom-nav lg:hidden" />
    </footer>
  );
}
