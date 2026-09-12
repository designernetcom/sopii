import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../Modal/Modal';
import { Image } from '../ui/Image';
import { Price } from '../ui/Price';
import { Rating } from '../ui/Rating';
import { QuantityStepper } from '../ui/QuantityStepper';
import { WishlistButton } from '../WishlistButton/WishlistButton';
import { SizeSelector, ColorSelector } from '../ProductOptions/ProductOptions';
import { useUI } from '../../context/UIContext';
import { useCart } from '../../context/CartContext';
import { productPath } from '../../utils/catalog';

/** Lightweight PDP preview so shoppers can pick a size without leaving the grid. */
export function QuickViewModal() {
  const { quickView: product, closeQuickView, openCart } = useUI();
  const { addItem } = useCart();

  const [size, setSize] = useState(null);
  const [color, setColor] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');

  // Reset selections whenever a different product opens.
  useEffect(() => {
    if (!product) return;
    setSize(product.sizes.length === 1 ? product.sizes[0] : null);
    setColor(product.colors[0]?.name ?? null);
    setQuantity(1);
    setError('');
  }, [product]);

  if (!product) return null;

  const handleAdd = () => {
    if (!size) {
      setError('Please select a size.');
      return;
    }
    addItem(product, { size, color, quantity, silent: true });
    closeQuickView();
    openCart();
  };

  return (
    <Modal open onClose={closeQuickView} size="lg" hideClose={false} title="Quick View">
      <div className="grid gap-6 p-5 sm:grid-cols-2 sm:gap-8 sm:p-7">
        <div>
          <Image
            src={product.image}
            alt={product.name}
            ratio="aspect-[4/5]"
            priority
            preset="detail"
            sizes="(min-width: 768px) 50vw, 100vw"
          />
          <Link
            to={productPath(product)}
            onClick={closeQuickView}
            className="mt-3 inline-block text-[11px] font-medium uppercase tracking-widest2 text-brand-soft link-underline"
          >
            View full details
          </Link>
        </div>

        <div className="flex flex-col">
          <p className="eyebrow">{product.category}</p>
          <h3 className="mt-2 font-display text-2xl leading-tight">{product.name}</h3>

          <Rating
            value={product.rating}
            reviews={product.reviews}
            showValue
            size={13}
            className="mt-2.5"
          />

          <Price
            price={product.price}
            originalPrice={product.originalPrice}
            discount={product.discount}
            size="lg"
            className="mt-4"
          />

          <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-charcoal-muted">
            {product.description}
          </p>

          <div className="mt-6 space-y-5">
            {/* <ColorSelector colors={product.colors} value={color} onChange={setColor} />
            <SizeSelector
              sizes={product.sizes}
              value={size}
              onChange={(s) => {
                setSize(s);
                setError('');
              }}
            /> */}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <WishlistButton product={product} variant="inline" />
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-[12px] text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleAdd}
            disabled={!product.inStock}
            className="btn-primary mt-5 w-full"
          >
            {product.inStock ? 'Add to Bag' : 'Sold Out'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
