import { useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { Skeleton, SkeletonScreen, SkeletonText } from './Skeleton';

/**
 * Page-shaped shimmer.
 * ===========================================================================
 * One skeleton per screen, laid out with the *same* container, grid and
 * spacing classes as the page it stands in for. That is the whole point: when
 * the data lands the shimmer is replaced in place, with no reflow, rather than
 * a centred spinner collapsing into a full page.
 *
 * `RouteSkeleton` at the bottom picks the right one from the URL, and that is
 * what the router's Suspense fallback, the catalogue gate and the auth guards
 * all render — so somebody opening /product/123 cold watches a product page
 * fill in rather than a generic loader.
 *
 * Keep these in step with their pages. If a page's grid changes and its
 * skeleton does not, the shimmer stops reserving the right space and the
 * layout shift it exists to prevent comes back.
 */

/** The listing grid, shared by Shop, search, collections and the wishlist. */
const PRODUCT_GRID =
  'grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 md:grid-cols-3 lg:gap-x-5 lg:gap-y-10 xl:grid-cols-4';

/* ----------------------------- Shared pieces ------------------------------ */

/**
 * The product tile, mirroring ProductCard: the same 4:5 image and the same
 * three lines beneath it.
 *
 * It lives here rather than beside the card because the catalogue gate renders
 * it, and the card's own imports — cart, wishlist, UI — lead straight back to
 * the catalogue. Keeping the shimmer free of them keeps that loop closed.
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[4/5] w-full" />
      <div className="space-y-2 pt-3">
        <Skeleton className="h-2 w-16" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/**
 * Grid tiles as bare `<li>`s, so a page can append them inside its own live
 * `<ul>` while the rest of the catalogue streams in — a wrapper element would
 * put a `<div>` between the `<ul>` and its `<li>`s.
 */
export function ProductTileSkeletons({ count = 8 }) {
  return Array.from({ length: count }, (_, i) => (
    <li key={`tile-skeleton-${i}`}>
      <ProductCardSkeleton />
    </li>
  ));
}

/**
 * Wishlist rows. The saved list uses a compact row rather than the grid tile,
 * so its shimmer does too.
 */
export function WishlistRowSkeletons({ count = 3 }) {
  return Array.from({ length: count }, (_, i) => (
    <li key={`wishlist-skeleton-${i}`} className="flex gap-4 border border-beige bg-cream p-4">
      <Skeleton className="aspect-[4/5] w-24 shrink-0 sm:w-28" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-2 w-16" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-9 w-28" />
      </div>
    </li>
  ));
}

/** A standalone listing grid. */
export function ProductGridSkeleton({ count = 8, className }) {
  return (
    <ul className={cn(PRODUCT_GRID, className)}>
      <ProductTileSkeletons count={count} />
    </ul>
  );
}

function BreadcrumbSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <Skeleton className="h-2 w-10" />
      <Skeleton className="h-2 w-2" />
      <Skeleton className="h-2 w-16" />
      <Skeleton className="h-2 w-2" />
      <Skeleton className="h-2 w-20" />
    </div>
  );
}

/** Page title and blurb, matching the bordered header every listing uses. */
function PageHeaderSkeleton({ className }) {
  return (
    <header className={cn('mt-5 border-b border-beige pb-6 lg:pb-8', className)}>
      <Skeleton className="h-8 w-56 max-w-full sm:h-10 sm:w-72 lg:h-12 lg:w-80" />
      <Skeleton className="mt-4 h-3 w-full max-w-xl" />
    </header>
  );
}

