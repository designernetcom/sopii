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
  BUILT_BY,
  FOOTER_COLUMNS,
  FOOTER_UTILITY_LINKS,
  LEGAL_LINKS,
  PAYMENT_BADGES,
  SOCIAL_LINKS,
} from '../../data/site';
import { useSiteSettings } from '../../context/CatalogContext';
import { Newsletter } from '../Newsletter/Newsletter';
import { BrandLogo } from '../ui/BrandLogo';
import { FooterSection } from './FooterSection';

const SOCIAL_ICONS = { Instagram, Facebook, Sparkle, Youtube };
const UTILITY_ICONS = { Package, LifeBuoy, Scissors, Briefcase };

export function Footer() {
  /* Store name, address and contact details come from the admin panel's
     store settings. */
  const { brand: BRAND } = useSiteSettings();

  return (
    <footer className="mt-auto bg-cream text-charcoal">
      {/* <Newsletter tone="dark" /> */}

      {/* The seam between the page and the footer: a gold hairline that fades
          out at both ends, rather than a border ruled edge to edge. */}
      <div
        aria-hidden="true"
        className="h-px w-full bg-gradient-to-r from-transparent via-gold/50 to-transparent"
      />

      <div className="container-site py-8 sm:py-12 lg:py-16">
        {/*
          The brand block is a column of its own and half again as wide as a
          link column: it carries the wordmark, the standfirst, three contact
          rows and the social list, and squeezing all of that into a 1fr track
          wraps the address to four lines.
        */}
        <div className="grid gap-x-8 sm:grid-cols-2 sm:gap-y-10 lg:grid-cols-[1.5fr_repeat(3,minmax(0,1fr))] lg:gap-x-10 lg:gap-y-0 xl:gap-x-16">
          {/*
            Brand, contact and social.
            First in the DOM as well as on the page, because on a phone the
            address and the two tap-to-contact rows are what the footer is *for*
            — burying them under three collapsed accordions costs three taps to
            reach.
          */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-block" aria-label={`${BRAND.name} home`}>
              {/* The footer sits on cream now, so this is the logo artwork
                  itself — oxblood with its gold rule — rather than the wordmark
                  set in type, which is what the old charcoal panel forced. */}
              <BrandLogo name={BRAND.name} className="max-h-16 sm:max-h-20 lg:max-h-[104px]" />
            </Link>

            <p className="mt-6 max-w-xs text-[13px] leading-relaxed text-charcoal-soft">
              {BRAND.tagline}. Handwoven textiles and considered silhouettes, made with
              craftspeople across India.
            </p>

            {/* Address, email and phone read as one block of three icon rows —
                no sub-headings, since the icons already say which is which.
                `tap-target` gives the two tappable rows a 44px height on a
                phone without changing how they read on a desktop. */}
            <ul className="mt-6 space-y-1 sm:mt-7 sm:space-y-3.5">
              <li className="flex items-start gap-3 text-[13px] leading-relaxed text-charcoal-soft">
                <MapPin size={16} className="mt-0.5 shrink-0 text-brand-soft" aria-hidden="true" />
                <span className="max-w-sm">{BRAND.address}</span>
              </li>
              <li>
                <a
                  href={`mailto:${BRAND.email}`}
                  className="footer-link tap-target flex items-center gap-3 break-all text-[13px]"
                >
                  <Mail size={16} className="shrink-0 text-brand-soft" aria-hidden="true" />
                  {BRAND.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${BRAND.phone.replace(/\s/g, '')}`}
                  className="footer-link tap-target flex items-center gap-3 text-[13px]"
                >
                  <Phone size={16} className="shrink-0 text-brand-soft" aria-hidden="true" />
                  {BRAND.phone}
                </a>
              </li>
            </ul>

            {/* Social sits under the contact details rather than in a column of
                its own, so the three link columns stay the three *navigation*
                columns. */}
       
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <FooterSection title={col.title}>
                <ul className="space-y-0 sm:space-y-3">
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
        </div>
      </div>

      {/*
        Utility bar.
        A tinted band under the columns carrying the things a customer looks for
        once they have already bought something — where the order is, who to ask,
        and whether their card is taken — plus the copyright and the policies.
      */}
      <div className="border-t border-beige bg-sand/50">
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
                    <Icon size={14} className="text-brand-soft" aria-hidden="true" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Last on a phone, where it reads as a sign-off; in the middle on a
              desktop, where the two flanking groups need something to push
              against. */}
          <p className="order-last text-[11px] text-charcoal-faint lg:order-none">
            © {new Date().getFullYear()} {BRAND.name}. All Rights Reserved.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest2 text-charcoal-faint">
              <ShieldCheck size={14} className="text-brand-soft" aria-hidden="true" />
              We Accept
            </span>
            <ul className="flex flex-wrap items-center justify-center gap-1.5">
              {PAYMENT_BADGES.map((badge) => (
                <li
                  key={badge}
                  className="rounded border border-beige bg-cream px-2 py-1 text-[10px] font-medium tracking-wide text-charcoal-muted"
                >
                  {badge}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Policies. Their own hairline under the utility row rather than a
            fourth link column — they are small print, and the grid above is
            the brand block plus the three shopping columns. */}
        <div className="border-t border-beige/70">
          <nav aria-label="Policies" className="container-site py-2 sm:py-3">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0 sm:gap-y-1">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="footer-link tap-target inline-flex items-center text-[11px]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/*
          The build credit, and the last line on the page.

          Below the policies rather than beside them: those are the customer's
          small print and this is not addressed to the customer at all, so it
          gets its own hairline and the faintest ink on the page. Same 11px as
          the copyright it echoes.
        */}
  <div className="border-t border-beige/70">
  <p className="container-site py-2.5 text-center text-[11px] text-charcoal-faint sm:py-3">
    Designed and Developed by{" "}
    <a
      href="https://netcom-india.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline"
    >
      {BUILT_BY}
    </a>
  </p>
</div>
      </div>

      {/* Clears the fixed mobile bottom nav, home indicator included. */}
      <div aria-hidden="true" className="h-bottom-nav lg:hidden" />
    </footer>
  );
}
