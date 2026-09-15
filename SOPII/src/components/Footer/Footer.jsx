import { Link } from 'react-router-dom';
import { Mail, MapPin, Package, Phone, ShieldCheck } from 'lucide-react';
import { useFooter, useSiteSettings } from '../../context/CatalogContext';
import { BrandLogo } from '../ui/BrandLogo';
import { FooterSection } from './FooterSection';
import { socialIcon, UTILITY_ICONS } from './footerIcons';

/*
 * The footer is managed in the admin panel (Storefront → Footer): which
 * sections exist, their order, their links and whether each is shown. This
 * component only decides *where* each kind of section goes, which is fixed:
 *
 *   columns     brand, links, text, social — the grid across the top
 *   bottom bar  utility, copyright, payments — side by side when adjacent
 *               legal, credit — full-width lines of small print
 *
 * The store's name, address, email and phone still come from Settings → Store.
 */

const COLUMN_TYPES = new Set(['brand', 'links', 'text', 'social']);

/** Bottom-bar types that share one row when they follow each other. */
const BAR_TYPES = new Set(['utility', 'copyright', 'payments']);

/**
 * A section with nothing to show is left out rather than rendered as an empty
 * heading — a link column whose every link is switched off, a blank text column.
 */
function hasContent(section) {
  switch (section.type) {
    case 'brand':
      return true;
    case 'text':
    case 'copyright':
      return Boolean(section.content);
    case 'credit':
      return Boolean(section.content || section.items.length);
    default:
      return section.items.length > 0;
  }
}

/**
 * Consecutive bar sections are grouped into one row; every other bottom
 * section is a row of its own. With the default order — quick links,
 * copyright, payments, policies, credit — this is exactly the footer's
 * original three rows.
 */
function groupBottomRows(sections) {
  const rows = [];
  sections.forEach((section) => {
    const last = rows[rows.length - 1];
    if (BAR_TYPES.has(section.type) && last && BAR_TYPES.has(last[0].type)) last.push(section);
    else rows.push([section]);
  });
  return rows;
}

const fillTokens = (text, storeName) =>
  text.split('{year}').join(String(new Date().getFullYear())).split('{store}').join(storeName);

/**
 * One footer link. Site paths go through the router; anything else — or
 * anything the panel asked to open in a new tab — is a plain anchor.
 */