function FilterPanelSkeleton() {
  return (
    <div className="sticky top-28">
      <Skeleton className="h-2.5 w-16" />
      <div className="mt-6 space-y-7">
        {Array.from({ length: 4 }, (_, group) => (
          <div key={group}>
            <Skeleton className="h-2.5 w-24" />
            <div className="mt-3.5 space-y-2.5">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="flex items-center gap-2.5">
                  <Skeleton className="h-3.5 w-3.5" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The toolbar above a grid: filter button on mobile, count and sort. */
function ListingToolbarSkeleton() {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-beige pb-4 lg:border-0 lg:pb-0">
      <Skeleton className="h-11 w-36 lg:h-2.5 lg:w-28" />
      <Skeleton className="h-11 w-40" />
    </div>
  );
}

/** A home-page rail: heading, then cards running off the right edge. */
function CarouselSkeleton({ className }) {
  return (
    <section className={cn('section', className)}>
      <div className="container-site">
        <div className="max-w-xl space-y-3.5">
          <Skeleton className="h-2 w-24" />
          <Skeleton className="h-7 w-72 max-w-full sm:h-9" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
      </div>

      <div className="mt-8 flex gap-4 overflow-hidden px-4 pb-2 sm:gap-5 sm:px-6 lg:px-8 xl:px-10">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="w-[62vw] shrink-0 sm:w-[38vw] md:w-[30vw] lg:w-[23vw] xl:w-[calc((1440px-5rem-4*1.25rem)/4.5)]"
          >
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The editorial header shared by collection and static pages. */
function EditorialHeaderSkeleton({ tall = false }) {
  return (
    <header className="relative bg-charcoal">
      <Skeleton
        dark
        className={cn(
          'w-full',
          tall ? 'h-[46vh] min-h-[300px] lg:h-[56vh]' : 'h-[34vh] min-h-[220px] lg:h-[40vh]',
        )}
      />
      <div className="absolute inset-0 flex items-end">
        <div className="container-site space-y-4 pb-8 lg:pb-12">
          <Skeleton dark className="h-2 w-24" />
          <Skeleton dark className="h-8 w-72 max-w-full sm:h-11 sm:w-96" />
          <Skeleton dark className="h-3 w-full max-w-md" />
        </div>
      </div>
    </header>
  );
}

/** The order summary card that sits beside the bag and the checkout. */
function SummaryCardSkeleton() {
  return (
    <div className="border border-beige bg-cream p-6">
      <Skeleton className="h-5 w-32" />
      <div className="mt-6 space-y-3.5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4 border-t border-beige pt-5">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-6 h-12 w-full" />
    </div>
  );
}

/* ------------------------------ List skeletons ---------------------------- */
/* Small and reusable, for a wait *inside* a page that has already painted.
   The order list on /orders and on the account's Orders tab is the same wait
   in two places, so it is the same skeleton in two places. */

/** Order cards, as `/orders` and the account's Orders tab both draw them. */
export function OrderListSkeleton({ count = 3, className }) {
  return (
    <SkeletonScreen label="Loading your orders" className={cn('space-y-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-beige bg-cream p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="mt-5 flex items-center gap-4">
            <Skeleton className="h-16 w-14 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-3.5 w-20 shrink-0" />
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** Signed-in devices on `/account/sessions`. */
export function SessionListSkeleton({ count = 3, className }) {
  return (
    <SkeletonScreen
      label="Loading your active sessions"
      className={cn('divide-y divide-beige border border-beige bg-cream', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-3 w-44 max-w-full" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** The security page's recent-activity log. */
export function ActivityListSkeleton({ count = 4, className }) {
  return (
    <SkeletonScreen
      label="Loading recent activity"
      className={cn('divide-y divide-beige border border-beige bg-cream', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
          <div className="min-w-0 space-y-2.5">
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-2.5 w-32" />
          </div>
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/* ------------------------------ Page skeletons ---------------------------- */

export function HomeSkeleton() {
  return (
    <SkeletonScreen label="Loading the shop">
      <Skeleton className="h-[62vh] min-h-[380px] w-full lg:h-[76vh]" />

      {/* Trust strip */}
      <div className="border-y border-beige bg-cream">
        <div className="container-site grid grid-cols-2 gap-8 py-9 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2 w-16" />
            </div>
          ))}
        </div>
      </div>

      <CarouselSkeleton />

      {/* Editorial banner */}
      <Skeleton className="h-[52vh] min-h-[320px] w-full" />

      <CarouselSkeleton className="bg-sand/40" />
    </SkeletonScreen>
  );
}

export function ShopSkeleton() {
  return (
    <SkeletonScreen label="Loading products" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />
      <PageHeaderSkeleton />

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10 xl:grid-cols-[268px_1fr] xl:gap-14">
        <aside className="hidden lg:block lg:py-8">
          <FilterPanelSkeleton />
        </aside>

        <section className="min-w-0 py-6 lg:py-8">
          <ListingToolbarSkeleton />
          <ProductGridSkeleton count={8} />
        </section>
      </div>
    </SkeletonScreen>
  );
}

export function ProductDetailsSkeleton() {
  return (
    <SkeletonScreen label="Loading product" className="container-site py-5 lg:py-8">
      <BreadcrumbSkeleton />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 xl:gap-20">
        {/* Gallery */}
        <div>
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="mt-3 flex gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-16 shrink-0 sm:w-20" />
            ))}
          </div>
        </div>

        {/* Information */}
        <div className="lg:py-2">
          <Skeleton className="h-2 w-20" />
          <Skeleton className="mt-3 h-8 w-full max-w-md sm:h-10" />
          <Skeleton className="mt-2.5 h-8 w-3/4 max-w-sm sm:h-10" />

          <div className="mt-5 flex items-center gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>

          <Skeleton className="mt-6 h-7 w-40" />
          <Skeleton className="mt-2 h-2 w-32" />

          <SkeletonText lines={3} className="mt-7 max-w-lg" />

          {/* Colour, size and quantity */}
          <div className="mt-9 space-y-7">
            {Array.from({ length: 2 }, (_, group) => (
              <div key={group}>
                <Skeleton className="h-2.5 w-24" />
                <div className="mt-3 flex gap-2.5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-11 w-11" />
                  ))}
                </div>
              </div>
            ))}

            <div>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-3 h-11 w-32" />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>

          <div className="mt-9 space-y-3 border-t border-beige pt-7">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}

export function CollectionsSkeleton() {
  return (
    <SkeletonScreen
      label="Loading collections"
      className="collection-page container-site py-6 lg:py-10"
    >
      <BreadcrumbSkeleton />
      <PageHeaderSkeleton />

      <ul className="grid gap-4 py-8 sm:grid-cols-2 lg:gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i}>
            <Skeleton className="aspect-[4/3] w-full" />
          </li>
        ))}
      </ul>
    </SkeletonScreen>
  );
}

export function CollectionDetailSkeleton() {
  return (
    <SkeletonScreen label="Loading collection">
      <EditorialHeaderSkeleton tall />

      <div className="container-site py-6 lg:py-10">
        <BreadcrumbSkeleton />

        <div className="mt-6 flex items-center justify-between gap-4 border-b border-beige pb-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-11 w-44" />
        </div>

        <ProductGridSkeleton count={8} className="py-8" />
      </div>
    </SkeletonScreen>
  );
}

export function SearchResultsSkeleton() {
  return (
    <SkeletonScreen label="Searching" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />
      <PageHeaderSkeleton className="mt-5 border-0 pb-6" />
      <ProductGridSkeleton count={8} className="pb-8" />
    </SkeletonScreen>
  );
}

export function WishlistSkeleton() {
  return (
    <SkeletonScreen label="Loading your wishlist" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-beige pb-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-56 sm:h-10" />
          <Skeleton className="h-2.5 w-32" />
        </div>
        <Skeleton className="h-10 w-32" />
      </header>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-8 py-8 sm:gap-x-4 lg:grid-cols-3">
        <WishlistRowSkeletons count={6} />
      </ul>
    </SkeletonScreen>
  );
}

export function CartSkeleton() {
  return (
    <SkeletonScreen label="Loading your bag" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-beige pb-6">
        <Skeleton className="h-8 w-52 sm:h-10" />
        <Skeleton className="h-2.5 w-24" />
      </header>

      <div className="grid gap-10 py-8 lg:grid-cols-[1fr_360px] lg:gap-14 xl:grid-cols-[1fr_400px]">
        <div>
          <div className="hidden grid-cols-[1fr_140px_120px] gap-4 border-b border-beige pb-3 sm:grid">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-2 w-16" />
          </div>

          <div className="divide-y divide-beige">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="grid grid-cols-[88px_1fr] gap-4 py-6 sm:grid-cols-[1fr_140px_120px] sm:items-start"
              >
                <div className="flex gap-4">
                  <Skeleton className="h-28 w-[88px] shrink-0" />
                  <div className="hidden min-w-0 flex-1 space-y-2.5 sm:block">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>

                {/* Mobile stacks name, options and stepper beside the photo */}
                <div className="space-y-2.5 sm:hidden">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-10 w-28" />
                </div>

                <Skeleton className="hidden h-11 w-28 sm:block" />
                <Skeleton className="hidden h-3.5 w-20 sm:block sm:justify-self-end" />
              </div>
            ))}
          </div>
        </div>

        <SummaryCardSkeleton />
      </div>
    </SkeletonScreen>
  );
}

export function CheckoutSkeleton() {
  return (
    <SkeletonScreen label="Loading checkout" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />
      <Skeleton className="mt-5 h-8 w-48 sm:h-10" />

      <div className="grid gap-10 py-8 lg:grid-cols-[1fr_380px] lg:gap-14 xl:grid-cols-[1fr_420px]">
        <div className="space-y-10">
          {Array.from({ length: 3 }, (_, section) => (
            <div key={section}>
              <div className="flex items-center gap-3 border-b border-beige pb-4">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, field) => (
                  <div key={field} className="space-y-2">
                    <Skeleton className="h-2 w-20" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <SummaryCardSkeleton />
      </div>
    </SkeletonScreen>
  );
}

export function OrderSuccessSkeleton() {
  return (
    <SkeletonScreen label="Loading your order" className="container-site py-10 lg:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-8 w-64 max-w-full sm:h-10" />
          <Skeleton className="h-3 w-full max-w-sm" />
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Fulfilment timeline */}
        <div className="mt-10 flex items-center justify-between gap-2 border-y border-beige py-7">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-2 w-14" />
            </div>
          ))}
        </div>

        {/* Items */}
        <div className="mt-8 divide-y divide-beige border border-beige bg-cream">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 p-5">
              <Skeleton className="h-20 w-16 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <Skeleton className="h-3.5 w-20 shrink-0" />
            </div>
          ))}
        </div>

        <Skeleton className="mt-8 h-12 w-full sm:mx-auto sm:w-56" />
      </div>
    </SkeletonScreen>
  );
}

