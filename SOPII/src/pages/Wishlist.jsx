import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { Image } from '../components/ui/Image';
import { Price } from '../components/ui/Price';
import { Rating } from '../components/ui/Rating';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { WishlistRowSkeletons } from '../components/ui/PageSkeletons';
import { useWishlist } from '../context/WishlistContext';
import { useUI } from '../context/UIContext';
import { useCatalog } from '../context/CatalogContext';
import { usePageSeo } from '../components/SEO/SEOHead';

export default function Wishlist() {
  /* Personal and transactional — nothing here belongs in an index.
     Called as a hook so it runs before this component's early returns. */
  usePageSeo({ path: '/wishlist', title: 'Wishlist', noindex: true });

  const { ids, remove, clear, moveToCart } = useWishlist();
  const { setQuickView, openCart } = useUI();
  const { getProductById, catalogComplete } = useCatalog();

  const products = ids.map((id) => getProductById(id)).filter(Boolean);

  /*
   * Saved pieces the background catalogue fill has not reached yet.
   *
   * `getProductById` returns nothing for them, and dropping them silently made
   * a wishlist look shorter than it is — or, on a cold load, entirely empty,
   * with the "your wishlist is empty" panel on top of it. They shimmer instead,
   * and the empty state waits until the catalogue is actually complete.
   */
  const pending = catalogComplete ? 0 : ids.length - products.length;

  if (products.length === 0 && pending === 0) {
    return (
      <div className="container-site py-6">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]} />
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          text="Save your favourite pieces here and come back to them whenever you like."
          action={{ label: 'Explore Collection', to: '/shop' }}
          secondaryAction={{ label: 'Shop New Arrivals', to: '/new-arrivals' }}
        />
      </div>
    );
  }

  /** Multi-size products open the quick view so a size gets chosen. */
  const handleMove = (product) => {
    if (product.sizes.length > 1) {
      setQuickView(product);
      return;
    }
    moveToCart(product);
    openCart();
  };

  return (
    <div className="container-site py-6 lg:py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]} />

      <header className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-beige pb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">My Wishlist</h1>
          <p className="mt-2 text-sm text-charcoal-muted">
            {products.length} {products.length === 1 ? 'piece' : 'pieces'} saved
          </p>
        </div>

        <button
          type="button"
          onClick={clear}
          className="text-[11px] uppercase tracking-widest2 text-charcoal-muted underline underline-offset-4 transition-colors hover:text-sale"
        >
          Clear wishlist
        </button>
      </header>

      {/* Two columns on a phone, like every other product grid in the shop —
          a single column made each saved piece a full screen tall. */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-8 py-8 sm:gap-x-4 lg:grid-cols-3">
        {pending > 0 ? <WishlistRowSkeletons count={pending} /> : null}

        {products.map((product) => (
          <li key={product.id} className="group flex gap-4 border border-beige bg-cream p-4">
            <Link to={`/product/${product.id}`} className="w-24 shrink-0 sm:w-28">
              <div className="relative overflow-hidden">
                <Image
                  src={product.image}
                  alt={product.name}
                  ratio="aspect-[4/5]"
                  className="transition-transform duration-700 ease-silk group-hover:scale-105"
                />
                {product.badge ? (
                  <div className="absolute left-1.5 top-1.5">
                    <Badge className="px-1.5 py-0.5 text-[8px]">{product.badge}</Badge>
                  </div>
                ) : null}
              </div>
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase tracking-widest2 text-charcoal-faint">
                  {product.category}
                </p>
                <button
                  type="button"
                  onClick={() => remove(product.id)}
                  aria-label={`Remove ${product.name} from wishlist`}
                  className="-mr-1 -mt-1 p-1 text-charcoal-faint transition-colors hover:text-sale"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>

              <h2 className="mt-1 text-[13px] leading-snug">
                <Link to={`/product/${product.id}`} className="transition-colors hover:text-clay">
                  {product.name}
                </Link>
              </h2>

              <Rating value={product.rating} reviews={product.reviews} className="mt-1.5" />

              <Price
                price={product.price}
                originalPrice={product.originalPrice}
                discount={product.discount}
                size="sm"
                className="mt-2"
              />

              <button
                type="button"
                onClick={() => handleMove(product)}
                disabled={!product.inStock}
                className="btn-primary btn-sm mt-auto w-full justify-center pt-2"
              >
                <ShoppingBag size={12} aria-hidden="true" />
                {product.inStock ? 'Move to Bag' : 'Sold Out'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-beige pt-8 text-center">
        <Link to="/shop" className="btn-outline">
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
