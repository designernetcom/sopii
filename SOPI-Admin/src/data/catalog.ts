import type { Collection, Coupon, Review, StockMovement } from '@/types';
import { products } from './products';
import { customers } from './customers';
import { orders } from './orders';
import { chance, daysAgo, daysAhead, pick, pickMany, randInt, uid } from './seed';

/* ------------------------------- collections ------------------------------- */

const COLLECTION_SPECS = [
  { name: 'New Arrivals', description: 'The latest drops from the SOPII studio, refreshed every Thursday.', featured: true },
  { name: 'Bestsellers', description: 'Pieces our community keeps coming back for.', featured: true },
  { name: 'Festive Edit', description: 'Zari, organza and silk for the celebration season.', featured: true },
  { name: 'Wedding Collection', description: 'Heirloom-grade weaves for the wedding calendar.', featured: false },
  { name: 'Summer Collection', description: 'Breathable cotton and linen for warm days.', featured: false },
  { name: 'Office Wear', description: 'Structured, easy-care silhouettes for the work week.', featured: false },
  { name: 'Handloom Heritage', description: 'Direct from weaver clusters across India.', featured: false },
  { name: 'Under ₹2,499', description: 'Everyday pieces at an accessible price.', featured: false },
];

export const collections: Collection[] = COLLECTION_SPECS.map((spec, index) => {
  const picked = pickMany(products, randInt(6, 14));
  return {
    id: uid('col', index + 1),
    name: spec.name,
    slug: spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: spec.description,
    banner: `/media/collections/${index + 1}.jpg`,
    productIds: picked.map((p) => p.id),
    startDate: daysAgo(randInt(20, 120)),
    endDate: index % 3 === 0 ? daysAhead(randInt(15, 90)) : undefined,
    status: index === 7 ? 'inactive' : 'active',
    featured: spec.featured,
    sortOrder: index,
    createdAt: daysAgo(randInt(60, 300)),
  } satisfies Collection;
});

/* Back-reference collections onto products. */
collections.forEach((collection) => {
  collection.productIds.forEach((id) => {
    const product = products.find((p) => p.id === id);
    if (product && !product.collectionIds.includes(collection.id)) {
      product.collectionIds.push(collection.id);
    }
  });
});

/* --------------------------------- coupons --------------------------------- */

const COUPON_SPECS: Array<Partial<Coupon> & { code: string; description: string }> = [
  { code: 'SOPII10', description: '10% off sitewide for returning customers', discountType: 'percentage', discountValue: 10, minOrderValue: 1999, maxDiscount: 1500 },
  { code: 'WELCOME200', description: 'Flat ₹200 off the first order', discountType: 'fixed', discountValue: 200, minOrderValue: 999 },
  { code: 'FESTIVE15', description: 'Festive season 15% off on sarees', discountType: 'percentage', discountValue: 15, minOrderValue: 4999, maxDiscount: 3000 },
  { code: 'FREESHIP', description: 'Free shipping on every order', discountType: 'free_shipping', discountValue: 0, minOrderValue: 0 },
  { code: 'SILK20', description: '20% off the silk saree edit', discountType: 'percentage', discountValue: 20, minOrderValue: 7999, maxDiscount: 5000 },
  { code: 'FLAT500', description: 'Flat ₹500 off above ₹4,999', discountType: 'fixed', discountValue: 500, minOrderValue: 4999 },
  { code: 'DIWALI25', description: 'Diwali special 25% off', discountType: 'percentage', discountValue: 25, minOrderValue: 9999, maxDiscount: 6000 },
  { code: 'BLOUSE100', description: '₹100 off ready-to-wear blouses', discountType: 'fixed', discountValue: 100, minOrderValue: 1499 },
  { code: 'LOYAL12', description: '12% off for gold and platinum members', discountType: 'percentage', discountValue: 12, minOrderValue: 2999, maxDiscount: 2000 },
  { code: 'SUMMER10', description: 'Summer edit 10% off', discountType: 'percentage', discountValue: 10, minOrderValue: 1499, maxDiscount: 800 },
];