export function AccountSkeleton() {
  return (
    <SkeletonScreen label="Loading your account" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />

      <header className="mt-5 border-b border-beige pb-6">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="mt-3 h-8 w-64 max-w-full sm:h-10" />
        <Skeleton className="mt-3 h-3 w-full max-w-md" />
      </header>

      <div className="gap-10 py-8 lg:grid lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside className="mb-8 lg:mb-0">
          <div className="flex gap-2 overflow-hidden lg:flex-col lg:gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-32 shrink-0 lg:w-full" />
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <Skeleton className="h-6 w-48" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2 w-20" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-7 h-12 w-40" />
        </section>
      </div>
    </SkeletonScreen>
  );
}

export function AccountSecuritySkeleton() {
  return (
    <SkeletonScreen label="Loading security settings" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />

      <header className="mt-5 border-b border-beige pb-6">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="mt-3 h-8 w-56 sm:h-10" />
        <Skeleton className="mt-3 h-3 w-full max-w-md" />
      </header>

      <div className="max-w-2xl space-y-10 py-8">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-6 w-44" />
            <SkeletonText lines={2} className="mt-3 max-w-lg" />
            <div className="mt-6 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-40" />
            </div>
          </div>
        ))}

        <ActivityListSkeleton />
      </div>
    </SkeletonScreen>
  );
}

