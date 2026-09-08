import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { formatPrice, formatDate } from '../utils/format';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { ProductSEO } from '../components/SEO/ProductSEO';
import { Badge } from '../components/ui/Badge';
import { Price } from '../components/ui/Price';
import { Rating } from '../components/ui/Rating';
import { Accordion } from '../components/ui/Accordion';
import { QuantityStepper } from '../components/ui/QuantityStepper';
import { Modal } from '../components/Modal/Modal';
import { ProductGallery } from '../components/ProductGallery/ProductGallery';
import { ColorSelector, SizeSelector } from '../components/ProductOptions/ProductOptions';
import { WishlistButton } from '../components/WishlistButton/WishlistButton';
import { ProductCarousel } from '../components/ProductCarousel/ProductCarousel';
import { useCart } from '../context/CartContext';
import { useUI } from '../context/UIContext';
import { useRecentlyViewed } from '../context/RecentlyViewedContext';
import { useCatalog } from '../context/CatalogContext';
import { useProductReviews } from '../hooks/useProductReviews';
import NotFound from './NotFound';

const SIZE_CHART = [
  ['XS', '32', '26', '35'],
  ['S', '34', '28', '37'],
  ['M', '36', '30', '39'],
  ['L', '38', '32', '41'],
  ['XL', '40', '34', '43'],
  ['XXL', '42', '36', '45'],
];

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProductById, getRelatedProducts, getCompleteTheLook } = useCatalog();
  const product = getProductById(id);

  const { addItem } = useCart();
  const { openCart } = useUI();
  const { record, products: recentlyViewed } = useRecentlyViewed();

  const [size, setSize] = useState(null);
  const [color, setColor] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // Reset selections when navigating between products.
  useEffect(() => {
    if (!product) return;
    setSize(product.sizes.length === 1 ? product.sizes[0] : null);
    setColor(product.colors[0]?.name ?? null);
    setQuantity(1);
    setError('');
    record(product.id);
  }, [product, record]);

  const related = useMemo(
    () => getRelatedProducts(product, 10),
    [getRelatedProducts, product],
  );
  const completeTheLook = useMemo(
    () => getCompleteTheLook(product, 4),
    [getCompleteTheLook, product],
  );

  /* Approved reviews are moderated in the admin panel; the hook falls back to
     the bundled ones while they load or if the API is unreachable. */
  const { reviews, breakdown, total: reviewTotal, average } = useProductReviews(product);
  const alsoViewed = useMemo(
    () => recentlyViewed.filter((p) => p.id !== product?.id),
    [recentlyViewed, product],
  );

  if (!product) return <NotFound />;

  const validate = () => {
    if (!size) {
      setError('Please select a size before adding to your bag.');
      return false;
    }
    return true;
  };

  const handleAddToCart = () => {
    if (!validate()) return;
    addItem(product, { size, color, quantity, silent: true });
    openCart();
  };

  const handleBuyNow = () => {
    if (!validate()) return;
    addItem(product, { size, color, quantity, silent: true });
    navigate('/checkout');
  };

  /* One array, two consumers: the visible trail and the BreadcrumbList schema.
     Building it twice is how the two drift apart. */
  const crumbs = [
    { label: 'Home', to: '/' },
    { label: product.category, to: `/shop?category=${encodeURIComponent(product.category)}` },
    { label: product.name },
  ];

  return (
    <div>
      <ProductSEO product={product} reviews={reviews} breadcrumbs={crumbs} />

      <div className="container-site py-5 lg:py-8">
        <Breadcrumbs items={crumbs} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 xl:gap-20">
          {/* ------------------------------ Gallery --------------------------- */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <ProductGallery
              images={product.images}
              thumbnails={product.thumbnails}
              alt={product.name}
              badge={product.badge ? <Badge>{product.badge}</Badge> : null}
            />
          </div>

          {/* ---------------------------- Information ------------------------- */}
          <div className="lg:py-2">
            <p className="eyebrow">{product.category}</p>

            <h1 className="mt-2.5 font-display text-[28px] leading-tight sm:text-4xl lg:text-[42px]">
              {product.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Rating value={product.rating} reviews={product.reviews} showValue size={14} />
              <a
                href="#reviews"
                className="text-[11px] text-clay underline underline-offset-4 hover:text-charcoal"
              >
                Read reviews
              </a>
            </div>

            <Price
              price={product.price}
              originalPrice={product.originalPrice}
              discount={product.discount}
              size="lg"
              className="mt-5"
            />
            <p className="mt-1 text-[11px] text-charcoal-faint">Inclusive of all taxes</p>

            <p className="mt-6 max-w-lg text-sm leading-relaxed text-charcoal-muted">
              {product.description}
            </p>

            {/* Options */}
            <div className="mt-8 space-y-6">
              <ColorSelector colors={product.colors} value={color} onChange={setColor} />

              <SizeSelector
                sizes={product.sizes}
                value={size}
                onChange={(s) => {
                  setSize(s);
                  setError('');
                }}
                onSizeGuide={product.sizes.length > 1 ? () => setSizeGuideOpen(true) : undefined}
              />

              <div>
                <p className="mb-2.5 text-[11px] font-medium uppercase tracking-widest2 text-charcoal-muted">
                  Quantity
                </p>
                <QuantityStepper value={quantity} onChange={setQuantity} />
              </div>
            </div>

            {error ? (
              <p role="alert" className="mt-4 text-[12px] text-sale">
                {error}
              </p>
            ) : null}

            {/* Actions */}
            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!product.inStock}
                className="btn-primary w-full"
              >
                {product.inStock ? 'Add to Cart' : 'Sold Out'}
              </button>

              <button
                type="button"
                onClick={handleBuyNow}
                disabled={!product.inStock}
                className="btn-outline w-full"
              >
                Buy Now
              </button>

              <div className="pt-1">
                <WishlistButton product={product} variant="inline" />
              </div>
            </div>

            {/* Delivery reassurance */}
            <ul className="mt-8 grid gap-3 border-y border-beige py-6 sm:grid-cols-3">
              {[
                { icon: Truck, label: 'Free shipping', text: 'Above ₹1,999' },
                { icon: RefreshCw, label: '15-day returns', text: 'No questions asked' },
                { icon: PackageCheck, label: 'Ships in 24h', text: 'Dispatched from Mumbai' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2.5">
                  <item.icon size={16} className="shrink-0 text-clay" strokeWidth={1.4} aria-hidden="true" />
                  <span>
                    <span className="block text-[11px] font-medium uppercase tracking-widest2">
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-charcoal-muted">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            {/* Information panels */}
            <Accordion
              className="mt-8 border-t-0"
              defaultOpen="details"
              items={[
                {
                  id: 'details',
                  title: 'Product Details',
                  content: (
                    <ul className="space-y-1.5">
                      {product.details.map((d) => (
                        <li key={d} className="flex gap-2">
                          <Check size={14} className="mt-0.5 shrink-0 text-clay" aria-hidden="true" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  ),
                },
                {
                  id: 'fabric',
                  title: 'Fabric & Care',
                  content: (
                    <>
                      <p className="mb-3">
                        Fabric: <strong className="font-medium text-charcoal">{product.fabric}</strong>
                      </p>
                      <ul className="space-y-1.5">
                        {product.care.map((c) => (
                          <li key={c} className="flex gap-2">
                            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </>
                  ),
                },
                {
                  id: 'shipping',
                  title: 'Shipping Information',
                  content: (
                    <div className="space-y-2">
                      <p>Dispatched within 24 hours on working days from our Mumbai studio.</p>
                      <p>Metro cities: 2–4 working days. Rest of India: 4–7 working days.</p>
                      <p>Free shipping on orders above ₹1,999. Cash on delivery available.</p>
                    </div>
                  ),
                },
                {
                  id: 'returns',
                  title: 'Returns',
                  content: (
                    <div className="space-y-2">
                      <p>
                        Return or exchange within 15 days of delivery, provided tags are intact and
                        the piece is unworn.
                      </p>
                      <p>Reverse pickup is free across serviceable pin codes.</p>
                      <p>Refunds are processed within 5 working days of the item reaching us.</p>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------- Reviews ------------------------------ */}
      <section id="reviews" className="border-t border-beige bg-sand/30 scroll-mt-24">
        <div className="container-site py-12 lg:py-16">
          <h2 className="font-display text-2xl sm:text-3xl">Customer Reviews</h2>

          <div className="mt-8 grid gap-10 lg:grid-cols-[280px_1fr] lg:gap-16">
            {/* Summary */}
            <div>
              <p className="font-display text-5xl">{(average || product.rating).toFixed(1)}</p>
              <Rating value={average || product.rating} size={16} className="mt-2" />
              <p className="mt-2 text-[12px] text-charcoal-muted">
                Based on {reviewTotal || product.reviews} reviews
              </p>

              <ul className="mt-6 space-y-2">
                {breakdown.map((row) => (
                  <li key={row.stars} className="flex items-center gap-3 text-[11px]">
                    <span className="w-7 shrink-0 text-charcoal-muted">{row.stars}★</span>
                    <span className="h-1.5 flex-1 overflow-hidden bg-beige">
                      <span
                        className="block h-full bg-gold"
                        style={{ width: `${row.percent}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-charcoal-faint">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* List */}
            <ul className="divide-y divide-beige border-t border-beige">
              {reviews.map((review) => (
                <li key={review.id} className="py-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Rating value={review.rating} size={12} />
                    <h3 className="text-[13px] font-medium">{review.title}</h3>
                    {review.verified ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest2 text-clay">
                        <Check size={11} aria-hidden="true" /> Verified
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-charcoal-muted">{review.body}</p>

                  <p className="mt-3 text-[11px] text-charcoal-faint">
                    {review.author} · {formatDate(review.date)}
                  </p>

                  {review.reply ? (
                    <p className="mt-3 border-l-2 border-beige pl-4 text-[12px] leading-relaxed text-charcoal-muted">
                      <span className="font-medium text-charcoal">SOPII</span> · {review.reply}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --------------------------- Recommendations -------------------------- */}
      {completeTheLook.length > 0 ? (
        <ProductCarousel
          eyebrow="Styled Together"
          title="Complete the look"
          products={completeTheLook}
        />
      ) : null}

      {related.length > 0 ? (
        <ProductCarousel
          eyebrow="More like this"
          title="You may also like"
          products={related}
          className="bg-sand/40"
        />
      ) : null}

      {alsoViewed.length >= 3 ? (
        <ProductCarousel eyebrow="Your Browsing" title="Recently viewed" products={alsoViewed} />
      ) : null}

      {/* ----------------------------- Size guide ----------------------------- */}
      <Modal open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} title="Size Guide">
        <div className="p-5 sm:p-7">
          <p className="text-sm text-charcoal-muted">
            All measurements are body measurements in inches. Our pieces are cut with ease built
            in — if you are between sizes, we recommend sizing up for a relaxed fit.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <caption className="sr-only">Body measurements by size, in inches</caption>
              <thead>
                <tr className="border-b border-charcoal">
                  {['Size', 'Bust', 'Waist', 'Hip'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="py-3 text-[11px] font-medium uppercase tracking-widest2"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SIZE_CHART.map(([sizeLabel, bust, waist, hip]) => (
                  <tr key={sizeLabel} className="border-b border-beige">
                    <th scope="row" className="py-3 text-[13px] font-medium">
                      {sizeLabel}
                    </th>
                    <td className="py-3 text-[13px] text-charcoal-muted">{bust}</td>
                    <td className="py-3 text-[13px] text-charcoal-muted">{waist}</td>
                    <td className="py-3 text-[13px] text-charcoal-muted">{hip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-[12px] text-charcoal-faint">
            Sarees, dupattas and jewellery are free size. Blouse sizing follows the chart above.
          </p>

          <Link
            to="/pages/size-guide"
            onClick={() => setSizeGuideOpen(false)}
            className="mt-5 inline-block text-[11px] font-medium uppercase tracking-widest2 text-clay link-underline"
          >
            Full measuring guide
          </Link>
        </div>
      </Modal>

      {/* --------------------- Mobile sticky purchase bar ---------------------
          Sits directly above the bottom tab bar, notch included. Both actions
          are here rather than just Add to Cart: on a phone the buttons in the
          panel above are several screens up by the time somebody has read the
          description, and "Buy Now" is the one that skips the bag entirely. */}
      <div
        className="sticky z-30 border-t border-beige bg-cream/95 px-3 py-2.5 backdrop-blur-md lg:hidden"
        style={{ bottom: 'var(--bottom-gap)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-charcoal-muted">{product.name}</p>
            <p className="text-sm font-medium">{formatPrice(product.price)}</p>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!product.inStock}
            aria-label={product.inStock ? `Add ${product.name} to cart` : 'Sold out'}
            className="btn-outline shrink-0 px-3 text-[10px] min-[360px]:px-4"
          >
            {product.inStock ? 'Add to Cart' : 'Sold Out'}
          </button>

          {product.inStock ? (
            <button
              type="button"
              onClick={handleBuyNow}
              aria-label={`Buy ${product.name} now`}
              className="btn-primary shrink-0 px-3 text-[10px] min-[360px]:px-4"
            >
              Buy Now
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