function FooterLink({ item, className, children }) {
  if (item.internal && !item.newTab) {
    return (
      <Link to={item.url} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={item.url}
      className={className}
      {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

export function Footer() {
  /* Store name, address and contact details come from the admin panel's
     store settings; everything else from its Footer screen. */
  const { brand: BRAND } = useSiteSettings();
  const footer = useFooter();

  const sections = (footer?.sections ?? []).filter(hasContent);
  const columns = sections.filter((section) => COLUMN_TYPES.has(section.type));
  const bottomRows = groupBottomRows(sections.filter((section) => !COLUMN_TYPES.has(section.type)));

  /*
   * The brand block is half again as wide as a link column: it carries the
   * wordmark, the standfirst, three contact rows, and squeezing all of that
   * into a 1fr track wraps the address to four lines. The track list is built
   * from the sections actually shown, so adding or hiding a column keeps the
   * grid on one row at desktop width.
   */
  const desktopTracks = columns
    .map((section) => (section.type === 'brand' ? '1.5fr' : 'minmax(0,1fr)'))
    .join(' ');

  return (
    <footer className="mt-auto bg-cream text-charcoal">
      {/* Newsletter signup: switched off in code, not in the panel — see the
          note in Newsletter/Newsletter.jsx. Restoring it here means importing
          it again and rendering <Newsletter tone="dark" />. */}

      {/* The seam between the page and the footer: a gold hairline that fades
          out at both ends, rather than a border ruled edge to edge. */}
      <div
        aria-hidden="true"
        className="h-px w-full bg-gradient-to-r from-transparent via-gold/50 to-transparent"
      />

      {columns.length > 0 && (
        <div className="container-site py-8 sm:py-12 lg:py-16">
          <div
            className="grid gap-x-8 sm:grid-cols-2 sm:gap-y-10 lg:grid-cols-[var(--footer-tracks)] lg:gap-x-10 lg:gap-y-0 xl:gap-x-16"
            style={{ '--footer-tracks': desktopTracks }}
          >
            {columns.map((section) => {
              switch (section.type) {
                case 'brand':
                  return <BrandColumn key={section.id} section={section} brand={BRAND} />;
                case 'text':
                  return <TextColumn key={section.id} section={section} />;
                case 'social':
                  return <SocialColumn key={section.id} section={section} />;
                default:
                  return <LinksColumn key={section.id} section={section} />;
              }
            })}
          </div>
        </div>
      )}

      {/*
        Bottom bar.
        A tinted band under the columns carrying the things a customer looks for
        once they have already bought something — where the order is, who to ask,
        and whether their card is taken — plus the copyright and the policies.
      */}
      {bottomRows.length > 0 && (
        <div className="border-t border-beige bg-sand/50">
          {bottomRows.map((row, index) => (
            <BottomRow key={row[0].id} row={row} divided={index > 0} storeName={BRAND.name} />
          ))}
        </div>
      )}

      {/* Clears the fixed mobile bottom nav, home indicator included. */}
      <div aria-hidden="true" className="h-bottom-nav lg:hidden" />
    </footer>
  );
}

/* --------------------------------- columns --------------------------------- */

/*
 * Brand, contact and social.
 * First in the DOM as well as on the page by default, because on a phone the
 * address and the two tap-to-contact rows are what the footer is *for* —
 * burying them under three collapsed accordions costs three taps to reach.
 */
function BrandColumn({ section, brand }) {
  const { display } = section;
  const showAddress = display.address && brand.address;
  const showEmail = display.email && brand.email;
  const showPhone = display.phone && brand.phone;

  return (
    <div className="sm:col-span-2 lg:col-span-1">
      {display.logo && (
        <Link to="/" className="inline-block" aria-label={`${brand.name} home`}>
          {/* The footer sits on cream, so this is the logo artwork itself —
              oxblood with its gold rule — rather than the wordmark set in type. */}
          <BrandLogo name={brand.name} className="max-h-16 sm:max-h-20 lg:max-h-[104px]" />
        </Link>
      )}

      {section.content && (
        <p
          className={`${display.logo ? 'mt-6' : ''} max-w-xs whitespace-pre-line text-[13px] leading-relaxed text-charcoal-soft`}
        >
          {section.content}
        </p>
      )}

      {/* Address, email and phone read as one block of icon rows — no
          sub-headings, since the icons already say which is which.
          `tap-target` gives the tappable rows a 44px height on a phone without
          changing how they read on a desktop. */}
      {(showAddress || showEmail || showPhone) && (
        <ul className="mt-6 space-y-1 sm:mt-7 sm:space-y-3.5">
          {showAddress && (
            <li className="flex items-start gap-3 text-[13px] leading-relaxed text-charcoal-soft">
              <MapPin size={16} className="mt-0.5 shrink-0 text-brand-soft" aria-hidden="true" />
              <span className="max-w-sm">{brand.address}</span>
            </li>
          )}
          {showEmail && (
            <li>
              <a
                href={`mailto:${brand.email}`}
                className="footer-link tap-target flex items-center gap-3 break-all text-[13px]"
              >
                <Mail size={16} className="shrink-0 text-brand-soft" aria-hidden="true" />
                {brand.email}
              </a>
            </li>
          )}
          {showPhone && (
            <li>
              <a
                href={`tel:${brand.phone.replace(/\s/g, '')}`}
                className="footer-link tap-target flex items-center gap-3 text-[13px]"
              >
                <Phone size={16} className="shrink-0 text-brand-soft" aria-hidden="true" />
                {brand.phone}
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function LinksColumn({ section }) {
  return (
    <nav aria-label={section.title}>
      <FooterSection title={section.title}>
        <ul className="space-y-0 sm:space-y-3">
          {section.items.map((item) => (
            <li key={item.id}>
              <FooterLink item={item} className="footer-link tap-target flex items-center text-[13px] sm:block">
                {item.label}
              </FooterLink>
            </li>
          ))}
        </ul>
      </FooterSection>
    </nav>
  );
}

function TextColumn({ section }) {
  return (
    <div>
      <FooterSection title={section.title}>
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-charcoal-soft">
          {section.content}
        </p>
      </FooterSection>
    </div>
  );
}

/* Oxblood, not each network's own colour — see `FOOTER` in data/site.js. */
function SocialColumn({ section }) {
  return (
    <nav aria-label={section.title}>
      <FooterSection title={section.title}>
        <ul className="space-y-0 sm:space-y-3">
          {section.items.map((item) => {
            const Icon = socialIcon(item.icon);
            return (
              <li key={item.id}>
                <FooterLink
                  item={item}
                  className="footer-link tap-target flex items-center gap-2.5 text-[13px]"
                >
                  <Icon size={15} strokeWidth={1.6} className="shrink-0 text-brand-soft" aria-hidden="true" />
                  {item.label}
                </FooterLink>
              </li>
            );
          })}
        </ul>
      </FooterSection>
    </nav>
  );
}

/* ------------------------------- bottom bar -------------------------------- */

function BottomRow({ row, divided, storeName }) {
  const [first] = row;
  const wrapper = divided ? 'border-t border-beige/70' : undefined;

  if (BAR_TYPES.has(first.type)) {
    return (
      <div className={wrapper}>
        <div
          className={`container-site flex flex-col items-center gap-4 py-5 text-center lg:flex-row lg:gap-8 lg:py-4 lg:text-left ${
            row.length > 1 ? 'lg:justify-between' : 'lg:justify-center'
          }`}
        >
          {row.map((section) => (
            <BarSection key={section.id} section={section} storeName={storeName} />
          ))}
        </div>
      </div>
    );
  }

  if (first.type === 'credit') {
    /* The build credit. Not addressed to the customer at all, so it gets its
       own hairline and the faintest ink on the page. */
    const [item] = first.items;
    return (
      <div className={wrapper}>
        <p className="container-site py-2.5 text-center text-[11px] text-charcoal-faint sm:py-3">
          {first.content}
          {first.content && item ? ' ' : null}
          {item && (
            <FooterLink item={item} className="hover:underline">
              {item.label}
            </FooterLink>
          )}
        </p>
      </div>
    );
  }

  /* Policies: small print on a hairline of their own rather than a link
     column — the grid above is for shopping. */
  return (
    <div className={wrapper}>
      <nav aria-label={first.title || 'Policies'} className="container-site py-2 sm:py-3">
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0 sm:gap-y-1">
          {first.items.map((item) => (
            <li key={item.id}>
              <FooterLink item={item} className="footer-link tap-target inline-flex items-center text-[11px]">
                {item.label}
              </FooterLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function BarSection({ section, storeName }) {
  if (section.type === 'copyright') {
    /* Last on a phone, where it reads as a sign-off; in the middle on a
       desktop, where the two flanking groups need something to push against. */
    return (
      <p className="order-last text-[11px] text-charcoal-faint lg:order-none">
        {fillTokens(section.content, storeName)}
      </p>
    );
  }

  if (section.type === 'payments') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        {section.title && (
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest2 text-charcoal-faint">
            <ShieldCheck size={14} className="text-brand-soft" aria-hidden="true" />
            {section.title}
          </span>
        )}
        <ul className="flex flex-wrap items-center justify-center gap-1.5">
          {section.items.map((badge) => (
            <li
              key={badge.id}
              className="rounded border border-beige bg-cream px-2 py-1 text-[10px] font-medium tracking-wide text-charcoal-muted"
            >
              {badge.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // utility
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0 sm:gap-y-1">
      {section.items.map((item) => {
        const Icon = item.icon ? UTILITY_ICONS[item.icon] || Package : null;
        return (
          <li key={item.id}>
            <FooterLink item={item} className="footer-link tap-target inline-flex items-center gap-2 text-[12px]">
              {Icon && <Icon size={14} className="text-brand-soft" aria-hidden="true" />}
              {item.label}
            </FooterLink>
          </li>
        );
      })}
    </ul>
  );
}