export function AccountSessionsSkeleton() {
  return (
    <SkeletonScreen label="Loading your active sessions" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />

      <header className="mt-5 border-b border-beige pb-6">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="mt-3 h-8 w-64 sm:h-10" />
        <Skeleton className="mt-3 h-3 w-full max-w-xl" />
      </header>

      <div className="max-w-2xl py-8">
        <SessionListSkeleton />
      </div>
    </SkeletonScreen>
  );
}

export function OrdersSkeleton() {
  return (
    <SkeletonScreen label="Loading your orders" className="container-site py-6 lg:py-10">
      <BreadcrumbSkeleton />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-beige pb-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48 sm:h-10" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-28" />
      </header>

      <OrderListSkeleton className="py-8" count={3} />
    </SkeletonScreen>
  );
}

export function StaticPageSkeleton() {
  return (
    <SkeletonScreen label="Loading page">
      <EditorialHeaderSkeleton />

      <div className="container-site py-6 lg:py-10">
        <BreadcrumbSkeleton />
        <div className="mt-8 max-w-3xl space-y-8">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-6 w-56 max-w-full" />
              <SkeletonText lines={4} className="mt-4" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}

/**
 * The split authentication layout, for every `/login`, `/register` and
 * `/auth/*` wait — including the moment after Google hands the browser back.
 * `label` is what a screen reader hears, so that moment can say what it is.
 */
export function AuthSkeleton({ label = 'Loading' }) {
  return (
    <SkeletonScreen label={label} className="grid min-h-[70vh] lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <Skeleton dark className="h-full w-full" />
        <div className="absolute inset-x-10 bottom-10 space-y-3">
          <Skeleton dark className="h-7 w-64" />
          <Skeleton dark className="h-7 w-52" />
          <Skeleton dark className="h-2.5 w-40" />
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Skeleton className="mx-auto h-8 w-28 lg:mx-0" />
          <Skeleton className="mt-8 h-2 w-20" />
          <Skeleton className="mt-3 h-8 w-56 max-w-full" />
          <Skeleton className="mt-3 h-3 w-full max-w-xs" />

          <div className="mt-8 space-y-4">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2 w-20" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
            <Skeleton className="h-12 w-full" />
          </div>

          <Skeleton className="mx-auto mt-8 h-2.5 w-32" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}

/** A plain content page — the 404, and anything unrecognised. */
export function GenericPageSkeleton() {
  return (
    <SkeletonScreen label="Loading" className="container-site py-12 lg:py-20">
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-64 max-w-full sm:h-10" />
        <SkeletonText lines={4} />
        <Skeleton className="h-12 w-40" />
      </div>
    </SkeletonScreen>
  );
}

/* -------------------------------- Chrome ---------------------------------- */

/**
 * Header and footer placeholders.
 *
 * Only the catalogue gate needs these: it runs *above* `<Layout>`, so on a
 * cold load there is no real header for the page shimmer to sit beneath.
 * Everywhere else the chrome has already painted, and drawing a second one
 * over it would be a lie.
 */
function ChromeSkeleton({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Skeleton className="h-9 w-full" />

      <div className="border-b border-beige bg-cream">
        <div className="container-site flex items-center justify-between gap-6 py-5">
          <div className="hidden gap-6 lg:flex">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-2.5 w-16" />
            ))}
          </div>
          <Skeleton className="h-7 w-24 lg:h-8 lg:w-32" />
          <div className="flex gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-5" />
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1">{children}</main>

      <div className="mt-16 border-t border-beige bg-cream">
        <div className="container-site grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, column) => (
            <div key={column} className="space-y-3.5">
              <Skeleton className="h-2.5 w-24" />
              {Array.from({ length: 4 }, (_, row) => (
                <Skeleton key={row} className="h-2 w-20" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Route matching ---------------------------- */

/** Paths that map to exactly one skeleton. */
const EXACT = {
  '/': HomeSkeleton,
  '/shop': ShopSkeleton,
  '/new-arrivals': ShopSkeleton,
  '/bestsellers': ShopSkeleton,
  '/sale': ShopSkeleton,
  '/sarees': ShopSkeleton,
  '/blouses': ShopSkeleton,
  '/women': ShopSkeleton,
  '/collections': CollectionsSkeleton,
  '/search': SearchResultsSkeleton,
  '/wishlist': WishlistSkeleton,
  '/cart': CartSkeleton,
  '/checkout': CheckoutSkeleton,
  '/orders': OrdersSkeleton,
  '/account': AccountSkeleton,
  '/account/security': AccountSecuritySkeleton,
  '/account/sessions': AccountSessionsSkeleton,
};

/** Prefixes that stand for a family of routes. Checked in order. */
const PREFIXES = [
  ['/product/', ProductDetailsSkeleton],
  ['/collections/', CollectionDetailSkeleton],
  ['/order-success', OrderSuccessSkeleton],
  ['/pages/', StaticPageSkeleton],
  ['/login', AuthSkeleton],
  ['/register', AuthSkeleton],
  ['/forgot-password', AuthSkeleton],
  ['/reset-password', AuthSkeleton],
  ['/auth/', AuthSkeleton],
];

/** Which skeleton a URL should shimmer as. */
function skeletonForPath(pathname = '/') {
  /* A trailing slash is the same page: `/shop/` must not miss the table above
     and fall through to the category branch, which would shimmer as a
     different shape for no reason. */
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (EXACT[path]) return EXACT[path];

  const prefixed = PREFIXES.find(([prefix]) => path.startsWith(prefix));
  if (prefixed) return prefixed[1];

  /* Anything left with a single segment is a category slug, which renders the
     Shop — the last route in App.jsx, and by far the most likely miss. */
  if (/^\/[^/]+$/.test(path)) return ShopSkeleton;

  return GenericPageSkeleton;
}

/**
 * The right skeleton for wherever the shopper is.
 *
 * Rendered by the router's Suspense fallback while a route chunk downloads, by
 * the catalogue gate on a cold start, and by the auth guards while the session
 * is restored — three different waits that all now look like the page that is
 * on its way.
 *
 * @param {boolean} [chrome] Draw a header and footer too. Only for a wait that
 *   happens above `<Layout>`, where no real chrome has painted yet.
 */
export function RouteSkeleton({ chrome = false }) {
  const { pathname } = useLocation();
  const Skeletal = skeletonForPath(pathname);

  if (chrome) {
    return (
      <ChromeSkeleton>
        <Skeletal />
      </ChromeSkeleton>
    );
  }

  return <Skeletal />;
}