export const coupons: Coupon[] = COUPON_SPECS.map((spec, index) => {
  const startsInFuture = index === 6;
  const expired = index === 9;
  const start = startsInFuture ? daysAhead(randInt(5, 20)) : daysAgo(randInt(20, 200));
  const end = expired ? daysAgo(randInt(2, 20)) : daysAhead(randInt(10, 180));
  const usageLimit = randInt(100, 2000);

  return {
    id: uid('cpn', index + 1),
    code: spec.code,
    description: spec.description,
    discountType: spec.discountType ?? 'percentage',
    discountValue: spec.discountValue ?? 10,
    minOrderValue: spec.minOrderValue ?? 0,
    maxDiscount: spec.maxDiscount,
    usageLimit,
    perCustomerLimit: randInt(1, 3),
    usedCount: randInt(0, Math.round(usageLimit * 0.7)),
    startDate: start,
    endDate: end,
    productIds: index % 4 === 0 ? pickMany(products, randInt(2, 6)).map((p) => p.id) : [],
    categoryIds: index === 2 ? ['cat_sarees'] : index === 4 ? ['cat_sarees_silk'] : [],
    status: expired ? 'expired' : startsInFuture ? 'scheduled' : index === 8 ? 'disabled' : 'active',
    createdAt: daysAgo(randInt(30, 260)),
  } satisfies Coupon;
});

/* --------------------------------- reviews --------------------------------- */

const REVIEW_BODIES = [
  'The fabric quality is beautiful and the colour is exactly as shown. Drapes wonderfully.',
  'Loved the weave. Slightly sheer than expected but overall a lovely piece for the price.',
  'Delivery was quick and the packaging felt premium. Will order again.',
  'The embroidery detail is stunning in person. Got so many compliments at the function.',
  'Good product but the size runs a little small. Consider ordering one size up.',
  'Colour faded slightly after the first wash despite following care instructions.',
  'Exceptional craftsmanship — you can tell it is handwoven. Worth every rupee.',
  'Comfortable for all-day wear, the cotton is soft and breathable.',
  'The blouse stitching was neat and the fit was perfect. Very happy with the purchase.',
  'Received a slightly different shade than the photo, but the quality makes up for it.',
];

const REVIEW_TITLES = [
  'Beautiful weave', 'Exactly as pictured', 'Great quality', 'Lovely piece',
  'Slightly small fit', 'Worth the price', 'Stunning in person', 'Would recommend',
];

export const reviews: Review[] = Array.from({ length: 180 }, (_, index) => {
  const product = pick(products);
  const customer = pick(customers);
  const rating = chance(0.66) ? randInt(4, 5) : randInt(2, 4);
  const status = index % 5 === 0 ? 'pending' : index % 11 === 0 ? 'rejected' : 'approved';
  const createdAt = daysAgo(randInt(0, 180), 23);

  return {
    id: uid('rev', index + 1),
    productId: product.id,
    productName: product.name,
    productImage: product.images[0]?.url,
    customerId: customer.id,
    customerName: customer.name,
    customerAvatar: customer.avatar,
    rating,
    title: pick(REVIEW_TITLES),
    body: pick(REVIEW_BODIES),
    images: chance(0.2) ? [`/media/reviews/${index + 1}-1.jpg`] : [],
    status,
    verifiedPurchase: chance(0.8),
    reply:
      status === 'approved' && chance(0.25)
        ? {
            body: 'Thank you so much for the kind words! We are delighted the piece found a good home. — Team SOPII',
            at: daysAgo(randInt(0, 30)),
            by: 'Meera Nair',
          }
        : undefined,
    helpfulCount: randInt(0, 42),
    createdAt,
  } satisfies Review;
}).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

/* ------------------------------ stock movements ---------------------------- */

const REASONS: Record<string, string[]> = {
  purchase: ['Restock from weaver cluster', 'New batch received', 'Purchase order #PO-2291'],
  sale: ['Customer order', 'Marketplace order sync'],
  return: ['Customer return restocked', 'Size exchange returned to stock'],
  adjustment: ['Stock count correction', 'Warehouse audit adjustment'],
  damaged: ['Damaged in transit', 'Fabric defect found in QC'],
  cancelled: ['Cancelled order released back to stock'],
};

export const stockMovements: StockMovement[] = Array.from({ length: 420 }, (_, index) => {
  const product = pick(products);
  const type = pick(['purchase', 'sale', 'return', 'adjustment', 'damaged', 'cancelled'] as const);
  const magnitude =
    type === 'purchase' ? randInt(10, 80) : type === 'sale' ? randInt(1, 6) : randInt(1, 12);
  const signed = type === 'purchase' || type === 'return' || type === 'cancelled' ? magnitude : -magnitude;
  const previousStock = randInt(5, 220);

  return {
    id: uid('stk', index + 1),
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    type,
    quantity: signed,
    previousStock,
    newStock: Math.max(0, previousStock + signed),
    reason: pick(REASONS[type]),
    reference: type === 'sale' ? pick(orders).code : undefined,
    admin: pick(['Rajesh Gawas', 'Meera Nair', 'Aditya Rao', 'System']),
    at: daysAgo(randInt(0, 120), 23),
  } satisfies StockMovement;
}).sort((a, b) => +new Date(b.at) - +new Date(a.at));
