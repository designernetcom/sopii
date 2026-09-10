import { Link } from 'react-router-dom';
import { Image } from '../ui/Image';
import { useSiteSettings } from '../../context/CatalogContext';
import { cn } from '../../utils/cn';
import { usePageSeo } from '../SEO/SEOHead';

/**
 * The editorial photograph on the left of every authentication screen.
 *
 * A fixed Cloudinary URL rather than the generated placeholder that used to
 * sit here: the auth screens are one continuous surface, so a shopper who goes
 * Log In -> Forgot Password -> Reset should not watch the artwork change under
 * them. `<Image>` resizes and re-encodes it per browser, so the one URL costs
 * a phone no more than a phone-sized file.
 */
const PANEL_IMAGE =
  'https://res.cloudinary.com/w2brnx9l/image/upload/v1788938564/sopii/products/unassigned/vhurm92pwhignvzhvocg.png';

/**
 * §21's split layout, shared by every authentication screen.
 *
 *   Desktop   editorial photograph on the left, form on the right.
 *   Mobile    single column — logo, form, alternatives, register link.
 *
 * The photograph is `aria-hidden` because it is decoration: describing a
 * fashion image to someone using a screen reader adds nothing to signing in,
 * and a wrong description is worse than none.
 *
 * Every screen that uses this layout is an authentication step, so the layout
 * sets the page metadata itself: one `noindex` rule in one place rather than
 * the same line repeated across six screens that must not drift apart.
 */
export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}) {
  const { brand: BRAND } = useSiteSettings();

  usePageSeo({
    title,
    description: subtitle,
    noindex: true,
  });

  return (
    <div className="grid min-h-[70vh] lg:grid-cols-2">
      <div className="relative hidden lg:block" aria-hidden="true">
        <Image
          src={PANEL_IMAGE}
          alt=""
          ratio="h-[900px]"
          wrapperClassName="w-full"
          preset="detail"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/75 via-charcoal/20 to-transparent" />
        <div className="absolute inset-x-10 bottom-10 text-cream">
          <p className="font-display text-3xl leading-tight">
            Handwoven textiles,
            <br />
            made to be lived in.
          </p>
          <p className="mt-3 text-[12px] uppercase tracking-widest2 text-cream/70">
            {BRAND.name} — {BRAND.tagline}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8 lg:py-16">
        <div className={cn('w-full', wide ? 'max-w-md' : 'max-w-sm')}>
          {/* The wordmark, for the mobile column where the editorial panel is gone. */}
          <Link
            to="/"
            className="mb-8 inline-block font-display text-2xl tracking-widest2 text-charcoal lg:hidden"
          >
            {BRAND.name}
          </Link>

          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-3 text-sm text-charcoal-muted">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-8 border-t border-beige pt-6 text-center text-[13px] text-charcoal-muted">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
