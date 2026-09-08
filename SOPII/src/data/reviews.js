/** Customer testimonials for the home page carousel. */
export const TESTIMONIALS = [
  {
    id: 'r1',
    rating: 5,
    title: 'Exactly as photographed',
    body: 'The fabric is beautiful and the colour is exactly as shown on the site — which almost never happens. It arrived pressed and packed in a cloth bag I have kept.',
    author: 'Priya M.',
    location: 'Bengaluru',
    product: 'Aarohi Handwoven Cotton Saree',
  },
  {
    id: 'r2',
    rating: 5,
    title: 'Wore it to two weddings already',
    body: 'I was nervous ordering silk online. It drapes far better than anything I have bought in a store at twice the price, and the blouse fit straight out of the box.',
    author: 'Ritika S.',
    location: 'Delhi',
    product: 'Meherzad Silk Blend Saree',
  },
  {
    id: 'r3',
    rating: 5,
    title: 'The cotton is the real thing',
    body: 'Genuine mulmul, not a blend pretending to be one. I have washed it four times and it has only got softer. Ordering two more.',
    author: 'Ananya R.',
    location: 'Chennai',
    product: 'Ishira Mulmul Cotton Saree',
  },
  {
    id: 'r4',
    rating: 4,
    title: 'Beautiful, and quick to arrive',
    body: 'Delivered in three days to a small town in Kerala. The embroidery on the blouse is properly hand-done — you can see it on the reverse.',
    author: 'Meera K.',
    location: 'Thrissur',
    product: 'Manvi Embroidered Blouse',
  },
  {
    id: 'r5',
    rating: 5,
    title: 'My most complimented purchase',
    body: 'Three people asked where the jhumkas were from at one dinner. Light enough that I forgot I had them on, which is the highest praise I can give an earring.',
    author: 'Sneha T.',
    location: 'Pune',
    product: 'Chandni Oxidised Jhumkas',
  },
  {
    id: 'r6',
    rating: 5,
    title: 'Returns were genuinely painless',
    body: 'Ordered two sizes, sent one back. Pickup was arranged the next morning and the refund landed in four days. No arguments.',
    author: 'Divya N.',
    location: 'Hyderabad',
    product: 'Amara Tiered Midi Dress',
  },
];

/**
 * Per-product reviews shown on the PDP. Keyed generically and rotated so any
 * product renders a plausible review list without 70 hand-written sets.
 */
const REVIEW_POOL = [
  {
    rating: 5,
    title: 'Worth every rupee',
    body: 'The quality is well above what I expected at this price. Finishing on the inside seams is clean, which tells you everything.',
    author: 'Kavya J.',
    date: '2026-07-28',
    verified: true,
  },
  {
    rating: 5,
    title: 'Colour is true to the photos',
    body: 'I ordered based on the third image and it is an exact match in daylight. Fits as described on the size chart.',
    author: 'Nandini P.',
    date: '2026-07-14',
    verified: true,
  },
  {
    rating: 4,
    title: 'Lovely, runs slightly generous',
    body: 'Beautiful piece. I would size down if you are between sizes — mine was a touch loose across the shoulders.',
    author: 'Shruti B.',
    date: '2026-06-30',
    verified: true,
  },
  {
    rating: 5,
    title: 'Packaging deserves a mention',
    body: 'Arrived wrapped in cloth with a handwritten note. Felt like a gift even though I bought it for myself.',
    author: 'Aishwarya G.',
    date: '2026-06-11',
    verified: true,
  },
  {
    rating: 4,
    title: 'Very good, slightly delayed',
    body: 'Took a day longer than the estimate but customer care replied within the hour when I asked. Product itself is excellent.',
    author: 'Rhea D.',
    date: '2026-05-22',
    verified: false,
  },
];

/** Deterministic per-product review list derived from the pool. */
export function getProductReviews(product) {
  if (!product) return [];
  const offset = product.id.charCodeAt(product.id.length - 1) % REVIEW_POOL.length;
  const count = 3 + (product.reviews % 3);

  return Array.from({ length: count }, (_, i) => {
    const base = REVIEW_POOL[(offset + i) % REVIEW_POOL.length];
    return { ...base, id: `${product.id}-rev-${i}` };
  });
}

/** Star distribution bar chart on the PDP reviews tab. */
export function getRatingBreakdown(product) {
  if (!product) return [];
  const total = product.reviews;
  // Weight the distribution towards the product's own average rating.
  const weights =
    product.rating >= 4.7
      ? [0.78, 0.16, 0.04, 0.01, 0.01]
      : product.rating >= 4.5
        ? [0.66, 0.24, 0.06, 0.03, 0.01]
        : [0.54, 0.28, 0.11, 0.05, 0.02];

  return weights.map((w, i) => ({
    stars: 5 - i,
    count: Math.round(total * w),
    percent: Math.round(w * 100),
  }));
}
